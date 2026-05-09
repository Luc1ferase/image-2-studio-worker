import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { displayRunName, formatRunIdAsLocalTime } from "../public/run-title.js";

describe("run title formatting", () => {
  it("formats generated run ids as local timestamps without run prefix or UTC suffix", () => {
    const formatted = formatRunIdAsLocalTime("run-2026-05-08T06-05-07-449Z");

    assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    assert.doesNotMatch(formatted, /^run-/);
    assert.doesNotMatch(formatted, /Z$/);
    assert.doesNotMatch(formatted, /T/);
  });

  it("uses the local timezone when formatting generated run ids", () => {
    const formatted = formatRunIdAsLocalTime("run-2026-05-08T06-05-07-449Z");
    const localDate = new Date("2026-05-08T06:05:07.449Z");
    const expected = [
      localDate.getFullYear(),
      "-",
      String(localDate.getMonth() + 1).padStart(2, "0"),
      "-",
      String(localDate.getDate()).padStart(2, "0"),
      " ",
      String(localDate.getHours()).padStart(2, "0"),
      ":",
      String(localDate.getMinutes()).padStart(2, "0"),
      ":",
      String(localDate.getSeconds()).padStart(2, "0"),
      ".",
      String(localDate.getMilliseconds()).padStart(3, "0"),
    ].join("");

    assert.equal(formatted, expected);
  });

  it("keeps user-renamed runs as their explicit names", () => {
    const name = displayRunName({
      id: "run-2026-05-08T06-05-07-449Z",
      name: "Portrait batch",
    });

    assert.equal(name, "Portrait batch");
  });
});
