import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

describe("GUI styles", () => {
  it("defines light and dark theme tokens", async () => {
    const css = await fs.readFile("public/styles.css", "utf8");

    assert.match(css, /:root\s*{[\s\S]*color-scheme: light;/);
    assert.match(css, /:root\[data-theme="dark"\]\s*{[\s\S]*color-scheme: dark;/);
    assert.match(css, /:root\[data-theme="dark"\]\s*{[\s\S]*--bg:/);
    assert.match(css, /:root\[data-theme="dark"\]\s*{[\s\S]*--surface:/);
    assert.match(css, /:root\[data-theme="dark"\]\s*{[\s\S]*--input-bg:/);
  });

  it("uses an Arial-first readable UI font stack with larger control text", async () => {
    const css = await fs.readFile("public/styles.css", "utf8");

    assert.doesNotMatch(css, /font-family:[\s\S]*Inter/);
    assert.match(css, /font-family:\s*var\(--font-ui\);/);
    assert.match(css, /--font-ui: Arial, "Microsoft YaHei UI", "PingFang SC"/);
    assert.doesNotMatch(css, /font-weight: 800;/);
    assert.doesNotMatch(css, /font-weight: 700;/);
    assert.doesNotMatch(css, /font-weight: 600;/);
    assert.match(css, /h1\s*{[\s\S]*font-weight: 400;/);
    assert.match(css, /h2\s*{[\s\S]*font-weight: 400;/);
    assert.match(css, /\nh3\s*{[^}]*font-weight: 400;/);
    assert.match(css, /label\s*{[\s\S]*font-weight: 400;/);
    assert.match(css, /\.primary-button\s*{[\s\S]*font-weight: 400;/);
    assert.match(css, /\.result-meta strong\s*{[^}]*font-weight: 400;/);
    assert.match(css, /\.job-row p\s*{[\s\S]*font-weight: 400;/);
    assert.match(css, /label\s*{[\s\S]*font-size: 13px;/);
    assert.match(css, /\.secondary-button,\s*\.danger-button,\s*\.icon-button\s*{[\s\S]*font-size: 13px;/);
    assert.match(css, /input,\s*select\s*{[\s\S]*font-size: 14px;/);
  });

  it("places the rail navigation on the far right side", async () => {
    const css = await fs.readFile("public/styles.css", "utf8");

    assert.match(css, /\.right-rail\s*{[\s\S]*grid-template-columns: minmax\(0, 320px\) 56px;/);
    assert.match(css, /\.right-rail__nav\s*{[\s\S]*grid-column: 2;/);
    assert.match(css, /\.right-rail__nav\s*{[\s\S]*border-left: 1px solid var\(--line\);/);
  });

  it("supports a collapsed right rail while keeping icon navigation visible", async () => {
    const css = await fs.readFile("public/styles.css", "utf8");

    assert.match(css, /\.app-shell\.right-rail-collapsed\s*{[\s\S]*grid-template-columns: 320px minmax\(420px, 1fr\) 56px;/);
    assert.match(css, /\.app-shell\.right-rail-collapsed\.sidebar-collapsed\s*{[\s\S]*grid-template-columns: 64px minmax\(420px, 1fr\) 56px;/);
    assert.match(css, /\.app-shell\.right-rail-collapsed \.right-rail\s*{[\s\S]*grid-template-columns: 56px;/);
    assert.match(css, /\.app-shell\.right-rail-collapsed \.right-rail__nav\s*{[\s\S]*grid-column: 1;/);
    assert.match(css, /\.app-shell\.right-rail-collapsed \.rail-panel\s*{[\s\S]*display: none;/);
  });

  it("supports a collapsed left settings sidebar", async () => {
    const css = await fs.readFile("public/styles.css", "utf8");

    assert.match(css, /\.app-shell\.sidebar-collapsed\s*{[\s\S]*grid-template-columns: 64px minmax\(420px, 1fr\) 376px;/);
    assert.match(css, /\.app-shell\.sidebar-collapsed \.settings-form\s*{[\s\S]*visibility: hidden;/);
    assert.match(css, /\.app-shell\.sidebar-collapsed \.brand-copy\s*{[\s\S]*opacity: 0;/);
  });

  it("uses a left-edge settings drawer control when collapsed on mobile", async () => {
    const css = await fs.readFile("public/styles.css", "utf8");
    const mobileRulesMatch = /@media \(max-width: 760px\) \{[\s\S]*\n\}/.exec(css);

    assert.ok(mobileRulesMatch, "mobile breakpoint should exist");
    const mobileRules = mobileRulesMatch[0];
    assert.match(mobileRules, /\.app-shell\.sidebar-collapsed \.sidebar\s*{[\s\S]*position: fixed;/);
    assert.match(mobileRules, /\.app-shell\.sidebar-collapsed \.sidebar\s*{[\s\S]*left: 0;/);
    assert.match(mobileRules, /\.app-shell\.sidebar-collapsed \.sidebar\s*{[\s\S]*top: 50%;/);
    assert.match(mobileRules, /\.app-shell\.sidebar-collapsed \.sidebar\s*{[\s\S]*transform: translateY\(-50%\);/);
    assert.match(mobileRules, /\.app-shell\.sidebar-collapsed \.settings-form\s*{[\s\S]*display: none;/);
    assert.match(mobileRules, /\.app-shell\.sidebar-collapsed \.brand-copy\s*{[\s\S]*visibility: hidden;/);
    assert.match(mobileRules, /\.app-shell\.sidebar-collapsed \.workspace\s*{[\s\S]*grid-row: 1;/);
  });

  it("keeps mobile controls touch-sized and thumb reachable", async () => {
    const css = await fs.readFile("public/styles.css", "utf8");
    const mobileRulesMatch = /@media \(max-width: 760px\) \{[\s\S]*\n\}/.exec(css);

    assert.ok(mobileRulesMatch, "mobile breakpoint should exist");
    const mobileRules = mobileRulesMatch[0];
    assert.match(mobileRules, /\.app-shell\s*{[\s\S]*padding-bottom: 76px;/);
    assert.match(mobileRules, /\.right-rail__nav\s*{[\s\S]*position: fixed;/);
    assert.match(mobileRules, /\.right-rail__nav\s*{[\s\S]*left: 0;/);
    assert.match(mobileRules, /\.right-rail__nav\s*{[\s\S]*right: 0;/);
    assert.match(mobileRules, /\.right-rail__nav\s*{[\s\S]*bottom: 0;/);
    assert.match(mobileRules, /\.rail-button\s*{[\s\S]*width: 44px;/);
    assert.match(mobileRules, /\.rail-button\s*{[\s\S]*height: 44px;/);
    assert.match(mobileRules, /\.sidebar-toggle\s*{[\s\S]*width: 44px;/);
    assert.match(mobileRules, /\.sidebar-toggle\s*{[\s\S]*height: 44px;/);
  });

  it("has visible keyboard focus and reduced-motion safeguards", async () => {
    const css = await fs.readFile("public/styles.css", "utf8");

    assert.match(css, /:focus-visible\s*{[\s\S]*outline: 2px solid var\(--accent\);/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*animation-duration: 1ms !important;/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*transition-duration: 1ms !important;/);
  });

  it("styles selectable result tiles, the image viewer, and confirmation dialog", async () => {
    const css = await fs.readFile("public/styles.css", "utf8");

    assert.match(css, /\.result-toolbar\s*{/);
    assert.match(css, /\.result-toolbar__selection\s*{/);
    assert.match(css, /\.result-tile\.is-selected\s*{/);
    assert.match(css, /\.result-prompt\s*{/);
    assert.match(css, /\.image-viewer\s*{/);
    assert.match(css, /\.image-viewer__image\s*{/);
    assert.match(css, /\.confirm-dialog\s*{/);
  });

  it("styles the authentication gate as a focused setup and login surface", async () => {
    const css = await fs.readFile("public/styles.css", "utf8");

    assert.match(css, /\.auth-gate/);
    assert.match(css, /\.auth-panel/);
    assert.match(css, /\.auth-message/);
    assert.match(css, /\[hidden\]\s*{[\s\S]*display: none !important;/);
    assert.match(css, /\.auth-gate\[hidden\]/);
    assert.match(css, /\.app-shell\[hidden\]\s*{[\s\S]*display: none;/);
  });
});
