import fs from "node:fs/promises";
import path from "node:path";

import { generateImage as defaultGenerateImage } from "../api.js";
import { buildEndpointUrl, createRequestBody, normalizeModel } from "../config.js";
import { createRunId, prepareRunDirectory, saveJobArtifacts, saveJobError, writeJson } from "../output.js";
import { createJobsFromPrompts } from "../prompts.js";
import { runConcurrent } from "../runner.js";

export const DEFAULT_GUI_TIMEOUT_MS = 900000;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export class GuiJobManager {
  constructor(options = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? process.env;
    this.outputDir = options.outputDir ?? path.resolve(this.cwd, "outputs");
    this.generateImage = options.generateImage ?? defaultGenerateImage;
    this.runs = new Map();
  }

  async startRun(input) {
    const prompts = normalizePrompts(input.prompts);
    if (prompts.length === 0) {
      throw new Error("At least one prompt is required");
    }
    const config = this.buildRunConfig(input);
    if (!config.dryRun && config.apiKey.trim() === "") {
      throw new Error("API key is required unless dry-run is enabled");
    }

    const runId = createRunId();
    const runDir = await prepareRunDirectory(config.outputDir, runId);
    const jobs = createJobsFromPrompts(prompts, config.count).map((job) => ({
      ...job,
      status: "queued",
      jobDir: "",
      images: [],
      error: "",
      startedAt: "",
      completedAt: "",
    }));
    const run = {
      id: runId,
      status: "running",
      runDir,
      config: publicConfig(config),
      jobs,
      summary: {
        total: jobs.length,
        queued: jobs.length,
        running: 0,
        completed: 0,
        failed: 0,
      },
      createdAt: new Date().toISOString(),
      completedAt: "",
      promise: undefined,
    };

    this.runs.set(run.id, run);
    await writeJson(path.join(runDir, "run-config.json"), {
      ...run.config,
      jobCount: jobs.length,
      createdAt: run.createdAt,
    });
    run.promise = this.executeRun(run, config);
    return this.getRun(run.id);
  }

  async loadPersistedRuns() {
    const runDirs = await findRunDirectories(this.outputDir);
    for (const runDir of runDirs) {
      const run = await loadRunFromDirectory(runDir);
      if (run) {
        this.runs.set(run.id, run);
      }
    }
  }

  listRuns() {
    return Array.from(this.runs.values())
      .map((run) => this.snapshot(run))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getRun(id) {
    const run = this.runs.get(id);
    if (!run) {
      throw new Error(`Run not found: ${id}`);
    }
    return this.snapshot(run);
  }

  async renameRun(id, name) {
    const run = this.runs.get(id);
    if (!run) {
      throw new Error(`Run not found: ${id}`);
    }
    const trimmed = String(name ?? "").trim();
    if (trimmed === "") {
      throw new Error("Run name cannot be empty");
    }
    run.name = trimmed;
    run.config = {
      ...run.config,
      name: trimmed,
    };
    await writeJson(path.join(run.runDir, "run-config.json"), {
      ...run.config,
      jobCount: run.jobs.length,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
    });
    return this.snapshot(run);
  }

  async deleteRuns(ids) {
    const uniqueIds = Array.from(new Set(Array.isArray(ids) ? ids.map((id) => String(id)) : []));
    const deletedIds = [];
    for (const id of uniqueIds) {
      const run = this.runs.get(id);
      if (!run) {
        continue;
      }
      await fs.rm(run.runDir, { recursive: true, force: true });
      this.runs.delete(id);
      deletedIds.push(id);
    }
    return { deletedIds };
  }

  async deleteRunImages(id, images) {
    const run = this.runs.get(id);
    if (!run) {
      throw new Error(`Run not found: ${id}`);
    }
    const requestedImages = normalizeImageDeleteRequest(images);
    const deletedImages = [];
    for (const requested of requestedImages) {
      const job = run.jobs.find((candidate) => candidate.id === requested.jobId);
      if (!job) {
        continue;
      }
      const imageIndex = job.images.findIndex((image) => image.filename === requested.filename);
      if (imageIndex < 0) {
        continue;
      }
      const imagePath = path.join(job.jobDir, requested.filename);
      if (!isSafeChildPath(imagePath, job.jobDir)) {
        continue;
      }
      await fs.rm(imagePath, { force: true });
      job.images.splice(imageIndex, 1);
      deletedImages.push(requested);
    }
    return { deletedImages };
  }

  async waitForRun(id) {
    const run = this.runs.get(id);
    if (!run) {
      throw new Error(`Run not found: ${id}`);
    }
    await run.promise;
    return this.getRun(id);
  }

  buildRunConfig(input) {
    const baseUrl = nonEmpty(input.baseUrl) ?? nonEmpty(this.env.IMAGE_API_BASE_URL) ?? nonEmpty(this.env.OPENAI_BASE_URL) ?? "";
    const endpointPath = nonEmpty(input.endpointPath) ?? this.env.IMAGE_API_ENDPOINT_PATH ?? "/images/generations";
    const model = normalizeModel(nonEmpty(input.model) ?? this.env.IMAGE_MODEL ?? "gpt-image-2");
    return {
      apiKey: nonEmpty(input.apiKey) ?? this.env.IMAGE_API_KEY ?? this.env.OPENAI_API_KEY ?? "",
      baseUrl,
      endpointPath,
      endpointUrl: buildEndpointUrl(baseUrl, endpointPath),
      model,
      count: positiveInteger(input.count, 1),
      concurrency: positiveInteger(input.concurrency, 1),
      size: nonEmpty(input.size) ?? this.env.IMAGE_SIZE ?? "1024x1024",
      responseFormat: nonEmpty(input.responseFormat) ?? this.env.IMAGE_RESPONSE_FORMAT ?? "",
      quality: nonEmpty(input.quality) ?? this.env.IMAGE_QUALITY,
      background: nonEmpty(input.background) ?? this.env.IMAGE_BACKGROUND,
      outputFormat: nonEmpty(input.outputFormat) ?? this.env.IMAGE_OUTPUT_FORMAT,
      outputDir: this.outputDir,
      timeoutMs: positiveInteger(input.timeoutMs, DEFAULT_GUI_TIMEOUT_MS),
      dryRun: input.dryRun === true,
    };
  }

  async executeRun(run, config) {
    await runConcurrent(run.jobs, config.concurrency, async (job) => {
      job.status = "running";
      job.startedAt = new Date().toISOString();
      this.recalculateSummary(run);
      const requestBody = createRequestBody(config, job.prompt);
      try {
        const responseBody = config.dryRun
          ? { dry_run: true, data: [] }
          : await this.generateImage(config, requestBody);
        const saved = await saveJobArtifacts({ config, job, runDir: run.runDir, requestBody, responseBody });
        job.status = "completed";
        job.jobDir = saved.jobDir;
        job.images = saved.savedImages;
        job.completedAt = new Date().toISOString();
      } catch (error) {
        const saved = await saveJobError({ config, job, runDir: run.runDir, requestBody, error });
        job.status = "failed";
        job.jobDir = saved.jobDir;
        job.error = error instanceof Error ? error.message : String(error);
        job.completedAt = new Date().toISOString();
      } finally {
        this.recalculateSummary(run);
      }
    });
    run.completedAt = new Date().toISOString();
    run.status = run.summary.failed > 0 ? "failed" : "completed";
  }

  recalculateSummary(run) {
    const summary = {
      total: run.jobs.length,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };
    for (const job of run.jobs) {
      if (job.status === "queued") {
        summary.queued += 1;
      } else if (job.status === "running") {
        summary.running += 1;
      } else if (job.status === "completed") {
        summary.completed += 1;
      } else if (job.status === "failed") {
        summary.failed += 1;
      }
    }
    run.summary = summary;
  }

  snapshot(run) {
    return {
      id: run.id,
      name: run.name ?? run.config.name ?? run.id,
      status: run.status,
      runDir: run.runDir,
      config: { ...run.config },
      jobs: run.jobs.map((job) => ({ ...job, images: [...job.images] })),
      summary: { ...run.summary },
      createdAt: run.createdAt,
      completedAt: run.completedAt,
    };
  }
}

async function findRunDirectories(outputDir) {
  const dateEntries = await readDirectory(outputDir);
  const runDirs = [];
  for (const dateEntry of dateEntries) {
    if (!dateEntry.isDirectory()) {
      continue;
    }
    const dateDir = path.join(outputDir, dateEntry.name);
    const runEntries = await readDirectory(dateDir);
    for (const runEntry of runEntries) {
      if (runEntry.isDirectory() && runEntry.name.startsWith("run-")) {
        runDirs.push(path.join(dateDir, runEntry.name));
      }
    }
  }
  return runDirs;
}

async function loadRunFromDirectory(runDir) {
  const config = await readJsonIfExists(path.join(runDir, "run-config.json"));
  if (!config) {
    return undefined;
  }
  const jobs = await loadJobsFromRunDirectory(runDir);
  const run = {
    id: path.basename(runDir),
    name: typeof config.name === "string" && config.name.trim() !== "" ? config.name : path.basename(runDir),
    status: "completed",
    runDir,
    config,
    jobs,
    summary: summarizeJobs(jobs),
    createdAt: typeof config.createdAt === "string" ? config.createdAt : createdAtFromRunId(path.basename(runDir)),
    completedAt: latestCompletedAt(jobs),
    promise: Promise.resolve(),
  };
  run.status = run.summary.failed > 0 ? "failed" : "completed";
  return run;
}

async function loadJobsFromRunDirectory(runDir) {
  const entries = await readDirectory(runDir);
  const jobs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const match = /^(\d+)-variant-(\d+)$/.exec(entry.name);
    if (!match) {
      continue;
    }
    const jobDir = path.join(runDir, entry.name);
    const errorJson = await readJsonIfExists(path.join(jobDir, "error.json"));
    const responseJson = await readJsonIfExists(path.join(jobDir, "response.json"));
    const prompt = await readTextIfExists(path.join(jobDir, "prompt.txt"));
    const images = await loadSavedImages(jobDir, responseJson);
    jobs.push({
      id: match[1],
      prompt: prompt.trim(),
      variant: Number.parseInt(match[2], 10),
      status: errorJson ? "failed" : "completed",
      jobDir,
      images,
      error: errorJson && typeof errorJson.message === "string" ? errorJson.message : "",
      startedAt: "",
      completedAt: completedAtFromJob(errorJson),
    });
  }
  return jobs.sort((left, right) => left.id.localeCompare(right.id) || left.variant - right.variant);
}

