import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { saveJobError } from "../src/output.js";

describe("output", () => {
  it("saves failed job artifacts and appends manifest entry", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-2-output-"));
    const runDir = path.join(outputDir, "2026-05-07", "run-test");
    const config = {
      outputDir,
      endpointUrl: "https://api.example.com/images/generations",
      model: "gpt-image-2",
      size: "1024x1024",
    };
    const job = {
      id: "0001",
      variant: 1,
      prompt: "broken",
    };

    const saved = await saveJobError({
      config,
      job,
      runDir,
      requestBody: { model: "gpt-image-2", prompt: "broken" },
      error: new Error("HTTP 500"),
    });

    const errorJson = JSON.parse(await fs.readFile(path.join(saved.jobDir, "error.json"), "utf8"));
    const manifest = await fs.readFile(path.join(outputDir, "manifest.jsonl"), "utf8");

    assert.equal(errorJson.message, "HTTP 500");
    assert.match(manifest, /"status":"failed"/);
  });
});
