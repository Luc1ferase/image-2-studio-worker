import fs from "node:fs/promises";
import path from "node:path";

import { downloadImage, extractImages, inferImageExtension } from "./images.js";

export function createRunId(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, "-");
  return `run-${stamp}`;
}

export function dateFolder(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function prepareRunDirectory(outputDir, runId) {
  const runDir = path.join(outputDir, dateFolder(), runId);
  await fs.mkdir(runDir, { recursive: true });
  return runDir;
}

export async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function appendManifest(outputDir, entry) {
  await fs.mkdir(outputDir, { recursive: true });
  const manifestPath = path.join(outputDir, "manifest.jsonl");
  await fs.appendFile(manifestPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function saveJobArtifacts({ config, job, runDir, requestBody, responseBody }) {
  const jobDir = path.join(runDir, `${job.id}-variant-${job.variant}`);
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, "prompt.txt"), `${job.prompt}\n`, "utf8");
  await writeJson(path.join(jobDir, "request.json"), redactRequest(requestBody));
  await writeJson(path.join(jobDir, "response.json"), responseBody);

  const images = extractImages(responseBody);
  const savedImages = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const imageNumber = String(index + 1).padStart(2, "0");
    if (image.kind === "base64") {
      const extension = inferImageExtension(image.data);
      const filename = `image-${imageNumber}.${extension}`;
      await fs.writeFile(path.join(jobDir, filename), image.data);
      savedImages.push({ filename, source: "b64_json", revisedPrompt: image.revisedPrompt });
      continue;
    }
    const downloaded = await downloadImage(image.url, config.timeoutMs);
    const filename = `image-${imageNumber}.${downloaded.extension}`;
    await fs.writeFile(path.join(jobDir, filename), downloaded.data);
    savedImages.push({ filename, source: image.url, revisedPrompt: image.revisedPrompt });
  }

  await appendManifest(config.outputDir, {
    runId: path.basename(runDir),
    jobId: job.id,
    variant: job.variant,
    prompt: job.prompt,
    model: config.model,
    size: config.size,
    endpointUrl: config.endpointUrl,
    jobDir,
    imageCount: savedImages.length,
    images: savedImages,
    createdAt: new Date().toISOString(),
  });

  return {
    jobDir,
    savedImages,
    ok: true,
  };
}

export async function saveJobError({ config, job, runDir, requestBody, error }) {
  const jobDir = path.join(runDir, `${job.id}-variant-${job.variant}`);
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, "prompt.txt"), `${job.prompt}\n`, "utf8");
  await writeJson(path.join(jobDir, "request.json"), redactRequest(requestBody));
  await writeJson(path.join(jobDir, "error.json"), {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : "Error",
    createdAt: new Date().toISOString(),
  });

  await appendManifest(config.outputDir, {
    runId: path.basename(runDir),
    jobId: job.id,
    variant: job.variant,
    prompt: job.prompt,
    model: config.model,
    size: config.size,
    endpointUrl: config.endpointUrl,
    jobDir,
    imageCount: 0,
    images: [],
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    createdAt: new Date().toISOString(),
  });

  return {
    jobDir,
    savedImages: [],
    ok: false,
  };
}

function redactRequest(requestBody) {
  return JSON.parse(JSON.stringify(requestBody));
}