async function loadSavedImages(jobDir, responseJson) {
  const entries = await readDirectory(jobDir);
  const revisedPrompts = revisedPromptsFromResponse(responseJson);
  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry, index) => ({
      filename: entry.name,
      source: "file",
      revisedPrompt: revisedPrompts[index],
    }));
}

function revisedPromptsFromResponse(responseJson) {
  if (!responseJson || !Array.isArray(responseJson.data)) {
    return [];
  }
  return responseJson.data.map((item) =>
    item && typeof item.revised_prompt === "string" ? item.revised_prompt : undefined,
  );
}

function summarizeJobs(jobs) {
  const summary = {
    total: jobs.length,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
  };
  for (const job of jobs) {
    if (job.status === "failed") {
      summary.failed += 1;
    } else if (job.status === "completed") {
      summary.completed += 1;
    }
  }
  return summary;
}

function latestCompletedAt(jobs) {
  return jobs
    .map((job) => job.completedAt)
    .filter((value) => value !== "")
    .sort()
    .at(-1) ?? "";
}

function completedAtFromJob(errorJson) {
  return errorJson && typeof errorJson.createdAt === "string" ? errorJson.createdAt : "";
}

function createdAtFromRunId(runId) {
  const raw = runId.replace(/^run-/, "").replace(/-(\d{3})Z$/, ".$1Z");
  return raw.replace(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/,
    "$1-$2-$3T$4:$5:$6",
  );
}

