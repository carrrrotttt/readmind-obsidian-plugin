import { describe, expect, it } from "vitest";
import { extractBookmarks, extractBooksFromShelfResponse, extractChaptersFromChapterInfos, extractReviews, mapWeReadBookDetails } from "../src/wereadMapper";
import { extractUserVidFromCookie, mergeSetCookieHeader, sanitizeCookie } from "../src/weReadSession";

describe("WeRead mapping", () => {
  it("extracts books from notebook-like response", () => {
    const books = extractBooksFromShelfResponse({ books: [{ bookId: "b1", title: "书", author: "作者" }] });
    expect(books).toHaveLength(1);
  });

  it("maps details and annotations", () => {
    const details = mapWeReadBookDetails(
      { bookId: "b1", title: "书", author: "作者", bookmarkCount: 1, reviewCount: 1 },
      extractBookmarks({ updated: [{ bookmarkId: "m1", markText: "划线", chapterName: "第一章" }] }),
      extractReviews({ reviews: [{ reviewId: "r1", content: "想法", chapterTitle: "第一章" }] }),
    );

    expect(details.title).toBe("书");
    expect(details.annotations).toHaveLength(2);
    expect(details.thoughtCount).toBe(1);
  });

  it("redacts cookies and extracts user vid", () => {
    const cookie = "wr_vid=123; wr_skey=secret; other=value";
    expect(extractUserVidFromCookie(cookie)).toBe("123");
    expect(sanitizeCookie(cookie)).not.toContain("secret");
    expect(sanitizeCookie(cookie)).not.toContain("123");
  });

  it("merges refreshed Set-Cookie values by cookie name", () => {
    const merged = mergeSetCookieHeader("wr_vid=123; wr_skey=old", "wr_skey=fresh; Path=/; HttpOnly, wr_rt=rt; Path=/");
    expect(merged.updatedNames).toEqual(["wr_rt", "wr_skey"]);
    expect(merged.cookie).toContain("wr_skey=fresh");
    expect(merged.cookie).toContain("wr_rt=rt");
    expect(merged.cookie).toContain("wr_vid=123");
  });

  it("extracts chapterInfos data[0].updated chapters", () => {
    const chapters = extractChaptersFromChapterInfos({
      data: [{ updated: [{ chapterUid: 1, title: "chapter 1" }] }],
    });
    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({ chapterUid: 1, title: "chapter 1" });
  });
});
