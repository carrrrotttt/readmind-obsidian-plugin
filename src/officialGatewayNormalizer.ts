import { stableJsonHash } from "./hash";
import type { AnnotationSubtype, ReadingAnnotation, ReadingBook, ReadingBookDetails } from "./types";

export interface GatewayBook {
  bookId?: string;
  book?: GatewayBook;
  title?: string;
  author?: string;
  cover?: string;
  noteCount?: number;
  reviewCount?: number;
  bookmarkCount?: number;
  readingProgress?: number;
  progress?: number;
  markedStatus?: number;
  sort?: number;
}

export interface GatewayBookmark {
  bookmarkId?: string;
  markText?: string;
  chapterUid?: number | string;
  chapterName?: string;
  range?: string;
  createTime?: number;
  updateTime?: number;
}

export interface GatewayReviewItem {
  review?: GatewayReview;
}

export interface GatewayReview {
  reviewId?: string;
  content?: string;
  htmlContent?: string;
  chapterUid?: number | string;
  chapterName?: string;
  chapterTitle?: string;
  createTime?: number;
  updateTime?: number;
  type?: number;
  bookmarkId?: string;
  range?: string;
}

export interface GatewayChapter {
  chapterUid?: number | string;
  uid?: number | string;
  title?: string;
  chapterName?: string;
  chapterIdx?: number;
  level?: number;
  updateTime?: number;
}

export function extractGatewayBooks(raw: unknown): GatewayBook[] {
  const value = raw as { books?: unknown; data?: { books?: unknown } };
  const candidate = Array.isArray(value.books) ? value.books : value.data?.books;
  return Array.isArray(candidate) ? candidate as GatewayBook[] : [];
}

export function extractGatewayBookmarks(raw: unknown): GatewayBookmark[] {
  const value = raw as { updated?: unknown; data?: { updated?: unknown } };
  const candidate = Array.isArray(value.updated) ? value.updated : value.data?.updated;
  return Array.isArray(candidate) ? candidate as GatewayBookmark[] : [];
}

export function extractGatewayReviews(raw: unknown): GatewayReviewItem[] {
  const value = raw as { reviews?: unknown; data?: { reviews?: unknown } };
  const candidate = Array.isArray(value.reviews) ? value.reviews : value.data?.reviews;
  return Array.isArray(candidate) ? candidate as GatewayReviewItem[] : [];
}

export function extractGatewayChapters(raw: unknown): GatewayChapter[] {
  const value = raw as { chapters?: unknown; data?: { chapters?: unknown; updated?: unknown } | Array<{ updated?: unknown }>; updated?: unknown };
  const candidate = Array.isArray(value.chapters)
    ? value.chapters
    : Array.isArray(value.data)
      ? value.data[0]?.updated
      : Array.isArray(value.data?.chapters)
        ? value.data.chapters
        : Array.isArray(value.data?.updated)
          ? value.data.updated
          : value.updated;
  return Array.isArray(candidate) ? candidate as GatewayChapter[] : [];
}

export function mapGatewayBook(raw: GatewayBook): ReadingBook {
  const book = { ...raw, ...(raw.book ?? {}) };
  return {
    id: stringValue(book.bookId, "unknown-book"),
    source: "weread",
    title: stringValue(book.title, "未命名书籍"),
    author: book.author,
    coverUrl: book.cover,
    readingStatus: mapReadingStatus(book.markedStatus, book.readingProgress ?? book.progress),
    annotationCount: numberValue(book.noteCount, 0),
    thoughtCount: numberValue(book.reviewCount, 0),
    readingProgress: numberOrUndefined(book.readingProgress ?? book.progress),
    sourceUpdatedAt: timeValue(book.sort),
  };
}

