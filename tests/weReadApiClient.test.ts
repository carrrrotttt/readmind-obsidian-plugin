import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestUrl } from "obsidian";
import { WeReadApiClient, WeReadApiError } from "../src/weReadApiClient";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
}));

const mockRequestUrl = vi.mocked(requestUrl);

describe("WeReadApiClient", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it("validates login with notebook only and absorbs notebook Set-Cookie", async () => {
    mockResponses([
      response({ books: [{ bookId: "b1", title: "Book" }] }, { headers: { "set-cookie": "wr_rt=notebook-fresh; Path=/" } }),
    ]);
    const updated: string[] = [];

    await new WeReadApiClient(session(), undefined, (next) => {
      updated.push(next.cookie);
    }).verifySession();

    expect(paths()).toEqual(["https://weread.qq.com/api/user/notebook"]);
    expect(methods()).toEqual(["GET"]);
    expect(updated.at(-1)).toContain("wr_rt=notebook-fresh");
  });

  it("marks 401 as unauthorized", async () => {
    mockResponses([response({}, { status: 401 })]);

    await expect(new WeReadApiClient(session()).verifySession()).rejects.toMatchObject({
      kind: "unauthorized",
    } satisfies Partial<WeReadApiError>);
  });

  it("sends saved Cookie header with browser-like headers", async () => {
    mockResponses([
      response({ books: [{ bookId: "b1" }] }),
    ]);

    await new WeReadApiClient(session()).verifySession();

    const headers = requestAt(0).headers as Record<string, string>;
    expect(cookieNames(headers.Cookie)).toEqual(["wr_name", "wr_skey", "wr_vid"]);
    expect(headers["User-Agent"]).toContain("Mozilla/5.0");
    expect(headers["User-Agent"]).not.toContain("ReadMind Obsidian");
    expect(headers.Accept).toContain("application/json");
    expect(headers["Accept-Language"]).toContain("zh-CN");
    expect(headers["Accept-Encoding"]).toContain("gzip");
  });

  it("maps notebook shelf books", async () => {
    mockResponses([
      response({}, { status: 204 }),
      response({
        books: [
          {
            book: { bookId: "b1", title: "Nested Book", author: "Nested Author" },
            bookmarkCount: 3,
            reviewCount: 2,
          },
        ],
      }),
    ]);

    const books = await new WeReadApiClient(session()).listBooks();

    expect(books[0]).toMatchObject({
      id: "b1",
      title: "Nested Book",
      author: "Nested Author",
      annotationCount: 3,
      thoughtCount: 2,
    });
  });

  it("requests reference-aligned details and maps progress, highlights, reviews, and chapters", async () => {
    mockDetailsResponses({
      bookmarks: {
        synckey: 1,
        updated: Array.from({ length: 4 }, (_, index) => ({
          bookmarkId: `m${index + 1}`,
          markText: `highlight ${index + 1}`,
          chapterUid: 100 + index,
          chapterName: `chapter ${index + 1}`,
          range: `${index}-${index + 1}`,
        })),
      },
      reviews: {
        reviews: [{ review: { reviewId: "r1", htmlContent: "thought", chapterName: "chapter 1" } }],
      },
      chapters: {
        data: [{ updated: [{ chapterUid: 100, title: "chapter 1" }] }],
      },
    });

    const details = await new WeReadApiClient(session()).getBookDetails("b1");

    expect(paths()).toEqual([
      "https://weread.qq.com",
      "https://weread.qq.com/api/user/notebook",
      "https://weread.qq.com/web/book/info?bookId=b1",
      "https://weread.qq.com/web/book/getProgress?bookId=b1",
      "https://weread.qq.com/web/book/bookmarklist?bookId=b1",
      "https://weread.qq.com/web/review/list?bookId=b1&listType=11&mine=1&synckey=0",
      "https://weread.qq.com/web/book/chapterInfos",
    ]);
    expect(paths()[4]).not.toContain("synckey=0");
    expect(paths()[5]).not.toContain("listMode=3");
    expect(methods()).toEqual(["HEAD", "GET", "GET", "GET", "GET", "GET", "POST"]);
    expect(requestAt(6).body).toBe(JSON.stringify({ bookIds: ["b1"] }));
    expect(details).toMatchObject({
      title: "Book",
      readingStatus: "reading",
      readingProgress: 9,
      readingTimeMinutes: 38,
      annotationCount: 4,
      thoughtCount: 1,
    });
    expect(details.annotations.filter((item) => item.type === "highlight").map((item) => item.text)).toEqual([
      "highlight 1",
      "highlight 2",
      "highlight 3",
      "highlight 4",
    ]);
    expect(details.annotations.find((item) => item.type === "thought")?.text).toBe("thought");
  });

  it("keeps notebook metadata and uses the remote shelf bookId for details", async () => {
    const events: Array<{ stage: string; data?: Record<string, unknown> }> = [];
    mockResponses([
      response({}, { status: 204 }),
      response({
        books: [
          {
            book: { bookId: "target-book", title: "幸福之路" },
            noteCount: 4,
            reviewCount: 1,
            bookmarkCount: 4,
          },
        ],
      }),
      response({ bookId: "target-book", title: "幸福之路" }),
      response({ book: { progress: 9, readingTime: 2280 } }),
      response({ updated: [] }),
      response({ reviews: [] }),
      response({ data: [{ updated: [] }] }),
    ]);

    await new WeReadApiClient(session(), (event) => events.push(event)).getBookDetails("target-book");

    expect(paths()).toContain("https://weread.qq.com/web/book/info?bookId=target-book");
    expect(events.find((event) => event.stage === "weread_note_payload_alignment_status")?.data).toMatchObject({
      notebookMetadata: {
        noteCount: 4,
        reviewCount: 1,
        bookmarkCount: 4,
      },
    });
  });

  it("keeps highlights and thoughts when chapterInfos fails", async () => {
    mockResponses([
      response({}, { status: 204 }),
      response({ books: [{ book: { bookId: "b1", title: "Book" }, noteCount: 4, reviewCount: 1 }] }),
      response({ bookId: "b1", title: "Book" }),
      response({ book: { progress: 9, readingTime: 2280 } }),
      response({
        updated: [
          { bookmarkId: "h1", markText: "划线1", chapterUid: 1, chapterName: "第一章", range: "1-2", createTime: 1 },
          { bookmarkId: "h2", markText: "划线2", chapterUid: 1, chapterName: "第一章", range: "3-4", createTime: 2 },
          { bookmarkId: "h3", markText: "划线3", chapterUid: 2, chapterName: "第二章", range: "1-2", createTime: 3 },
          { bookmarkId: "h4", markText: "划线4", chapterUid: 2, chapterName: "第二章", range: "3-4", createTime: 4 },
        ],
      }),
      response({
        reviews: [
          {
            review: {
              reviewId: "r1",
              htmlContent: "<p>我的想法</p>",
              content: "我的想法",
              chapterUid: 1,
              chapterName: "第一章",
              type: 1,
              createTime: 1,
            },
          },
        ],
      }),
      response({}, { status: 500 }),
    ]);

    const details = await new WeReadApiClient(session()).getBookDetails("b1");

    expect(details.annotationCount).toBe(4);
    expect(details.thoughtCount).toBe(1);
    expect(details.annotations.filter((item) => item.type === "highlight").map((item) => item.text)).toEqual([
      "划线1",
      "划线2",
      "划线3",
      "划线4",
    ]);
    expect(details.annotations.find((item) => item.type === "thought")?.text).toBe("<p>我的想法</p>");
  });

  it("does not silently return zero when personal note requests fail", async () => {
    mockResponses([
      response({}, { status: 204 }),
      response({ books: [{ bookId: "b1" }] }),
      response({ bookId: "b1", title: "Book" }),
      response({ book: { progress: 9, readingTime: 2280 } }),
      response({}, { status: 500 }),
      response({ reviews: [] }),
      response({ data: [{ updated: [] }] }),
    ]);

    await expect(new WeReadApiClient(session()).getBookDetails("b1")).rejects.toMatchObject({
      kind: "network",
    } satisfies Partial<WeReadApiError>);
  });

  it("does not request /web/book/underlines", async () => {
    mockDetailsResponses({
      bookmarks: { updated: [] },
      reviews: { reviews: [] },
      chapters: { data: [{ updated: [] }] },
    });

    await new WeReadApiClient(session()).getBookDetails("b1");

    expect(JSON.stringify(paths())).not.toContain("/web/book/underlines");
  });

  it("emits one minimal sync status without note text, cookie values, or full ids", async () => {
    const events: Array<{ stage: string; data?: Record<string, unknown> }> = [];
    mockDetailsResponses({
      bookId: "secret-book-id",
      bookmarks: { updated: [{ bookmarkId: "secret-bookmark-id", markText: "PRIVATE_HIGHLIGHT_TEXT" }] },
      reviews: { reviews: [{ review: { reviewId: "secret-review-id", content: "PRIVATE_THOUGHT_TEXT" } }] },
      chapters: { data: [{ updated: [] }] },
    });

    await new WeReadApiClient(session(), (event) => events.push(event)).getBookDetails("secret-book-id");

    const status = events.find((event) => event.stage === "weread_note_payload_alignment_status");
    expect(status?.data).toMatchObject({
      remoteResponse: {
        progressStatus: 200,
        bookmarkStatus: 200,
        bookmarkUpdatedCount: 1,
        reviewStatus: 200,
        reviewArrayCount: 1,
        chapterStatus: 200,
      },
      normalizedData: {
        highlightCount: 1,
        thoughtCount: 1,
      },
      displayedData: {
        highlightCount: 1,
        thoughtCount: 1,
      },
      markdownData: {
        highlightCount: "not-synced",
        thoughtCount: "not-synced",
      },
    });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("secret-book-id");
    expect(serialized).not.toContain("secret-bookmark-id");
    expect(serialized).not.toContain("secret-review-id");
    expect(serialized).not.toContain("PRIVATE_HIGHLIGHT_TEXT");
    expect(serialized).not.toContain("PRIVATE_THOUGHT_TEXT");
    expect(serialized).not.toContain("wr_skey=test");
  });
});

