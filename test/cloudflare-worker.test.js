import { describe, it } from "node:test";
import assert from "node:assert/strict";

import worker, { RunState } from "../src/cloudflare/worker.js";

describe("Cloudflare worker", () => {
  it("requires first-run password setup before Cloudflare API and output access", async () => {
    const env = createTestEnv();

    const statusResponse = await worker.fetch(new Request("https://studio.test/api/auth/status"), env, {
      waitUntil: () => {},
    });
    const status = await statusResponse.json();
    assert.equal(status.authRequired, true);
    assert.equal(status.initialized, false);
    assert.equal(status.authenticated, false);

    const defaultsResponse = await worker.fetch(new Request("https://studio.test/api/defaults"), env, {
      waitUntil: () => {},
    });
    assert.equal(defaultsResponse.status, 401);

    const setupResponse = await worker.fetch(
      jsonRequest("https://studio.test/api/auth/setup", {
        password: "correct-password",
      }),
      env,
      { waitUntil: () => {} },
    );
    const setupCookie = setupResponse.headers.get("set-cookie") ?? "";
    assert.equal(setupResponse.status, 200);
    assert.match(setupCookie, /image2studio_session=/);
    assert.match(setupCookie, /HttpOnly/);
    assert.match(setupCookie, /Secure/);

    const authenticatedResponse = await worker.fetch(
      new Request("https://studio.test/api/defaults", {
        headers: { Cookie: sessionCookie(setupCookie) },
      }),
      env,
      { waitUntil: () => {} },
    );
    assert.equal(authenticatedResponse.status, 200);
  });

  it("marks auth session cookies as Secure only on HTTPS requests", async () => {
    const httpEnv = createTestEnv();
    const httpResponse = await worker.fetch(
      jsonRequest("http://studio.test/api/auth/setup", {
        password: "correct-password",
      }),
      httpEnv,
      { waitUntil: () => {} },
    );
    const httpCookie = httpResponse.headers.get("set-cookie") ?? "";
    assert.equal(httpResponse.status, 200);
    assert.doesNotMatch(httpCookie, /Secure/);

    const httpsEnv = createTestEnv();
    const httpsResponse = await worker.fetch(
      jsonRequest("https://studio.test/api/auth/setup", {
        password: "correct-password",
      }),
      httpsEnv,
      { waitUntil: () => {} },
    );
    const httpsCookie = httpsResponse.headers.get("set-cookie") ?? "";
    assert.equal(httpsResponse.status, 200);
    assert.match(httpsCookie, /Secure/);
  });

  it("reports login mode instead of setup mode after the admin password exists", async () => {
    const env = createTestEnv();
    await worker.fetch(
      jsonRequest("https://studio.test/api/auth/setup", {
        password: "correct-password",
      }),
      env,
      { waitUntil: () => {} },
    );

    const statusResponse = await worker.fetch(new Request("https://studio.test/api/auth/status"), env, {
      waitUntil: () => {},
    });
    const status = await statusResponse.json();

    assert.equal(statusResponse.headers.get("cache-control"), "no-store");
    assert.equal(status.authRequired, true);
    assert.equal(status.initialized, true);
    assert.equal(status.authenticated, false);
  });

  it("logs in with the configured password and clears the session on logout", async () => {
    const env = createTestEnv();
    await worker.fetch(
      jsonRequest("https://studio.test/api/auth/setup", {
        password: "correct-password",
      }),
      env,
      { waitUntil: () => {} },
    );

    const failedLogin = await worker.fetch(
      jsonRequest("https://studio.test/api/auth/login", {
        password: "wrong password",
      }),
      env,
      { waitUntil: () => {} },
    );
    assert.equal(failedLogin.status, 401);

    const loginResponse = await worker.fetch(
      jsonRequest("https://studio.test/api/auth/login", {
        password: "correct-password",
      }),
      env,
      { waitUntil: () => {} },
    );
    const loginCookie = loginResponse.headers.get("set-cookie") ?? "";
    assert.equal(loginResponse.status, 200);
    assert.match(loginCookie, /image2studio_session=/);

    const logoutResponse = await worker.fetch(
      new Request("https://studio.test/api/auth/logout", {
        method: "POST",
        headers: { Cookie: sessionCookie(loginCookie) },
      }),
      env,
      { waitUntil: () => {} },
    );
    assert.equal(logoutResponse.status, 200);
    assert.match(logoutResponse.headers.get("set-cookie") ?? "", /Max-Age=0/);
  });

  it("stores admin password hashes with Cloudflare-compatible PBKDF2 settings", async () => {
    const env = createTestEnv();
    const response = await worker.fetch(
      jsonRequest("https://studio.test/api/auth/setup", {
        password: "hYQ7QcTr.-xqkC9ZWiAA",
      }),
      env,
      { waitUntil: () => {} },
    );
    const auth = await env.RUN_STATE.instance.state.storage.get("auth");

    assert.equal(response.status, 200);
    assert.equal(auth.password.algorithm, "PBKDF2-SHA-256");
    assert.equal(auth.password.iterations, 100000);
  });

  it("rejects admin passwords outside the supported length range", async () => {
    const env = createTestEnv();
    const tooLongPassword = "a".repeat(21);
    const response = await worker.fetch(
      jsonRequest("https://studio.test/api/auth/setup", {
        password: tooLongPassword,
      }),
      env,
      { waitUntil: () => {} },
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, "Password must be 8 to 20 characters");
  });

  it("creates a run, queues jobs, saves images to R2, and serves output objects", async () => {
    const env = createTestEnv();
    const cookie = await setupAuth(env);
    const createResponse = await worker.fetch(
      jsonRequest("https://studio.test/api/generate", {
        apiKey: "test-key",
        baseUrl: "https://api.example.com",
        endpointPath: "/images/generations",
        model: "image-2",
        size: "1024x1024",
        prompts: ["cloudflare test"],
        count: 1,
        concurrency: 1,
        dryRun: false,
      }, cookie),
      env,
      { waitUntil: () => {} },
    );
    const run = await createResponse.json();

    assert.equal(createResponse.status, 202);
    assert.equal(run.status, "running");
    assert.equal(env.IMAGE_JOBS.messages.length, 1);

    await worker.queue({ messages: env.IMAGE_JOBS.takeMessages() }, env);

    const runResponse = await worker.fetch(
      new Request(`https://studio.test/api/runs/${run.id}`, { headers: { Cookie: cookie } }),
      env,
      {
        waitUntil: () => {},
      },
    );
    const finalRun = await runResponse.json();

    assert.equal(finalRun.status, "completed");
    assert.equal(finalRun.jobs[0].images.length, 1);
    assert.match(finalRun.jobs[0].images[0].url, /^\/outputs\//);

    const imageResponse = await worker.fetch(
      new Request(`https://studio.test${finalRun.jobs[0].images[0].url}`, { headers: { Cookie: cookie } }),
      env,
      {
        waitUntil: () => {},
      },
    );
    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());

    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get("content-type"), "image/png");
    assert.deepEqual(Array.from(imageBytes.slice(0, 4)), [0x89, 0x50, 0x4e, 0x47]);
  });

  it("dispatches queued image jobs according to the requested thread count", async () => {
    const env = createTestEnv();
    const cookie = await setupAuth(env);
    const createResponse = await worker.fetch(
      jsonRequest("https://studio.test/api/generate", {
        apiKey: "test-key",
        baseUrl: "https://api.example.com",
        endpointPath: "/images/generations",
        model: "image-2",
        size: "1024x1024",
        prompts: ["first prompt", "second prompt", "third prompt"],
        count: 1,
        concurrency: 2,
        dryRun: false,
      }, cookie),
      env,
      { waitUntil: () => {} },
    );
    const run = await createResponse.json();

    assert.equal(env.IMAGE_JOBS.messages.length, 2);

    const firstBatch = env.IMAGE_JOBS.takeMessages();
    await worker.queue({ messages: [firstBatch[0]] }, env);
    assert.equal(env.IMAGE_JOBS.messages.length, 1);

    await worker.queue({ messages: [firstBatch[1], ...env.IMAGE_JOBS.takeMessages()] }, env);

    const runResponse = await worker.fetch(
      new Request(`https://studio.test/api/runs/${run.id}`, { headers: { Cookie: cookie } }),
      env,
      {
        waitUntil: () => {},
      },
    );
    const finalRun = await runResponse.json();

    assert.equal(finalRun.status, "completed");
    assert.equal(finalRun.summary.completed, 3);
  });

  it("declares Cloudflare resources in wrangler config", async () => {
    const config = await import("node:fs/promises").then((fs) => fs.readFile("wrangler.jsonc", "utf8"));

    assert.match(config, /"name": "image-2-studio-worker"/);
    assert.match(config, /"main": "src\/cloudflare\/worker\.js"/);
    assert.match(config, /"binding": "ASSETS"/);
    assert.match(config, /"binding": "IMAGE_OUTPUTS"/);
    assert.match(config, /"bucket_name": "image-2-studio-worker-outputs"/);
    assert.match(config, /"name": "RUN_STATE"/);
    assert.match(config, /"new_sqlite_classes": \["RunState"\]/);
    assert.match(config, /"binding": "IMAGE_JOBS"/);
    assert.match(config, /"queue": "image-2-studio-worker-jobs"/);
  });
});

