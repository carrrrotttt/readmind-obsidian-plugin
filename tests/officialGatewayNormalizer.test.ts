import { describe, expect, it } from "vitest";
import { mapGatewayBookDetails } from "../src/officialGatewayNormalizer";

describe("official gateway normalizer", () => {
  it("keeps reliable thought-to-highlight fields for source organization", () => {
    const details = mapGatewayBookDetails(
      { bookId: "target-book", title: "幸福之路" },
      [{ bookmarkId: "h1", markText: "划线", chapterUid: 7, chapterName: "拜伦式不幸", range: "10-12" }],
      [{ review: { reviewId: "r1", content: "想法", bookmarkId: "h1", chapterUid: 7, chapterName: "拜伦式不幸", range: "10-12" } }],
      {},
      [],
    );

    const thought = details.annotations.find((annotation) => annotation.type === "thought");
    expect(thought).toMatchObject({
      relatedHighlightId: "h1",
      chapterId: "7",
      locationLabel: "10-12",
      annotationSubtype: "highlight_comment",
    });
  });
});
