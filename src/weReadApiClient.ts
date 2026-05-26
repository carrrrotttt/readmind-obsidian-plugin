import { requestUrl } from "obsidian";
import type { WeReadSession } from "./types";
import type { WeReadDebugLogger } from "./weReadDiagnostics";
import { describeHeaderNames } from "./weReadDiagnostics";
import { extractUserVidFromCookie, mergeSetCookieHeader, summarizeCookieHeader } from "./weReadSession";
import {
  extractBookmarks,
  extractBooksFromShelfResponse,
  extractChaptersFromChapterInfos,
  extractReviews,
  mapWeReadBook,
  mapWeReadBookDetails,
} from "./wereadMapper";
import type { WeReadRawBook } from "./wereadTypes";

const WEREAD_ORIGIN = "https://weread.qq.com";
const WEREAD_REFERER = "https://weread.qq.com/";
const USER_NOTEBOOK_PATH = "/api/user/notebook";

type RequestMethod = "GET" | "POST" | "HEAD";

export class WeReadApiError extends Error {
  constructor(
    message: string,
    readonly kind: "unauthorized" | "network" | "format" | "unknown",
  ) {
    super(message);
  }
}

export class WeReadApiClient {
  constructor(
    private readonly session: WeReadSession,
    private readonly onDebug?: WeReadDebugLogger,
    private readonly onSessionUpdated?: (session: WeReadSession) => void | Promise<void>,
  ) {}

  async verifySession(): Promise<void> {
    const notebook = await this.requestJsonResponse(USER_NOTEBOOK_PATH, "verify_user_notebook");
    const hasBooks = hasBooksField(notebook.json);
    this.onDebug?.({
      stage: "weread_notebook_probe_finished",
      data: {
        path: USER_NOTEBOOK_PATH,
        hasBooks,
        bookCount: extractBooksFromShelfResponse(notebook.json).length,
      },
    });
    if (!hasBooks) {
      throw new WeReadApiError("微信读书登录验证返回格式不包含 books。", "format");
    }
  }

  async listBooks(): Promise<ReturnType<typeof mapWeReadBook>[]> {
    const notebook = await this.refreshCookiesAndNotebook();
    const books = extractBooksFromShelfResponse(notebook.json).map(mapWeReadBook);
    if (books.length === 0) {
      throw new WeReadApiError("微信读书书架为空或接口返回格式已变化。", "format");
    }
    return books;
  }

  async getBookDetails(bookId: string) {
    const notebook = await this.refreshCookiesAndNotebook();
    const notebookBook = findNotebookBook(notebook.json, bookId);
    const bookInfoPath = `/web/book/info?bookId=${encodeURIComponent(bookId)}`;
    const progressPath = `/web/book/getProgress?bookId=${encodeURIComponent(bookId)}`;
    const bookmarkPath = `/web/book/bookmarklist?bookId=${encodeURIComponent(bookId)}`;
    const reviewPath = `/web/review/list?bookId=${encodeURIComponent(bookId)}&listType=11&mine=1&synckey=0`;
    const chapterPath = "/web/book/chapterInfos";

    const [bookInfo, progress, bookmarks, reviews, chapters] = await Promise.all([
      this.requestJsonResponse(bookInfoPath, "fetch_book_info"),
      this.requestJsonResponse(progressPath, "fetch_book_progress"),
      this.requestJsonResponse(bookmarkPath, "fetch_bookmarks"),
      this.requestJsonResponse(reviewPath, "fetch_reviews"),
      this.requestJsonResponse(chapterPath, "fetch_chapter_infos", "POST", { bookIds: [bookId] })
        .catch(() => fallbackJsonResponse({ data: [{ updated: [] }] })),
    ]);

    const book = applyProgressToBook({ ...normalizeBookInfo(bookInfo.json, bookId), ...notebookBook }, progress.json);
    const bookmarkItems = extractBookmarks(bookmarks.json);
    const reviewItems = extractReviews(reviews.json);
    const chapterItems = extractChaptersFromChapterInfos(chapters.json);
    const details = mapWeReadBookDetails(book, bookmarkItems, reviewItems);

    this.onDebug?.({
      stage: "weread_note_payload_alignment_status",
      data: {
        bookTitle: details.title,
        notebookMetadata: {
          noteCount: numberOrMissing(notebookBook?.noteCount),
          reviewCount: numberOrMissing(notebookBook?.reviewCount),
          bookmarkCount: numberOrMissing(notebookBook?.bookmarkCount),
        },
        requestUrls: {
          bookmarkPath: sanitizePathWithQueryNames(bookmarkPath),
          reviewPath: sanitizePathWithQueryNames(reviewPath),
          chapterPath,
          progressPath: sanitizePathWithQueryNames(progressPath),
        },
        remoteResponse: {
          progressStatus: progress.status,
          bookmarkStatus: bookmarks.status,
          reviewStatus: reviews.status,
          chapterStatus: chapters.status === 0 ? "request-failed" : chapters.status,
          progressErrCode: errorCode(progress.json),
          bookmarkErrCode: errorCode(bookmarks.json),
          reviewErrCode: errorCode(reviews.json),
          chapterErrCode: errorCode(chapters.json),
          bookmarkTopLevelKeys: topLevelKeys(bookmarks.json),
          reviewTopLevelKeys: topLevelKeys(reviews.json),
          chapterTopLevelKeys: topLevelKeys(chapters.json),
          bookmarkUpdatedCount: updatedCount(bookmarks.json),
          bookmarkChapterCount: bookmarkChapterCount(bookmarks.json),
          reviewArrayCount: reviewCount(reviews.json),
          chapterUpdatedCount: chapterItems.length > 0 ? chapterItems.length : "missing",
        },
        normalizedData: {
          highlightCount: details.annotationCount,
          thoughtCount: details.thoughtCount,
          chapterCount: chapterItems.length,
          ungroupedHighlightCount: details.annotations.filter((item) => item.type === "highlight" && !item.chapterTitle).length,
          ungroupedThoughtCount: details.annotations.filter((item) => item.type === "thought" && !item.chapterTitle).length,
        },
        displayedData: {
          progress: details.readingProgress ?? "missing",
          readingMinutes: details.readingTimeMinutes ?? "missing",
          highlightCount: details.annotationCount,
          thoughtCount: details.thoughtCount,
        },
        markdownData: {
          highlightCount: "not-synced",
          thoughtCount: "not-synced",
        },
      },
    });

    return details;
  }