function mockDetailsResponses(options: {
  bookId?: string;
  bookmarks: unknown;
  reviews: unknown;
  chapters: unknown;
}) {
  const bookId = options.bookId ?? "b1";
  mockResponses([
    response({}, { status: 204, headers: { "set-cookie": "wr_skey=fresh; Path=/" } }),
    response({ books: [{ book: { bookId, title: "Book" }, noteCount: 4, reviewCount: 1, bookmarkCount: 4 }] }),
    response({ bookId, title: "Book", author: "Author" }),
    response({ book: { progress: 9, readingTime: 2280 } }),
    response(options.bookmarks),
    response(options.reviews),
    response(options.chapters),
  ]);
}

function mockResponses(items: Array<ReturnType<typeof response>>) {
  mockRequestUrl.mockImplementation((async () => {
    const next = items.shift();
    if (!next) throw new Error("No mocked response left.");
    return next as never;
  }) as never);
}

function response(json: unknown, options: { status?: number; headers?: Record<string, string> } = {}) {
  return {
    status: options.status ?? 200,
    headers: options.headers ?? { "content-type": "application/json" },
    json,
    text: JSON.stringify(json),
  };
}

function requestAt(index: number) {
  const input = mockRequestUrl.mock.calls[index]?.[0];
  if (!input || typeof input === "string") {
    throw new Error("Expected requestUrl to be called with RequestUrlParam.");
  }
  return input;
}

function paths(): string[] {
  return mockRequestUrl.mock.calls.map((_call, index) => requestAt(index).url);
}

function methods(): string[] {
  return mockRequestUrl.mock.calls.map((_call, index) => String(requestAt(index).method));
}

function session() {
  return {
    cookie: "wr_vid=123; wr_skey=test; wr_name=name",
    loginAt: "2026-05-23T00:00:00.000Z",
    expired: false,
    userVid: "123",
  };
}

function cookieNames(cookie: string): string[] {
  return cookie
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .sort();
}
