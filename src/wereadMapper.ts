import { stableJsonHash } from "./hash";
import type { ReadingAnnotation, ReadingBook, ReadingBookDetails, ReadingStatus } from "./types";
import type { WeReadRawBook, WeReadRawBookmark, WeReadRawChapter, WeReadRawReview } from "./wereadTypes";

export function mapWeReadBook(raw: WeReadRawBook): ReadingBook {
  const book = { ...raw, ...(raw.book ?? {}) };
  const id = stringValue(book.bookId, "unknown-book");
  return {
    id,
    source: "weread",
    title: stringValue(book.title, "未命名书籍"),
    author: book.author,
    coverUrl: book.cover,
    publisher: book.publisher,
    isbn: book.isbn,
    category: book.category,
    description: book.intro ?? book.description,
    readingStatus: mapReadingStatus(book.readingStatus),
    annotationCount: numberValue(book.bookmarkCount ?? book.noteCount, 0),
    thoughtCount: numberValue(book.reviewCount, 0),
    readingProgress: numberOrUndefined(book.progress),
    readingTimeMinutes: numberOrUndefined(book.readingTimeMinutes),
    lastReadAt: timeValue(book.readUpdateTime ?? book.sort),
    sourceUpdatedAt: timeValue(book.updateTime ?? book.readUpdateTime ?? book.sort),
  };
}

export function mapWeReadBookDetails(
  rawBook: WeReadRawBook,
  bookmarks: WeReadRawBookmark[],
  reviews: WeReadRawReview[],
): ReadingBookDetails {
  const book = mapWeReadBook(rawBook);
  const highlightAnnotations = bookmarks.map((bookmark, index) => mapBookmark(book.id, bookmark, index));
  const thoughtAnnotations = reviews.map((review, index) => mapReview(book.id, review, index));
  const annotations = [...highlightAnnotations, ...thoughtAnnotations]
    .sort((left, right) => (left.createdAt ?? "").localeCompare(right.createdAt ?? ""));
  return {
    ...book,
    annotationCount: highlightAnnotations.length,
    thoughtCount: thoughtAnnotations.length,
    annotations,
  };
}

export function extractBooksFromShelfResponse(raw: unknown): WeReadRawBook[] {
  const value = raw as {
    books?: unknown;
    data?: { books?: unknown; shelf?: unknown };
    bookProgress?: unknown;
  };
  const candidates = [
    value.books,
    value.data?.books,
    value.data?.shelf,
    value.bookProgress,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as WeReadRawBook[];
  }
  return [];
}

export function extractBookmarks(raw: unknown): WeReadRawBookmark[] {
  const value = raw as { updated?: unknown; bookmarks?: unknown; data?: { bookmarks?: unknown } };
  if (Array.isArray(value.updated)) return value.updated as WeReadRawBookmark[];
  if (Array.isArray(value.bookmarks)) return value.bookmarks as WeReadRawBookmark[];
  if (Array.isArray(value.data?.bookmarks)) return value.data.bookmarks as WeReadRawBookmark[];
  return [];
}

export function extractReviews(raw: unknown): WeReadRawReview[] {
  const value = raw as { reviews?: unknown; data?: { reviews?: unknown }; list?: unknown };
  if (Array.isArray(value.reviews)) return value.reviews as WeReadRawReview[];
  if (Array.isArray(value.data?.reviews)) return value.data.reviews as WeReadRawReview[];
  if (Array.isArray(value.list)) return value.list as WeReadRawReview[];
  return [];
}

export function extractChaptersFromChapterInfos(raw: unknown): WeReadRawChapter[] {
  const value = raw as {
    data?: unknown;
    updated?: unknown;
    chapters?: unknown;
    list?: unknown;
  };
  const candidates = [
    Array.isArray(value.data) ? (value.data[0] as { updated?: unknown; chapters?: unknown } | undefined)?.updated : undefined,
    Array.isArray(value.data) ? (value.data[0] as { updated?: unknown; chapters?: unknown } | undefined)?.chapters : undefined,
    value.updated,
    value.chapters,
    value.list,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as WeReadRawChapter[];
  }
  return [];
}

function mapBookmark(bookId: string, raw: WeReadRawBookmark, index: number): ReadingAnnotation {
  const id = stringValue(raw.bookmarkId, `bookmark-${bookId}-${index + 1}`);
  const input = {
    id,
    bookId,
    chapterId: raw.chapterUid ? String(raw.chapterUid) : undefined,
    chapterTitle: raw.chapterName,
    type: "highlight" as const,
    text: stringValue(raw.markText ?? raw.abstract, ""),
    locationLabel: raw.range,
    createdAt: timeValue(raw.createTime),
    updatedAt: timeValue(raw.updateTime),
  };
  return { ...input, sourceHash: stableJsonHash(input) };
}

function mapReview(bookId: string, raw: WeReadRawReview, index: number): ReadingAnnotation {
  const review = { ...raw, ...((raw.review && typeof raw.review === "object") ? raw.review : {}) };
  const id = stringValue(review.reviewId, `review-${bookId}-${index + 1}`);
  const input = {
    id,
    bookId,
    chapterId: review.chapterUid ? String(review.chapterUid) : undefined,
    chapterTitle: review.chapterTitle ?? review.chapterName,
    type: "thought" as const,
    text: stringValue(review.htmlContent ?? review.content ?? review.abstract ?? review.text, ""),
    relatedHighlightId: review.bookmarkId,
    createdAt: timeValue(review.createTime),
    updatedAt: timeValue(review.updateTime),
  };
  return { ...input, sourceHash: stableJsonHash(input) };
}

function mapReadingStatus(value: unknown): ReadingStatus {
  if (value === 3 || value === "finished") return "finished";
  if (value === 2 || value === 1 || value === "reading") return "reading";
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
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
