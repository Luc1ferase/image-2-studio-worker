import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseGuiPrompts } from "../public/prompt-parser.js";

describe("GUI prompt parser", () => {
  it("treats multiline text as one prompt by default", () => {
    const prompts = parseGuiPrompts("line one\nline two\nline three", { batchMode: false });

    assert.deepEqual(prompts, ["line one\nline two\nline three"]);
  });

  it("splits prompts by non-empty non-comment lines in batch mode", () => {
    const prompts = parseGuiPrompts("line one\n\n# ignored\nline two", { batchMode: true });

    assert.deepEqual(prompts, ["line one", "line two"]);
  });
});
