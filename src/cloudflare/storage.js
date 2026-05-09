import { downloadImage, extractImages, inferImageExtension } from "./images.js";

export const OUTPUT_PREFIX = "outputs";

export function runObjectPrefix(runId) {
  return `${OUTPUT_PREFIX}/${dateFolderFromRunId(runId)}/${runId}`;
}

export async function saveJobArtifacts({ bucket, config, job, runId, requestBody, responseBody }) {
  const jobPrefix = `${runObjectPrefix(runId)}/${job.id}-variant-${job.variant}`;
  await putText(bucket, `${jobPrefix}/prompt.txt`, `${job.prompt}\n`, "text/plain; charset=utf-8");
  await putJson(bucket, `${jobPrefix}/request.json`, requestBody);
  await putJson(bucket, `${jobPrefix}/response.json`, responseBody);

  const images = extractImages(responseBody);
  const savedImages = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const imageNumber = String(index + 1).padStart(2, "0");
    if (image.kind === "base64") {
      const extension = inferImageExtension(image.data);
      const filename = `image-${imageNumber}.${extension}`;
      await putBytes(bucket, `${jobPrefix}/${filename}`, image.data, contentTypeForExtension(extension));
      savedImages.push({
        filename,
        key: `${jobPrefix}/${filename}`,
        url: `/outputs/${jobPrefix.slice(`${OUTPUT_PREFIX}/`.length)}/${encodeURIComponent(filename)}`,
        source: "b64_json",
        revisedPrompt: image.revisedPrompt,
      });
      continue;
    }
    const downloaded = await downloadImage(image.url, config.timeoutMs);
    const filename = `image-${imageNumber}.${downloaded.extension}`;
    await putBytes(
      bucket,
      `${jobPrefix}/${filename}`,
      downloaded.data,
      downloaded.contentType || contentTypeForExtension(downloaded.extension),
    );
    savedImages.push({
      filename,
      key: `${jobPrefix}/${filename}`,
      url: `/outputs/${jobPrefix.slice(`${OUTPUT_PREFIX}/`.length)}/${encodeURIComponent(filename)}`,
      source: image.url,
      revisedPrompt: image.revisedPrompt,
    });
  }

  return {
    jobDir: jobPrefix,
    savedImages,
    ok: true,
  };
}

export async function saveJobError({ bucket, job, runId, requestBody, error }) {
  const jobPrefix = `${runObjectPrefix(runId)}/${job.id}-variant-${job.variant}`;
  await putText(bucket, `${jobPrefix}/prompt.txt`, `${job.prompt}\n`, "text/plain; charset=utf-8");
  await putJson(bucket, `${jobPrefix}/request.json`, requestBody);
  await putJson(bucket, `${jobPrefix}/error.json`, {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : "Error",
    createdAt: new Date().toISOString(),
  });
  return {
    jobDir: jobPrefix,
    savedImages: [],
    ok: false,
  };
}

export async function deleteRunObjects(bucket, runId) {
  const prefix = `${runObjectPrefix(runId)}/`;
  let cursor;
  do {
    const listed = await bucket.list({ prefix, cursor });
    const keys = listed.objects.map((object) => object.key);
    if (keys.length > 0) {
      await bucket.delete(keys);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

export async function getOutputObject(bucket, pathname) {
  const relativePath = decodeURIComponent(pathname.replace(/^\/outputs\/+/, ""));
  if (relativePath.includes("..")) {
    return null;
  }
  return bucket.get(`${OUTPUT_PREFIX}/${relativePath}`);
}

export function contentTypeForFilename(filename) {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  return contentTypeForExtension(extension);
}

function dateFolderFromRunId(runId) {
  const match = /^run-(\d{4}-\d{2}-\d{2})T/.exec(runId);
  return match ? match[1] : new Date().toISOString().slice(0, 10);
}

async function putJson(bucket, key, value) {
  await bucket.put(key, JSON.stringify(value, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

async function putText(bucket, key, value, contentType) {
  await bucket.put(key, value, {
    httpMetadata: { contentType },
  });
}

async function putBytes(bucket, key, value, contentType) {
  await bucket.put(key, value, {
    httpMetadata: { contentType },
  });
}

function contentTypeForExtension(extension) {
  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  return "image/png";
}
