import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadDotEnv } from "../dotenv.js";
import { DEFAULT_GUI_TIMEOUT_MS, GuiJobManager } from "./job-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../../public");
const DEFAULT_PORT = 4317;

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
]);

export async function createGuiServer(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? options.manager?.env ?? process.env;
  await loadDotEnv(cwd, env);
  const manager = options.manager ?? new GuiJobManager({ cwd, env });
  await manager.loadPersistedRuns();

  const server = http.createServer(async (request, response) => {
    try {
      await handleRequest({ request, response, manager, cwd, env });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return { server, manager };
}

export async function startGuiServer(options = {}) {
  const { server } = await createGuiServer(options);
  const envPort = Number.parseInt(process.env.GUI_PORT ?? "", 10);
  const port = options.port ?? (Number.isInteger(envPort) && envPort > 0 ? envPort : DEFAULT_PORT);
  const host = options.host ?? "127.0.0.1";
  const actualPort = await listenWithFallback({ server, host, port, allowFallback: options.port === undefined });
  return {
    server,
    url: `http://${host}:${actualPort}`,
  };
}

async function listenWithFallback({ server, host, port, allowFallback }) {
  try {
    return await listen(server, host, port);
  } catch (error) {
    if (!allowFallback || !isAddressInUse(error)) {
      throw error;
    }
    return listen(server, host, 0);
  }
}

async function listen(server, host, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  return typeof address === "object" && address ? address.port : port;
}

function isAddressInUse(error) {
  return error && typeof error === "object" && error.code === "EADDRINUSE";
}

async function handleRequest({ request, response, manager, cwd, env }) {
  if (!request.url) {
    sendJson(response, 400, { error: "Missing URL" });
    return;
  }
  const url = new URL(request.url, "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/api/defaults") {
    const configuredBaseUrl = env.IMAGE_API_BASE_URL ?? env.OPENAI_BASE_URL ?? "";
    sendJson(response, 200, {
      apiKeyConfigured: Boolean(env.IMAGE_API_KEY || env.OPENAI_API_KEY),
      baseUrl: configuredBaseUrl,
      baseUrlConfigured: configuredBaseUrl.trim() !== "",
      endpointPath: env.IMAGE_API_ENDPOINT_PATH ?? "/images/generations",
      model: env.IMAGE_MODEL ?? "gpt-image-2",
      size: env.IMAGE_SIZE ?? "1024x1024",
      quality: env.IMAGE_QUALITY ?? "",
      outputFormat: env.IMAGE_OUTPUT_FORMAT ?? "",
      responseFormat: env.IMAGE_RESPONSE_FORMAT ?? "",
      timeoutMs: parseOptionalPositiveInteger(env.IMAGE_TIMEOUT_MS, DEFAULT_GUI_TIMEOUT_MS),
      outputDir: path.resolve(cwd, "outputs"),
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/runs") {
    sendJson(response, 200, { runs: manager.listRuns() });
    return;
  }
  if (request.method === "POST" && url.pathname.endsWith("/rename") && url.pathname.startsWith("/api/runs/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/runs/".length, -"/rename".length));
    const body = await readJsonBody(request);
    sendJson(response, 200, await manager.renameRun(id, body.name));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/runs/delete") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await manager.deleteRuns(body.ids));
    return;
  }
  if (request.method === "POST" && url.pathname.endsWith("/images/delete") && url.pathname.startsWith("/api/runs/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/runs/".length, -"/images/delete".length));
    const body = await readJsonBody(request);
    sendJson(response, 200, await manager.deleteRunImages(id, body.images));
    return;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/runs/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/runs/".length));
    sendJson(response, 200, manager.getRun(id));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/generate") {
    const body = await readJsonBody(request);
    const run = await manager.startRun(body);
    sendJson(response, 202, run);
    return;
  }
  if (request.method === "GET" && url.pathname.startsWith("/outputs/")) {
    await serveOutputFile({ response, pathname: url.pathname, cwd });
    return;
  }
  if (request.method === "GET") {
    await serveStatic({ response, pathname: url.pathname });
    return;
  }
  sendJson(response, 404, { error: "Not found" });
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim() === "") {
    return {};
  }
  return JSON.parse(raw);
}

async function serveStatic({ response, pathname }) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!isPathInside(filePath, PUBLIC_DIR)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }
  await sendFile(response, filePath);
}

async function serveOutputFile({ response, pathname, cwd }) {
  const outputRoot = path.resolve(cwd, "outputs");
  const relativePath = pathname.slice("/outputs/".length);
  const filePath = path.resolve(outputRoot, relativePath);
  if (!isPathInside(filePath, outputRoot)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }
  await sendFile(response, filePath);
}

async function sendFile(response, filePath) {
  try {
    const data = await fs.readFile(filePath);
    const contentType = CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    response.end(data);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }
    throw error;
  }
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(value)}\n`);
}

function parseOptionalPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isPathInside(filePath, root) {
  const relative = path.relative(root, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
