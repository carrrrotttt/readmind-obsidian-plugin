import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("BookshelfView settings entry", () => {
  it("keeps the expected toolbar actions on the main toolbar", () => {
    const source = readFileSync(join(process.cwd(), "src", "BookshelfView.ts"), "utf8");

    const expectedOrder = ["刷新书架", "同步所选", "同步日志", "设置", "知识卡片", "关联建议", "阅读回顾"];
    let cursor = -1;
    for (const label of expectedOrder) {
      const next = source.indexOf(`, "${label}",`, cursor + 1);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }

    expect(source).toContain("readmind-icon-toolbar");
    expect(source).toContain("configureIconButton");
    expect(source).toContain("button.setIcon(icon).setTooltip(label)");
    expect(source).toContain("if (showText) button.setButtonText(label)");
    expect(source).toContain('button.buttonEl.setAttribute("aria-label", label)');
    expect(source).toContain('showText ? "readmind-icon-text-button" : "readmind-icon-button"');
    expect(source).toContain('"知识卡片", () => this.plugin.openLinkSuggestions(), true');
    expect(source).toContain('"关联建议", () => this.plugin.openLinkSuggestions(), true');
    expect(source).toContain('"阅读回顾", () => this.plugin.openReadingJourney(), true');
    expect(source).toContain("this.plugin.openSettings()");
    expect(source).not.toContain("主要操作");
    expect(source).not.toContain("AI 工作区");
    expect(source).not.toContain("辅助入口");
    expect(source).not.toContain('setButtonText("载入示例数据")');
    expect(source).not.toContain('setButtonText("导入本地阅读数据")');
    expect(source).not.toContain('setButtonText("刷新书架")');
    expect(source).not.toContain('setButtonText("同步所选")');
    expect(source).not.toContain('setButtonText("同步日志")');
    expect(source).not.toContain('setButtonText("设置")');
    expect(source).not.toContain('"知识网络", () => this.plugin.openKnowledgeNetwork(), true');
  });

  it("renders bookshelf cards with separate info, cover, and bottom action areas", () => {
    const source = readFileSync(join(process.cwd(), "src", "BookshelfView.ts"), "utf8");

    expect(source).toContain("readmind-book-card-body");
    expect(source).toContain("readmind-book-card-info");
    expect(source).toContain("readmind-book-card-cover");
    expect(source).toContain("readmind-book-card-actions");
  });
});