  private async refreshCookiesAndNotebook(): Promise<WeReadJsonResponse> {
    await this.refreshHomeCookie();
    return this.requestJsonResponse(USER_NOTEBOOK_PATH, "fetch_user_notebook");
  }

  private async refreshHomeCookie(): Promise<void> {
    try {
      await this.requestJsonResponse("/", "refresh_weread_home_cookie", "HEAD");
    } catch (error) {
      this.onDebug?.({
        stage: "weread_home_cookie_refresh_skipped",
        data: {
          reason: error instanceof Error ? error.message : "unknown",
        },
      });
    }
  }

  private async requestJsonResponse(
    path: string,
    category = "request",
    method: RequestMethod = "GET",
    body?: unknown,
  ): Promise<WeReadJsonResponse> {
    if (!this.session.cookie || this.session.expired) {
      throw new WeReadApiError("微信读书登录状态不可用，请重新扫码登录。", "unauthorized");
    }

    try {
      const response = await this.requestWithRequestUrl(path, category, method, body);
      await this.absorbSetCookie(response);
      this.onDebug?.({
        stage: "weread_request_finished",
        data: {
          category,
          path: sanitizePath(path),
          status: response.status,
          environment: response.environment,
          method,
          hasBooks: hasBooksField(response.json),
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw new WeReadApiError("微信读书登录已失效，请重新扫码。", "unauthorized");
      }
      if (response.status < 200 || response.status >= 300) {
        throw new WeReadApiError(`微信读书请求失败：HTTP ${response.status}`, "network");
      }
      return response;
    } catch (error) {
      if (error instanceof WeReadApiError) throw error;
      this.onDebug?.({ stage: "weread_request_failed", data: { category, path: sanitizePath(path) } });
      throw new WeReadApiError("微信读书请求失败，请重试或重新登录。", "network");
    }
  }

  private async requestWithRequestUrl(path: string, category: string, method: RequestMethod, body?: unknown): Promise<WeReadJsonResponse> {
    const url = path === "/" ? WEREAD_ORIGIN : `${WEREAD_ORIGIN}${path}`;
    const headers = this.buildHeaders(method);
    const cookieSummary = summarizeCookieHeader(this.session.cookie);
    this.onDebug?.({
      stage: "weread_request_started",
      data: {
        category,
        path: sanitizePath(path),
        host: new URL(url).host,
        method,
        environment: "request_url",
        cookieCount: cookieSummary.count,
        cookieNames: cookieSummary.names,
        headerNames: describeHeaderNames(headers),
      },
    });
    const response = await requestUrl({
      url,
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      throw: false,
    });
    const text = response.text ?? "";
    return {
      status: response.status,
      headers: response.headers ?? {},
      text,
      json: response.json ?? parseJson(text),
      environment: "request_url",
    };
  }

  private buildHeaders(method: RequestMethod): Record<string, string> {
    return {
      Cookie: this.session.cookie,
      Referer: WEREAD_REFERER,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      ...(method === "POST" ? { "Content-Type": "application/json;charset=UTF-8" } : {}),
    };
  }

  private async absorbSetCookie(response: WeReadJsonResponse): Promise<void> {
    const setCookie = headerValue(response.headers, "set-cookie");
    const merged = mergeSetCookieHeader(this.session.cookie, setCookie);
    if (merged.updatedNames.length === 0 || merged.cookie === this.session.cookie) return;
    this.session.cookie = merged.cookie;
    this.session.userVid = extractUserVidFromCookie(merged.cookie);
    await this.onSessionUpdated?.(this.session);
  }
}

interface WeReadJsonResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: unknown;
  environment: "request_url";
}

function fallbackJsonResponse(json: unknown): WeReadJsonResponse {
  return {
    status: 0,
    headers: {},
    text: "",
    json,
    environment: "request_url",
  };
}

function sanitizePath(path: string): string {
  return path.split("?")[0] ?? path;
}

function hasBooksField(raw: unknown): boolean {
  return Boolean(raw && typeof raw === "object" && Array.isArray((raw as { books?: unknown }).books));
}

function normalizeBookInfo(raw: unknown, bookId: string): WeReadRawBook {
  const value = raw as WeReadRawBook & { book?: WeReadRawBook };
  return {
    bookId,
    ...(value.book ?? value),
  };
}

function findNotebookBook(raw: unknown, bookId: string): WeReadRawBook | undefined {
  return extractBooksFromShelfResponse(raw)
    .map((item) => ({ ...item, ...(item.book ?? {}) }))
    .find((item) => item.bookId === bookId);
}

function applyProgressToBook(book: WeReadRawBook, raw: unknown): WeReadRawBook {
  const progressBook = findObject(raw, "book");
  const source = progressBook ?? raw;
  const progress = findNumeric(source, ["progress", "readProgress", "readingProgress", "percent"]);
  const readingTime = findNumeric(source, ["readingTime", "readTime", "readingTimeMinutes", "readTimeMinutes", "totalReadTime"]);
  const normalizedProgress = normalizeProgress(progress);
  return {
    ...book,
    progress: normalizedProgress,
    readingTimeMinutes: normalizeReadingMinutes(readingTime),
    readingStatus: mapStatusFromProgress(source, normalizedProgress, book.readingStatus),
  };
}

function findObject(raw: unknown, key: string): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = (raw as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function findNumeric(raw: unknown, keys: string[]): number | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function normalizeProgress(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (value <= 1) return Math.round(value * 100);
  if (value > 100 && value <= 10000) return Math.round(value / 100);
  return Math.round(value);
}

function normalizeReadingMinutes(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return value > 300 ? Math.round(value / 60) : Math.round(value);
}

function mapStatusFromProgress(raw: unknown, progress: number | undefined, fallback: unknown): number | undefined {
  const explicit = findNumeric(raw, ["readingStatus", "readStatus", "status"]);
  if (explicit !== undefined) return explicit;
  if (progress === undefined) return typeof fallback === "number" ? fallback : undefined;
  return progress >= 100 ? 3 : progress > 0 ? 2 : 1;
}

function updatedCount(raw: unknown): number | "missing" {
  const updated = raw && typeof raw === "object" ? (raw as { updated?: unknown }).updated : undefined;
  return Array.isArray(updated) ? updated.length : "missing";
}

function reviewCount(raw: unknown): number | "missing" {
  const reviews = extractReviews(raw);
  return reviews.length > 0 ? reviews.length : "missing";
}

function bookmarkChapterCount(raw: unknown): number | "missing" {
  const chapters = new Set(extractBookmarks(raw).map((item) => item.chapterUid).filter(Boolean));
  return chapters.size > 0 ? chapters.size : "missing";
}

function numberOrMissing(value: unknown): number | "missing" {
  return typeof value === "number" && Number.isFinite(value) ? value : "missing";
}

function errorCode(raw: unknown): number | "missing" {
  if (!raw || typeof raw !== "object") return "missing";
  const record = raw as { errCode?: unknown; errcode?: unknown; code?: unknown };
  const value = record.errCode ?? record.errcode ?? record.code;
  return typeof value === "number" ? value : "missing";
}

function topLevelKeys(raw: unknown): string[] {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? Object.keys(raw).sort() : [];
}

function sanitizePathWithQueryNames(path: string): string {
  const parsed = new URL(`${WEREAD_ORIGIN}${path}`);
  const names = [...parsed.searchParams.keys()];
  return names.length > 0 ? `${parsed.pathname}?${names.join("&")}` : parsed.pathname;
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1];
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}
