import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

describe("GUI app script", () => {
  it("wires rail panels and editable history actions", async () => {
    const script = await fs.readFile("public/app.js", "utf8");

    assert.match(script, /sidebarCollapsed: false/);
    assert.match(script, /rightRailCollapsed: false/);
    assert.match(script, /function setSidebarCollapsed\(/);
    assert.match(script, /function setRightRailCollapsed\(/);
    assert.match(script, /elements\.appShell\.classList\.toggle\("sidebar-collapsed"/);
    assert.match(script, /elements\.appShell\.classList\.toggle\("right-rail-collapsed"/);
    assert.match(script, /elements\.settingsToggle\.setAttribute\("aria-expanded"/);
    assert.match(script, /elements\.rightRailToggle\.setAttribute\("aria-expanded"/);
    assert.match(script, /selectedRunIds: new Set\(\)/);
    assert.match(script, /historyEditMode: false/);
    assert.match(script, /function showPanel\(/);
    assert.match(script, /function setHistoryEditMode\(/);
    assert.match(script, /function toggleSelectAllRuns\(/);
    assert.match(script, /function renameRun\(/);
    assert.match(script, /function deleteRuns\(/);
    assert.match(script, /import \{ displayRunName \} from "\.\/run-title\.js";/);
    assert.match(script, /if \(state\.historyEditMode\)/);
    assert.match(script, /\/api\/runs\/\$\{encodeURIComponent\(runId\)\}\/rename/);
    assert.match(script, /\/api\/runs\/delete/);
    assert.match(script, /parseGuiPrompts\(elements\.prompts\.value/);
    assert.match(script, /batchMode: elements\.batchPrompts\.checked/);
    assert.match(script, /timeoutMs: timeoutMinutesToMs\(elements\.timeoutMinutes\.value\)/);
    assert.match(script, /function timeoutMinutesToMs\(/);
    assert.match(script, /selectedImages: new Set\(\)/);
    assert.match(script, /function openImageViewer\(/);
    assert.match(script, /function zoomImageViewer\(/);
    assert.match(script, /function toggleResultSelection\(/);
    assert.match(script, /function toggleSelectAllImages\(/);
    assert.match(script, /elements\.selectAllImages\.indeterminate/);
    assert.match(script, /function requestDeleteSelectedImages\(/);
    assert.match(script, /function confirmDeleteSelectedImages\(/);
    assert.match(script, /\/api\/runs\/\$\{encodeURIComponent\(state\.activeRunId\)\}\/images\/delete/);
    assert.match(script, /details\.className = "result-prompt"/);
  });

  it("loads GUI preferences, applies i18n, and persists theme choice", async () => {
    const script = await fs.readFile("public/app.js", "utf8");

    assert.match(script, /import \{ DEFAULT_LANGUAGE, normalizeLanguage, normalizeTheme, t \} from "\.\/i18n\.js";/);
    assert.match(script, /language: DEFAULT_LANGUAGE/);
    assert.match(script, /theme: DEFAULT_THEME/);
    assert.match(script, /const LANGUAGE_STORAGE_KEY = "image2studio\.language";/);
    assert.match(script, /const THEME_STORAGE_KEY = "image2studio\.theme";/);
    assert.match(script, /function loadPreferences\(/);
    assert.match(script, /function applyLanguage\(/);
    assert.match(script, /function applyTheme\(/);
    assert.match(script, /document\.documentElement\.lang = state\.language === "zh" \? "zh-CN" : "en";/);
    assert.match(script, /document\.documentElement\.dataset\.theme = state\.theme;/);
    assert.match(script, /localStorage\.setItem\(LANGUAGE_STORAGE_KEY, state\.language\)/);
    assert.match(script, /localStorage\.setItem\(THEME_STORAGE_KEY, state\.theme\)/);
  });

  it("persists the full GUI configuration in local browser storage", async () => {
    const script = await fs.readFile("public/app.js", "utf8");

    assert.match(script, /const USER_CONFIG_STORAGE_KEY = "image2studio\.userConfig";/);
    assert.match(script, /const USER_CONFIG_FIELDS = \[/);
    for (const field of [
      "apiKey",
      "baseUrl",
      "endpointPath",
      "model",
      "size",
      "count",
      "concurrency",
      "timeoutMinutes",
      "quality",
      "outputFormat",
      "responseFormat",
      "dryRun",
      "batchPrompts",
    ]) {
      assert.match(script, new RegExp(`"${field}"`));
    }
    assert.match(script, /function loadUserConfig\(/);
    assert.match(script, /function applyUserConfig\(/);
    assert.match(script, /function saveUserConfig\(/);
    assert.match(script, /localStorage\.setItem\(USER_CONFIG_STORAGE_KEY, JSON\.stringify\(snapshot\)\)/);
    assert.match(script, /element\.type === "checkbox" \? element\.checked : element\.value/);
    assert.match(script, /const eventName = element\.type === "checkbox" \|\| element\.tagName === "SELECT" \? "change" : "input";/);
  });

  it("does not overwrite an empty Base URL from loaded defaults", async () => {
    const script = await fs.readFile("public/app.js", "utf8");

    assert.doesNotMatch(script, /elements\.baseUrl\.value = defaults\.baseUrl;/);
    assert.doesNotMatch(script, /elements\.baseUrl\.value\s*=/);
    assert.match(script, /function defaultStatusText\(defaults\)/);
  });

  it("does not use blocking browser dialogs", async () => {
    const script = await fs.readFile("public/app.js", "utf8");

    assert.doesNotMatch(script, /\b(prompt|alert|confirm)\s*\(/);
  });

  it("lazy-loads generated result images", async () => {
    const script = await fs.readFile("public/app.js", "utf8");

    assert.match(script, /img\.loading = "lazy"/);
    assert.match(script, /img\.decoding = "async"/);
    assert.match(script, /const url = image\.url \|\| outputUrl\(job\.jobDir, image\.filename\);/);
  });

  it("gates Cloudflare mode behind first-run auth setup or login", async () => {
    const script = await fs.readFile("public/app.js", "utf8");

    assert.match(script, /await initializeAuth\(\);/);
    assert.match(script, /function initializeAuth\(/);
    assert.match(script, /\/api\/auth\/status/);
    assert.match(script, /\/api\/auth\/setup/);
    assert.match(script, /\/api\/auth\/login/);
    assert.match(script, /state\.authMode = authStatus\.initialized \? "login" : "setup";/);
    assert.match(script, /function showApplication\(\)/);
    assert.match(script, /elements\.authGate\.hidden = false/);
    assert.match(script, /elements\.appShell\.hidden = true/);
  });

  it("verifies the session after setup or login before entering the app", async () => {
    const script = await fs.readFile("public/app.js", "utf8");

    assert.match(script, /await refreshAuthSession\(\);/);
    assert.match(script, /async function refreshAuthSession\(\)/);
    assert.match(script, /authStatus = await requestJson\("\/api\/auth\/status"\);/);
    assert.match(script, /throw new Error\(translate\("authSessionNotReady"\)\);/);
  });

  it("switches from setup to login when the password was already configured", async () => {
    const script = await fs.readFile("public/app.js", "utf8");

    assert.match(script, /function isPasswordAlreadyConfiguredError\(error\)/);
    assert.match(script, /state\.authMode !== "login" && isPasswordAlreadyConfiguredError\(error\)/);
    assert.match(script, /state\.authMode = "login";/);
    assert.match(script, /translate\("authPasswordAlreadyConfigured"\)/);
  });

  it("tries a one-password login when setup mode is stale", async () => {
    const script = await fs.readFile("public/app.js", "utf8");

    assert.match(script, /await tryLoginFromSetupMode\(password\)/);
    assert.match(script, /async function tryLoginFromSetupMode\(password\)/);
    assert.match(script, /await completeAuthRequest\("\/api\/auth\/login", password\);/);
    assert.match(script, /function isPasswordNotConfiguredError\(error\)/);
    assert.doesNotMatch(script, /authConfirmPassword\.required = isSetup/);
  });

  it("shows the application after authenticated startup finishes loading", async () => {
    const script = await fs.readFile("public/app.js", "utf8");

    assert.match(script, /async function enterApplication\(\) \{\s+await loadDefaults\(\);\s+await loadLatestRun\(\);\s+showApplication\(\);/);
    assert.doesNotMatch(script, /if \(state\.authMode === "none"\) \{\s+showApplication\(\);\s+\}/);
  });

  it("scrolls panel changes into view on mobile", async () => {
    const script = await fs.readFile("public/app.js", "utf8");

    assert.match(script, /function scrollActivePanelIntoView\(/);
    assert.match(script, /window\.matchMedia\("\(max-width: 760px\)"\)\.matches/);
    assert.match(script, /activePanel\.scrollIntoView\(\{ block: "start", behavior: "smooth" \}\)/);
  });
});
