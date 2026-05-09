import fs from "node:fs/promises";
import path from "node:path";

export function parsePromptFileContent(content) {
  return String(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

export async function loadPrompts(config, cwd) {
  const prompts = [];
  if (config.prompt !== undefined && String(config.prompt).trim() !== "") {
    prompts.push(String(config.prompt).trim());
  }
  if (config.promptFile !== undefined && String(config.promptFile).trim() !== "") {
    const promptPath = path.resolve(cwd, config.promptFile);
    const content = await fs.readFile(promptPath, "utf8");
    prompts.push(...parsePromptFileContent(content));
  }
  if (prompts.length === 0) {
    throw new Error("Provide --prompt or --prompt-file");
  }
  return prompts;
}

export function createJobsFromPrompts(prompts, count) {
  const jobs = [];
  let index = 1;
  for (const prompt of prompts) {
    for (let variant = 1; variant <= count; variant += 1) {
      jobs.push({
        id: String(index).padStart(4, "0"),
        index,
        variant,
        prompt,
      });
      index += 1;
    }
  }
  return jobs;
}
