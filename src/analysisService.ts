import { App, normalizePath, TFile } from "obsidian";
import { buildAnalysisFileName, buildAnalysisMarkdown, mergeAnalysisMarkdown } from "./aiMarkdown";
import { buildChatRequest, OpenAICompatibleProvider, validateAISettings } from "./aiProvider";
import { buildBookAnalysisPrompt, buildLinkSuggestionPrompt, buildRelationSuggestionPrompt } from "./aiPrompts";
import { buildReadingReviewPrompt } from "./aiPrompts";
import { buildRelationInputCards, validateRelationSuggestionsForInput } from "./relationService";
import type {
  AIProviderSettings,
  AnalysisRecord,
  BookAnalysisResult,
  LinkSuggestion,
  KnowledgeCardRecord,
  PromptSettings,
  ReadingBookDetails,
  ReadingReviewInput,
  ReadingReviewResult,
  ReadMindSourceFragment,
  SyncedBookRecord,
  ConfirmedRelation,
  RelationSuggestion,
} from "./types";
import { ensureFolder } from "./vaultUtils";

export class AnalysisService {
  private readonly provider = new OpenAICompatibleProvider();

  constructor(
    private readonly app: App,
    private readonly aiDir: string,
    private readonly prompts?: PromptSettings,
  ) {}

  async analyzeBook(
    book: ReadingBookDetails,
    syncRecord: SyncedBookRecord,
    settings: AIProviderSettings,
  ): Promise<AnalysisRecord> {
    validateAISettings(settings);
    const fragments = syncRecord.sourceFragments ?? [];
    const inputFragments = fragments.filter((fragment) => settings.includeUserThoughts || fragment.type !== "thought");
    if (inputFragments.length === 0) {
      throw new Error("当前书没有可供 AI 引用的来源摘录，请先同步真实笔记。");
    }

    const prompt = buildBookAnalysisPrompt(book, inputFragments, settings, this.prompts);
    const rawResult = await this.provider.generateBookAnalysis(settings, buildChatRequest(settings, prompt));
    const result = filterAnalysisEvidence(rawResult, inputFragments);
    const analyzedAt = new Date().toISOString();
    const filePath = normalizePath(`${this.aiDir}/${buildAnalysisFileName(book)}`);
    const record: AnalysisRecord = {
      bookId: book.id,
      analysisFilePath: filePath,
      sourceNotePath: syncRecord.sourceFilePath,
      analyzedAt,
      inputContentHash: syncRecord.sourceContentHash,
      model: settings.model,
      result,
      sourceFragments: inputFragments,
    };
    await this.writeAnalysisFile(filePath, book, record);
    return record;
  }

  async suggestLinks(records: AnalysisRecord[], settings: AIProviderSettings): Promise<LinkSuggestion[]> {
    validateAISettings(settings);
    const prompt = buildLinkSuggestionPrompt(records, this.prompts);
    return this.provider.generateLinkSuggestions(settings, buildChatRequest(settings, prompt));
  }

  async suggestRelations(
    cards: KnowledgeCardRecord[],
    settings: AIProviderSettings,
    existingRelations: Record<string, ConfirmedRelation>,
  ): Promise<RelationSuggestion[]> {
    validateAISettings(settings);
    const input = buildRelationInputCards(cards);
    if (input.length < 2) throw new Error("请至少选择两张知识卡片。");
    if (input.some((card) => card.evidence.length === 0 || card.evidence.every((item) => !item.text.trim()))) {
      throw new Error("所选知识卡片缺少可用证据。");
    }
    const prompt = buildRelationSuggestionPrompt(input, this.prompts);
    const raw = await this.provider.generateRelationSuggestions(settings, buildChatRequest(settings, prompt));
    return validateRelationSuggestionsForInput(raw, input, existingRelations);
  }

  async generateReadingReview(input: ReadingReviewInput, settings: AIProviderSettings): Promise<ReadingReviewResult> {
    validateAISettings(settings);
    const prompt = buildReadingReviewPrompt(input);
    if (prompt.length > settings.maxInputChars) {
      throw new Error("选择内容过多，请减少书籍或证据范围后重试。");
    }
    return this.provider.generateReadingReview(settings, buildChatRequest(settings, prompt));
  }

  private async writeAnalysisFile(filePath: string, book: ReadingBookDetails, record: AnalysisRecord): Promise<void> {
    const folder = filePath.split("/").slice(0, -1).join("/");
    if (folder) await ensureFolder(this.app, folder);
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      const existingContent = await this.app.vault.read(existing);
      await this.app.vault.modify(existing, mergeAnalysisMarkdown(book, record, existingContent));
    } else {
      await this.app.vault.create(filePath, buildAnalysisMarkdown(book, record));
    }
  }
}

export function filterAnalysisEvidence(result: BookAnalysisResult, fragments: ReadMindSourceFragment[]): BookAnalysisResult {
  const allowed = new Set(fragments.map((fragment) => fragment.fragmentId));
  return {
    centralQuestions: result.centralQuestions,
    summary: result.summary,
    themes: result.themes
      .map((theme) => ({
        ...theme,
        sourceFragmentIds: theme.sourceFragmentIds.filter((id) => allowed.has(id)),
      }))
      .filter((theme) => theme.sourceFragmentIds.length > 0),
    concepts: result.concepts
      .map((concept) => ({
        ...concept,
        sourceFragmentIds: concept.sourceFragmentIds.filter((id) => allowed.has(id)),
      }))
      .filter((concept) => concept.sourceFragmentIds.length > 0),
    reflectionQuestions: result.reflectionQuestions,
  };
}
