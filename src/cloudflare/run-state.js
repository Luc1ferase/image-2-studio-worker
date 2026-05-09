export class RunState {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/runs") {
        return json(await this.createRun(await request.json()), 201);
      }
      if (request.method === "GET" && url.pathname === "/auth") {
        return json(await this.authStatus());
      }
      if (request.method === "POST" && url.pathname === "/auth/setup") {
        return json(await this.setupAuth(await request.json()));
      }
      if (request.method === "POST" && url.pathname === "/auth/login") {
        return json(await this.login(await request.json()));
      }
      if (request.method === "POST" && url.pathname === "/auth/logout") {
        return json(await this.logout(await request.json()));
      }
      if (request.method === "POST" && url.pathname === "/auth/session") {
        return json(await this.verifySession(String((await request.json()).sessionHash ?? "")));
      }
      if (request.method === "GET" && url.pathname === "/runs") {
        return json(await this.listRuns());
      }
      if (request.method === "GET" && url.pathname.startsWith("/runs/")) {
        return json(await this.getRun(runIdFromPath(url.pathname)));
      }
      if (request.method === "PATCH" && url.pathname.endsWith("/rename")) {
        const runId = runIdFromPath(url.pathname.slice(0, -"/rename".length));
        return json(await this.renameRun(runId, await request.json()));
      }
      if (request.method === "POST" && url.pathname === "/runs/delete") {
        return json(await this.deleteRuns(await request.json()));
      }
      if (request.method === "PATCH" && url.pathname.startsWith("/jobs/")) {
        return json(await this.updateJob(await request.json()));
      }
      if (request.method === "POST" && url.pathname === "/jobs/next") {
        return json(await this.startNextQueuedJobs(await request.json()));
      }
      if (request.method === "POST" && url.pathname.endsWith("/images/delete")) {
        const runId = runIdFromPath(url.pathname.slice(0, -"/images/delete".length));
        return json(await this.deleteRunImages(runId, await request.json()));
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      if (error instanceof AuthError) {
        return json(error);
      }
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  }

  async createRun(run) {
    const runs = await this.readRuns();
    runs.set(run.id, run);
    await this.writeRuns(runs);
    return run;
  }

  async listRuns() {
    const runs = await this.readRuns();
    return {
      runs: Array.from(runs.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    };
  }

  async getRun(runId) {
    const runs = await this.readRuns();
    const run = runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }

  async renameRun(runId, body) {
    const runs = await this.readRuns();
    const run = runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const trimmed = String(body.name ?? "").trim();
    if (trimmed === "") {
      throw new Error("Run name cannot be empty");
    }
    run.name = trimmed;
    run.config = { ...run.config, name: trimmed };
    await this.writeRuns(runs);
    return run;
  }

  async deleteRuns(body) {
    const runs = await this.readRuns();
    const ids = Array.from(new Set(Array.isArray(body.ids) ? body.ids.map((id) => String(id)) : []));
    const deletedIds = [];
    for (const id of ids) {
      if (runs.delete(id)) {
        deletedIds.push(id);
      }
    }
    await this.writeRuns(runs);
    return { deletedIds };
  }

  async updateJob(body) {
    const runs = await this.readRuns();
    const run = runs.get(String(body.runId ?? ""));
    if (!run) {
      throw new Error(`Run not found: ${body.runId}`);
    }
    const job = run.jobs.find((candidate) => candidate.id === body.jobId);
    if (!job) {
      throw new Error(`Job not found: ${body.jobId}`);
    }
    Object.assign(job, body.patch ?? {});
    recalculateSummary(run);
    if (run.summary.completed + run.summary.failed >= run.summary.total) {
      run.status = run.summary.failed > 0 ? "failed" : "completed";
      run.completedAt = run.completedAt || new Date().toISOString();
    } else {
      run.status = "running";
    }
    await this.writeRuns(runs);
    return run;
  }

  async startNextQueuedJobs(body) {
    const runs = await this.readRuns();
    const run = runs.get(String(body.runId ?? ""));
    if (!run) {
      throw new Error(`Run not found: ${body.runId}`);
    }
    const concurrency = positiveInteger(body.concurrency, 1);
    recalculateSummary(run);
    const availableSlots = Math.max(0, concurrency - run.summary.running);
    const jobs = [];
    if (run.status === "running" && availableSlots > 0) {
      for (const job of run.jobs) {
        if (jobs.length >= availableSlots) {
          break;
        }
        if (job.status !== "queued") {
          continue;
        }
        job.status = "running";
        job.startedAt = new Date().toISOString();
        jobs.push(job);
      }
    }
    recalculateSummary(run);
    await this.writeRuns(runs);
    return { jobs, run };
  }

  async deleteRunImages(runId, body) {
    const runs = await this.readRuns();
    const run = runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const requestedImages = normalizeImageDeleteRequest(body.images);
    const deletedImages = [];
    for (const requested of requestedImages) {
      const job = run.jobs.find((candidate) => candidate.id === requested.jobId);
      if (!job || !Array.isArray(job.images)) {
        continue;
      }
      const imageIndex = job.images.findIndex((image) => image.filename === requested.filename);
      if (imageIndex < 0) {
        continue;
      }
      job.images.splice(imageIndex, 1);
      deletedImages.push(requested);
    }
    await this.writeRuns(runs);
    return { deletedImages };
  }

  async readRuns() {
    const stored = await this.state.storage.get("runs");
    const runs = new Map();
    if (stored && typeof stored === "object") {
      for (const [key, value] of Object.entries(stored)) {
        runs.set(key, value);
      }
    }
    return runs;
  }

  async writeRuns(runs) {
    await this.state.storage.put("runs", Object.fromEntries(runs));
  }

  async authStatus() {
    const auth = await this.readAuth();
    return {
      initialized: Boolean(auth?.password),
      sessionCount: Object.keys(auth?.sessions ?? {}).length,
    };
  }

  async setupAuth(body) {
    const auth = await this.readAuth();
    if (auth?.password) {
      throw new AuthError("Password has already been configured", 409);
    }
    const password = normalizePassword(body.password);
    const passwordRecord = await hashPassword(password);
    const session = await createSession();
    await this.writeAuth({
      password: passwordRecord,
      sessions: {
        [session.id]: session.record,
      },
    });
    return { initialized: true, session };
  }

  async login(body) {
    const auth = await this.readAuth();
    if (!auth?.password) {
      throw new AuthError("Password has not been configured", 409);
    }
    const password = normalizePassword(body.password);
    const ok = await verifyPassword(password, auth.password);
    if (!ok) {
      throw new AuthError("Invalid password", 401);
    }
    const session = await createSession();
    await this.writeAuth({
      ...auth,
      sessions: {
        ...(auth.sessions ?? {}),
        [session.id]: session.record,
      },
    });
    return { initialized: true, session };
  }

  async logout(body) {
    const auth = await this.readAuth();
    if (!auth?.sessions) {
      return { loggedOut: true };
    }
    const sessionHash = String(body.sessionHash ?? "");
    const sessions = { ...auth.sessions };
    for (const [id, session] of Object.entries(sessions)) {
      if (session?.hash === sessionHash) {
        delete sessions[id];
      }
    }
    await this.writeAuth({ ...auth, sessions });
    return { loggedOut: true };
  }

  async verifySession(sessionHash) {
    const auth = await this.readAuth();
    if (!auth?.password) {
      return { initialized: false, authenticated: false };
    }
    const now = Date.now();
    const sessions = {};
    let authenticated = false;
    for (const [id, session] of Object.entries(auth.sessions ?? {})) {
      const expiresAt = Number.parseInt(String(session?.expiresAt ?? ""), 10);
      if (!Number.isInteger(expiresAt) || expiresAt <= now) {
        continue;
      }
      sessions[id] = session;
      if (session.hash === sessionHash) {
        authenticated = true;
      }
    }
    if (Object.keys(sessions).length !== Object.keys(auth.sessions ?? {}).length) {
      await this.writeAuth({ ...auth, sessions });
    }
    return { initialized: true, authenticated };
  }

  async readAuth() {
    const stored = await this.state.storage.get("auth");
    return stored && typeof stored === "object" ? stored : {};
  }

  async writeAuth(auth) {
    await this.state.storage.put("auth", auth);
  }
}

