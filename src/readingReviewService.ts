import { App, normalizePath, TFile } from "obsidian";
import { safeFileName } from "./fileNames";
import { formatCompareRatio, formatReadDuration, READING_PERIOD_LABELS } from "./readingJourneyService";
import { relationTypeLabel } from "./relationService";
import type {
  ConfirmedRelation,
  KnowledgeCardRecord,
  ReadMindPluginData,
  ReadingJourneySummary,
  ReadingReviewEvidence,
  ReadingReviewInput,
  ReadingReviewPeriod,
  ReadingReviewResult,
  ReadMindSourceFragment,
} from "./types";
import { ensureFolder } from "./vaultUtils";

export const READING_REVIEW_BLOCK_START = "<!-- readmind:reading-review:start -->";
export const READING_REVIEW_BLOCK_END = "<!-- readmind:reading-review:end -->";

export interface ReadingReviewOptions {
  selectedBookIds: string[];
  includePeriodEvidence: boolean;
  includeUnconfirmedEvidence: boolean;
  includePeriodCards: boolean;
  includePeriodRelations: boolean;
  includeCumulativeKnowledge: boolean;
}

export interface ReadingReviewCandidate {
  bookId: string;
  title: string;
  author?: string;
  readSeconds?: number;
  confirmedEvidenceCount: number;
  unconfirmedEvidenceCount: number;
  hasKnowledgeCards: boolean;
  hasConfirmedRelations: boolean;
  selectable: boolean;
  selected: boolean;
}

export interface ReadingReviewPreview {
  candidates: ReadingReviewCandidate[];
  counts: {
    selectedBooks: number;
    periodEvidence: number;
    unconfirmedEvidence: number;
    periodCards: number;
    periodRelations: number;
    cumulativeCards: number;
    cumulativeRelations: number;
  };
  input: ReadingReviewInput;
}

export interface ReadingReviewRecord {
  period: ReadingReviewPeriod;
  periodKey: string;
  filePath: string;
  generatedAt: string;
  model: string;
}

export function defaultReadingReviewOptions(data: ReadMindPluginData, summary: ReadingJourneySummary): ReadingReviewOptions {
  const range = periodRange(summary.period as ReadingReviewPeriod, summary.baseTime);
  const selectedBookIds = Object.entries(data.syncIndex)
    .filter(([, record]) => (record.sourceFragments ?? []).some((fragment) => isPeriodConfirmed(fragment, range)))
    .map(([bookId]) => bookId);
  return {
    selectedBookIds,
    includePeriodEvidence: true,
    includeUnconfirmedEvidence: false,
    includePeriodCards: true,
    includePeriodRelations: true,
    includeCumulativeKnowledge: false,
  };
}

export function prepareReadingReview(data: ReadMindPluginData, summary: ReadingJourneySummary): { options: ReadingReviewOptions; preview: ReadingReviewPreview } {
  const options = defaultReadingReviewOptions(data, summary);
  return {
    options,
    preview: buildReadingReviewPreview(data, summary, options),
  };
}

