import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { GuiJobManager } from "../src/gui/job-manager.js";
import { startGuiServer } from "../src/gui/server.js";

describe("GUI server", () => {
  it("returns an empty Base URL default unless the environment explicitly configures one", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "image-2-gui-defaults-"));
    const manager = new GuiJobManager({
      cwd,
      env: {},
    });
    const { server, url } = await startGuiServer({ cwd, port: 0, manager });
    try {
      const response = await fetch(`${url}/api/defaults`);
      const defaults = await response.json();

      assert.equal(response.status, 200);
      assert.equal(defaults.baseUrl, "");
      assert.equal(defaults.baseUrlConfigured, false);
      assert.equal(defaults.endpointPath, "/images/generations");
    } finally {
      await closeServer(server);
    }
  });

  it("returns a configured Base URL default from the GUI environment", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "image-2-gui-defaults-"));
    const manager = new GuiJobManager({
      cwd,
      env: { IMAGE_API_BASE_URL: "https://api.example.com" },
    });
    const { server, url } = await startGuiServer({ cwd, port: 0, manager });
    try {
      const response = await fetch(`${url}/api/defaults`);
      const defaults = await response.json();

      assert.equal(response.status, 200);
      assert.equal(defaults.baseUrl, "https://api.example.com");
      assert.equal(defaults.baseUrlConfigured, true);
    } finally {
      await closeServer(server);
    }
  });

  it("posts non-dry-run requests to the configured images endpoint", async () => {
    const upstream = await startMockImageServer();
    const { server, url } = await startGuiServer({ port: 0 });
    try {
      const createResponse = await fetch(`${url}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: "test-key",
          baseUrl: upstream.url,
          endpointPath: "/images/generations",
          model: "image-2",
          size: "3840x2160",
          quality: "high",
          outputFormat: "jpeg",
          prompts: ["mock upstream test"],
          count: 1,
          concurrency: 1,
          dryRun: false,
        }),
      });
      const run = await createResponse.json();
      const finalRun = await waitForRun(url, run.id);

      assert.equal(createResponse.status, 202);
      assert.equal(finalRun.status, "completed");
      assert.equal(upstream.calls.length, 1);
      assert.equal(upstream.calls[0].url, "/images/generations");
      assert.deepEqual(JSON.parse(upstream.calls[0].body), {
        model: "gpt-image-2",
        prompt: "mock upstream test",
        n: 1,
        size: "3840x2160",
        quality: "high",
        output_format: "jpeg",
      });
    } finally {
      await closeServer(server);
      await closeServer(upstream.server);
    }
  });

  it("lists persisted runs after the GUI server starts", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-2-gui-server-"));
    const firstManager = new GuiJobManager({
      cwd: process.cwd(),
      env: {},
      outputDir,
      generateImage: async () => ({
        data: [{ b64_json: Buffer.from("fake png").toString("base64") }],
      }),
    });
    const run = await firstManager.startRun({
      apiKey: "test-key",
      baseUrl: "https://api.example.com",
      endpointPath: "/images/generations",
      model: "gpt-image-2",
      size: "1024x1024",
      prompts: ["server persisted"],
      count: 1,
      concurrency: 1,
      dryRun: false,
    });
    await firstManager.waitForRun(run.id);

    const manager = new GuiJobManager({
      cwd: process.cwd(),
      env: {},
      outputDir,
    });
    const { server, url } = await startGuiServer({ port: 0, manager });
    try {
      const response = await fetch(`${url}/api/runs`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.runs.length, 1);
      assert.equal(body.runs[0].id, run.id);
      assert.equal(body.runs[0].jobs[0].images[0].filename, "image-01.png");
    } finally {
      await closeServer(server);
    }
  });

  it("renames and deletes runs through the GUI API", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-2-gui-server-"));
    const manager = new GuiJobManager({
      cwd: process.cwd(),
      env: {},
      outputDir,
      generateImage: async () => ({ data: [] }),
    });
    const run = await manager.startRun({
      apiKey: "test-key",
      baseUrl: "https://api.example.com",
      endpointPath: "/images/generations",
      model: "gpt-image-2",
      size: "1024x1024",
      prompts: ["editable"],
      count: 1,
      concurrency: 1,
      dryRun: false,
    });
    await manager.waitForRun(run.id);
    const { server, url } = await startGuiServer({ port: 0, manager });
    try {
      const renameResponse = await fetch(`${url}/api/runs/${encodeURIComponent(run.id)}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Edited name" }),
      });
      const renamed = await renameResponse.json();
      const deleteResponse = await fetch(`${url}/api/runs/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [run.id] }),
      });
      const deleted = await deleteResponse.json();

      assert.equal(renameResponse.status, 200);
      assert.equal(renamed.name, "Edited name");
      assert.equal(deleteResponse.status, 200);
      assert.deepEqual(deleted.deletedIds, [run.id]);
      assert.equal(manager.listRuns().length, 0);
    } finally {
      await closeServer(server);
    }
  });

  it("deletes selected run images through the GUI API", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-2-gui-server-"));
    const manager = new GuiJobManager({
      cwd: process.cwd(),
      env: {},
      outputDir,
      generateImage: async () => ({
        data: [{ b64_json: Buffer.from("fake png").toString("base64") }],
      }),
    });
    const run = await manager.startRun({
      apiKey: "test-key",
      baseUrl: "https://api.example.com",
      endpointPath: "/images/generations",
      model: "gpt-image-2",
      size: "1024x1024",
      prompts: ["delete image"],
      count: 1,
      concurrency: 1,
      dryRun: false,
    });
    await manager.waitForRun(run.id);
    const { server, url } = await startGuiServer({ port: 0, manager });
    try {
      const deleteResponse = await fetch(`${url}/api/runs/${encodeURIComponent(run.id)}/images/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [{ jobId: "0001", filename: "image-01.png" }] }),
      });
      const deleted = await deleteResponse.json();

      assert.equal(deleteResponse.status, 200);
      assert.deepEqual(deleted.deletedImages, [{ jobId: "0001", filename: "image-01.png" }]);
      assert.equal(manager.getRun(run.id).jobs[0].images.length, 0);
    } finally {
      await closeServer(server);
    }
  });
});

async function startMockImageServer() {
  const calls = [];
  const server = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
    }
    calls.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body,
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ data: [] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  return {
    server,
    calls,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function waitForRun(baseUrl, runId) {
  let latest;
  for (let index = 0; index < 20; index += 1) {
    const response = await fetch(`${baseUrl}/api/runs/${encodeURIComponent(runId)}`);
    latest = await response.json();
    if (latest.status !== "running") {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return latest;
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}