function createTestEnv() {
  const bucket = new MemoryR2Bucket();
  const runState = new MemoryDurableObjectNamespace(() => new RunState(new MemoryDurableObjectState()));
  return {
    ASSETS: {
      fetch: async () => new Response("asset", { status: 200 }),
    },
    IMAGE_OUTPUTS: bucket,
    IMAGE_JOBS: new MemoryQueue(),
    RUN_STATE: runState,
    IMAGE_API_ENDPOINT_PATH: "/images/generations",
    IMAGE_MODEL: "gpt-image-2",
    IMAGE_SIZE: "1024x1024",
    IMAGE_TIMEOUT_MS: "900000",
    AUTH_SECRET: "test-auth-secret",
    generateImage: async () => ({
      data: [{ b64_json: bytesToBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])) }],
    }),
  };
}

async function setupAuth(env) {
  const response = await worker.fetch(
    jsonRequest("https://studio.test/api/auth/setup", {
      password: "correct-password",
    }),
    env,
    { waitUntil: () => {} },
  );
  return sessionCookie(response.headers.get("set-cookie") ?? "");
}

function sessionCookie(setCookieHeader) {
  return setCookieHeader.split(";")[0];
}

function jsonRequest(url, body, cookie = "") {
  const headers = { "Content-Type": "application/json" };
  if (cookie !== "") {
    headers.Cookie = cookie;
  }
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

class MemoryQueue {
  constructor() {
    this.messages = [];
  }

  async send(body) {
    this.messages.push({
      body,
      ack() {},
    });
  }

  takeMessages() {
    const messages = this.messages;
    this.messages = [];
    return messages;
  }
}

class MemoryDurableObjectNamespace {
  constructor(createInstance) {
    this.createInstance = createInstance;
    this.instances = new Map();
    this.instance = null;
  }

  idFromName(name) {
    return name;
  }

  get(id) {
    if (!this.instances.has(id)) {
      this.instances.set(id, this.createInstance());
    }
    this.instance = this.instances.get(id);
    return this.instance;
  }
}

class MemoryDurableObjectState {
  constructor() {
    this.storage = new MemoryStorage();
  }
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.get(key);
  }

  async put(key, value) {
    this.values.set(key, value);
  }
}

class MemoryR2Bucket {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options = {}) {
    const data = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
    this.objects.set(key, {
      key,
      data,
      httpMetadata: options.httpMetadata ?? {},
    });
  }

  async get(key) {
    const object = this.objects.get(key);
    if (!object) {
      return null;
    }
    return {
      body: object.data,
      httpMetadata: object.httpMetadata,
    };
  }

  async list(options = {}) {
    const prefix = options.prefix ?? "";
    return {
      truncated: false,
      objects: Array.from(this.objects.values())
        .filter((object) => object.key.startsWith(prefix))
        .map((object) => ({ key: object.key })),
    };
  }

  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      this.objects.delete(key);
    }
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
