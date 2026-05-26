import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("evidence based reading review flow", () => {
  it("adds generation entry to reading journey without allowing overall generation", () => {
    const view = readFileSync(join(process.cwd(), "src", "ReadingJourneyView.ts"), "utf8");

    expect(view).toContain("生成阶段回顾");
    expect(view).toContain("打开已有回顾");
    expect(view).toContain("重新生成");
    expect(view).toContain('summary.period === "overall"');
    expect(view).toContain("总计适合查看长期统计");
    expect(view).toContain("openReadingReviewConfirm(summary)");
  });

  it("requires user confirmation before calling AI generation", () => {
    const main = readFileSync(join(process.cwd(), "src", "main.ts"), "utf8");
    const modal = readFileSync(join(process.cwd(), "src", "ReadingReviewModal.ts"), "utf8");

    expect(main).toContain("new ReadingReviewConfirmModal");
    expect(modal).toContain("确认生成");
    expect(modal).toContain("onConfirm(this.preview)");
    expect(main).toContain("async generateReadingReview");
    expect(main.indexOf("new ReadingReviewConfirmModal")).toBeLessThan(main.indexOf("async generateReadingReview"));
  });

  it("opens the same preparation flow for weekly, monthly, and annually while blocking overall", () => {
    const main = readFileSync(join(process.cwd(), "src", "main.ts"), "utf8");
    const view = readFileSync(join(process.cwd(), "src", "ReadingJourneyView.ts"), "utf8");
    const service = readFileSync(join(process.cwd(), "src", "readingReviewService.ts"), "utf8");

    expect(view).toContain('const PERIODS: ReadingPeriod[] = ["weekly", "monthly", "annually", "overall"]');
    expect(view).toContain("this.plugin.openReadingReviewConfirm(summary)");
    expect(main).toContain('summary.period === "overall"');
    expect(main).toContain("阶段回顾准备失败，请重试。");
    expect(service).toContain("prepareReadingReview");
  });

  it("uses the shared AI provider, prompt, and strict id validation layer", () => {
    const aiProvider = readFileSync(join(process.cwd(), "src", "aiProvider.ts"), "utf8");
    const prompts = readFileSync(join(process.cwd(), "src", "aiPrompts.ts"), "utf8");
    const analysis = readFileSync(join(process.cwd(), "src", "analysisService.ts"), "utf8");
    const service = readFileSync(join(process.cwd(), "src", "readingReviewService.ts"), "utf8");

    expect(aiProvider).toContain("generateReadingReview");
    expect(aiProvider).toContain("validateReadingReviewResult");
    expect(prompts).toContain("buildReadingReviewPrompt");
    expect(prompts).toContain("time_unconfirmed 表示只作为补充背景");
    expect(prompts).toContain("cumulative_only 表示当前累计知识沉淀");
    expect(analysis).toContain("prompt.length > settings.maxInputChars");
    expect(service).toContain("validateReadingReviewResultForInput");
  });

  it("writes independent review notes and preserves the user review area", () => {
    const constants = readFileSync(join(process.cwd(), "src", "constants.ts"), "utf8");
    const settings = readFileSync(join(process.cwd(), "src", "defaultSettings.ts"), "utf8");
    const service = readFileSync(join(process.cwd(), "src", "readingReviewService.ts"), "utf8");

    expect(constants).toContain("DEFAULT_READING_REVIEWS_DIR");
    expect(constants).toContain("ReadMind/04 Reading Reviews");
    expect(settings).toContain("readingReviewsDir");
    expect(service).toContain("READING_REVIEW_BLOCK_START");
    expect(service).toContain("## 我的回顾");
    expect(service).toContain("extractReviewUserArea");
    expect(service).toContain("[[${evidence.sourceNotePath}#^${evidence.blockId}|${label}]]");
  });
});