async function readDirectory(dirPath) {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function normalizePrompts(prompts) {
  if (!Array.isArray(prompts)) {
    return [];
  }
  return prompts.map((prompt) => String(prompt).trim()).filter((prompt) => prompt !== "");
}

function nonEmpty(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = String(value).trim();
  return trimmed === "" ? undefined : trimmed;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function publicConfig(config) {
  return {
    baseUrl: config.baseUrl,
    endpointPath: config.endpointPath,
    endpointUrl: config.endpointUrl,
    model: config.model,
    count: config.count,
    concurrency: config.concurrency,
    size: config.size,
    responseFormat: config.responseFormat,
    quality: config.quality ?? "",
    background: config.background ?? "",
    outputFormat: config.outputFormat ?? "",
    outputDir: config.outputDir,
    dryRun: config.dryRun,
  };
}

function normalizeImageDeleteRequest(images) {
  if (!Array.isArray(images)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (const image of images) {
    if (!image || typeof image !== "object") {
      continue;
    }
    const jobId = String(image.jobId ?? "").trim();
    const filename = String(image.filename ?? "").trim();
    if (jobId === "" || !isSafeFilename(filename)) {
      continue;
    }
    const key = `${jobId}/${filename}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({ jobId, filename });
  }
  return normalized;
}

function isSafeFilename(filename) {
  return filename !== "" && filename === path.basename(filename) && !filename.includes("/") && !filename.includes("\\");
}

function isSafeChildPath(filePath, root) {
  const relative = path.relative(root, filePath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
