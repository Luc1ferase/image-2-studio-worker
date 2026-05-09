const DEFAULT_ENDPOINT_PATH = "/images/generations";
const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_SIZE = "1024x1024";
const DEFAULT_COUNT = 1;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_TIMEOUT_MS = 900000;

export function buildRunConfig(input = {}, env = {}) {
  const baseUrl = nonEmpty(input.baseUrl) ?? nonEmpty(env.IMAGE_API_BASE_URL) ?? nonEmpty(env.OPENAI_BASE_URL) ?? "";
  const endpointPath = nonEmpty(input.endpointPath) ?? env.IMAGE_API_ENDPOINT_PATH ?? DEFAULT_ENDPOINT_PATH;
  const model = normalizeModel(nonEmpty(input.model) ?? env.IMAGE_MODEL ?? DEFAULT_MODEL);
  return {
    apiKey: nonEmpty(input.apiKey) ?? env.IMAGE_API_KEY ?? env.OPENAI_API_KEY ?? "",
    baseUrl,
    endpointPath,
    endpointUrl: buildEndpointUrl(baseUrl, endpointPath),
    model,
    count: positiveInteger(input.count, DEFAULT_COUNT),
    concurrency: positiveInteger(input.concurrency, DEFAULT_CONCURRENCY),
    size: nonEmpty(input.size) ?? env.IMAGE_SIZE ?? DEFAULT_SIZE,
    responseFormat: nonEmpty(input.responseFormat) ?? env.IMAGE_RESPONSE_FORMAT ?? "",
    quality: nonEmpty(input.quality) ?? env.IMAGE_QUALITY,
    background: nonEmpty(input.background) ?? env.IMAGE_BACKGROUND,
    outputFormat: nonEmpty(input.outputFormat) ?? env.IMAGE_OUTPUT_FORMAT,
    timeoutMs: positiveInteger(input.timeoutMs, DEFAULT_TIMEOUT_MS),
    dryRun: input.dryRun === true,
  };
}

export function publicConfig(config) {
  return {
    baseUrl: config.baseUrl,
    endpointPath: config.endpointPath,
    endpointUrl: config.endpointUrl,
    model: config.model,
    count: config.count,
    concurrency: config.concurrency,
    size: config.size,
    quality: config.quality ?? "",
    outputFormat: config.outputFormat ?? "",
    responseFormat: config.responseFormat ?? "",
    timeoutMs: config.timeoutMs,
    dryRun: config.dryRun,
  };
}

export function normalizeModel(model) {
  const trimmed = String(model ?? "").trim();
  if (trimmed === "") {
    return DEFAULT_MODEL;
  }
  if (trimmed === "image-2") {
    return DEFAULT_MODEL;
  }
  return trimmed;
}

export function buildEndpointUrl(baseUrl, endpointPath) {
  const normalizedBase = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  const normalizedPath = ensureLeadingSlash(String(endpointPath ?? "").trim());
  if (normalizedBase === "") {
    throw new Error("Base URL cannot be empty");
  }
  return `${normalizedBase}${normalizedPath}`;
}

export function createRequestBody(config, prompt) {
  const body = {
    model: config.model,
    prompt,
    n: 1,
    size: config.size,
  };
  if (!isGptImageModel(config.model)) {
    setOptional(body, "response_format", config.responseFormat);
  }
  setOptional(body, "quality", config.quality);
  setOptional(body, "background", config.background);
  setOptional(body, "output_format", config.outputFormat);
  return body;
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

export function normalizePrompts(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((prompt) => String(prompt ?? "").trim()).filter((prompt) => prompt !== "");
}

export function createRunId(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, "-");
  return `run-${stamp}`;
}

function isGptImageModel(model) {
  return String(model ?? "").trim().startsWith("gpt-image-");
}

function ensureLeadingSlash(value) {
  if (value === "") {
    return DEFAULT_ENDPOINT_PATH;
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonEmpty(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

function setOptional(target, key, value) {
  if (value !== undefined && String(value).trim() !== "") {
    target[key] = value;
  }
}
