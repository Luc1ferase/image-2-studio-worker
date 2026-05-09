import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LANGUAGE, normalizeLanguage, t } from "../public/i18n.js";

describe("GUI i18n", () => {
  it("defaults to Chinese", () => {
    assert.equal(DEFAULT_LANGUAGE, "zh");
    assert.equal(normalizeLanguage(""), "zh");
    assert.equal(normalizeLanguage("fr"), "zh");
  });

  it("translates core GUI labels in Chinese and English", () => {
    assert.equal(t("zh", "generate"), "生成");
    assert.equal(t("en", "generate"), "Generate");
    assert.equal(t("zh", "history"), "历史");
    assert.equal(t("en", "history"), "History");
  });

  it("interpolates dynamic messages", () => {
    assert.equal(t("zh", "selectedCount", { count: 3 }), "已选择 3 项");
    assert.equal(t("en", "selectedCount", { count: 3 }), "3 selected");
    assert.equal(t("zh", "deletedImages", { count: 2 }), "已删除 2 张图片。");
    assert.equal(t("en", "deletedImages", { count: 2 }), "Deleted 2 images.");
  });

  it("translates status labels for persisted runs and activity rows", () => {
    assert.equal(t("zh", "status.failed"), "失败");
    assert.equal(t("zh", "status.running"), "运行中");
    assert.equal(t("en", "status.completed"), "completed");
  });
});
