import { App, normalizePath, TFile } from "obsidian";
import { buildSuggestionsMarkdown } from "./aiMarkdown";
import { safeFileName } from "./fileNames";
import { stableJsonHash } from "./hash";
import { replaceManagedBlock } from "./managedBlockUtils";
import type {
  ConfirmedRelation,
  KnowledgeCardRecord,
  KnowledgeEvidence,
  LinkSuggestion,
} from "./types";
import { evidenceId, relationTypeLabel } from "./relationService";
import { ensureFolder, writeTextFile } from "./vaultUtils";

const LINKS_START = "<!-- readmind:links:start -->";
const LINKS_END = "<!-- readmind:links:end -->";
const KNOWLEDGE_START = "<!-- readmind:knowledge:start -->";
const KNOWLEDGE_END = "<!-- readmind:knowledge:end -->";

export interface KnowledgeCardInput {
  title: string;
  explanation: string;
  evidence: KnowledgeEvidence[];
  sourceAnalysisPath: string;
}

export class KnowledgeService {
  constructor(
    private readonly app: App,
    private readonly cardsDir: string,
    private readonly suggestionsDir: string,
  ) {}

  findExistingCard(cards: Record<string, KnowledgeCardRecord>, title: string): KnowledgeCardRecord | undefined {
    const normalized = normalizeKnowledgeTitle(title);
    return Object.values(cards).find((card) => (card.normalizedTitle || normalizeKnowledgeTitle(card.title)) === normalized);
  }

  async createCard(input: KnowledgeCardInput): Promise<KnowledgeCardRecord> {
    const now = new Date().toISOString();
    const normalizedTitle = normalizeKnowledgeTitle(input.title);
    const filePath = normalizePath(`${this.cardsDir}/${safeFileName(input.title)}.md`);
    await ensureFolder(this.app, this.cardsDir);
    const evidence = uniqueEvidence(input.evidence);
    const record: KnowledgeCardRecord = {
      id: `card-${stableJsonHash({ normalizedTitle, createdAt: now }).slice(0, 12)}`,
      title: input.title.trim(),
      normalizedTitle,
      path: filePath,
      filePath,
      createdAt: now,
      updatedAt: now,
      evidence,
      sourceAnalysisPaths: [input.sourceAnalysisPath],
      sourceBookId: evidence[0]?.sourceBookId,
      sourceAnnotationIds: evidence.map((item) => item.fragmentId),
    };
    await this.app.vault.create(filePath, buildKnowledgeCardMarkdown(record, input.explanation));
    return record;
  }

  async appendEvidence(card: KnowledgeCardRecord, input: KnowledgeCardInput): Promise<KnowledgeCardRecord> {
    const now = new Date().toISOString();
    const next: KnowledgeCardRecord = {
      ...card,
      path: card.path || card.filePath,
      filePath: card.filePath || card.path,
      updatedAt: now,
      evidence: uniqueEvidence([...(card.evidence ?? []), ...input.evidence]),
      sourceAnalysisPaths: uniqueStrings([...(card.sourceAnalysisPaths ?? []), input.sourceAnalysisPath]),
    };
    next.sourceAnnotationIds = next.evidence.map((item) => item.fragmentId);

    const file = this.app.vault.getAbstractFileByPath(next.filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`未找到知识卡片：${next.filePath}`);
    }
    const existing = await this.app.vault.read(file);
    await this.app.vault.modify(file, mergeKnowledgeCardMarkdown(existing, next, input.explanation));
    return next;
  }

  async writeSuggestions(suggestions: LinkSuggestion[]): Promise<string> {
    const date = new Date().toISOString().slice(0, 10);
    const path = normalizePath(`${this.suggestionsDir}/${date} - 关联建议.md`);
    await writeTextFile(this.app, path, buildSuggestionsMarkdown(suggestions, date));
    return path;
  }

  async acceptSuggestion(cardPath: string, suggestion: LinkSuggestion, editedRationale?: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(cardPath);
    if (!(file instanceof TFile)) {
      throw new Error(`未找到知识卡片：${cardPath}`);
    }

    const content = await this.app.vault.read(file);
    const linkLine = [
      `- [[${suggestion.rightTarget.notePath.replace(/\.md$/, "")}]]`,
      `关系：${suggestion.relationType}`,
      `理由：${editedRationale?.trim() || suggestion.rationale}`,
    ].join("；");
    const next = replaceManagedBlock(content, LINKS_START, LINKS_END, linkLine);
    await this.app.vault.modify(file, next);
  }

  async writeConfirmedRelations(
    card: KnowledgeCardRecord,
    relations: ConfirmedRelation[],
    cards: Record<string, KnowledgeCardRecord>,
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(card.filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`未找到知识卡片：${card.filePath}`);
    }
    const content = await this.app.vault.read(file);
    const block = relations
      .filter((relation) => relation.leftCardId === card.id || relation.rightCardId === card.id)
      .map((relation) => renderConfirmedRelation(card, relation, cards))
      .join("\n\n") || "<!-- 未来接受跨书关联建议后追加 -->";
    await this.app.vault.modify(file, replaceManagedBlock(content, LINKS_START, LINKS_END, block));
  }
}

