import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createJobsFromPrompts, parsePromptFileContent } from "../src/prompts.js";

describe("prompts", () => {
  it("loads one prompt per non-empty non-comment line", () => {
    const prompts = parsePromptFileContent(`
# ignored
cinematic mountain

minimal logo
`);

    assert.deepEqual(prompts, ["cinematic mountain", "minimal logo"]);
  });

  it("expands prompts by count while preserving stable job order", () => {
    const jobs = createJobsFromPrompts(["a", "b"], 2);

    assert.deepEqual(
      jobs.map((job) => ({ prompt: job.prompt, index: job.index, variant: job.variant })),
      [
        { prompt: "a", index: 1, variant: 1 },
        { prompt: "a", index: 2, variant: 2 },
        { prompt: "b", index: 3, variant: 1 },
        { prompt: "b", index: 4, variant: 2 },
      ],
    );
  });
});