export function buildReadingReviewPreview(data: ReadMindPluginData, summary: ReadingJourneySummary, options: ReadingReviewOptions): ReadingReviewPreview {
  const period = summary.period as ReadingReviewPeriod;
  const range = periodRange(period, summary.baseTime);
  const topBookById = new Map(summary.topBooks.filter((book) => book.bookId).map((book) => [book.bookId as string, book]));
  const candidateIds = new Set([
    ...Object.keys(data.syncIndex),
    ...summary.topBooks.map((book) => book.bookId).filter((id): id is string => Boolean(id)),
  ]);
  const candidates: ReadingReviewCandidate[] = [...candidateIds].map((bookId) => {
    const record = data.syncIndex[bookId];
    const fragments = record?.sourceFragments ?? [];
    const topBook = topBookById.get(bookId);
    const title = fragments[0]?.bookTitle ?? topBook?.title ?? bookId;
    const author = fragments[0]?.author ?? topBook?.author;
    const confirmedEvidenceCount = fragments.filter((fragment) => isPeriodConfirmed(fragment, range)).length;
    const unconfirmedEvidenceCount = fragments.filter((fragment) => !fragment.createdAt).length;
    const relatedCardIds = Object.values(data.cardIndex).filter((card) => card.evidence.some((item) => item.sourceBookId === bookId)).map((card) => card.id);
    return {
      bookId,
      title,
      author,
      readSeconds: topBook?.readSeconds,
      confirmedEvidenceCount,
      unconfirmedEvidenceCount,
      hasKnowledgeCards: relatedCardIds.length > 0,
      hasConfirmedRelations: Object.values(data.confirmedRelations).some((relation) => relatedCardIds.includes(relation.leftCardId) || relatedCardIds.includes(relation.rightCardId)),
      selectable: confirmedEvidenceCount > 0,
      selected: options.selectedBookIds.includes(bookId),
    };
  }).sort((left, right) => right.confirmedEvidenceCount - left.confirmedEvidenceCount || left.title.localeCompare(right.title));

  const selected = new Set(options.selectedBookIds);
  const selectedBooks = candidates.filter((book) => selected.has(book.bookId));
  const evidences = selectedBooks.flatMap((book) => evidenceForBook(data.syncIndex[book.bookId]?.sourceFragments ?? [], range, {
    includePeriodEvidence: options.includePeriodEvidence,
    includeUnconfirmedEvidence: options.includeUnconfirmedEvidence,
  }));
  const periodEvidenceIds = new Set(evidences.map((item) => item.evidenceId));
  const periodCards = options.includePeriodCards ? Object.values(data.cardIndex).filter((card) => isIsoInRange(card.createdAt, range)) : [];
  const periodRelations = options.includePeriodRelations ? Object.values(data.confirmedRelations).filter((relation) => isIsoInRange(relation.acceptedAt, range)) : [];
  const cumulativeCards = options.includeCumulativeKnowledge ? Object.values(data.cardIndex) : [];
  const cumulativeRelations = options.includeCumulativeKnowledge ? Object.values(data.confirmedRelations) : [];
  const cards = [
    ...periodCards.map((card) => reviewCardInput(card, "period_confirmed" as const)),
    ...cumulativeCards.filter((card) => !periodCards.some((periodCard) => periodCard.id === card.id)).map((card) => reviewCardInput(card, "cumulative_only" as const)),
  ];
  const relations = [
    ...periodRelations.map((relation) => reviewRelationInput(relation, "period_confirmed" as const)),
    ...cumulativeRelations.filter((relation) => !periodRelations.some((periodRelation) => periodRelation.id === relation.id)).map((relation) => reviewRelationInput(relation, "cumulative_only" as const)),
  ];
  const input: ReadingReviewInput = {
    period,
    periodLabel: periodLabel(period, summary.baseTime),
    statistics: {
      readDays: summary.readDays,
      totalReadSeconds: summary.totalReadSeconds,
      naturalDayAverageSeconds: summary.naturalDayAverageSeconds,
      compareRatio: summary.compareRatio,
      selectedBooks: selectedBooks.map((book) => ({ title: book.title, author: book.author, readSeconds: book.readSeconds })),
    },
    books: selectedBooks.map((book) => ({
      title: book.title,
      author: book.author,
      evidences: evidences.filter((evidence) => evidence.sourceBookTitle === book.title),
    })).filter((book) => book.evidences.length > 0),
    knowledgeCards: cards,
    confirmedRelations: relations,
  };
  return {
    candidates,
    counts: {
      selectedBooks: selectedBooks.length,
      periodEvidence: evidences.filter((item) => item.timeScope === "period_confirmed").length,
      unconfirmedEvidence: evidences.filter((item) => item.timeScope === "time_unconfirmed").length,
      periodCards: periodCards.length,
      periodRelations: periodRelations.length,
      cumulativeCards: cumulativeCards.length,
      cumulativeRelations: cumulativeRelations.length,
    },
    input: filterInputByKnownIds(input, periodEvidenceIds),
  };
}

