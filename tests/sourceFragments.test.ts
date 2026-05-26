import { describe, expect, it } from "vitest";
import { buildAnnotationBlockIds } from "../src/markdown";
import { buildSourceFragments } from "../src/sourceFragments";
import type { ReadingBookDetails } from "../src/types";

describe("source fragments", () => {
  it("keeps block identifiers and local note paths for AI evidence", () => {
    const book: ReadingBookDetails = {
      id: "target-book",
      source: "weread",
      title: "幸福之路",
      author: "伯特兰·罗素",
      readingStatus: "reading",
      annotationCount: 1,
      thoughtCount: 1,
      annotations: [
        { id: "h1", bookId: "target-book", type: "highlight", text: "划线", sourceHash: "hash-h1" },
        { id: "r1", bookId: "target-book", type: "thought", text: "想法", sourceHash: "hash-r1" },
      ],
    };
    const blockIds = buildAnnotationBlockIds(book.annotations);
    const fragments = buildSourceFragments(book, "ReadMind/01 Sources/Books/幸福之路.md", blockIds);

    expect(fragments).toHaveLength(2);
    expect(fragments[0]).toMatchObject({
      sourceType: "highlight",
      bookId: "target-book",
      bookTitle: "幸福之路",
      blockIdentifier: blockIds.h1,
      localNotePath: "ReadMind/01 Sources/Books/幸福之路.md",
      annotationId: "h1",
      blockId: blockIds.h1,
      sourceNotePath: "ReadMind/01 Sources/Books/幸福之路.md",
      type: "highlight",
      text: "划线",
    });
    expect(fragments[1].sourceType).toBe("thought");
  });
});
