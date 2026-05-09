import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { GuiJobManager } from "../src/gui/job-manager.js";

describe("GuiJobManager", () => {
  it("runs dry-run jobs and exposes completed status", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-2-gui-"));
    const manager = new GuiJobManager({
      cwd: process.cwd(),
      env: {},
      outputDir,
    });

    const run = await manager.startRun({
      apiKey: "",
      baseUrl: "https://api.example.com",
      endpointPath: "/images/generations",
      model: "image-2",
      size: "1024x1024",
      responseFormat: "b64_json",
      prompts: ["first", "second"],
      count: 1,
      concurrency: 2,
      dryRun: true,
    });

    await manager.waitForRun(run.id);
    const snapshot = manager.getRun(run.id);

    assert.equal(snapshot.status, "completed");
    assert.equal(snapshot.jobs.length, 2);
    assert.equal(snapshot.summary.completed, 2);
    assert.equal(snapshot.summary.failed, 0);
    assert.equal(snapshot.config.model, "gpt-image-2");
  });

  it("keeps processing jobs when one request fails", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-2-gui-"));
    let calls = 0;
    const manager = new GuiJobManager({
      cwd: process.cwd(),
      env: {},
      outputDir,
      generateImage: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("upstream failed");
        }
        return { data: [] };
      },
    });

    const run = await manager.startRun({
      apiKey: "test-key",
      baseUrl: "https://api.example.com",
      endpointPath: "/images/generations",
      model: "gpt-image-2",
      size: "1024x1024",
      responseFormat: "b64_json",
      prompts: ["first", "second"],
      count: 1,
      concurrency: 1,
      dryRun: false,
    });

    await manager.waitForRun(run.id);
    const snapshot = manager.getRun(run.id);

    assert.equal(snapshot.status, "failed");
    assert.equal(snapshot.summary.completed, 1);
    assert.equal(snapshot.summary.failed, 1);
    assert.equal(snapshot.jobs[0].status, "failed");
    assert.equal(snapshot.jobs[1].status, "completed");
  });

  it("defaults GUI requests to a fifteen minute timeout for slow high-resolution images", async () => {
    const manager = new GuiJobManager({
      cwd: process.cwd(),
      env: {},
    });

    const config = manager.buildRunConfig({
      apiKey: "test-key",
      baseUrl: "https://api.example.com",
      endpointPath: "/images/generations",
      model: "gpt-image-2",
      size: "3840x2160",
      count: 1,
      concurrency: 1,
      dryRun: false,
    });

    assert.equal(config.timeoutMs, 900000);
  });

  it("requires a Base URL instead of falling back to a private default", () => {
    const manager = new GuiJobManager({
      cwd: process.cwd(),
      env: {},
    });

    assert.throws(
      () =>
        manager.buildRunConfig({
          apiKey: "test-key",
          baseUrl: "",
          endpointPath: "/images/generations",
          model: "gpt-image-2",
          size: "1024x1024",
          count: 1,
          concurrency: 1,
          dryRun: false,
        }),
      /Base URL cannot be empty/,
    );
  });

  it("uses the GUI environment Base URL when the request field is left blank", () => {
    const manager = new GuiJobManager({
      cwd: process.cwd(),
      env: { IMAGE_API_BASE_URL: "https://api.example.com" },
    });

    const config = manager.buildRunConfig({
      apiKey: "test-key",
      baseUrl: "",
      endpointPath: "/images/generations",
      model: "gpt-image-2",
      size: "1024x1024",
      count: 1,
      concurrency: 1,
      dryRun: false,
    });

    assert.equal(config.baseUrl, "https://api.example.com");
    assert.equal(config.endpointUrl, "https://api.example.com/images/generations");
  });

  it("loads completed runs from the output directory after restart", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-2-gui-"));
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
      prompts: ["persist me"],
      count: 1,
      concurrency: 1,
      dryRun: false,
    });
    await manager.waitForRun(run.id);

    const restarted = new GuiJobManager({
      cwd: process.cwd(),
      env: {},
      outputDir,
    });
    await restarted.loadPersistedRuns();
    const runs = restarted.listRuns();

    assert.equal(runs.length, 1);
    assert.equal(runs[0].id, run.id);
    assert.equal(runs[0].status, "completed");
    assert.equal(runs[0].summary.completed, 1);
    assert.equal(runs[0].jobs[0].prompt, "persist me");
    assert.equal(runs[0].jobs[0].images[0].filename, "image-01.png");
  });

  it("deletes selected image files from a persisted run", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-2-gui-"));
    const manager = new GuiJobManager({
      cwd: process.cwd(),
      env: {},
      outputDir,
      generateImage: async () => ({
        data: [
          { b64_json: Buffer.from("fake png one").toString("base64") },
          { b64_json: Buffer.from("fake png two").toString("base64") },
        ],
      }),
    });

    const run = await manager.startRun({
      apiKey: "test-key",
      baseUrl: "https://api.example.com",
      endpointPath: "/images/generations",
      model: "gpt-image-2",
      size: "1024x1024",
      prompts: ["delete one image"],
      count: 1,
      concurrency: 1,
      dryRun: false,
    });
    await manager.waitForRun(run.id);

    const deleted = await manager.deleteRunImages(run.id, [
      { jobId: "0001", filename: "image-01.png" },
    ]);
    const snapshot = manager.getRun(run.id);

    assert.deepEqual(deleted.deletedImages, [{ jobId: "0001", filename: "image-01.png" }]);
    assert.deepEqual(
      snapshot.jobs[0].images.map((image) => image.filename),
      ["image-02.png"],
    );
    await assert.rejects(
      () => fs.access(path.join(run.runDir, "0001-variant-1", "image-01.png")),
      /ENOENT/,
    );
    await fs.access(path.join(run.runDir, "0001-variant-1", "image-02.png"));
  });

  it("renames and deletes persisted runs", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-2-gui-"));
    const manager = new GuiJobManager({
      cwd: process.cwd(),
      env: {},
      outputDir,
      generateImage: async () => ({ data: [] }),
    });
    const first = await manager.startRun({
      apiKey: "test-key",
      baseUrl: "https://api.example.com",
      endpointPath: "/images/generations",
      model: "gpt-image-2",
      size: "1024x1024",
      prompts: ["first"],
      count: 1,
      concurrency: 1,
      dryRun: false,
    });
    const second = await manager.startRun({
      apiKey: "test-key",
      baseUrl: "https://api.example.com",
      endpointPath: "/images/generations",
      model: "gpt-image-2",
      size: "1024x1024",
      prompts: ["second"],
      count: 1,
      concurrency: 1,
      dryRun: false,
    });
    await manager.waitForRun(first.id);
    await manager.waitForRun(second.id);

    const renamed = await manager.renameRun(first.id, "Client poster");
    await manager.deleteRuns([second.id]);

    assert.equal(renamed.name, "Client poster");
    assert.equal(manager.getRun(first.id).name, "Client poster");
    assert.throws(() => manager.getRun(second.id), /Run not found/);
    await assert.rejects(() => fs.access(second.runDir), /ENOENT/);

    const reloaded = new GuiJobManager({ cwd: process.cwd(), env: {}, outputDir });
    await reloaded.loadPersistedRuns();
    assert.equal(reloaded.getRun(first.id).name, "Client poster");
    assert.equal(reloaded.listRuns().some((run) => run.id === second.id), false);
  });
});
