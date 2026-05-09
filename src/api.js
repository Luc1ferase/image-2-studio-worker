export async function generateImage(config, requestBody) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(config.endpointUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    const text = await response.text();
    const responseBody = parseResponseText(text);
    if (!response.ok) {
      const message = extractErrorMessage(responseBody) ?? text.slice(0, 500) ?? "empty response body";
      throw new Error(`API request failed with HTTP ${response.status}: ${message}`);
    }
    return responseBody;
  } catch (error) {
    throw new Error(`Network request failed: ${formatNetworkError(error)}`, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

function parseResponseText(text) {
  if (text.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractErrorMessage(body) {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  if (typeof body.error === "string") {
    return body.error;
  }
  if (body.error && typeof body.error.message === "string") {
    return body.error.message;
  }
  if (typeof body.message === "string") {
    return body.message;
  }
  return undefined;
}

function formatNetworkError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = error.cause;
  const causeMessage = formatErrorCause(cause);
  return causeMessage === "" ? error.message : `${error.message} (${causeMessage})`;
}

function formatErrorCause(cause) {
  if (!(cause instanceof Error)) {
    return "";
  }
  const code = typeof cause.code === "string" && cause.code.trim() !== "" ? `${cause.code}: ` : "";
  return `${code}${cause.message}`;
}
