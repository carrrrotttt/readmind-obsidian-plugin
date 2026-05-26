import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI settings UI", () => {
  it("moves local import and fixture loading into the data source area", () => {
    const source = readFileSync("src/ReadMindSettingTab.ts", "utf8");

    expect(source).toContain('settings.dataSourceMode === "fixture"');
    expect(source).toContain('setName("示例数据")');
    expect(source).toContain('setButtonText("载入示例数据")');
    expect(source).toContain("this.plugin.useFixtureData()");
    expect(source).toContain('setName("补充导入")');
    expect(source).toContain('setButtonText("导入本地阅读数据")');
    expect(source).toContain("this.plugin.importReadingDataFromPicker()");
    expect(source).not.toContain("导入 ReadMind JSON");
  });

  it("uses provider presets and hides Base URL behind advanced settings", () => {
    const source = readFileSync("src/ReadMindSettingTab.ts", "utf8");

    expect(source).toContain("AI_PROVIDER_PRESETS");
    expect(source).toContain("模型供应商");
    expect(source).toContain("高级设置");
    expect(source).toContain('preset.id === "custom"');
    expect(source).toContain("Base URL");
    expect(source).toContain("自定义模型名");
  });

  it("keeps provider and model dropdown labels plain", () => {
    const source = readFileSync("src/ReadMindSettingTab.ts", "utf8");

    expect(source).toContain("dropdown.addOption(item.id, item.label)");
    expect(source).toContain("dropdown.addOption(model.id, model.label)");
    expect(source).not.toContain("providerStatusLabel(item)");
    expect(source).not.toContain("（推荐）");
  });

  it("shows staged loading text for AI connection testing", () => {
    const source = readFileSync("src/ReadMindSettingTab.ts", "utf8");

    expect(source).toContain("正在测试基础连接…");
    expect(source).toContain("正在验证 ReadMind 分析能力…");
    expect(source).toContain("button.setDisabled(true)");
    expect(source).toContain("button.setDisabled(false)");
  });
});