export function recalculateSummary(run) {
  const summary = {
    total: run.jobs.length,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
  };
  for (const job of run.jobs) {
    if (job.status === "queued") {
      summary.queued += 1;
    } else if (job.status === "running") {
      summary.running += 1;
    } else if (job.status === "completed") {
      summary.completed += 1;
    } else if (job.status === "failed") {
      summary.failed += 1;
    }
  }
  run.summary = summary;
}

function normalizeImageDeleteRequest(images) {
  if (!Array.isArray(images)) {
    return [];
  }
  return images
    .map((image) => ({
      jobId: String(image?.jobId ?? ""),
      filename: String(image?.filename ?? ""),
    }))
    .filter((image) => image.jobId !== "" && image.filename !== "" && !image.filename.includes("/"));
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 100000;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 20;

function normalizePassword(value) {
  const password = String(value ?? "");
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new AuthError(`Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`, 400);
  }
  return password;
}

async function hashPassword(password) {
  const salt = randomToken(24);
  const hash = await pbkdf2(password, salt);
  return {
    algorithm: "PBKDF2-SHA-256",
    iterations: PASSWORD_ITERATIONS,
    salt,
    hash,
  };
}

async function verifyPassword(password, record) {
  if (!record || record.algorithm !== "PBKDF2-SHA-256") {
    return false;
  }
  const hash = await pbkdf2(password, record.salt, record.iterations);
  return timingSafeEqual(hash, record.hash);
}

async function createSession() {
  const token = randomToken(32);
  const hash = await sha256Hex(token);
  const id = randomToken(12);
  return {
    id,
    token,
    record: {
      hash,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    },
  };
}

async function pbkdf2(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: utf8(salt),
      iterations: positiveInteger(iterations, PASSWORD_ITERATIONS),
    },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", utf8(value));
  return bytesToHex(new Uint8Array(digest));
}

function randomToken(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function timingSafeEqual(left, right) {
  const leftValue = String(left ?? "");
  const rightValue = String(right ?? "");
  if (leftValue.length !== rightValue.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < leftValue.length; index += 1) {
    diff |= leftValue.charCodeAt(index) ^ rightValue.charCodeAt(index);
  }
  return diff === 0;
}

function utf8(value) {
  return new TextEncoder().encode(String(value));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function runIdFromPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return decodeURIComponent(last ?? "");
}

function json(value, status = 200) {
  const responseStatus = value instanceof AuthError ? value.status : status;
  const responseBody = value instanceof AuthError ? { error: value.message } : value;
  return new Response(`${JSON.stringify(responseBody)}\n`, {
    status: responseStatus,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
