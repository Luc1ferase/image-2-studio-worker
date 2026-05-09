import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadDotEnv } from "../src/dotenv.js";

describe("dotenv", () => {
  it("loads .env values without overwriting existing env keys", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "image-2-env-"));
    await fs.writeFile(
      path.join(dir, ".env"),
      `
IMAGE_API_KEY=from-file
OPENAI_API_KEY="quoted-value"
EXISTING=from-file
`,
      "utf8",
    );
    const env = {
      EXISTING: "already-set",
    };

    await loadDotEnv(dir, env);

    assert.equal(env.IMAGE_API_KEY, "from-file");
    assert.equal(env.OPENAI_API_KEY, "quoted-value");
    assert.equal(env.EXISTING, "already-set");
  });
});
