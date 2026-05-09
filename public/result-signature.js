export function createResultSignature(run) {
  if (!run || !Array.isArray(run.jobs)) {
    return "";
  }
  const parts = [];
  for (const job of run.jobs) {
    if (!Array.isArray(job.images)) {
      continue;
    }
    for (const image of job.images) {
      parts.push([job.id, job.variant, job.jobDir, image.filename, image.revisedPrompt ?? ""].join("|"));
    }
  }
  return parts.join("\n");
}
