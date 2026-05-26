import type { DailyEvent, DailyNotesSettings } from "./types";

export function buildDailyBlock(events: DailyEvent[], date: string, settings: DailyNotesSettings): string {
  const todayEvents = events.filter((event) => event.at.slice(0, 10) === date);
  const sections: string[] = [];
  sections.push(`## ReadMind Daily`);
  sections.push("");
  sections.push(...renderGroup("今日同步", todayEvents.filter((event) => event.type === "sync"), settings.includeSyncedAnnotations));
  sections.push(...renderGroup("今日 AI 分析", todayEvents.filter((event) => event.type === "analysis"), settings.includeAIAnalysis));
  sections.push(...renderGroup("今日知识卡片", todayEvents.filter((event) => event.type === "card"), settings.includeCards));
  sections.push(...renderGroup("今日确认关联", todayEvents.filter((event) => event.type === "link"), settings.includeAcceptedLinks));
  return sections.join("\n");
}

export function formatDate(date: Date, pattern: string): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return pattern.replace(/YYYY/g, year).replace(/MM/g, month).replace(/DD/g, day);
}

function renderGroup(title: string, events: DailyEvent[], enabled: boolean): string[] {
  if (!enabled) return [];
  const lines = [`### ${title}`, ""];
  if (events.length === 0) {
    lines.push("- 暂无", "");
    return lines;
  }
  for (const event of events) {
    const link = event.filePath ? `（${event.filePath}）` : "";
    const count = event.count !== undefined ? ` · ${event.count} 条` : "";
    lines.push(`- ${event.title}${count}${link}`);
  }
  lines.push("");
  return lines;
}
