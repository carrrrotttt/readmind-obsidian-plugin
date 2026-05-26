import { describe, expect, it } from "vitest";
import {
  annotationTypeLabel,
  aiStatusLabel,
  buildBookCardMeta,
  connectionStateLabel,
  formatReadingDuration,
  formatUserDateTime,
  friendlyChapterTitle,
  readingStatusLabel,
  shouldShowAIUserFeatures,
  syncStatusLabel,
} from "../src/displayText";

describe("display text helpers", () => {
  it("maps internal states to user-facing labels", () => {
    expect(connectionStateLabel("connected")).toBe("已连接");
    expect(connectionStateLabel("disconnected")).toBe("未连接");
    expect(connectionStateLabel("expired")).toBe("登录已失效");
    expect(connectionStateLabel("failed")).toBe("连接失败");
    expect(syncStatusLabel("not_synced")).toBe("尚未同步");
    expect(syncStatusLabel("synced")).toBe("已同步");
    expect(syncStatusLabel("failed")).toBe("同步失败");
    expect(aiStatusLabel("not_analyzed")).toBe("尚未分析");
    expect(aiStatusLabel("analyzing")).toBe("分析中");
    expect(aiStatusLabel("analyzed")).toBe("已完成分析");
    expect(aiStatusLabel("stale")).toBe("来源笔记有更新，建议重新分析");
    expect(aiStatusLabel("failed")).toBe("分析失败");
    expect(readingStatusLabel("unknown")).toBe("暂无阅读状态");
  });

  it("formats annotation labels and fallback chapters for ordinary users", () => {
    expect(annotationTypeLabel("highlight")).toBe("划线");
    expect(annotationTypeLabel("thought")).toBe("想法");
    expect(friendlyChapterTitle("未归类笔记")).toBe("其他笔记");
    expect(friendlyChapterTitle(undefined)).toBe("其他笔记");
  });

  it("formats ISO time and reading duration", () => {
    const formatted = formatUserDateTime("2026-04-24T05:44:51.000Z");
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(formatted).not.toContain("T");
    expect(formatReadingDuration(38)).toBe("38 分钟");
    expect(formatReadingDuration(125)).toBe("2 小时 5 分钟");
    expect(formatReadingDuration(undefined)).toBe("暂无阅读时长数据");
  });

  it("omits AI status from ordinary book card metadata", () => {
    const meta = buildBookCardMeta(
      {
        id: "b1",
        source: "weread",
        title: "书",
        author: "作者",
        readingStatus: "unknown",
        annotationCount: 1,
        thoughtCount: 2,
        sourceUpdatedAt: "2026-04-24T05:44:51.000Z",
      },
      {
        bookId: "b1",
        sourceFilePath: "ReadMind/01 Sources/Books/book.md",
        lastSyncedAt: "2026-04-24T05:44:51.000Z",
        sourceContentHash: "hash",
        syncStatus: "not_synced",
        aiStatus: "not_analyzed",
        pendingSuggestionCount: 0,
      },
    );

    expect(meta.join("\n")).toContain("尚未同步");
    expect(meta.join("\n")).not.toContain("AI");
    expect(meta.join("\n")).not.toContain("not_analyzed");
    expect(shouldShowAIUserFeatures()).toBe(false);
  });
});
