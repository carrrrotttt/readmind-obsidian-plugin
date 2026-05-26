import type { ReadingJourneySummary, ReadingPeriod } from "./types";

export const READING_PERIOD_LABELS: Record<ReadingPeriod, string> = {
  weekly: "本周",
  monthly: "本月",
  annually: "本年",
  overall: "总计",
};

export function mapReadingJourneySummary(period: ReadingPeriod, raw: unknown): ReadingJourneySummary {
  const data = record(raw);
  return {
    period,
    baseTime: numberValue(data.baseTime) ?? 0,
    readDays: numberValue(data.readDays ?? data.readDayCount),
    totalReadSeconds: numberValue(data.totalReadTime),
    naturalDayAverageSeconds: numberValue(data.dayAverageReadTime),
    compareRatio: numberValue(data.compare),
    timeBuckets: mapReadTimes(data.readTimes),
    topBooks: arrayValue(data.readLongest).map((item) => mapTopBook(record(item))).filter((item) => item.title),
    readingStats: mapReadStats(data.readStat),
    categoryPreferences: arrayValue(data.preferCategory).map((item) => mapCategoryPreference(record(item))).filter((item) => item.title),
    preferredTimeLabel: stringValue(data.preferTimeText ?? data.preferTimeLabel),
    preferredTimeSeconds: mapPreferTime(data.preferTime),
    preferredAuthors: arrayValue(data.preferAuthor).map((item) => mapPreferredAuthor(record(item))).filter((item) => item.name),
    preferredPublishers: arrayValue(data.preferPublisher).map((item) => mapPreferredPublisher(record(item))).filter((item) => item.name),
  };
}

export function formatReadDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return "0 分钟";
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} 分钟`;
  if (minutes === 0) return `${hours} 小时`;
  return `${hours} 小时 ${minutes} 分钟`;
}

export function formatCompareRatio(ratio: number | undefined): string {
  if (ratio === undefined || !Number.isFinite(ratio)) return "暂无对比数据";
  const percent = Math.round(Math.abs(ratio) * 100);
  if (percent === 0) return "持平";
  return ratio > 0 ? `增长 ${percent}%` : `下降 ${percent}%`;
}

export function preferTimeHourLabel(index: number): string {
  const hour = (6 + index) % 24;
  return `${hour}:00`;
}

export function formatTrendLabel(period: ReadingPeriod, timestamp: number): string {
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return "未知时间";
  if (period === "annually") return `${date.getMonth() + 1} 月`;
  if (period === "overall") return `${date.getFullYear()} 年`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function mapReadTimes(value: unknown): ReadingJourneySummary["timeBuckets"] {
  return arrayValue(value)
    .map((item) => {
      const row = record(item);
      const timestamp = numberValue(row.time ?? row.timestamp ?? row.date ?? row.baseTime);
      const seconds = numberValue(row.readTime ?? row.readSeconds ?? row.seconds);
      return timestamp === undefined || seconds === undefined ? undefined : { timestamp, seconds };
    })
    .filter((item): item is { timestamp: number; seconds: number } => Boolean(item));
}

function mapTopBook(row: Record<string, unknown>): ReadingJourneySummary["topBooks"][number] {
  const book = record(row.book);
  const tags = arrayValue(row.tags ?? book.tags).map(stringValue).filter((item): item is string => Boolean(item));
  return {
    bookId: stringValue(row.bookId ?? row.bookid ?? book.bookId),
    title: stringValue(row.title ?? book.title ?? row.name) ?? "",
    author: stringValue(row.author ?? book.author),
    cover: stringValue(row.cover ?? row.coverUrl ?? book.cover ?? book.coverUrl),
    readSeconds: numberValue(row.readTime ?? row.readSeconds) ?? 0,
    tags,
    isAudio: Boolean(row.isAudio ?? book.isAudio),
  };
}

function mapReadStats(value: unknown): ReadingJourneySummary["readingStats"] {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const row = record(item);
      return {
        label: stringValue(row.label ?? row.name ?? row.title) ?? "",
        valueText: stringValue(row.valueText ?? row.text ?? row.value) ?? "",
      };
    }).filter((item) => item.label && item.valueText);
  }
  const row = record(value);
  return Object.entries(row)
    .map(([key, value]) => ({
      label: stringValue(record(value).label ?? key) ?? key,
      valueText: stringValue(record(value).valueText ?? record(value).text ?? value) ?? "",
    }))
    .filter((item) => item.label && item.valueText);
}

function mapCategoryPreference(row: Record<string, unknown>): ReadingJourneySummary["categoryPreferences"][number] {
  const seconds = numberValue(row.readingTime);
  return {
    title: stringValue(row.title ?? row.category ?? row.name) ?? "",
    seconds,
    bookCount: numberValue(row.bookCount ?? row.count),
    relativeValue: numberValue(row.relativeValue ?? row.ratio ?? row.percent),
  };
}

function mapPreferTime(value: unknown): number[] | undefined {
  const items = arrayValue(value).map(numberValue).filter((item): item is number => item !== undefined);
  return items.length > 0 ? items : undefined;
}

function mapPreferredAuthor(row: Record<string, unknown>): NonNullable<ReadingJourneySummary["preferredAuthors"]>[number] {
  return {
    name: stringValue(row.name ?? row.author) ?? "",
    count: numberValue(row.count ?? row.bookCount),
    readTimeText: stringValue(row.readTime),
  };
}

function mapPreferredPublisher(row: Record<string, unknown>): NonNullable<ReadingJourneySummary["preferredPublishers"]>[number] {
  return {
    name: stringValue(row.name ?? row.publisher) ?? "",
    count: numberValue(row.count ?? row.bookCount),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}