export function mapGatewayBookDetails(
  rawBook: GatewayBook,
  bookmarks: GatewayBookmark[],
  reviews: GatewayReviewItem[],
  progressRaw: unknown,
  chapters: GatewayChapter[] = [],
): ReadingBookDetails {
  const progress = progressObject(progressRaw);
  const progressPercent = numberOrUndefined(progress.progress);
  const readingSeconds = firstNumber(progress, ["recordReadingTime", "readingTime", "readTime", "totalReadingTime", "totalReadTime"]);
  const book = mapGatewayBook({
    ...rawBook,
    progress: progressPercent ?? rawBook.progress ?? rawBook.readingProgress,
  });
  const chapterTitles = buildChapterTitleMap(chapters);
  const highlights = bookmarks.map((bookmark, index) => mapGatewayBookmark(book.id, bookmark, index, chapterTitles));
  const thoughts = reviews.map((item, index) => mapGatewayReview(book.id, item, index, chapterTitles));
  const annotations = [...highlights, ...thoughts].sort((left, right) => (left.createdAt ?? "").localeCompare(right.createdAt ?? ""));
  return {
    ...book,
    readingProgress: progressPercent ?? book.readingProgress,
    readingTimeMinutes: readingSeconds === undefined ? book.readingTimeMinutes : Math.round(readingSeconds / 60),
    readingStatus: mapReadingStatus(rawBook.markedStatus, progressPercent),
    annotationCount: highlights.length,
    thoughtCount: thoughts.length,
    annotations,
  };
}

function mapGatewayBookmark(bookId: string, raw: GatewayBookmark, index: number, chapterTitles: Map<string, string>): ReadingAnnotation {
  const chapterId = raw.chapterUid === undefined ? undefined : String(raw.chapterUid);
  const input = {
    id: stringValue(raw.bookmarkId, `gateway-highlight-${bookId}-${index + 1}`),
    bookId,
    chapterId,
    chapterTitle: raw.chapterName || (chapterId ? chapterTitles.get(chapterId) : undefined),
    type: "highlight" as const,
    text: stringValue(raw.markText, ""),
    locationLabel: raw.range,
    createdAt: timeValue(raw.createTime),
    updatedAt: timeValue(raw.updateTime),
  };
  return { ...input, sourceHash: stableJsonHash(input) };
}

function mapGatewayReview(bookId: string, raw: GatewayReviewItem, index: number, chapterTitles: Map<string, string>): ReadingAnnotation {
  const review = raw.review ?? {};
  const chapterId = review.chapterUid === undefined ? undefined : String(review.chapterUid);
  const input = {
    id: stringValue(review.reviewId, `gateway-thought-${bookId}-${index + 1}`),
    bookId,
    chapterId,
    chapterTitle: review.chapterName ?? review.chapterTitle ?? (chapterId ? chapterTitles.get(chapterId) : undefined),
    type: "thought" as const,
    annotationSubtype: inferReviewSubtype(review),
    text: stringValue(review.htmlContent ?? review.content, ""),
    relatedHighlightId: review.bookmarkId,
    locationLabel: review.range,
    createdAt: timeValue(review.createTime),
    updatedAt: timeValue(review.updateTime),
  };
  return { ...input, sourceHash: stableJsonHash(input) };
}

function buildChapterTitleMap(chapters: GatewayChapter[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const chapter of chapters) {
    const uid = chapter.chapterUid ?? chapter.uid;
    const title = chapter.title ?? chapter.chapterName;
    if (uid !== undefined && title) map.set(String(uid), title);
  }
  return map;
}

function inferReviewSubtype(review: GatewayReview): AnnotationSubtype {
  if (review.bookmarkId || review.range) return "highlight_comment";
  if (review.chapterUid !== undefined) return "chapter_thought";
  return "book_review";
}

function progressObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as { book?: unknown; data?: unknown };
  if (value.book && typeof value.book === "object") return value.book as Record<string, unknown>;
  if (value.data && typeof value.data === "object") return value.data as Record<string, unknown>;
  return raw as Record<string, unknown>;
}

function mapReadingStatus(markedStatus: unknown, progress: unknown): "reading" | "finished" | "unknown" {
  if (markedStatus === 3 || progress === 100) return "finished";
  if (typeof progress === "number" && progress > 0) return "reading";
  if (markedStatus === 1 || markedStatus === 2) return "reading";
  return "unknown";
}

function timeValue(value: unknown): string | undefined {
  if (typeof value !== "number" || value <= 0) return undefined;
  const millis = value < 10000000000 ? value * 1000 : value;
  return new Date(millis).toISOString();
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function firstNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = numberOrUndefined(source[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}
