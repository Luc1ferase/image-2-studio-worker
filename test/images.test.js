import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { extractImages, inferImageExtension } from "../src/images.js";

describe("images", () => {
  it("extracts b64_json images from OpenAI image responses", () => {
    const response = {
      created: 123,
      data: [
        {
          b64_json: Buffer.from("fake png").toString("base64"),
          revised_prompt: "new prompt",
        },
      ],
    };

    const images = extractImages(response);

    assert.equal(images.length, 1);
    assert.equal(images[0].kind, "base64");
    assert.equal(images[0].revisedPrompt, "new prompt");
    assert.equal(images[0].data.toString(), "fake png");
  });

  it("extracts URL images from OpenAI image responses", () => {
    const images = extractImages({
      data: [{ url: "https://example.com/image.webp" }],
    });

    assert.equal(images.length, 1);
    assert.equal(images[0].kind, "url");
    assert.equal(images[0].url, "https://example.com/image.webp");
  });

  it("infers file extensions from image bytes", () => {
    assert.equal(inferImageExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "png");
    assert.equal(inferImageExtension(Buffer.from([0xff, 0xd8, 0xff])), "jpg");
    assert.equal(inferImageExtension(Buffer.from("RIFFxxxxWEBP")), "webp");
  });
});