export function validateReadingReviewResultForInput(result: ReadingReviewResult, input: ReadingReviewInput): ReadingReviewResult {
  const books = new Set(input.books.map((book) => book.title));
  const evidences = new Set(input.books.flatMap((book) => book.evidences.map((evidence) => evidence.evidenceId)));
  const cards = new Set(input.knowledgeCards.map((card) => card.cardId));
  const relations = new Set(input.confirmedRelations.map((relation) => relation.relationId));
  return {
    overview: result.overview,
    focusBooks: result.focusBooks
      .map((book) => ({ ...book, evidenceIds: book.evidenceIds.filter((id) => evidences.has(id)) }))
      .filter((book) => books.has(book.bookTitle) && book.evidenceIds.length > 0),
    themes: result.themes
      .map((theme) => ({
        ...theme,
        evidenceIds: theme.evidenceIds.filter((id) => evidences.has(id)),
        relatedCardIds: (theme.relatedCardIds ?? []).filter((id) => cards.has(id)),
      }))
      .filter((theme) => theme.evidenceIds.length > 0),
    confirmedKnowledgeConnections: result.confirmedKnowledgeConnections.filter((item) => relations.has(item.relationId)),
    nextQuestions: result.nextQuestions,
  };
}

export async function writeReadingReviewFile(
  app: App,
  dir: string,
  summary: ReadingJourneySummary,
  input: ReadingReviewInput,
  result: ReadingReviewResult,
  data: ReadMindPluginData,
  model: string,
): Promise<ReadingReviewRecord> {
  const period = summary.period as ReadingReviewPeriod;
  const periodKeyValue = periodKey(period, summary.baseTime);
  const filePath = normalizePath(`${dir}/${safeFileName(`${periodKeyValue} - 阅读回顾`)}.md`);
  const generatedAt = new Date().toISOString();
  const folder = filePath.split("/").slice(0, -1).join("/");
  if (folder) await ensureFolder(app, folder);
  const existing = app.vault.getAbstractFileByPath(filePath);
  const existingContent = existing instanceof TFile ? await app.vault.read(existing) : "";
  const content = buildReadingReviewMarkdown(summary, input, result, data, model, generatedAt, existingContent);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content);
  } else {
    await app.vault.create(filePath, content);
  }
  return { period, periodKey: periodKeyValue, filePath, generatedAt, model };
}

export function buildReadingReviewMarkdown(
  summary: ReadingJourneySummary,
  input: ReadingReviewInput,
  result: ReadingReviewResult,
  data: ReadMindPluginData,
  model: string,
  generatedAt: string,
  existingContent = "",
): string {
  const evidenceById = new Map(input.books.flatMap((book) => book.evidences.map((evidence) => [evidence.evidenceId, evidence])));
  const cardById = new Map(Object.values(data.cardIndex).map((card) => [card.id, card]));
  const relationById = new Map(Object.values(data.confirmedRelations).map((relation) => [relation.id, relation]));
  return [
    "---",
    `标题: ${JSON.stringify(`${input.periodLabel}阅读回顾`)}`,
    `生成时间: ${JSON.stringify(generatedAt.slice(0, 10))}`,
    `分析模型: ${JSON.stringify(model)}`,
    "tags:",
    "  - readmind/reading-review",
    "---",
    "",
    `# ${input.periodLabel}阅读回顾`,
    "",
    READING_REVIEW_BLOCK_START,
    "",
    "## 阅读概览",
    "",
    `- 阅读天数：${summary.readDays === undefined ? "暂无数据" : `${summary.readDays} 天`}`,
    `- 总阅读时长：${summary.totalReadSeconds === undefined ? "暂无数据" : formatReadDuration(summary.totalReadSeconds)}`,
    `- 自然日均：${summary.naturalDayAverageSeconds === undefined ? "暂无数据" : formatReadDuration(summary.naturalDayAverageSeconds)}`,
    `- 较上周期：${formatCompareRatio(summary.compareRatio)}`,
    "",
    "## 本阶段重点阅读",
    "",
    ...(result.focusBooks.length ? result.focusBooks.flatMap((book) => [
      `### 《${book.bookTitle}》`,
      "",
      book.observation,
      "",
      "**阅读依据**",
      ...book.evidenceIds.map((id) => `- ${evidenceLink(evidenceById.get(id))}`),
      "",
    ]) : ["暂无可写入的重点阅读观察。", ""]),
    "## 本阶段关注主题",
    "",
    ...(result.themes.length ? result.themes.flatMap((theme) => [
      `### ${theme.title}`,
      "",
      theme.interpretation,
      "",
      "**依据**",
      ...theme.evidenceIds.map((id) => `- ${evidenceLink(evidenceById.get(id))}`),
      ...(theme.relatedCardIds ?? []).map((id) => `- ${cardLink(cardById.get(id))}`),
      "",
    ]) : ["暂无可写入的关注主题。", ""]),
    "## 本期形成的知识联系",
    "",
    ...periodRelationLines(input, result, relationById, cardById),
    "",
    ...(input.knowledgeCards.some((card) => card.timeScope === "cumulative_only") || input.confirmedRelations.some((relation) => relation.timeScope === "cumulative_only")
      ? [
        "## 当前累计知识沉淀",
        "",
        "> 以下内容来自当前 ReadMind 中已有的累计整理结果；不代表全部形成于本周期。",
        "",
        ...input.knowledgeCards.filter((card) => card.timeScope === "cumulative_only").map((card) => `- ${cardLink(cardById.get(card.cardId))}`),
        ...input.confirmedRelations.filter((relation) => relation.timeScope === "cumulative_only").map((relation) => `- ${relationLine(relationById.get(relation.relationId), cardById)}`),
        "",
      ]
      : []),
    ...(input.books.some((book) => book.evidences.some((evidence) => evidence.timeScope === "time_unconfirmed"))
      ? ["> 本回顾包含少量时间未确认的补充背景证据；这些内容不代表本周期新增。", ""]
      : []),
    "## 接下来值得继续思考的问题",
    "",
    ...(result.nextQuestions.length ? result.nextQuestions.map((question) => `- ${question}`) : ["- 暂无"]),
    "",
    READING_REVIEW_BLOCK_END,
    "",
    extractReviewUserArea(existingContent),
    "",
  ].join("\n").trimEnd() + "\n";
}

