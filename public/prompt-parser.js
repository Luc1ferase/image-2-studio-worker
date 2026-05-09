export function parseGuiPrompts(value, options = {}) {
  const text = String(value ?? "").trim();
  if (text === "") {
    return [];
  }
  if (options.batchMode === true) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));
  }
  return [text];
}
