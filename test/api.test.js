import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generateImage } from "../src/api.js";

describe("api", () => {
  it("includes low-level fetch cause details when the network request fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      const cause = new Error("connect EACCES 198.18.0.9:443");
      cause.code = "EACCES";
      throw new TypeError("fetch failed", { cause });
    };
    try {
      await assert.rejects(
        () =>
          generateImage(
            {
              apiKey: "test-key",
              endpointUrl: "https://api.example.com/images/generations",
              timeoutMs: 1000,
            },
            { model: "gpt-image-2", prompt: "test", n: 1, size: "1024x1024" },
          ),
        /Network request failed: fetch failed \(EACCES: connect EACCES 198\.18\.0\.9:443\)/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
