const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const JPG_SIGNATURE = [0xff, 0xd8, 0xff];

export function extractImages(response) {
  if (!response || !Array.isArray(response.data)) {
    return [];
  }
  const images = [];
  for (const item of response.data) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const revisedPrompt =
      typeof item.revised_prompt === "string" && item.revised_prompt.trim() !== ""
        ? item.revised_prompt
        : undefined;
    if (typeof item.b64_json === "string" && item.b64_json.trim() !== "") {
      images.push({
        kind: "base64",
        data: base64ToBytes(normalizeBase64(item.b64_json)),
        revisedPrompt,
      });
      continue;
    }
    if (typeof item.url === "string" && item.url.trim() !== "") {
      images.push({
        kind: "url",
        url: item.url,
        revisedPrompt,
      });
    }
  }
  return images;
}

export function inferImageExtension(data, contentType = "") {
  const normalizedType = contentType.toLowerCase();
  if (normalizedType.includes("png")) {
    return "png";
  }
  if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) {
    return "jpg";
  }
  if (normalizedType.includes("webp")) {
    return "webp";
  }
  if (startsWithBytes(data, PNG_SIGNATURE)) {
    return "png";
  }
  if (startsWithBytes(data, JPG_SIGNATURE)) {
    return "jpg";
  }
  if (
    data.length >= 12 &&
    bytesToAscii(data.slice(0, 4)) === "RIFF" &&
    bytesToAscii(data.slice(8, 12)) === "WEBP"
  ) {
    return "webp";
  }
  return "png";
}

export async function downloadImage(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "image/*,*/*;q=0.8",
      },
    });
    if (!response.ok) {
      throw new Error(`Image download failed with HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    const data = new Uint8Array(await response.arrayBuffer());
    return {
      data,
      extension: inferImageExtension(data, contentType),
      contentType,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBase64(value) {
  const withoutDataUrl =
    value.includes(",") && value.trim().toLowerCase().startsWith("data:")
      ? value.slice(value.indexOf(",") + 1)
      : value;
  const trimmed = withoutDataUrl.trim();
  return trimmed.padEnd(trimmed.length + ((4 - (trimmed.length % 4)) % 4), "=");
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function startsWithBytes(data, signature) {
  if (data.length < signature.length) {
    return false;
  }
  return signature.every((byte, index) => data[index] === byte);
}

function bytesToAscii(data) {
  return Array.from(data, (byte) => String.fromCharCode(byte)).join("");
}