export function normalizeKnowledgeTitle(value: string): string {
  return value
    .trim()
    .replace(/[，,]/g, ",")
    .replace(/[。．.]/g, ".")
    .replace(/[：:]/g, ":")
    .replace(/[；;]/g, ";")
    .replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"))
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function buildKnowledgeEvidenceLinks(evidence: KnowledgeEvidence[]): string[] {
  return evidence.map((item) => {
    const label = item.fragmentType === "thought" || item.fragmentType === "review" ? "查看我的想法" : "查看原文划线";
    return `- [[${item.sourceNotePath}#^${item.blockId}|${label}]]`;
  });
}

export function buildKnowledgeCardMarkdown(record: KnowledgeCardRecord, explanation: string, existingContent = ""): string {
  const userArea = extractUserArea(existingContent);
  return [
    "---",
    `来源: ${JSON.stringify("ReadMind")}`,
    `创建时间: ${JSON.stringify(record.createdAt.slice(0, 10))}`,
    "tags:",
    "  - readmind/knowledge",
    "---",
    "",
    `# ${record.title}`,
    "",
    "> 基于真实阅读笔记创建的知识卡片。",
    "",
    buildManagedKnowledgeBlock(record, explanation),
    "",
    userArea,
    "",
    "## 后续关联",
    "",
    LINKS_START,
    "<!-- 未来接受跨书关联建议后追加 -->",
    LINKS_END,
    "",
  ].join("\n").trimEnd() + "\n";
}

function mergeKnowledgeCardMarkdown(existingContent: string, record: KnowledgeCardRecord, explanation: string): string {
  return buildKnowledgeCardMarkdown(record, explanation, existingContent);
}

function buildManagedKnowledgeBlock(record: KnowledgeCardRecord, explanation: string): string {
  const byBook = groupEvidenceByBook(record.evidence ?? []);
  return [
    KNOWLEDGE_START,
    `<!-- readmind:card-id:${record.id} -->`,
    `<!-- readmind:normalized-title:${record.normalizedTitle} -->`,
    "",
    "## 初步理解",
    "",
    explanation,
    "",
    "## 来自阅读的证据",
    "",
    ...byBook.flatMap((group) => [
      `### 《${group.title}》${group.author ? `· ${group.author}` : ""}`,
      "",
      ...buildKnowledgeEvidenceLinks(group.evidence),
      "",
    ]),
    KNOWLEDGE_END,
  ].join("\n");
}

function extractUserArea(content: string): string {
  const fallback = [
    "## 我的理解",
    "",
    "<!-- 用户可以在此继续补充；插件不得覆盖该区域 -->",
  ].join("\n");
  if (!content.trim()) return fallback;
  const start = content.indexOf("## 我的理解");
  if (start < 0) return fallback;
  const linksStart = content.indexOf("## 后续关联", start);
  return (linksStart > start ? content.slice(start, linksStart) : content.slice(start)).trimEnd();
}

function groupEvidenceByBook(evidence: KnowledgeEvidence[]): Array<{ title: string; author?: string; evidence: KnowledgeEvidence[] }> {
  const groups = new Map<string, { title: string; author?: string; evidence: KnowledgeEvidence[] }>();
  for (const item of evidence) {
    const key = `${item.sourceBookId}:${item.sourceBookTitle}`;
    const group = groups.get(key) ?? { title: item.sourceBookTitle, author: item.sourceBookAuthor, evidence: [] };
    group.evidence.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function uniqueEvidence(evidence: KnowledgeEvidence[]): KnowledgeEvidence[] {
  const seen = new Set<string>();
  const result: KnowledgeEvidence[] = [];
  for (const item of evidence) {
    const key = `${item.fragmentId}:${item.blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function renderConfirmedRelation(
  currentCard: KnowledgeCardRecord,
  relation: ConfirmedRelation,
  cards: Record<string, KnowledgeCardRecord>,
): string {
  const isLeft = relation.leftCardId === currentCard.id;
  const otherCard = cards[isLeft ? relation.rightCardId : relation.leftCardId];
  const currentEvidenceIds = isLeft ? relation.leftEvidenceIds : relation.rightEvidenceIds;
  const otherEvidenceIds = isLeft ? relation.rightEvidenceIds : relation.leftEvidenceIds;
  return [
    `### ${relationTypeLabel(relation.relationType)}：[[${otherCard?.filePath ?? otherCard?.title ?? "关联卡片"}|${otherCard?.title ?? "关联卡片"}]]`,
    "",
    relation.explanation,
    "",
    "**来自本卡片的证据**",
    ...evidenceLinksForIds(currentCard, currentEvidenceIds),
    "",
    "**来自关联卡片的证据**",
    ...evidenceLinksForIds(otherCard, otherEvidenceIds),
  ].join("\n");
}

function evidenceLinksForIds(card: KnowledgeCardRecord | undefined, ids: string[]): string[] {
  if (!card) return ["- 暂无"];
  const byId = new Map((card.evidence ?? []).map((item) => [evidenceId(card.id, item.fragmentId, item.blockId), item]));
  return ids.map((id) => {
    const item = byId.get(id);
    if (!item) return "- 暂无";
    return `- [[${item.sourceNotePath}#^${item.blockId}|查看来源]]`;
  });
}
