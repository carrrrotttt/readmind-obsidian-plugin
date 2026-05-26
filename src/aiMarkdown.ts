import { safeFileName } from "./fileNames";
import { buildAnnotationBlockIds } from "./markdown";
import type { AnalysisRecord, KnowledgeCardDraft, LinkSuggestion, ReadingBookDetails, ReadMindSourceFragment } from "./types";

export const AI_ANALYSIS_BLOCK_START = "<!-- readmind:ai-analysis:start -->";
export const AI_ANALYSIS_BLOCK_END = "<!-- readmind:ai-analysis:end -->";

export function buildAnalysisFileName(book: ReadingBookDetails): string {
  return `${safeFileName(`${book.title} - AI分析`)}.md`;
}

export function buildAnalysisMarkdown(book: ReadingBookDetails, record: AnalysisRecord, existingContent = ""): string {
  const userArea = extractUserArea(existingContent);
  return [
    "---",
    `书名: ${JSON.stringify(book.title)}`,
    `来源笔记: ${JSON.stringify(record.sourceNotePath)}`,
    `分析时间: ${JSON.stringify(formatAnalysisTime(record.analyzedAt))}`,
    `分析模型: ${JSON.stringify(record.model)}`,
    "tags:",
    "  - readmind/ai-analysis",
    "---",
    "",
    `# ${book.title}｜AI 分析`,
    "",
    buildManagedAnalysisBlock(record),
    "",
    userArea,
    "",
  ].join("\n").trimEnd() + "\n";
}

export function mergeAnalysisMarkdown(book: ReadingBookDetails, record: AnalysisRecord, existingContent: string): string {
  if (!existingContent.trim()) return buildAnalysisMarkdown(book, record);
  return buildAnalysisMarkdown(book, record, existingContent);
}

export function buildKnowledgeCardMarkdown(draft: KnowledgeCardDraft, sourceBook: ReadingBookDetails): string {
  return [
    "---",
    `来源: ${JSON.stringify("ReadMind")}`,
    `创建时间: ${JSON.stringify(new Date().toISOString().slice(0, 10))}`,
    "tags:",
    "  - readmind/knowledge",
    "---",
    "",
    `# ${draft.title}`,
    "",
    "## 概念说明",
    "",
    draft.definition,
    "",
    "## 来源摘录",
    "",
    ...draft.sourceAnnotationIds.map((id) => `- ${legacySourceLink(sourceBook, id)}`),
    "",
    "## 我的补充",
    "",
    "<!-- 此区域属于用户，插件不会自动覆盖。 -->",
    "",
    "## 已确认关联",
    "",
    "<!-- readmind:links:start -->",
    "<!-- 插件只在用户确认后管理此区域 -->",
    "<!-- readmind:links:end -->",
    "",
  ].join("\n");
}

export function buildSuggestionsMarkdown(suggestions: LinkSuggestion[], titleDate: string): string {
  return [
    `# 关联建议 - ${titleDate}`,
    "",
    ...suggestions.flatMap((suggestion, index) => [
      `## 建议 ${index + 1}：${suggestion.leftTarget.concept ?? "左侧"} -> ${suggestion.rightTarget.concept ?? "右侧"}`,
      "",
      `- ID：${suggestion.id}`,
      `- 状态：${suggestion.status}`,
      `- 关系类型：${suggestion.relationType}`,
      `- 置信度：${suggestion.confidence}`,
      `- 来源 A：${suggestion.leftTarget.notePath} (${suggestion.leftTarget.annotationIds.join(", ")})`,
      `- 来源 B：${suggestion.rightTarget.notePath} (${suggestion.rightTarget.annotationIds.join(", ")})`,
      `- 推荐理由：${suggestion.rationale}`,
      "",
    ]),
  ].join("\n");
}

export function createKnowledgeCardDraft(
  title: string,
  definition: string,
  sourceAnnotationIds: string[],
  relatedThemeNames: string[],
): KnowledgeCardDraft {
  return {
    title,
    definition,
    sourceAnnotationIds,
    relatedThemeNames,
  };
}

