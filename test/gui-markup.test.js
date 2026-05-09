import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

describe("GUI markup", () => {
  it("defaults the GUI to Chinese and renders language and theme controls in settings", async () => {
    const html = await fs.readFile("public/index.html", "utf8");

    assert.match(html, /<html lang="zh-CN">/);
    assert.match(html, /id="language"/);
    assert.match(html, /id="theme"/);
    assert.match(html, /<option value="zh" selected>中文<\/option>/);
    assert.match(html, /<option value="en">English<\/option>/);
    assert.match(html, /<option value="light" selected[^>]*>浅色<\/option>/);
    assert.match(html, /<option value="dark"[^>]*>深色<\/option>/);
    assert.match(html, /提示词队列/);
    assert.match(html, /生成/);
  });

  it("renders first-run password setup and login controls", async () => {
    const html = await fs.readFile("public/index.html", "utf8");

    assert.match(html, /id="auth-gate"/);
    assert.match(html, /id="auth-title"/);
    assert.match(html, /id="auth-password"/);
    assert.match(html, /id="auth-confirm-password"/);
    assert.match(html, /id="auth-submit"/);
    assert.match(html, /id="auth-message"/);
    assert.match(html, /data-i18n="authSetupTitle"/);
    assert.match(html, /长度为 8 到 20 个字符/);
    assert.match(html, /id="auth-password"[^>]*minlength="8"[^>]*maxlength="20"/);
    assert.match(html, /id="auth-confirm-password"[^>]*minlength="8"[^>]*maxlength="20"/);
  });

  it("renders size as a select with high-resolution options", async () => {
    const html = await fs.readFile("public/index.html", "utf8");
    const sizeSelectMatch = /<select id="size"[\s\S]*?<\/select>/.exec(html);

    assert.ok(sizeSelectMatch, "size field should be a visible select element");
    const sizeSelect = sizeSelectMatch[0];
    assert.match(sizeSelect, /<option value="1024x1024"[^>]*>1024x1024 - 1:1<\/option>/);
    assert.match(sizeSelect, /<option value="1536x1024"[^>]*>1536x1024 - 3:2<\/option>/);
    assert.match(sizeSelect, /<option value="1024x1536"[^>]*>1024x1536 - 2:3<\/option>/);
    assert.match(sizeSelect, /<option value="2048x2048"[^>]*>2048x2048 - 2K 方图 \/ 1:1<\/option>/);
    assert.match(sizeSelect, /<option value="2048x1152"[^>]*>2048x1152 - 2K \/ 16:9<\/option>/);
    assert.match(sizeSelect, /<option value="2560x1440"[^>]*>2560x1440 - 2K QHD \/ 16:9<\/option>/);
    assert.match(sizeSelect, /<option value="3840x2160"[^>]*>3840x2160 - 4K UHD \/ 16:9<\/option>/);
    assert.match(sizeSelect, /<option value="2160x3840"[^>]*>2160x3840 - 4K 竖屏 \/ 9:16<\/option>/);
  });

  it("renders Base URL as an empty user-provided field with generic placeholder guidance", async () => {
    const html = await fs.readFile("public/index.html", "utf8");
    const baseUrlMatch = /<input[^>]+id="base-url"[^>]*>/i.exec(html);

    assert.ok(baseUrlMatch, "Base URL input should exist");
    const baseUrlInput = baseUrlMatch[0];
    assert.doesNotMatch(baseUrlInput, /\svalue=/);
    assert.match(baseUrlInput, /placeholder="例如：https:\/\/api\.example\.com"/);
    assert.match(baseUrlInput, /data-i18n-placeholder="baseUrlPlaceholder"/);
  });

  it("renders a vertical right rail with history and activity panels", async () => {
    const html = await fs.readFile("public/index.html", "utf8");

    assert.match(html, /<nav class="right-rail__nav"/);
    assert.match(html, /id="right-rail-toggle"/);
    assert.match(html, /aria-controls="history-panel activity-panel"/);
    assert.match(html, /id="right-rail-toggle-label"/);
    assert.match(html, /data-panel="history"/);
    assert.match(html, /data-panel="activity"/);
    assert.match(html, /id="history-panel"/);
    assert.match(html, /id="activity-panel"/);
    assert.match(html, /id="delete-selected-runs"/);
  });

  it("renders history editing controls separately from the history list", async () => {
    const html = await fs.readFile("public/index.html", "utf8");

    assert.match(html, /class="rail-button__icon rail-button__icon--history"/);
    assert.match(html, /<path d="M3 12a9 9 0 1 0 3-6\.7"/);
    assert.match(html, /id="edit-history-button"/);
    assert.match(html, /id="select-all-runs"/);
    assert.match(html, /<div class="history-toolbar" hidden>/);
  });

  it("renders the left settings sidebar as a collapsible panel", async () => {
    const html = await fs.readFile("public/index.html", "utf8");

    assert.match(html, /class="brand-copy"/);
    assert.match(html, /id="settings-toggle"/);
    assert.match(html, /aria-controls="settings-form"/);
    assert.match(html, /aria-expanded="true"/);
    assert.match(html, /id="settings-toggle-label"/);
  });

  it("renders an explicit batch prompt mode toggle", async () => {
    const html = await fs.readFile("public/index.html", "utf8");

    assert.match(html, /id="batch-prompts"/);
    assert.match(html, /批量按行/);
  });

  it("renders an editable request timeout field", async () => {
    const html = await fs.readFile("public/index.html", "utf8");

    assert.match(html, /id="timeout-minutes"/);
    assert.match(html, /超时/);
    assert.match(html, /value="15"/);
  });

  it("renders result selection controls, viewer, and delete confirmation dialog", async () => {
    const html = await fs.readFile("public/index.html", "utf8");

    assert.match(html, /id="result-toolbar"/);
    assert.match(html, /id="result-select-all-images"/);
    assert.match(html, /全选图片/);
    assert.match(html, /id="download-selected-images"/);
    assert.match(html, /id="delete-selected-images"/);
    assert.match(html, /id="image-viewer"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /id="confirm-dialog"/);
    assert.match(html, /id="confirm-delete-images"/);
  });
});
