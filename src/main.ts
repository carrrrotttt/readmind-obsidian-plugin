import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_BOOKSHELF, VIEW_TYPE_KNOWLEDGE_NETWORK, VIEW_TYPE_LINK_SUGGESTIONS, VIEW_TYPE_READING_JOURNEY } from "./constants";
import { fixtureData } from "./fixtures";
import { BookshelfView } from "./BookshelfView";
import { KnowledgeNetworkView } from "./KnowledgeNetworkView";
import { LinkSuggestionsView } from "./LinkSuggestionsView";
import { ReadingJourneyView } from "./ReadingJourneyView";
import { ReadMindSettingTab } from "./ReadMindSettingTab";
import { MemoryReadingSourceAdapter, OfficialGatewayProvider, parseImportedReadingData, WeReadReadingSourceAdapter } from "./sourceAdapters";
import { WeReadApiClient, WeReadApiError } from "./weReadApiClient";
import { openWeReadQrLoginWindow } from "./weReadLogin";
import { logWeReadDebug, type WeReadDebugEvent, type WeReadDebugLogger } from "./weReadDiagnostics";
import { PluginStore } from "./store";
import { SyncService } from "./syncService";
import { DailyNoteService } from "./dailyNoteService";
import { connectionStateLabel } from "./displayText";
import { AnalysisService } from "./analysisService";
import { AIFormatError, OpenAICompatibleProvider, sanitizeAIError, type ConnectionTestResult, type ConnectionTestStage } from "./aiProvider";
import { KnowledgeService, normalizeKnowledgeTitle, type KnowledgeCardInput } from "./knowledgeService";
import { createConfirmedRelation } from "./relationService";
import { OfficialGatewayClient } from "./officialGatewayClient";
import { findCardForSuggestion } from "./linkSuggestionUtils";
import { AnalysisConfirmModal, KnowledgeCardConfirmModal } from "./modals";
import { ReadingReviewConfirmModal } from "./ReadingReviewModal";
import { SyncLogModal } from "./SyncLogModal";
import { hasReviewEvidence, reviewIndexKey, validateReadingReviewResultForInput, writeReadingReviewFile, type ReadingReviewPreview } from "./readingReviewService";
import type {
  LinkSuggestionStatus,
  ReadingBook,
  ReadingBookDetails,
  ReadingSourceAdapter,
  KnowledgeEvidence,
  RelationSuggestionStatus,
  RelationType,
  ReadingJourneySummary,
  ReadingPeriod,
  ReadingReviewPeriod,
} from "./types";

export default class ReadMindPlugin extends Plugin {
  store!: PluginStore;

