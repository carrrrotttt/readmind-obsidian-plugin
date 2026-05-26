import { LEGACY_SOURCE_BLOCK_END, LEGACY_SOURCE_BLOCK_START, SOURCE_BLOCK_END, SOURCE_BLOCK_START } from "./constants";
import { bookSourceFileName } from "./fileNames";
import { formatUserDateTime, friendlyChapterTitle, readingStatusLabel } from "./displayText";
import { stableJsonHash } from "./hash";
import { buildSourceFragments } from "./sourceFragments";
import {
  groupSourceFragmentsByChapter,
  highlightsInGroup,
  thoughtsForHighlight,
  unlinkedThoughtsInGroup,
} from "./sourceOrganization";
import type { FrontmatterSettings, ReadingAnnotation, ReadingBookDetails, ReadMindSourceFragment, SyncedBookRecord } from "./types";

export interface SourceNoteBuildResult {
  fileName: string;
  content: string;
  managedBlock: string;
  annotationBlockIds: Record<string, string>;
  sourceFragments: ReadMindSourceFragment[];
}

export function buildSourceNote(
  book: ReadingBookDetails,
  record: SyncedBookRecord,
  frontmatterSettings?: FrontmatterSettings,
): SourceNoteBuildResult {
  const annotationBlockIds = buildAnnotationBlockIds(book.annotations);
  const sourceFragments = buildSourceFragments(book, record.sourceFilePath, annotationBlockIds);
  const managedBlock = buildManagedBlock(book, record, sourceFragments);
  const content = [
    buildFrontmatter(book, record, frontmatterSettings),
    "",
    `# ${book.title}`,
    "",
    book.author ? `> ${book.author}` : undefined,
    "",
    managedBlock,
    "",
    "## 我的补充",
    "",
    "<!-- 这里由你自由书写，ReadMind 后续同步不会覆盖。 -->",
    "",
  ].filter((line): line is string => line !== undefined).join("\n");

  return {
    fileName: bookSourceFileName(book.title, book.author),
    content,
    managedBlock,
    annotationBlockIds,
    sourceFragments,
  };
}

export function mergeManagedSourceBlock(existingContent: string, nextContent: string): string {
  const nextFrontmatter = mergeFrontmatterTags(extractFrontmatter(existingContent), extractFrontmatter(nextContent));
  const nextManagedBlock = extractManagedBlock(nextContent);
  if (!nextManagedBlock) {
    return nextContent;
  }

  let body = stripFrontmatter(existingContent);
  const existingManagedBlock = extractManagedBlock(body);
  if (existingManagedBlock) {
    body = body.replace(existingManagedBlock, nextManagedBlock);
  } else {
    body = `${body.trimEnd()}\n\n${nextManagedBlock}\n`;
  }

  return [nextFrontmatter, body.trimStart()].filter(Boolean).join("\n\n").trimEnd() + "\n";
}

export function buildAnnotationBlockIds(annotations: ReadingAnnotation[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const annotation of annotations) {
    const prefix = annotation.type === "thought" ? "rm-t" : "rm-h";
    const stableKey = annotation.sourceHash || annotation.id;
    result[annotation.id] = `${prefix}-${stableJsonHash({ type: annotation.type, id: stableKey }).slice(0, 10)}`;
  }
  return result;
}

function buildFrontmatter(book: ReadingBookDetails, record: SyncedBookRecord, settings?: FrontmatterSettings): string {
  if (settings && !settings.enabled) return "";
  const lines = [
    "---",
    shouldInclude(settings, "includeTitle") ? `书名: ${JSON.stringify(book.title)}` : undefined,
    shouldInclude(settings, "includeAuthor") ? `作者: ${JSON.stringify(book.author ?? "")}` : undefined,
    shouldInclude(settings, "includeSource") ? "来源: 微信读书" : undefined,
    `同步时间: ${JSON.stringify(formatUserDateTime(record.lastSyncedAt) ?? record.lastSyncedAt)}`,
    shouldInclude(settings, "includeTags") ? "tags:" : undefined,
    shouldInclude(settings, "includeTags") ? "  - readmind/source" : undefined,
    "---",
  ];
  return lines.filter((line): line is string => line !== undefined).join("\n");
}

