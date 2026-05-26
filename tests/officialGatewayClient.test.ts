import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestUrl } from "obsidian";
import { buildSourceNote } from "../src/markdown";
import { OfficialGatewayClient } from "../src/officialGatewayClient";
import type { SyncedBookRecord, WeReadOfficialGatewaySettings } from "../src/types";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
}));

const mockRequestUrl = vi.mocked(requestUrl);

describe("OfficialGatewayClient", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it("posts flat gateway body with bearer auth", async () => {
    mockResponses([response({ errcode: 0, books: [] })]);

    await new OfficialGatewayClient(settings()).callGateway("/user/notebooks", { count: 20 });

    const request = requestAt(0);
    expect(request.url).toBe("https://i.weread.qq.com/api/agent/gateway");
    expect(request.method).toBe("POST");
    expect((request.headers as Record<string, string>).Authorization).toBe("Bearer test-api-key");
    expect(JSON.parse(String(request.body))).toEqual({
      api_name: "/user/notebooks",
      skill_version: "1.0.3",
      count: 20,
    });
  });

  it("maps notebook pages with lastSort", async () => {
    mockResponses([
      response({ books: [{ bookId: "b1", title: "A", noteCount: 1, sort: 9 }], hasMore: 1 }),
      response({ books: [{ bookId: "b2", title: "B", reviewCount: 2, sort: 8 }], hasMore: 0 }),
    ]);

    const books = await new OfficialGatewayClient(settings()).listBooks();

    expect(books.map((book) => book.id)).toEqual(["b1", "b2"]);
    expect(JSON.parse(String(requestAt(1).body))).toMatchObject({ lastSort: 9 });
  });

  it("maps real note details and progress without chapter dependency", async () => {
    mockDetailsResponses();

    const details = await new OfficialGatewayClient(settings()).getBookDetails("target-book");

    expect(details.readingProgress).toBe(9);
    expect(details.readingTimeMinutes).toBe(38);
    expect(details.annotationCount).toBe(4);
    expect(details.thoughtCount).toBe(1);
    expect(details.annotations.filter((item) => item.type === "highlight").map((item) => item.text)).toEqual([
      "划线1",
      "划线2",
      "划线3",
      "划线4",
    ]);
    expect(details.annotations.filter((item) => item.type === "highlight").map((item) => item.chapterTitle)).toEqual([
      "第一章",
      "第一章",
      "第二章",
      "第二章",
    ]);
    expect(details.annotations.find((item) => item.type === "thought")?.text).toBe("我的想法");
    expect(details.annotations.find((item) => item.type === "thought")?.annotationSubtype).toBe("chapter_thought");
  });

  it("uses lowercase bookid and synckey pagination for reviews", async () => {
    mockResponses([
      response({ books: [{ bookId: "target-book", title: "幸福之路" }] }),
      response({ bookId: "target-book", title: "幸福之路" }),
      response({ updated: [] }),
      response({ reviews: [{ review: { reviewId: "r1", content: "想法1" } }], hasMore: 1, synckey: 12 }),
      response({ book: { progress: 9, recordReadingTime: 2280 } }),
      response({ data: [{ updated: [{ chapterUid: 1, title: "第一章" }, { chapterUid: 2, title: "第二章" }] }] }),
      response({ reviews: [{ review: { reviewId: "r2", content: "想法2" } }], hasMore: 0, synckey: 13 }),
    ]);

    const details = await new OfficialGatewayClient(settings()).getBookDetails("target-book");

    expect(details.thoughtCount).toBe(2);
    expect(JSON.parse(String(requestAt(3).body))).toMatchObject({
      api_name: "/review/list/mine",
      bookid: "target-book",
      synckey: 0,
    });
    expect(JSON.parse(String(requestAt(6).body))).toMatchObject({
      api_name: "/review/list/mine",
      bookid: "target-book",
      synckey: 12,
    });
  });

  it("writes the same normalized details to markdown", async () => {
    mockDetailsResponses();
    const details = await new OfficialGatewayClient(settings()).getBookDetails("target-book");
    const built = buildSourceNote(details, record());

    for (const text of ["划线1", "划线2", "划线3", "划线4", "我的想法"]) {
      expect(built.content).toContain(text);
    }
  });

  it("does not call legacy web note endpoints in official mode", async () => {
    mockDetailsResponses();

    await new OfficialGatewayClient(settings()).getBookDetails("target-book");

    const serializedRequests = mockRequestUrl.mock.calls.map((call) => JSON.stringify(call[0])).join("\n");
    expect(serializedRequests).not.toContain("/web/book/bookmarklist");
    expect(serializedRequests).not.toContain("/web/review/list");
    expect(serializedRequests).not.toContain("/web/book/underlines");
    expect(serializedRequests).not.toContain("Cookie");
  });

  it("fails instead of silently rendering zero", async () => {
    mockResponses([response({ errcode: 401, errmsg: "bad key" })]);

    await expect(new OfficialGatewayClient(settings()).listBooks()).rejects.toThrow("401");
  });

  it("requests reading journey detail with stable skill version and mode", async () => {
    mockResponses([response({
      data: {
        totalReadTime: 3600,
        dayAverageReadTime: 600,
        readTimes: [{ time: 1716508800, readTime: 120 }],
      },
    })]);

    const summary = await new OfficialGatewayClient(settings()).getReadingJourney("monthly");

    expect(summary.totalReadSeconds).toBe(3600);
    expect(summary.timeBuckets).toEqual([{ timestamp: 1716508800, seconds: 120 }]);
    expect(JSON.parse(String(requestAt(0).body))).toEqual({
      api_name: "/readdata/detail",
      skill_version: "1.0.3",
      mode: "monthly",
    });
  });
});

function mockDetailsResponses() {
  mockResponses([
    response({ books: [{ bookId: "target-book", title: "幸福之路", noteCount: 4, reviewCount: 1, bookmarkCount: 0 }] }),
    response({ bookId: "target-book", title: "幸福之路", author: "伯特兰·罗素" }),
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
            content: "我的想法",
            chapterUid: 1,
            chapterName: "第一章",
            createTime: 1,
          },
        },
      ],
      hasMore: 0,
      synckey: 1,
    }),
    response({ book: { progress: 9, recordReadingTime: 2280 } }),
    response({ chapters: [] }),
  ]);
}

function mockResponses(items: Array<ReturnType<typeof response>>) {
  mockRequestUrl.mockImplementation((async () => {
    const next = items.shift();
    if (!next) throw new Error("No mocked response left.");
    return next as never;
  }) as never);
}

function response(json: unknown, options: { status?: number } = {}) {
  return {
    status: options.status ?? 200,
    headers: { "content-type": "application/json" },
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

function settings(): WeReadOfficialGatewaySettings {
  return {
    apiKey: "test-api-key",
    skillVersion: "1.0.3",
    connection: { state: "connected", message: "ok" },
  };
}

function record(): SyncedBookRecord {
  return {
    bookId: "target-book",
    sourceFilePath: "",
    lastSyncedAt: "2026-05-24T00:00:00.000Z",
    sourceContentHash: "hash",
    syncStatus: "synced",
    aiStatus: "not_analyzed",
    pendingSuggestionCount: 0,
  };
}
