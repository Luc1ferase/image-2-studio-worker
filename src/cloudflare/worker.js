import { generateImage } from "../api.js";
import { buildRunConfig, createJobsFromPrompts, createRequestBody, createRunId, normalizePrompts, publicConfig } from "./config.js";
import { RunState } from "./run-state.js";
import { contentTypeForFilename, deleteRunObjects, getOutputObject, saveJobArtifacts, saveJobError } from "./storage.js";

export { RunState };

const SESSION_COOKIE = "image2studio_session";

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      await processGenerateJob(message.body, env);
      message.ack();
    }
  },
};

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/auth/")) {
    return handleAuthRequest(request, env, url.pathname);
  }
  const auth = await authenticateRequest(request, env);
  if (!auth.authRequired && url.pathname === "/api/auth/status") {
    return json(auth);
  }
  if (!auth.authenticated) {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/outputs/")) {
      return json({ error: auth.initialized ? "Login required" : "Admin password setup required" }, 401);
    }
  }
  if (request.method === "GET" && url.pathname === "/api/defaults") {
    return json({
      apiKeyConfigured: Boolean(env.IMAGE_API_KEY || env.OPENAI_API_KEY),
      baseUrl: env.IMAGE_API_BASE_URL ?? env.OPENAI_BASE_URL ?? "",
      baseUrlConfigured: String(env.IMAGE_API_BASE_URL ?? env.OPENAI_BASE_URL ?? "").trim() !== "",
      endpointPath: env.IMAGE_API_ENDPOINT_PATH ?? "/images/generations",
      model: env.IMAGE_MODEL ?? "gpt-image-2",
      size: env.IMAGE_SIZE ?? "1024x1024",
      quality: env.IMAGE_QUALITY ?? "",
      outputFormat: env.IMAGE_OUTPUT_FORMAT ?? "",
      responseFormat: env.IMAGE_RESPONSE_FORMAT ?? "",
      timeoutMs: parseOptionalPositiveInteger(env.IMAGE_TIMEOUT_MS, 900000),
      outputDir: "Cloudflare R2",
    });
  }
  if (request.method === "GET" && url.pathname === "/api/runs") {
    return runStateFetch(env, "/runs");
  }
  if (request.method === "POST" && url.pathname === "/api/generate") {
    return createRun(request, env);
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/runs/")) {
    return runStateFetch(env, `/runs/${encodeURIComponent(runIdFromApiPath(url.pathname))}`);
  }
  if (request.method === "POST" && url.pathname.endsWith("/rename") && url.pathname.startsWith("/api/runs/")) {
    const runId = url.pathname.slice("/api/runs/".length, -"/rename".length);
    return runStateFetch(env, `/runs/${runId}/rename`, request);
  }
  if (request.method === "POST" && url.pathname === "/api/runs/delete") {
    const body = await request.clone().json();
    const stateResponse = await runStateFetch(env, "/runs/delete", request);
    if (stateResponse.ok) {
      const result = await stateResponse.clone().json();
      const deletedIds = Array.isArray(result.deletedIds) ? result.deletedIds : [];
      ctx.waitUntil(Promise.all(deletedIds.map((runId) => deleteRunObjects(env.IMAGE_OUTPUTS, runId))));
    }
    return stateResponse;
  }
  if (request.method === "POST" && url.pathname.endsWith("/images/delete") && url.pathname.startsWith("/api/runs/")) {
    const runId = url.pathname.slice("/api/runs/".length, -"/images/delete".length);
    const body = await request.clone().json();
    const stateResponse = await runStateFetch(env, `/runs/${runId}/images/delete`, request);
    if (stateResponse.ok) {
      const images = Array.isArray(body.images) ? body.images : [];
      ctx.waitUntil(Promise.all(images.map((image) => deleteImageObject(env, decodeURIComponent(runId), image))));
    }
    return stateResponse;
  }
  if (request.method === "GET" && url.pathname.startsWith("/outputs/")) {
    return serveOutput(url.pathname, env);
  }
  return env.ASSETS.fetch(request);
}

async function handleAuthRequest(request, env, pathname) {
  if (request.method === "GET" && pathname === "/api/auth/status") {
    return authJson(await authenticateRequest(request, env));
  }
  if (request.method === "POST" && pathname === "/api/auth/setup") {
    const body = await request.json();
    const response = await runStateFetch(env, "/auth/setup", jsonStateRequest("/auth/setup", body));
    return authSessionResponse(response, request);
  }
  if (request.method === "POST" && pathname === "/api/auth/login") {
    const body = await request.json();
    const response = await runStateFetch(env, "/auth/login", jsonStateRequest("/auth/login", body));
    return authSessionResponse(response, request);
  }
  if (request.method === "POST" && pathname === "/api/auth/logout") {
    const token = readSessionCookie(request);
    const response = await runStateFetch(env, "/auth/logout", jsonStateRequest("/auth/logout", {
      sessionHash: token === "" ? "" : await sha256Hex(token),
    }));
    const body = await response.json();
    return authJson(body, response.status, { "Set-Cookie": expiredSessionCookie(request) });
  }
  return authJson({ error: "Not found" }, 404);
}

async function authSessionResponse(response, request) {
  const body = await response.json();
  if (!response.ok) {
    return authJson(body, response.status);
  }
  const token = String(body?.session?.token ?? "");
  return authJson(
    {
      initialized: true,
      authenticated: token !== "",
    },
    response.status,
    token === "" ? {} : { "Set-Cookie": sessionCookie(token, request) },
  );
}

