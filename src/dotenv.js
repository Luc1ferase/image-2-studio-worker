import fs from "node:fs/promises";
import path from "node:path";

export async function loadDotEnv(cwd, env) {
  const envPath = path.join(cwd, ".env");
  try {
    const content = await fs.readFile(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) {
        continue;
      }
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex < 0) {
        continue;
      }
      const key = trimmed.slice(0, equalsIndex).trim();
      const value = stripEnvQuotes(trimmed.slice(equalsIndex + 1).trim());
      if (key !== "" && env[key] === undefined) {
        env[key] = value;
      }
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function stripEnvQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