export function periodRange(period: ReadingReviewPeriod, baseTime: number): { start: Date; end: Date } {
  const base = new Date((baseTime || Math.floor(Date.now() / 1000)) * 1000);
  if (period === "annually") return { start: new Date(base.getFullYear(), 0, 1), end: new Date(base.getFullYear() + 1, 0, 1) };
  if (period === "monthly") return { start: new Date(base.getFullYear(), base.getMonth(), 1), end: new Date(base.getFullYear(), base.getMonth() + 1, 1) };
  const day = base.getDay() || 7;
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() - day + 1);
  return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) };
}

export function periodKey(period: ReadingReviewPeriod, baseTime: number): string {
  const base = new Date((baseTime || Math.floor(Date.now() / 1000)) * 1000);
  if (period === "annually") return `${base.getFullYear()}`;
  if (period === "monthly") return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
  return `${base.getFullYear()}-W${String(weekOfYear(base)).padStart(2, "0")}`;
}

export function periodLabel(period: ReadingReviewPeriod, baseTime: number): string {
  const base = new Date((baseTime || Math.floor(Date.now() / 1000)) * 1000);
  if (period === "annually") return `${base.getFullYear()} 年`;
  if (period === "monthly") return `${base.getFullYear()} 年 ${base.getMonth() + 1} 月`;
  return `${base.getFullYear()} 年第 ${weekOfYear(base)} 周`;
}

function evidenceForBook(fragments: ReadMindSourceFragment[], range: { start: Date; end: Date }, options: { includePeriodEvidence: boolean; includeUnconfirmedEvidence: boolean }): ReadingReviewEvidence[] {
  return fragments
    .filter((fragment) => (options.includePeriodEvidence && isPeriodConfirmed(fragment, range)) || (options.includeUnconfirmedEvidence && !hasValidCreatedAt(fragment.createdAt)))
    .map((fragment) => ({
      evidenceId: reviewEvidenceId(fragment),
      fragmentId: fragment.fragmentId,
      blockId: fragment.blockId,
      sourceNotePath: fragment.sourceNotePath,
      sourceBookTitle: fragment.bookTitle,
      sourceBookAuthor: fragment.author,
      fragmentType: fragment.type,
      chapterTitle: fragment.chapterTitle,
      text: fragment.text,
      createdAt: fragment.createdAt,
      timeScope: hasValidCreatedAt(fragment.createdAt) ? "period_confirmed" : "time_unconfirmed",
    }));
}

