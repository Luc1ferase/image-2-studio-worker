import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildConfig,
  buildEndpointUrl,
  createRequestBody,
  normalizeModel,
  parseArgs,
} from "../src/config.js";

describe("config", () => {
  it("normalizes image-2 shorthand to sub2api-compatible model name", () => {
    assert.equal(normalizeModel("image-2"), "gpt-image-2");
    assert.equal(normalizeModel("gpt-image-2"), "gpt-image-2");
  });

  it("uses the non-v1 sub2api image endpoint by default", () => {
    const url = buildEndpointUrl("https://api.example.com", "/images/generations");

    assert.equal(url, "https://api.example.com/images/generations");
  });

  it("parses CLI flags into typed options", () => {
    const args = parseArgs([
      "--prompt",
      "a red moon",
      "--count",
      "3",
      "--concurrency",
      "2",
      "--size",
      "1024x1024",
      "--model",
      "image-2",
      "--endpoint-path",
      "/v1/images/generations",
      "--dry-run",
    ]);

    assert.equal(args.prompt, "a red moon");
    assert.equal(args.count, 3);
    assert.equal(args.concurrency, 2);
    assert.equal(args.size, "1024x1024");
    assert.equal(args.model, "image-2");
    assert.equal(args.endpointPath, "/v1/images/generations");
    assert.equal(args.dryRun, true);
  });

  it("builds config from env and args without exposing secrets", () => {
    const config = buildConfig({
      argv: ["--prompt", "city", "--count", "2"],
      env: {
        IMAGE_API_KEY: "secret-key",
        IMAGE_API_BASE_URL: "https://api.example.com",
      },
      cwd: "X:/project",
    });

    assert.equal(config.apiKey, "secret-key");
    assert.equal(config.model, "gpt-image-2");
    assert.equal(config.endpointUrl, "https://api.example.com/images/generations");
    assert.equal(config.outputDir.endsWith("outputs"), true);
  });

  it("requires the Base URL from args or env instead of using a built-in host", () => {
    assert.throws(
      () =>
        buildConfig({
          argv: ["--prompt", "city"],
          env: {
            IMAGE_API_KEY: "secret-key",
          },
          cwd: "X:/project",
        }),
      /Base URL cannot be empty/,
    );
  });

  it("omits response_format for GPT image models and keeps image output options", () => {
    const body = createRequestBody(
      {
        model: "gpt-image-2",
        size: "3840x2160",
        responseFormat: "b64_json",
        quality: "high",
        outputFormat: "jpeg",
      },
      "wide poster",
    );

    assert.equal(body.model, "gpt-image-2");
    assert.equal(body.size, "3840x2160");
    assert.equal(body.quality, "high");
    assert.equal(body.output_format, "jpeg");
    assert.equal("response_format" in body, false);
  });
});