function shouldInclude(settings: FrontmatterSettings | undefined, key: keyof FrontmatterSettings): boolean {
  if (!settings) return true;
  if (key === "includeBookId" || key === "includeSyncStatus" || key === "includeAIStatus") return false;
  return Boolean(settings[key]);
}

function buildManagedBlock(book: ReadingBookDetails, record: SyncedBookRecord, fragments: ReadMindSourceFragment[]): string {
  return [
    SOURCE_BLOCK_START,
    "## 阅读信息",
    "",
    "- 来源：微信读书",
    `- 阅读状态：${readingStatusLabel(book.readingStatus)}`,
    book.readingProgress === undefined ? undefined : `- 阅读进度：${book.readingProgress}%`,
    `- 最近同步：${formatUserDateTime(record.lastSyncedAt) ?? record.lastSyncedAt}`,
    "",
    "## 我的笔记",
    "",
    ...renderChapterGroups(fragments),
    SOURCE_BLOCK_END,
  ].filter((line): line is string => line !== undefined).join("\n");
}

function renderChapterGroups(fragments: ReadMindSourceFragment[]): string[] {
  const groups = groupSourceFragmentsByChapter(fragments);
  if (groups.length === 0) return ["暂无笔记。", ""];

  const lines: string[] = [];
  for (const group of groups) {
    lines.push(`### ${group.chapterTitle}`, "");
    const highlights = highlightsInGroup(group);
    const unlinkedThoughts = unlinkedThoughtsInGroup(group);

    for (const highlight of highlights) {
      lines.push(`> ${highlight.text.replace(/\n/g, "\n> ")}`, "");
      lines.push(`^${highlight.blockId}`, "");
      const attachedThoughts = thoughtsForHighlight(group, highlight);
      for (const thought of attachedThoughts) renderThought(lines, thought);
    }

    if (unlinkedThoughts.length > 0) {
      lines.push("#### 其他想法", "");
      for (const thought of unlinkedThoughts) renderThought(lines, thought);
    }
  }
  return lines;
}

function renderThought(lines: string[], thought: ReadMindSourceFragment): void {
  lines.push("> [!note] 我的想法");
  lines.push(`> ${thought.text.replace(/\n/g, "\n> ")}`, "");
  lines.push(`^${thought.blockId}`, "");
}

function extractManagedBlock(content: string): string | null {
  return extractBlock(content, SOURCE_BLOCK_START, SOURCE_BLOCK_END)
    ?? extractBlock(content, LEGACY_SOURCE_BLOCK_START, LEGACY_SOURCE_BLOCK_END);
}

function extractBlock(content: string, startMarker: string, endMarker: string): string | null {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start < 0 || end < start) return null;
  return content.slice(start, end + endMarker.length);
}

function extractFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) return "";
  const end = content.indexOf("\n---", 4);
  if (end < 0) return "";
  return content.slice(0, end + 4);
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---", 4);
  if (end < 0) return content;
  return content.slice(end + 4).trimStart();
}

function mergeFrontmatterTags(existingFrontmatter: string, nextFrontmatter: string): string {
  if (!nextFrontmatter) return "";
  const tags = new Set([...extractYamlList(existingFrontmatter, "tags"), ...extractYamlList(nextFrontmatter, "tags"), "readmind/source"]);
  const lines = nextFrontmatter.split("\n");
  const output: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "tags:") {
      output.push(line);
      for (const tag of tags) output.push(`  - ${tag}`);
      while (lines[index + 1]?.startsWith("  - ")) index += 1;
    } else {
      output.push(line);
    }
  }
  return output.join("\n");
}

function extractYamlList(frontmatter: string, key: string): string[] {
  if (!frontmatter) return [];
  const lines = frontmatter.split("\n");
  const result: string[] = [];
  const start = lines.findIndex((line) => line === `${key}:`);
  if (start < 0) return result;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith("  - ")) break;
    const value = line.slice(4).trim();
    if (value) result.push(value);
  }
  return result;
}
