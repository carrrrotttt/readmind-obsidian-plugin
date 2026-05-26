import { describe, expect, it } from "vitest";
import { buildAnnotationBlockIds, buildSourceNote, mergeManagedSourceBlock } from "../src/markdown";
import type { ReadingBookDetails, SyncedBookRecord } from "../src/types";

function record(hash = "hash-a"): SyncedBookRecord {
  return {
    bookId: "target-book",
    sourceFilePath: "ReadMind/01 Sources/Books/幸福之路 - 伯特兰·罗素.md",
    lastSyncedAt: "2026-05-24T12:19:00.000Z",
    sourceContentHash: hash,
    syncStatus: "synced",
    aiStatus: "not_analyzed",
    generatedCardIds: [],
    pendingSuggestionCount: 0,
  };
}

describe("source markdown", () => {
  it("generates user-facing source notes without visible internal fields", () => {
    const built = buildSourceNote(book(), record());

    expect(built.content).toContain("# 幸福之路");
    expect(built.content).toContain("## 我的笔记");
    expect(built.content).toContain("### 第一章");
    expect(built.content).toContain("### 第二章");
    expect(built.content).toContain("来源：微信读书");
    expect(built.content).toContain("阅读状态：在读");
    expect(built.content).toContain("阅读进度：9%");
    expect(built.content).toContain("tags:\n  - readmind/source");
    expect(built.content).not.toContain("readmind_type");
    expect(built.content).not.toContain("book_id");
    expect(built.content).not.toContain("sync_status");
    expect(built.content).not.toContain("ai_status");
    expect(built.content).not.toContain("source_content_hash");
    expect(built.content).not.toContain("未归类笔记");
    expect(built.content).not.toContain("划线（");
  });

  it("organizes source notes by chapters and keeps related thoughts under highlights", () => {
    const built = buildSourceNote(book(), record());
    const firstChapter = built.content.indexOf("### 第一章");
    const secondChapter = built.content.indexOf("### 第二章");
    const highlight = built.content.indexOf("> 划线2");
    const thoughtTitle = built.content.indexOf("> [!note] 我的想法");
    const thought = built.content.indexOf("> 我的想法");

    expect(firstChapter).toBeGreaterThan(-1);
    expect(secondChapter).toBeGreaterThan(firstChapter);
    expect(thoughtTitle).toBeGreaterThan(highlight);
    expect(thought).toBeGreaterThan(thoughtTitle);
    expect(built.content).not.toContain("**我的想法**");
    expect(built.content).not.toContain("未归类笔记");
  });

  it("keeps unlinked thoughts separate instead of guessing by chapter", () => {
    const source = book();
    source.annotations = [
      annotation("h1", "highlight", "划线1", "第一章"),
      annotation("h2", "highlight", "划线2", "第一章"),
      annotation("r1", "thought", "独立想法", "第一章"),
    ];

    const content = buildSourceNote(source, record()).content;

    expect(content.indexOf("#### 其他想法")).toBeGreaterThan(content.indexOf("> 划线2"));
    expect(content).toContain("> [!note] 我的想法");
    expect(content).toContain("> 独立想法");
  });

  it("keeps stable block ids when annotations are reordered or added", () => {
    const annotations = book().annotations;
    const first = buildAnnotationBlockIds(annotations);
    const next = buildAnnotationBlockIds([annotation("new", "highlight", "新增划线"), ...annotations]);

    expect(first.h1).toBe(next.h1);
    expect(first.r1).toBe(next.r1);
    expect(first.h1).toMatch(/^rm-h-/);
    expect(first.r1).toMatch(/^rm-t-/);
    expect(Object.values(first).join("\n")).not.toContain("rm-a-001");
  });

  it("preserves user text and user tags outside managed block", () => {
    const first = buildSourceNote(book(), record("hash-a")).content;
    const userEdited = first
      .replace("  - readmind/source", "  - readmind/source\n  - user/custom")
      .replace("<!-- 这里由你自由书写，ReadMind 后续同步不会覆盖。 -->", "我的手写内容");
    const next = buildSourceNote(book(), record("hash-b")).content;
    const merged = mergeManagedSourceBlock(userEdited, next);

    expect(merged).toContain("我的手写内容");
    expect(merged).toContain("  - readmind/source");
    expect(merged).toContain("  - user/custom");
    expect(merged.match(/READMIND:SYNCED_CONTENT_START/g)).toHaveLength(1);
  });

  it("updates legacy managed blocks to the new user-facing template", () => {
    const legacy = [
      "---",
      "readmind_type: source_note",
      "tags:",
      "  - readmind/source",
      "---",
      "",
      "# 《幸福之路》来源笔记",
      "",
      "<!-- readmind:source:start -->",
      "## 原始摘录",
      "旧内容",
      "<!-- readmind:source:end -->",
      "",
      "用户手写内容",
    ].join("\n");

    const merged = mergeManagedSourceBlock(legacy, buildSourceNote(book(), record()).content);
    expect(merged).toContain("## 我的笔记");
    expect(merged).toContain("用户手写内容");
    expect(merged).not.toContain("readmind_type");
    expect(merged).not.toContain("原始摘录");
  });
});

function book(): ReadingBookDetails {
  return {
    id: "target-book",
    source: "weread",
    title: "幸福之路",
    author: "伯特兰·罗素",
    readingStatus: "reading",
    readingProgress: 9,
    annotationCount: 4,
    thoughtCount: 1,
    annotations: [
      annotation("h1", "highlight", "划线1", "第一章"),
      annotation("h2", "highlight", "划线2", "第一章"),
      annotation("h3", "highlight", "划线3", "第二章"),
      annotation("h4", "highlight", "划线4", "第二章"),
      { ...annotation("r1", "thought", "我的想法", "第一章"), relatedHighlightId: "h2" },
    ],
  };
}

function annotation(id: string, type: "highlight" | "thought", text: string, chapterTitle?: string) {
  return {
    id,
    bookId: "target-book",
    type,
    text,
    chapterTitle,
    sourceHash: `hash-${id}`,
  };
}