  async onload(): Promise<void> {
    this.store = new PluginStore(this);
    await this.store.load();

    this.registerView(VIEW_TYPE_BOOKSHELF, (leaf: WorkspaceLeaf) => new BookshelfView(leaf, this));
    this.registerView(VIEW_TYPE_LINK_SUGGESTIONS, (leaf: WorkspaceLeaf) => new LinkSuggestionsView(leaf, this));
    this.registerView(VIEW_TYPE_KNOWLEDGE_NETWORK, (leaf: WorkspaceLeaf) => new KnowledgeNetworkView(leaf, this));
    this.registerView(VIEW_TYPE_READING_JOURNEY, (leaf: WorkspaceLeaf) => new ReadingJourneyView(leaf, this));
    this.addRibbonIcon("book-open", "打开 ReadMind 书架", () => this.openBookshelf());

    this.addCommand({
      id: "open-bookshelf",
      name: "ReadMind: Open bookshelf",
      callback: () => this.openBookshelf(),
    });
    this.addCommand({
      id: "import-reading-data",
      name: "ReadMind: Import reading data",
      callback: () => this.importReadingDataFromPicker(),
    });
    this.addCommand({
      id: "sync-selected-books",
      name: "ReadMind: Sync selected books",
      callback: () => this.syncSelectedBooks(),
    });
    this.addCommand({
      id: "analyze-selected-books",
      name: "ReadMind: Analyze selected books with AI",
      callback: () => this.analyzeSelectedBooks(),
    });
    this.addCommand({
      id: "review-link-suggestions",
      name: "ReadMind: Review link suggestions",
      callback: () => this.openLinkSuggestions(),
    });
    this.addCommand({
      id: "open-knowledge-network",
      name: "ReadMind: Open knowledge network",
      callback: () => this.openKnowledgeNetwork(),
    });
    this.addCommand({
      id: "open-reading-journey",
      name: "ReadMind: Open reading journey",
      callback: () => this.openReadingJourney(),
    });
    this.addCommand({
      id: "open-settings",
      name: "ReadMind: Open settings",
      callback: () => this.openSettings(),
    });

    this.addSettingTab(new ReadMindSettingTab(this));
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_BOOKSHELF);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_LINK_SUGGESTIONS);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_KNOWLEDGE_NETWORK);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_READING_JOURNEY);
  }

  async openBookshelf(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOOKSHELF);
    if (leaves.length > 0) {
      await this.app.workspace.revealLeaf(leaves[0]);
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    if (!leaf) {
      new Notice("无法打开 ReadMind 书架。");
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE_BOOKSHELF, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  openSettings(): void {
    const appWithSettings = this.app as typeof this.app & {
      setting?: { open(): void; openTabById(id: string): void };
    };
    appWithSettings.setting?.open();
    appWithSettings.setting?.openTabById(this.manifest.id);
  }

  getDataSourceStatusLabel(): string {
    const mode = this.store.data.settings.dataSourceMode;
    if (mode === "fixture") return "示例数据";
    if (mode === "import") return this.store.data.settings.importedData ? "本地导入模式" : "等待导入";
    if (mode === "weread_official") return `微信读书官方 API（${connectionStateLabel(this.store.data.settings.wereadOfficial.connection.state)}）`;
    return `微信读书（${connectionStateLabel(this.store.data.settings.wereadConnection.state)}）`;
  }

  async useFixtureData(): Promise<void> {
    this.store.data.settings.dataSourceMode = "fixture";
    await this.store.save();
    new Notice("已载入 ReadMind 示例数据。");
  }

  async openLinkSuggestions(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LINK_SUGGESTIONS);
    if (leaves.length > 0) {
      await this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("无法打开关联建议视图。");
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE_LINK_SUGGESTIONS, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async openKnowledgeNetwork(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_KNOWLEDGE_NETWORK);
    if (leaves.length > 0) {
      await this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    if (!leaf) {
      new Notice("无法打开知识网络。");
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE_KNOWLEDGE_NETWORK, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async openReadingJourney(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_READING_JOURNEY);
    if (leaves.length > 0) {
      await this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    if (!leaf) {
      new Notice("无法打开阅读回顾。");
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE_READING_JOURNEY, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  canLoadReadingJourney(): boolean {
    const settings = this.store.data.settings;
    return settings.dataSourceMode === "weread_official"
      && settings.wereadOfficial.connection.state === "connected"
      && Boolean(settings.wereadOfficial.apiKey.trim());
  }

  async loadReadingJourney(period: ReadingPeriod): Promise<ReadingJourneySummary> {
    return new OfficialGatewayClient(this.store.data.settings.wereadOfficial, this.weReadLogger()).getReadingJourney(period);
  }

  openReadingReviewConfirm(summary: ReadingJourneySummary): void {
    if (summary.period === "overall") {
      new Notice("总计适合查看长期统计。生成阶段回顾请选择本周、本月或本年。");
      return;
    }
    if (!this.store.data.settings.ai.enabled || !this.store.data.settings.ai.baseUrl || !this.store.data.settings.ai.apiKey || !this.store.data.settings.ai.model) {
      new Notice("请先在设置中配置 AI 模型，再生成阶段回顾。");
      this.openSettings();
      return;
    }
    try {
      new ReadingReviewConfirmModal(this, summary, (preview) => void this.generateReadingReview(summary, preview)).open();
    } catch {
      new Notice("阶段回顾准备失败，请重试。");
    }
  }

  async generateReadingReview(summary: ReadingJourneySummary, preview: ReadingReviewPreview): Promise<void> {
    if (summary.period === "overall") {
      new Notice("总计适合查看长期统计。生成阶段回顾请选择本周、本月或本年。");
      return;
    }
    if (!hasReviewEvidence(preview.input)) {
      new Notice("当前周期还没有可用于生成回顾的阅读证据。请先同步包含划线或想法的书籍。");
      return;
    }
    try {
      const service = new AnalysisService(this.app, this.store.data.settings.aiDir, this.store.data.settings.prompts);
      const raw = await service.generateReadingReview(preview.input, this.store.data.settings.ai);
      const result = validateReadingReviewResultForInput(raw, preview.input);
      const record = await writeReadingReviewFile(
        this.app,
        this.store.data.settings.readingReviewsDir,
        summary,
        preview.input,
        result,
        this.store.data,
        this.store.data.settings.ai.model,
      );
      this.store.data.readingReviewIndex[reviewIndexKey(summary.period as ReadingReviewPeriod, summary.baseTime)] = record;
      await this.store.save();
      new Notice("阶段阅读回顾已生成。");
      await this.openMarkdownFile(record.filePath);
    } catch (error) {
      const message = error instanceof AIFormatError
        ? "阶段回顾生成未完成，请重试或更换模型。"
        : sanitizeAIError(error);
      new Notice(message);
    }
  }

  async listBooks(): Promise<ReadingBook[]> {
    return this.getAdapter().listBooks();
  }

  async getBookDetails(bookId: string): Promise<ReadingBookDetails> {
    return this.getAdapter().getBookDetails(bookId);
  }

  async syncSelectedBooks(): Promise<void> {
    if (this.store.data.selectedBookIds.length === 0) {
      new Notice("请先在书架中选择要同步的书籍。");
      return;
    }
    await this.syncBooks(this.store.data.selectedBookIds);
  }

  async syncBooks(bookIds: string[]): Promise<void> {
    const adapter = this.getAdapter();
    const service = new SyncService(this.app, this.store.data.settings.sourcesDir, {
      syncIndex: this.store.data.syncIndex,
      addLog: (entry) => this.store.addLog(entry),
      save: () => this.store.save(),
    }, this.store.data.settings.frontmatter);

    let success = 0;
    for (const bookId of bookIds) {
      try {
        const book = await adapter.getBookDetails(bookId);
        const record = await service.syncBook(book);
        await this.addDailyEvent({
          id: `${record.lastSyncedAt}-${book.id}-sync`,
          at: record.lastSyncedAt,
          type: "sync",
          title: `同步《${book.title}》`,
          filePath: record.sourceFilePath,
          count: book.annotations.length,
        });
        success += 1;
      } catch (error) {
        const now = new Date().toISOString();
        await this.store.addLog({
          id: `${now}-${bookId}-error`,
          at: now,
          bookId,
          level: "error",
          message: error instanceof Error ? error.message : "同步失败",
        });
        await this.store.save();
        new Notice(error instanceof Error ? error.message : "同步失败");
      }
    }

    if (success > 0) {
      new Notice(`已同步 ${success} 本书。`);
    }
  }

  async refreshBookshelf(): Promise<void> {
    try {
      const books = await this.listBooks();
      new Notice(`已刷新书架：${books.length} 本书。`);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "刷新书架失败。");
    }
  }

  openSyncLogs(): void {
    new SyncLogModal(this).open();
  }

  async testAIConnection(options: { onStage?: (stage: ConnectionTestStage) => void } = {}): Promise<ConnectionTestResult> {
    try {
      const result = await new OpenAICompatibleProvider().testConnection(this.store.data.settings.ai, {
        onStage: options.onStage,
        timeoutMs: 60000,
      });
      this.store.data.settings.ai.lastConnectionTest = {
        ok: result.ok,
        providerId: this.store.data.settings.ai.providerId,
        model: this.store.data.settings.ai.model,
        testedAt: new Date().toISOString(),
      };
      await this.store.save();
      return result;
    } catch (error) {
      return { ok: false, kind: "api_error", message: "连接失败，请检查 API Key、模型或网络设置。", detail: sanitizeAIError(error) };
    }
  }

  async analyzeSelectedBooks(): Promise<void> {
    if (this.store.data.selectedBookIds.length === 0) {
      new Notice("请先在书架中选择要分析的书籍。");
      return;
    }
    await this.analyzeBooks(this.store.data.selectedBookIds);
  }

  async analyzeBooks(bookIds: string[]): Promise<void> {
    const settings = this.store.data.settings.ai;
    if (!settings.enabled || !settings.baseUrl || !settings.apiKey || !settings.model) {
      new Notice("请先在 ReadMind 设置中完整配置并启用 AI。");
      return;
    }

    const adapter = this.getAdapter();
    const books = await Promise.all(bookIds.map((id) => adapter.getBookDetails(id)));
    const missingSync = books.find((book) => !this.store.data.syncIndex[book.id]?.sourceFilePath);
    if (missingSync) {
      new Notice(`请先同步《${missingSync.title}》，再进行 AI 分析。`);
      return;
    }
    const missingFragments = books.find((book) => !this.store.data.syncIndex[book.id]?.sourceFragments?.length);
    if (missingFragments) {
      new Notice(`《${missingFragments.title}》没有可引用的来源摘录，请先同步真实笔记。`);
      return;
    }

    const annotationCount = books.reduce((sum, book) => sum + book.annotations.length, 0);
    if (!this.store.data.settings.firstAnalysisConfirmed) {
      const confirmed = await new Promise<boolean>((resolve) => {
        new AnalysisConfirmModal(this, books.length, annotationCount, resolve).open();
      });
      if (!confirmed) return;
      this.store.data.settings.firstAnalysisConfirmed = true;
      await this.store.save();
    }

    const service = new AnalysisService(this.app, this.store.data.settings.aiDir, this.store.data.settings.prompts);
    let success = 0;
    for (const book of books) {
      try {
        const syncRecord = this.store.data.syncIndex[book.id];
        syncRecord.aiStatus = "analyzing";
        await this.store.save();
        const record = await service.analyzeBook(book, syncRecord, settings);
        this.store.data.analysisIndex[book.id] = record;
        syncRecord.aiStatus = "analyzed";
        syncRecord.lastAnalyzedHash = syncRecord.sourceContentHash;
        await this.store.addLog({
          id: `${record.analyzedAt}-${book.id}-ai`,
          at: record.analyzedAt,
          bookId: book.id,
          title: book.title,
          level: "info",
          message: `AI 分析完成：${settings.model}`,
        });
        await this.store.save();
        await this.addDailyEvent({
          id: `${record.analyzedAt}-${book.id}-analysis`,
          at: record.analyzedAt,
          type: "analysis",
          title: `AI 分析《${book.title}》`,
          filePath: record.analysisFilePath,
        });
        success += 1;
      } catch (error) {
        const syncRecord = this.store.data.syncIndex[book.id];
        if (syncRecord) syncRecord.aiStatus = "failed";
        const message = error instanceof AIFormatError
          ? "AI 分析未完成，请重试或更换模型。"
          : sanitizeAIError(error);
        await this.store.addLog({
          id: `${new Date().toISOString()}-${book.id}-ai-error`,
          at: new Date().toISOString(),
          bookId: book.id,
          title: book.title,
          level: "error",
          message,
        });
        await this.store.save();
        new Notice(message);
      }
    }

    if (success > 0) {
      new Notice(`已完成 ${success} 本书的 AI 分析。`);
    }
  }

  async createKnowledgeCardFromConcept(bookId: string, conceptName: string): Promise<void> {
    const input = this.buildKnowledgeCardInput(bookId, conceptName);
    if (!input) {
      new Notice("该概念没有可用来源依据，不能创建知识卡片。");
      return;
    }

    const service = new KnowledgeService(this.app, this.store.data.settings.cardsDir, this.store.data.settings.suggestionsDir);
    const existing = service.findExistingCard(this.store.data.cardIndex, input.title);
    const action = await new Promise<"create" | "attach" | "open" | "cancel">((resolve) => {
      new KnowledgeCardConfirmModal(this, input, existing, resolve).open();
    });
    if (action === "cancel") return;
    if (action === "open" && existing) {
      await this.openMarkdownFile(existing.filePath);
      return;
    }

    const record = existing && action === "attach"
      ? await service.appendEvidence(existing, input)
      : await service.createCard(input);
    this.store.data.cardIndex[record.id] = record;
    this.setConceptCandidateStatus(bookId, conceptName, existing ? "attached_to_existing" : "card_created", record.id);
    const syncRecord = this.store.data.syncIndex[bookId];
    if (syncRecord) {
      syncRecord.generatedCardIds = [...new Set([...(syncRecord.generatedCardIds ?? []), record.id])];
    }
    await this.store.save();
    await this.addDailyEvent({
      id: `${record.updatedAt}-${record.id}`,
      at: record.updatedAt,
      type: "card",
      title: existing ? `更新知识卡片「${record.title}」` : `创建知识卡片「${record.title}」`,
      filePath: record.filePath,
    });
    new Notice(existing ? `已添加到知识卡片：${record.title}` : `已创建知识卡片：${record.title}`);
  }

  async dismissConceptCandidate(bookId: string, conceptName: string): Promise<void> {
    this.setConceptCandidateStatus(bookId, conceptName, "dismissed");
    await this.store.save();
    new Notice("已标记为暂不整理。");
  }

  findKnowledgeCardForConcept(conceptName: string): import("./types").KnowledgeCardRecord | undefined {
    const normalized = normalizeKnowledgeTitle(conceptName);
    return Object.values(this.store.data.cardIndex).find((card) => (card.normalizedTitle || normalizeKnowledgeTitle(card.title)) === normalized);
  }

  private buildKnowledgeCardInput(bookId: string, conceptName: string): KnowledgeCardInput | null {
    const analysis = this.store.data.analysisIndex[bookId];
    if (!analysis) return null;
    const concept = analysis.result.concepts.find((item) => item.name === conceptName);
    if (!concept) return null;
    const fragments = new Map(analysis.sourceFragments.map((fragment) => [fragment.fragmentId, fragment]));
    const evidence: KnowledgeEvidence[] = concept.sourceFragmentIds
      .map((id) => fragments.get(id))
      .filter((fragment): fragment is NonNullable<typeof fragment> => Boolean(fragment))
      .map((fragment) => ({
        sourceBookId: fragment.bookId,
        sourceBookTitle: fragment.bookTitle,
        sourceBookAuthor: fragment.author,
        sourceNotePath: fragment.sourceNotePath,
        blockId: fragment.blockId,
        fragmentId: fragment.fragmentId,
        fragmentType: fragment.type,
        chapterTitle: fragment.chapterTitle,
        text: fragment.text,
      }));
    if (evidence.length === 0) return null;
    return {
      title: concept.name,
      explanation: concept.explanation,
      evidence,
      sourceAnalysisPath: analysis.analysisFilePath,
    };
  }

  private setConceptCandidateStatus(
    bookId: string,
    conceptName: string,
    status: import("./types").ConceptCandidateStatus,
    cardId?: string,
  ): void {
    const analysis = this.store.data.analysisIndex[bookId];
    if (!analysis) return;
    const key = normalizeKnowledgeTitle(conceptName);
    analysis.conceptCandidates = {
      ...(analysis.conceptCandidates ?? {}),
      [key]: {
        status,
        cardId,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  async generateLinkSuggestionsForSelectedBooks(): Promise<void> {
    new Notice("请在关联建议中选择知识卡片后生成建议。");
  }

  async generateRelationSuggestionsForCards(cardIds: string[]): Promise<void> {
    if (cardIds.length < 2) {
      new Notice("请至少选择两张知识卡片。");
      return;
    }
    if (cardIds.length > 5) {
      new Notice("一次最多选择 5 张知识卡片。");
      return;
    }
    const settings = this.store.data.settings.ai;
    if (!settings.enabled || !settings.baseUrl || !settings.apiKey || !settings.model) {
      new Notice("请先配置 AI 后再生成关联建议。");
      return;
    }

    try {
      const cards = cardIds.map((id) => this.store.data.cardIndex[id]).filter(Boolean).map((card) => this.enrichCardEvidenceText(card));
      const service = new AnalysisService(this.app, this.store.data.settings.aiDir, this.store.data.settings.prompts);
      const suggestions = await service.suggestRelations(cards, settings, this.store.data.confirmedRelations);
      for (const suggestion of suggestions) {
        this.store.data.relationSuggestions[suggestion.id] = suggestion;
      }
      await this.store.save();
      new Notice(suggestions.length > 0 ? `已生成 ${suggestions.length} 条关联建议。` : "当前证据不足以形成可靠关联。");
      await this.openLinkSuggestions();
    } catch (error) {
      new Notice(sanitizeAIError(error));
    }
  }

  async acceptRelationSuggestion(
    suggestionId: string,
    edits?: { title?: string; relationType?: RelationType; explanation?: string },
  ): Promise<void> {
    const suggestion = this.store.data.relationSuggestions[suggestionId];
    if (!suggestion) return;
    const nextSuggestion = {
      ...suggestion,
      title: edits?.title?.trim() || suggestion.title,
      relationType: edits?.relationType ?? suggestion.relationType,
      explanation: edits?.explanation?.trim() || suggestion.explanation,
      status: edits ? "edited_and_accepted" as const : "accepted" as const,
      updatedAt: new Date().toISOString(),
    };
    const relation = createConfirmedRelation(nextSuggestion);
    if (!this.store.data.confirmedRelations[relation.id]) {
      this.store.data.confirmedRelations[relation.id] = relation;
    }
    this.store.data.relationSuggestions[suggestionId] = nextSuggestion;
    const knowledge = new KnowledgeService(this.app, this.store.data.settings.cardsDir, this.store.data.settings.suggestionsDir);
    await knowledge.writeConfirmedRelations(this.store.data.cardIndex[relation.leftCardId], Object.values(this.store.data.confirmedRelations), this.store.data.cardIndex);
    await knowledge.writeConfirmedRelations(this.store.data.cardIndex[relation.rightCardId], Object.values(this.store.data.confirmedRelations), this.store.data.cardIndex);
    await this.store.save();
    new Notice("已建立双向知识卡片链接。");
  }

  async setRelationSuggestionStatus(suggestionId: string, status: RelationSuggestionStatus): Promise<void> {
    const suggestion = this.store.data.relationSuggestions[suggestionId];
    if (!suggestion) return;
    suggestion.status = status;
    suggestion.updatedAt = new Date().toISOString();
    await this.store.save();
  }

  private enrichCardEvidenceText(card: import("./types").KnowledgeCardRecord): import("./types").KnowledgeCardRecord {
    const fragments = new Map(
      Object.values(this.store.data.syncIndex)
        .flatMap((record) => record.sourceFragments ?? [])
        .map((fragment) => [fragment.fragmentId, fragment]),
    );
    return {
      ...card,
      evidence: (card.evidence ?? []).map((item) => ({
        ...item,
        text: item.text || fragments.get(item.fragmentId)?.text || "",
      })),
    };
  }

  async acceptLinkSuggestion(suggestionId: string, editedRationale?: string): Promise<void> {
    const suggestion = this.store.data.linkSuggestions[suggestionId];
    if (!suggestion) {
      new Notice("未找到关联建议。");
      return;
    }
    const card = findCardForSuggestion(this.store.data.cardIndex, suggestion);
    if (!card) {
      new Notice("请先为左侧概念创建知识卡片，再接受关联建议。");
      return;
    }

    try {
      const service = new KnowledgeService(this.app, this.store.data.settings.cardsDir, this.store.data.settings.suggestionsDir);
      await service.acceptSuggestion(card.filePath, suggestion, editedRationale);
      suggestion.status = editedRationale ? "edited_and_accepted" : "accepted";
      await this.store.save();
      await this.addDailyEvent({
        id: `${new Date().toISOString()}-${suggestion.id}-link`,
        at: new Date().toISOString(),
        type: "link",
        title: `确认关联：${suggestion.leftTarget.concept ?? "左侧"} ↔ ${suggestion.rightTarget.concept ?? "右侧"}`,
        filePath: card.filePath,
      });
      new Notice("已写入确认后的双链。");
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "写入双链失败。");
    }
  }

  async setLinkSuggestionStatus(suggestionId: string, status: LinkSuggestionStatus): Promise<void> {
    const suggestion = this.store.data.linkSuggestions[suggestionId];
    if (!suggestion) return;
    suggestion.status = status;
    await this.store.save();
  }

  async importReadingDataFromPicker(): Promise<void> {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const raw = await file.text();
        this.store.data.settings.importedData = parseImportedReadingData(raw);
        this.store.data.settings.dataSourceMode = "import";
        await this.store.save();
        new Notice(`已导入 ${this.store.data.settings.importedData.books.length} 本书。`);
      } catch (error) {
        new Notice(error instanceof Error ? error.message : "导入失败。");
      }
    };
    input.click();
  }

  async openWeReadExperimentalConnection(): Promise<void> {
    this.store.data.settings.wereadConnection = {
      state: "waiting_scan",
      message: "正在打开微信读书扫码登录窗口。",
    };
    await this.store.save();
    const result = await openWeReadQrLoginWindow({
      verifySession: async (session) => {
        try {
          await new WeReadApiClient(session, this.weReadLogger(), async (next) => {
            session.cookie = next.cookie;
            session.userVid = next.userVid;
          }).verifySession();
          return true;
        } catch {
          return false;
        }
      },
      onDebug: this.weReadLogger(),
    });
    if (result.ok && result.session) {
      this.store.data.settings.wereadSession = result.session;
      result.session.lastVerifiedAt = new Date().toISOString();
      result.session.expired = false;
      this.store.data.settings.wereadConnection = {
        state: "connected",
        message: "微信读书已连接，可读取书架和笔记。",
      };
      this.store.data.settings.dataSourceMode = "weread";
      await this.store.save();
      new Notice("微信读书登录成功，已保存本地会话。");
    } else {
      this.store.data.settings.wereadConnection = result.status;
      this.store.data.settings.wereadSession = undefined;
      await this.store.save();
      new Notice(result.status.message);
    }
  }

  async markWeReadExperimentalExpired(): Promise<void> {
    this.store.data.settings.wereadConnection = {
      state: "expired",
      message: "微信读书登录已标记为失效，请重新扫码。",
    };
    if (this.store.data.settings.wereadSession) {
      this.store.data.settings.wereadSession.expired = true;
    }
    await this.store.save();
  }

  async clearWeReadExperimentalConnection(): Promise<void> {
    const adapter = new WeReadReadingSourceAdapter(this.store.data.settings.wereadConnection);
    await adapter.disconnect?.();
    this.store.data.settings.wereadConnection = await adapter.getConnectionStatus();
    this.store.data.settings.wereadSession = undefined;
    if (this.store.data.settings.dataSourceMode === "weread") {
      this.store.data.settings.dataSourceMode = "fixture";
    }
    await this.store.save();
    new Notice("已清除微信读书实验连接状态。");
  }

  async verifyWeReadConnection(options: { quiet?: boolean } = {}): Promise<boolean> {
    const session = this.store.data.settings.wereadSession;
    if (!session) {
      if (!options.quiet) new Notice("请先扫码登录微信读书。");
      return false;
    }
    try {
      await new WeReadApiClient(session, this.weReadLogger(), async (next) => {
        this.store.data.settings.wereadSession = next;
        await this.store.save();
      }).verifySession();
      session.expired = false;
      session.lastVerifiedAt = new Date().toISOString();
      this.store.data.settings.wereadConnection = {
        state: "connected",
        message: "微信读书已连接，可读取书架和笔记。",
      };
      this.store.data.settings.dataSourceMode = "weread";
      await this.store.save();
      if (!options.quiet) new Notice("微信读书登录状态有效。");
      return true;
    } catch (error) {
      session.expired = true;
      this.store.data.settings.wereadConnection = {
        state: error instanceof WeReadApiError && error.kind === "unauthorized" ? "expired" : "failed",
        message: error instanceof Error ? error.message : "微信读书连接验证失败。",
      };
      await this.store.save();
      if (!options.quiet) new Notice(this.store.data.settings.wereadConnection.message);
      return false;
    }
  }

  async testOfficialGatewayConnection(): Promise<boolean> {
    const settings = this.store.data.settings.wereadOfficial;
    try {
      await new OfficialGatewayProvider(settings, this.weReadLogger()).connect();
      settings.connection = { state: "connected", message: "微信读书官方 API 已连接。" };
      this.store.data.settings.dataSourceMode = "weread_official";
      await this.store.save();
      new Notice("微信读书官方 API 已连接。");
      return true;
    } catch (error) {
      settings.connection = {
        state: "failed",
        message: error instanceof Error ? error.message : "微信读书官方 API 连接失败。",
      };
      await this.store.save();
      new Notice(settings.connection.message);
      return false;
    }
  }

  async clearOfficialGatewayConnection(): Promise<void> {
    this.store.data.settings.wereadOfficial.apiKey = "";
    this.store.data.settings.wereadOfficial.connection = {
      state: "disconnected",
      message: "已清除微信读书官方 API Key。",
    };
    if (this.store.data.settings.dataSourceMode === "weread_official") {
      this.store.data.settings.dataSourceMode = "fixture";
    }
    await this.store.save();
    new Notice("已清除微信读书官方 API Key。");
  }

  private async addDailyEvent(event: import("./types").DailyEvent): Promise<void> {
    this.store.data.dailyEvents = [event, ...this.store.data.dailyEvents].slice(0, 200);
    await this.store.save();
    await new DailyNoteService(this.app, this.store.data.settings.dailyNotes).updateToday(this.store.data.dailyEvents);
  }

  async openMarkdownFile(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`未找到文件：${path}`);
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  async openMarkdownBlock(path: string, blockId: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`未找到文件：${path}`);
      return;
    }
    await this.app.workspace.openLinkText(`${path}#^${blockId}`, "", false);
  }

  private getAdapter(): ReadingSourceAdapter {
    const mode = this.store.data.settings.dataSourceMode;
    if (mode === "import") {
      const data = this.store.data.settings.importedData;
      if (!data) {
        return new MemoryReadingSourceAdapter("import", "本地导入", { books: [] });
      }
      return new MemoryReadingSourceAdapter("import", "本地导入", data);
    }
    if (mode === "weread") {
      return new WeReadReadingSourceAdapter(
        this.store.data.settings.wereadConnection,
        this.store.data.settings.wereadSession,
        this.weReadLogger(),
        async (session) => {
          this.store.data.settings.wereadSession = session;
          await this.store.save();
        },
      );
    }
    if (mode === "weread_official") {
      return new OfficialGatewayProvider(
        this.store.data.settings.wereadOfficial,
        this.weReadLogger(),
      );
    }
    return new MemoryReadingSourceAdapter("fixture", "示例数据", fixtureData);
  }

  private weReadLogger(): WeReadDebugLogger {
    return (event: WeReadDebugEvent) => logWeReadDebug(event, Boolean(this.store.data.settings.weReadDebugEnabled));
  }
}
