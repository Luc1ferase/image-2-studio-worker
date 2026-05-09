import path from "node:path";

const DEFAULT_ENDPOINT_PATH = "/images/generations";
const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_SIZE = "1024x1024";
const DEFAULT_OUTPUT_DIR = "outputs";
const DEFAULT_COUNT = 1;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_TIMEOUT_MS = 300000;

const FLAG_DEFINITIONS = new Map([
  ["--api-key", "apiKey"],
  ["--base-url", "baseUrl"],
  ["--endpoint-path", "endpointPath"],
  ["--model", "model"],
  ["--prompt", "prompt"],
  ["--prompt-file", "promptFile"],
  ["--count", "count"],
  ["--concurrency", "concurrency"],
  ["--size", "size"],
  ["--quality", "quality"],
  ["--background", "background"],
  ["--output-format", "outputFormat"],
  ["--response-format", "responseFormat"],
  ["--output-dir", "outputDir"],
  ["--timeout-ms", "timeoutMs"],
]);

const BOOLEAN_FLAGS = new Map([
  ["--dry-run", "dryRun"],
  ["--help", "help"],
  ["-h", "help"],
  ["--verbose", "verbose"],
]);

const NUMBER_FIELDS = new Set(["count", "concurrency", "timeoutMs"]);

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (BOOLEAN_FLAGS.has(token)) {
      const key = BOOLEAN_FLAGS.get(token);
      args[key] = true;
      continue;
    }
    if (!FLAG_DEFINITIONS.has(token)) {
      throw new Error(`Unknown argument: ${token}`);
    }
    const key = FLAG_DEFINITIONS.get(token);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }
    index += 1;
    args[key] = NUMBER_FIELDS.has(key) ? parsePositiveInteger(value, token) : value;
  }
  return args;
}

export function normalizeModel(model) {
  const trimmed = String(model ?? "").trim();
  if (trimmed === "") {
    return DEFAULT_MODEL;
  }
  if (trimmed === "image-2") {
    return DEFAULT_MODEL;
  }
  if (trimmed.startsWith("gpt-image-")) {
    return trimmed;
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

export function buildConfig({ argv, env, cwd }) {
  const parsed = parseArgs(argv);
  const baseUrl = parsed.baseUrl ?? env.IMAGE_API_BASE_URL ?? env.OPENAI_BASE_URL ?? "";
  const endpointPath = parsed.endpointPath ?? env.IMAGE_API_ENDPOINT_PATH ?? DEFAULT_ENDPOINT_PATH;
  const outputDir = path.resolve(cwd, parsed.outputDir ?? env.IMAGE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR);
  const apiKey = parsed.apiKey ?? env.IMAGE_API_KEY ?? env.OPENAI_API_KEY ?? "";
  const count = parsed.count ?? parseOptionalPositiveInteger(env.IMAGE_COUNT, DEFAULT_COUNT);
  const concurrency =
    parsed.concurrency ?? parseOptionalPositiveInteger(env.IMAGE_CONCURRENCY, DEFAULT_CONCURRENCY);
  const timeoutMs =
    parsed.timeoutMs ?? parseOptionalPositiveInteger(env.IMAGE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  return {
    apiKey,
    baseUrl,
    endpointPath,
    endpointUrl: buildEndpointUrl(baseUrl, endpointPath),
    model: normalizeModel(parsed.model ?? env.IMAGE_MODEL ?? DEFAULT_MODEL),
    prompt: parsed.prompt,
    promptFile: parsed.promptFile,
    count,
    concurrency,
    size: parsed.size ?? env.IMAGE_SIZE ?? DEFAULT_SIZE,
    quality: parsed.quality ?? env.IMAGE_QUALITY,
    background: parsed.background ?? env.IMAGE_BACKGROUND,
    outputFormat: parsed.outputFormat ?? env.IMAGE_OUTPUT_FORMAT,
    responseFormat: parsed.responseFormat ?? env.IMAGE_RESPONSE_FORMAT ?? "",
    outputDir,
    timeoutMs,
    dryRun: parsed.dryRun === true,
    help: parsed.help === true,
    verbose: parsed.verbose === true,
  };
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

export function isGptImageModel(model) {
  return String(model ?? "").trim().startsWith("gpt-image-");
}

export function usageText() {
  return `
Usage:
  npm run gui

Image-2 Studio is configured from the local browser GUI.

Environment:
  Optional GUI defaults: IMAGE_API_BASE_URL, IMAGE_API_ENDPOINT_PATH,
  IMAGE_API_KEY, IMAGE_MODEL, IMAGE_SIZE, IMAGE_QUALITY,
  IMAGE_OUTPUT_FORMAT, IMAGE_TIMEOUT_MS.
`.trim();
}

function ensureLeadingSlash(value) {
  if (value === "") {
    return DEFAULT_ENDPOINT_PATH;
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return parsed;
}

function parseOptionalPositiveInteger(value, fallback) {
  if (value === undefined || String(value).trim() === "") {
    return fallback;
  }
  return parsePositiveInteger(String(value), "environment value");
}

function setOptional(target, key, value) {
  if (value !== undefined && String(value).trim() !== "") {
    target[key] = value;
  }
}
