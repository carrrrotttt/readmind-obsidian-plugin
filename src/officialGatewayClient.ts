import { requestUrl } from "obsidian";
import type { ReadingBook, ReadingBookDetails, ReadingJourneySummary, ReadingPeriod, WeReadOfficialGatewaySettings } from "./types";
import type { WeReadDebugLogger } from "./weReadDiagnostics";
import { mapReadingJourneySummary } from "./readingJourneyService";
import {
  extractGatewayBookmarks,
  extractGatewayBooks,
  extractGatewayChapters,
  extractGatewayReviews,
  mapGatewayBook,
  mapGatewayBookDetails,
  type GatewayBook,
} from "./officialGatewayNormalizer";

const GATEWAY_URL = "https://i.weread.qq.com/api/agent/gateway";

export class OfficialGatewayError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class OfficialGatewayClient {
  constructor(
    private readonly settings: WeReadOfficialGatewaySettings,
    private readonly onDebug?: WeReadDebugLogger,
  ) {}

  async testConnection(): Promise<void> {
    const result = await this.callGateway<{ books?: unknown }>("/user/notebooks", { count: 20 });
    if (!Array.isArray(result.books)) {
      throw new OfficialGatewayError("微信读书官方 API 返回格式不包含 books。");
    }
  }

  async listBooks(): Promise<ReadingBook[]> {
    const books: GatewayBook[] = [];
    let lastSort: number | undefined;
    for (let page = 0; page < 20; page += 1) {
      const raw = await this.callGateway<{ books?: unknown; hasMore?: number }>("/user/notebooks", {
        count: 100,
        ...(lastSort === undefined ? {} : { lastSort }),
      });
      const pageBooks = extractGatewayBooks(raw);
      books.push(...pageBooks);
      if (raw.hasMore !== 1 || pageBooks.length === 0) break;
      lastSort = pageBooks.at(-1)?.sort;
      if (lastSort === undefined) break;
    }
    return books.map(mapGatewayBook);
  }

  async getBookDetails(bookId: string): Promise<ReadingBookDetails> {
    const notebooks = await this.callGateway<{ books?: unknown }>("/user/notebooks", { count: 100 });
    const notebookBook = extractGatewayBooks(notebooks).find((item) => ({ ...item, ...(item.book ?? {}) }).bookId === bookId);
    const [bookInfo, bookmarklist, reviews, progress, chapters] = await Promise.all([
      this.callGateway<GatewayBook>("/book/info", { bookId }),
      this.callGateway<unknown>("/book/bookmarklist", { bookId }),
      this.fetchAllReviews(bookId),
      this.callGateway<unknown>("/book/getprogress", { bookId }),
      this.callGateway<unknown>("/book/chapterinfo", { bookId }).catch(() => ({ chapters: [] })),
    ]);

    const rawBook = { ...bookInfo, ...notebookBook };
    const bookmarkItems = extractGatewayBookmarks(bookmarklist);
    const reviewItems = extractGatewayReviews(reviews);
    const chapterItems = extractGatewayChapters(chapters);
    const details = mapGatewayBookDetails(rawBook, bookmarkItems, reviewItems, progress, chapterItems);

    this.onDebug?.({
      stage: "weread_official_gateway_sync_status",
      data: {
        dataSource: "official-gateway",
        skillVersion: this.settings.skillVersion,
        bookTitle: details.title,
        notebookCounts: {
          noteCount: numberOrMissing((notebookBook as { noteCount?: unknown } | undefined)?.noteCount),
          reviewCount: numberOrMissing((notebookBook as { reviewCount?: unknown } | undefined)?.reviewCount),
          bookmarkCount: numberOrMissing((notebookBook as { bookmarkCount?: unknown } | undefined)?.bookmarkCount),
        },
        responseStatus: {
          notebooks: "ok",
          bookmarklist: "ok",
          reviews: "ok",
          progress: "ok",
          chapter: chapterItems.length > 0 ? "ok" : "missing",
        },
        remoteCounts: {
          highlightCount: bookmarkItems.length,
          thoughtCount: reviewItems.length,
          chapterCount: chapterItems.length,
        },
        normalizedCounts: {
          highlightCount: details.annotationCount,
          thoughtCount: details.thoughtCount,
        },
        displayedCounts: {
          highlightCount: details.annotationCount,
          thoughtCount: details.thoughtCount,
        },
        markdownCounts: {
          highlightCount: details.annotationCount,
          thoughtCount: details.thoughtCount,
        },
      },
    });

    return details;
  }

  async getReadingJourney(period: ReadingPeriod): Promise<ReadingJourneySummary> {
    const raw = await this.callGateway<unknown>("/readdata/detail", { mode: period });
    return mapReadingJourneySummary(period, raw);
  }

  async callGateway<T>(apiName: string, params: Record<string, unknown>): Promise<T> {
    if (!this.settings.apiKey.trim()) {
      throw new OfficialGatewayError("请先配置微信读书官方 API Key。");
    }
    const body = {
      api_name: apiName,
      skill_version: this.settings.skillVersion || "1.0.3",
      ...params,
    };
    const response = await requestUrl({
      url: GATEWAY_URL,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      throw: false,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new OfficialGatewayError(`微信读书官方 API 请求失败：HTTP ${response.status}`);
    }
    const json = response.json ?? parseJson(response.text ?? "");
    return this.unwrapGatewayResponse<T>(json);
  }

  private async fetchAllReviews(bookId: string): Promise<{ reviews: unknown[] }> {
    const reviews: unknown[] = [];
    let synckey = 0;
    for (let page = 0; page < 20; page += 1) {
      const raw = await this.callGateway<{ reviews?: unknown; hasMore?: number; synckey?: number }>("/review/list/mine", {
        bookid: bookId,
        count: 100,
        synckey,
      });
      const pageReviews = extractGatewayReviews(raw);
      reviews.push(...pageReviews);
      if (raw.hasMore !== 1) break;
      if (typeof raw.synckey !== "number" || raw.synckey === synckey) break;
      synckey = raw.synckey;
    }
    return { reviews };
  }

  private unwrapGatewayResponse<T>(json: unknown): T {
    if (!json || typeof json !== "object") {
      throw new OfficialGatewayError("微信读书官方 API 返回格式无效。");
    }
    const record = json as Record<string, unknown>;
    if (record.upgrade_info) {
      throw new OfficialGatewayError("微信读书官方 API 需要升级 skill_version。");
    }
    const errcode = record.errcode ?? record.errCode;
    if (typeof errcode === "number" && errcode !== 0) {
      throw new OfficialGatewayError(`微信读书官方 API 返回错误：${errcode}`);
    }
    const data = record.data && typeof record.data === "object" ? record.data : record;
    return data as T;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function numberOrMissing(value: unknown): number | "missing" {
  return typeof value === "number" && Number.isFinite(value) ? value : "missing";
}
