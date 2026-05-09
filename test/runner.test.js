import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runConcurrent } from "../src/runner.js";

describe("runner", () => {
  it("runs jobs with a concurrency limit and keeps result order", async () => {
    let active = 0;
    let maxActive = 0;
    const jobs = [1, 2, 3, 4, 5];

    const results = await runConcurrent(jobs, 2, async (job) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return job * 10;
    });

    assert.deepEqual(results, [10, 20, 30, 40, 50]);
    assert.equal(maxActive, 2);
  });
});
