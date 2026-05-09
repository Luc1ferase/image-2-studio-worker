import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createResultSignature } from "../public/result-signature.js";

describe("result signature", () => {
  it("stays stable when only job status changes", () => {
    const run = {
      jobs: [
        {
          id: "0001",
          variant: 1,
          status: "completed",
          jobDir: "outputs/run/0001-variant-1",
          images: [{ filename: "image-01.png", revisedPrompt: "same" }],
        },
        {
          id: "0002",
          variant: 2,
          status: "running",
          jobDir: "outputs/run/0002-variant-2",
          images: [],
        },
      ],
    };
    const updated = {
      ...run,
      jobs: run.jobs.map((job) => ({ ...job, status: job.id === "0002" ? "failed" : job.status })),
    };

    assert.equal(createResultSignature(run), createResultSignature(updated));
  });

  it("changes when a new image becomes available", () => {
    const before = {
      jobs: [{ id: "0001", variant: 1, jobDir: "outputs/run/0001-variant-1", images: [] }],
    };
    const after = {
      jobs: [
        {
          id: "0001",
          variant: 1,
          jobDir: "outputs/run/0001-variant-1",
          images: [{ filename: "image-01.png" }],
        },
      ],
    };

    assert.notEqual(createResultSignature(before), createResultSignature(after));
  });
});
