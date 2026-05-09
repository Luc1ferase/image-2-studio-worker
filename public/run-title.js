const GENERATED_RUN_ID_PATTERN = /^run-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/;

export function displayRunName(run) {
  const explicitName = String(run?.name ?? "").trim();
  const id = String(run?.id ?? "").trim();
  if (explicitName !== "" && explicitName !== id) {
    return explicitName;
  }
  const timestampName = formatRunIdAsLocalTime(id);
  return timestampName || explicitName || id || "Untitled run";
}

export function historyMeta(run) {
  const completed = run?.summary?.completed ?? 0;
  const total = run?.summary?.total ?? 0;
  return `${run?.status ?? "unknown"} - ${completed}/${total}`;
}

export function formatRunIdAsLocalTime(runId) {
  const match = GENERATED_RUN_ID_PATTERN.exec(String(runId ?? ""));
  if (!match) {
    return "";
  }
  const [, year, month, day, hour, minute, second, millisecond] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}Z`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return formatLocalDateTime(date);
}

function formatLocalDateTime(date) {
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1, 2),
    "-",
    pad(date.getDate(), 2),
    " ",
    pad(date.getHours(), 2),
    ":",
    pad(date.getMinutes(), 2),
    ":",
    pad(date.getSeconds(), 2),
    ".",
    pad(date.getMilliseconds(), 3),
  ].join("");
}

function pad(value, width) {
  return String(value).padStart(width, "0");
}
