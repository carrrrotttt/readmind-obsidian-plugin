import type { AIStatus, ConnectionState, ReadingBook, ReadingStatus, SyncStatus, SyncedBookRecord } from "./types";

export function connectionStateLabel(state: ConnectionState): string {
  if (state === "connected") return "已连接";
  if (state === "disconnected") return "未连接";
  if (state === "waiting_scan") return "等待扫码";
  if (state === "confirming") return "确认中";
  if (state === "expired") return "登录已失效";
  return "连接失败";
}

export function syncStatusLabel(status: SyncStatus | undefined): string {
  if (status === "synced") return "已同步";
  if (status === "syncing") return "同步中";
  if (status === "update_available") return "有更新";
  if (status === "failed") return "同步失败";
  return "尚未同步";
}

export function aiStatusLabel(status: AIStatus | undefined): string {
  if (status === "analyzing") return "分析中";
  if (status === "analyzed") return "已完成分析";
  if (status === "stale") return "来源笔记有更新，建议重新分析";
  if (status === "failed") return "分析失败";
  return "尚未分析";
}

export function readingStatusLabel(status: ReadingStatus | undefined): string {
  if (status === "reading") return "在读";
  if (status === "finished") return "已读完";
  return "暂无阅读状态";
}

export function annotationTypeLabel(type: string | undefined): string {
  if (type === "thought" || type === "review" || type === "note") return "想法";
  return "划线";
}

export function friendlyChapterTitle(value: string | undefined): string {
  const title = value?.trim();
  if (!title) return "其他笔记";
  if (title.includes("未归类") || title.includes("未分章") || title.toLowerCase().includes("ungrouped")) return "其他笔记";
  return title;
}

export function formatReadingDuration(minutes: number | undefined): string {
  if (minutes === undefined || minutes <= 0 || !Number.isFinite(minutes)) return "暂无阅读时长数据";
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} 分钟`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
}

export function formatUserDateTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function buildBookCardMeta(book: ReadingBook, record?: SyncedBookRecord): string[] {
  return [
    `作者：${book.author ?? "未知"}`,
    `状态：${readingStatusLabel(book.readingStatus)} · 划线 ${book.annotationCount} · 想法 ${book.thoughtCount}`,
    `最近更新：${formatUserDateTime(book.sourceUpdatedAt ?? book.lastReadAt) ?? "未知"}`,
    `同步：${syncStatusLabel(record?.syncStatus)}`,
  ];
}

export function shouldShowAIUserFeatures(): boolean {
  return false;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