function reviewEvidenceId(fragment: ReadMindSourceFragment): string {
  return `review-evidence:${fragment.fragmentId}:${fragment.blockId}`;
}

function isPeriodConfirmed(fragment: ReadMindSourceFragment, range: { start: Date; end: Date }): boolean {
  return Boolean(fragment.createdAt && isIsoInRange(fragment.createdAt, range));
}

function isIsoInRange(value: string | undefined, range: { start: Date; end: Date }): boolean {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= range.start && date < range.end;
}

function hasValidCreatedAt(value: string | undefined): boolean {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function reviewCardInput(card: KnowledgeCardRecord, timeScope: "period_confirmed" | "cumulative_only"): ReadingReviewInput["knowledgeCards"][number] {
  return {
    cardId: card.id,
    title: card.title,
    explanation: card.evidence[0]?.text ?? card.title,
    evidenceIds: card.evidence.map((item) => `card-evidence:${item.fragmentId}:${item.blockId}`),
    timeScope,
  };
}

function reviewRelationInput(relation: ConfirmedRelation, timeScope: "period_confirmed" | "cumulative_only"): ReadingReviewInput["confirmedRelations"][number] {
  return {
    relationId: relation.id,
    title: relation.title,
    relationType: relationTypeLabel(relation.relationType),
    explanation: relation.explanation,
    leftCardId: relation.leftCardId,
    rightCardId: relation.rightCardId,
    timeScope,
  };
}

function filterInputByKnownIds(input: ReadingReviewInput, _periodEvidenceIds: Set<string>): ReadingReviewInput {
  return input;
}

function evidenceLink(evidence: ReadingReviewEvidence | undefined): string {
  if (!evidence) return "来源已不可用";
  const label = evidence.fragmentType === "thought" ? "查看想法" : evidence.fragmentType === "review" ? "查看评论" : "查看划线";
  return `[[${evidence.sourceNotePath}#^${evidence.blockId}|${label}]]`;
}

function cardLink(card: KnowledgeCardRecord | undefined): string {
  return card ? `[[${card.filePath}|${card.title}]]` : "知识卡片已不可用";
}

function periodRelationLines(
  input: ReadingReviewInput,
  result: ReadingReviewResult,
  relationById: Map<string, ConfirmedRelation>,
  cardById: Map<string, KnowledgeCardRecord>,
): string[] {
  const periodRelations = new Set(input.confirmedRelations.filter((relation) => relation.timeScope === "period_confirmed").map((relation) => relation.relationId));
  const lines = result.confirmedKnowledgeConnections
    .filter((item) => periodRelations.has(item.relationId))
    .map((item) => `- ${relationLine(relationById.get(item.relationId), cardById)}：${item.reflection}`);
  return lines.length ? lines : ["- 暂无本期确认关系。"];
}

function relationLine(relation: ConfirmedRelation | undefined, cardById: Map<string, KnowledgeCardRecord>): string {
  if (!relation) return "关系已不可用";
  const left = cardById.get(relation.leftCardId);
  const right = cardById.get(relation.rightCardId);
  return `${cardLink(left)} ↔ ${cardLink(right)}：${relation.title}`;
}

function extractReviewUserArea(content: string): string {
  const start = content.indexOf(READING_REVIEW_BLOCK_START);
  const end = content.indexOf(READING_REVIEW_BLOCK_END);
  if (start >= 0 && end > start) {
    const after = content.slice(end + READING_REVIEW_BLOCK_END.length).trim();
    if (after) return after;
  }
  return [
    "## 我的回顾",
    "",
    "<!-- 用户可继续补充；重新生成时插件不得覆盖本区域 -->",
  ].join("\n");
}

function weekOfYear(date: Date): number {
  const target = new Date(date.valueOf());
  const day = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - day + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000);
}

export function hasReviewEvidence(input: ReadingReviewInput): boolean {
  return input.books.some((book) => book.evidences.length > 0)
    || input.knowledgeCards.length > 0
    || input.confirmedRelations.length > 0;
}

export function reviewIndexKey(period: ReadingReviewPeriod, baseTime: number): string {
  return `${period}:${periodKey(period, baseTime)}`;
}