async function authenticateRequest(request, env) {
  const statusResponse = await runStateFetch(env, "/auth", new Request("https://state/auth"));
  const status = await statusResponse.json();
  const initialized = Boolean(status.initialized);
  if (!initialized) {
    return { authRequired: true, initialized: false, authenticated: false };
  }
  const token = readSessionCookie(request);
  if (token === "") {
    return { authRequired: true, initialized: true, authenticated: false };
  }
  const response = await runStateFetch(env, "/auth/session", jsonStateRequest("/auth/session", {
    sessionHash: await sha256Hex(token),
  }));
  const session = await response.json();
  return {
    authRequired: true,
    initialized: Boolean(session.initialized),
    authenticated: Boolean(session.authenticated),
  };
}

async function createRun(request, env) {
  const input = await request.json();
  const prompts = normalizePrompts(input.prompts);
  if (prompts.length === 0) {
    return json({ error: "At least one prompt is required" }, 400);
  }
  const config = buildRunConfig(input, env);
  if (!config.dryRun && config.apiKey.trim() === "") {
    return json({ error: "API key is required unless dry-run is enabled" }, 400);
  }
  const runId = createRunId();
  const jobs = createJobsFromPrompts(prompts, config.count).map((job) => ({
    ...job,
    status: "queued",
    jobDir: "",
    images: [],
    error: "",
    startedAt: "",
    completedAt: "",
  }));
  const run = {
    id: runId,
    status: "running",
    runDir: `Cloudflare R2 / ${runId}`,
    config: publicConfig(config),
    jobs,
    summary: {
      total: jobs.length,
      queued: jobs.length,
      running: 0,
      completed: 0,
      failed: 0,
    },
    createdAt: new Date().toISOString(),
    completedAt: "",
  };
  await runStateFetch(env, "/runs", new Request("https://state/runs", {
    method: "POST",
    body: JSON.stringify(run),
    headers: { "Content-Type": "application/json" },
  }));
  await dispatchNextJobs(env, runId, config);
  return json(run, 202);
}

async function processGenerateJob(message, env) {
  const runId = String(message.runId ?? "");
  const job = message.job;
  const config = message.config;
  const requestBody = createRequestBody(config, job.prompt);
  try {
    const generate = env.generateImage ?? generateImage;
    const responseBody = config.dryRun ? { dry_run: true, data: [] } : await generate(config, requestBody);
    const saved = await saveJobArtifacts({
      bucket: env.IMAGE_OUTPUTS,
      config,
      job,
      runId,
      requestBody,
      responseBody,
    });
    await patchJob(env, {
      runId,
      jobId: job.id,
      patch: {
        status: "completed",
        jobDir: saved.jobDir,
        images: saved.savedImages,
        completedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const saved = await saveJobError({
      bucket: env.IMAGE_OUTPUTS,
      job,
      runId,
      requestBody,
      error,
    });
    await patchJob(env, {
      runId,
      jobId: job.id,
      patch: {
        status: "failed",
        jobDir: saved.jobDir,
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString(),
      },
    });
  }
  await dispatchNextJobs(env, runId, config);
}

async function serveOutput(pathname, env) {
  const object = await getOutputObject(env.IMAGE_OUTPUTS, pathname);
  if (!object) {
    return json({ error: "Not found" }, 404);
  }
  const filename = pathname.split("/").pop() ?? "";
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? contentTypeForFilename(filename),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

async function deleteImageObject(env, runId, image) {
  const filename = String(image?.filename ?? "");
  const jobId = String(image?.jobId ?? "");
  if (filename === "" || jobId === "" || filename.includes("/")) {
    return;
  }
  const keyPrefix = `outputs/${dateFolderFromRunId(runId)}/${runId}/${jobId}-variant-`;
  const listed = await env.IMAGE_OUTPUTS.list({ prefix: keyPrefix });
  const object = listed.objects.find((candidate) => candidate.key.endsWith(`/${filename}`));
  if (object) {
    await env.IMAGE_OUTPUTS.delete(object.key);
  }
}

async function patchJob(env, body) {
  return runStateFetch(env, "/jobs/update", new Request("https://state/jobs/update", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }));
}

async function dispatchNextJobs(env, runId, config) {
  const response = await runStateFetch(env, "/jobs/next", new Request("https://state/jobs/next", {
    method: "POST",
    body: JSON.stringify({ runId, concurrency: config.concurrency }),
    headers: { "Content-Type": "application/json" },
  }));
  if (!response.ok) {
    return;
  }
  const result = await response.json();
  const jobs = Array.isArray(result.jobs) ? result.jobs : [];
  for (const job of jobs) {
    await env.IMAGE_JOBS.send({ runId, job, config });
  }
}

function runStateFetch(env, pathname, sourceRequest) {
  const id = env.RUN_STATE.idFromName("global");
  const stub = env.RUN_STATE.get(id);
  const request =
    sourceRequest ??
    new Request(`https://state${pathname}`, {
      method: "GET",
    });
  return stub.fetch(new Request(`https://state${pathname}`, request));
}

function jsonStateRequest(pathname, body) {
  return new Request(`https://state${pathname}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function runIdFromApiPath(pathname) {
  return decodeURIComponent(pathname.slice("/api/runs/".length));
}

function dateFolderFromRunId(runId) {
  const match = /^run-(\d{4}-\d{2}-\d{2})T/.exec(runId);
  return match ? match[1] : new Date().toISOString().slice(0, 10);
}

function parseOptionalPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readSessionCookie(request) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      return valueParts.join("=");
    }
  }
  return "";
}

function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === "https:" ? " Secure;" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=604800`;
}

function expiredSessionCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? " Secure;" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=0`;
}

function json(value, status = 200, headers = {}) {
  return new Response(`${JSON.stringify(value)}\n`, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function authJson(value, status = 200, headers = {}) {
  return json(value, status, { "Cache-Control": "no-store", ...headers });
}