export function sourceFragmentLink(fragment: ReadMindSourceFragment): string {
  return `[[${fragment.sourceNotePath}#^${fragment.blockId}|查看来源摘录]]`;
}

function buildManagedAnalysisBlock(record: AnalysisRecord): string {
  const fragments = new Map(record.sourceFragments.map((fragment) => [fragment.fragmentId, fragment]));
  return [
    AI_ANALYSIS_BLOCK_START,
    `<!-- readmind:book-id:${record.bookId} -->`,
    `<!-- readmind:input-hash:${record.inputContentHash} -->`,
    `<!-- readmind:analyzed-at:${record.analyzedAt} -->`,
    "",
    `> 基于《${record.sourceFragments[0]?.bookTitle ?? record.bookId}》的 ${highlightCount(record.sourceFragments)} 条划线与 ${thoughtCount(record.sourceFragments)} 条想法生成  `,
    `> 分析时间：${formatAnalysisTime(record.analyzedAt)} · 分析模型：${record.model}`,
    "",
    "## 核心问题",
    "",
    ...list(record.result.centralQuestions),
    "",
    "## 观点摘要",
    "",
    record.result.summary,
    "",
    "## 主题洞察",
    "",
    ...record.result.themes.flatMap((theme) => [
      `### ${theme.name}`,
      "",
      theme.rationale,
      "",
      `依据：${theme.sourceFragmentIds.map((id) => evidenceLink(fragments, id)).filter(Boolean).join("、")}`,
      "",
    ]),
    "## 概念候选",
    "",
    ...record.result.concepts.flatMap((concept) => [
      `### ${concept.name}`,
      "",
      `- 置信度：${confidenceLabel(concept.confidence)}`,
      `- 概念说明：${concept.explanation}`,
      `- 依据：${concept.sourceFragmentIds.map((id) => evidenceLink(fragments, id)).filter(Boolean).join("、")}`,
      "",
    ]),
    "## 值得继续思考的问题",
    "",
    ...list(record.result.reflectionQuestions),
    "",
    AI_ANALYSIS_BLOCK_END,
  ].join("\n");
}

function highlightCount(fragments: ReadMindSourceFragment[]): number {
  return fragments.filter((fragment) => fragment.type === "highlight").length;
}

function thoughtCount(fragments: ReadMindSourceFragment[]): number {
  return fragments.filter((fragment) => fragment.type === "thought" || fragment.type === "review").length;
}

function formatAnalysisTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function evidenceLink(fragments: Map<string, ReadMindSourceFragment>, fragmentId: string): string {
  const fragment = fragments.get(fragmentId);
  return fragment ? sourceFragmentLink(fragment) : "";
}

function extractManagedBlock(content: string): string | null {
  const start = content.indexOf(AI_ANALYSIS_BLOCK_START);
  const end = content.indexOf(AI_ANALYSIS_BLOCK_END);
  if (start < 0 || end < start) return null;
  return content.slice(start, end + AI_ANALYSIS_BLOCK_END.length);
}

function extractUserArea(content: string): string {
  const managed = extractManagedBlock(content);
  if (!managed) {
    return [
      "## 我的补充",
      "",
      "<!-- 这里由你自由书写，ReadMind 后续重新分析不会覆盖。 -->",
    ].join("\n");
  }
  const after = content.slice(content.indexOf(managed) + managed.length).trim();
  return after || [
    "## 我的补充",
    "",
    "<!-- 这里由你自由书写，ReadMind 后续重新分析不会覆盖。 -->",
  ].join("\n");
}

function legacySourceLink(book: ReadingBookDetails, annotationId: string): string {
  const blockIds = buildAnnotationBlockIds(book.annotations);
  const blockId = blockIds[annotationId] ?? annotationId;
  const author = book.author ? ` - ${book.author}` : "";
  return `[[${book.title}${author}#^${blockId}]]`;
}

function list(values: string[]): string[] {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ["- 暂无"];
}

function confidenceLabel(value: string): string {
  if (value === "high") return "高";
  if (value === "low") return "低";
  return "中";
}
