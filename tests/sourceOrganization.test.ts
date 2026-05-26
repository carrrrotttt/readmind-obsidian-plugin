import { describe, expect, it } from "vitest";
import { buildAnnotationBlockIds } from "../src/markdown";
import { buildSourceFragments } from "../src/sourceFragments";
import { groupSourceFragmentsByChapter, thoughtsForHighlight } from "../src/sourceOrganization";
import type { ReadingBookDetails } from "../src/types";

describe("source organization", () => {
  it("groups fragments by real chapter order for both markdown and detail views", () => {
    const fragments = buildSourceFragments(book(), "ReadMind/01 Sources/Books/幸福之路.md", buildAnnotationBlockIds(book().annotations));
    const groups = groupSourceFragmentsByChapter(fragments);

    expect(groups.map((group) => group.chapterTitle)).toEqual(["第一章", "第二章"]);
    expect(groups[0].fragments.map((fragment) => fragment.annotationId)).toContain("r1");
  });

  it("matches a thought to its related highlight without changing stable block ids", () => {
    const annotations = book().annotations;
    const blockIds = buildAnnotationBlockIds(annotations);
    const fragments = buildSourceFragments(book(), "ReadMind/01 Sources/Books/幸福之路.md", blockIds);
    const firstGroup = groupSourceFragmentsByChapter(fragments)[0];
    const highlight = firstGroup.fragments.find((fragment) => fragment.annotationId === "h2")!;

    expect(thoughtsForHighlight(firstGroup, highlight).map((fragment) => fragment.annotationId)).toEqual(["r1"]);
    expect(highlight.blockId).toBe(blockIds.h2);
  });

  it("matches by chapter uid and range only when both fields are reliable", () => {
    const source = book();
    source.annotations = [
      { id: "h1", bookId: "target-book", type: "highlight", text: "划线1", chapterId: "1", chapterTitle: "第一章", locationLabel: "1-2", sourceHash: "hash-h1" },
      { id: "h2", bookId: "target-book", type: "highlight", text: "划线2", chapterId: "1", chapterTitle: "第一章", locationLabel: "3-4", sourceHash: "hash-h2" },
      { id: "r1", bookId: "target-book", type: "thought", text: "想法", chapterId: "1", chapterTitle: "第一章", locationLabel: "3-4", sourceHash: "hash-r1" },
      { id: "r2", bookId: "target-book", type: "thought", text: "不应绑定", chapterTitle: "第一章", locationLabel: "3-4", sourceHash: "hash-r2" },
    ];
    const fragments = buildSourceFragments(source, "ReadMind/01 Sources/Books/幸福之路.md", buildAnnotationBlockIds(source.annotations));
    const group = groupSourceFragmentsByChapter(fragments)[0];

    expect(thoughtsForHighlight(group, group.fragments.find((fragment) => fragment.annotationId === "h2")!).map((fragment) => fragment.annotationId)).toEqual(["r1"]);
  });
});

function book(): ReadingBookDetails {
  return {
    id: "target-book",
    source: "weread",
    title: "幸福之路",
    author: "伯特兰·罗素",
    readingStatus: "reading",
    annotationCount: 2,
    thoughtCount: 1,
    annotations: [
      { id: "h2", bookId: "target-book", type: "highlight", text: "划线2", chapterId: "1", chapterTitle: "第一章", sourceHash: "hash-h2" },
      { id: "h1", bookId: "target-book", type: "highlight", text: "划线1", chapterId: "1", chapterTitle: "第一章", sourceHash: "hash-h1" },
      { id: "h3", bookId: "target-book", type: "highlight", text: "划线3", chapterId: "2", chapterTitle: "第二章", sourceHash: "hash-h3" },
      {
        id: "r1",
        bookId: "target-book",
        type: "thought",
        text: "想法",
        chapterId: "1",
        chapterTitle: "第一章",
        relatedHighlightId: "h2",
        sourceHash: "hash-r1",
      },
    ],
  };
}
