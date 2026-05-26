import { Modal, Notice, Setting } from "obsidian";
import {
  aiStatusLabel,
  formatReadingDuration,
  formatUserDateTime,
  readingStatusLabel,
  syncStatusLabel,
} from "./displayText";
import { normalizeKnowledgeTitle } from "./knowledgeService";
import { groupSourceFragmentsByChapter, highlightsInGroup } from "./sourceOrganization";
import type ReadMindPlugin from "./main";
import type { ReadingBookDetails } from "./types";

type DetailTab = "overview" | "annotations" | "analysis";

export class BookDetailModal extends Modal {
  private activeTab: DetailTab = "overview";
  private book: ReadingBookDetails;
  private errorMessage = "";

  constructor(
    private readonly plugin: ReadMindPlugin,
    book: ReadingBookDetails,
  ) {
    super(plugin.app);
    this.book = book;
  }

  onOpen(): void {
    this.titleEl.setText(`ReadMind / ${this.book.title}`);
    this.render();
  }

  private render(): void {
    this.contentEl.empty();
    const tabs = this.contentEl.createDiv({ cls: "readmind-detail-tabs" });
    this.addTab(tabs, "overview", "概览");
    this.addTab(tabs, "annotations", "我的笔记");
    this.addTab(tabs, "analysis", "AI 分析");

    if (this.errorMessage) {
      this.contentEl.createEl("p", { cls: "readmind-error", text: this.errorMessage });
    }

    const panel = this.contentEl.createDiv();
    if (this.activeTab === "overview") this.renderOverview(panel);
    if (this.activeTab === "annotations") this.renderAnnotations(panel);
    if (this.activeTab === "analysis") this.renderAnalysis(panel);
  }

  private addTab(container: HTMLElement, tab: DetailTab, label: string): void {
    const button = container.createEl("button", {
      cls: `readmind-detail-tab${this.activeTab === tab ? " is-active" : ""}`,
      text: label,
    });
    button.addEventListener("click", () => {
      this.activeTab = tab;
      this.render();
    });
  }

  private renderOverview(container: HTMLElement): void {
    const record = this.plugin.store.data.syncIndex[this.book.id];
    container.createEl("h3", { text: this.book.title });
    container.createEl("p", { text: `作者：${this.book.author ?? "未知"}` });
    container.createEl("p", { text: `阅读状态：${readingStatusLabel(this.book.readingStatus)}` });
    if (this.book.readingProgress !== undefined) {
      container.createEl("p", { text: `阅读进度：${this.book.readingProgress}%` });
    }
    container.createEl("p", { text: `阅读时长：${formatReadingDuration(this.book.readingTimeMinutes)}` });
    container.createEl("p", { text: `划线：${this.book.annotationCount}，想法：${this.book.thoughtCount}` });
    container.createEl("p", { text: `同步状态：${syncStatusLabel(record?.syncStatus)}` });
    container.createEl("p", { text: `AI 分析：${aiStatusLabel(record?.aiStatus)}` });
    if (record?.lastSyncedAt) {
      container.createEl("p", { text: `最近同步：${formatUserDateTime(record.lastSyncedAt) ?? "未知"}` });
    }
    if (record?.sourceFilePath) {
      container.createEl("p", { text: `本地笔记：${record.sourceFilePath}` });
    }

    new Setting(container)
      .addButton((button) => {
        button.setButtonText("刷新详情").onClick(() => this.refreshDetails());
      })
      .addButton((button) => {
        button
          .setCta()
          .setButtonText("同步此书")
          .onClick(async () => {
            await this.plugin.syncBooks([this.book.id]);
            await this.refreshDetails();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("打开本地笔记")
          .setDisabled(!record?.sourceFilePath)
          .onClick(async () => {
            if (record?.sourceFilePath) {
              await this.plugin.openMarkdownFile(record.sourceFilePath);
            }
          });
      })
      .addButton((button) => {
        const canAnalyze = Boolean(record?.sourceFilePath && record.sourceFragments?.length);
        button
          .setButtonText(record?.aiStatus === "stale" ? "重新分析此书" : "AI 分析此书")
          .setDisabled(!canAnalyze || record?.aiStatus === "analyzing")
          .onClick(async () => {
            if (!this.plugin.store.data.settings.ai.enabled) {
              new Notice("请先前往 ReadMind 设置配置并启用 AI。");
              this.plugin.openSettings();
              return;
            }
            if (!canAnalyze) {
              new Notice("请先同步此书，生成可引用的来源笔记。");
              return;
            }
            await this.plugin.analyzeBooks([this.book.id]);
            await this.refreshDetails();
            this.activeTab = "analysis";
            this.render();
          });
      });
  }

  private async refreshDetails(): Promise<void> {
    try {
      this.errorMessage = "";
      this.book = await this.plugin.getBookDetails(this.book.id);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : "笔记读取失败，请重试或重新登录。";
      new Notice(this.errorMessage);
    }
    this.titleEl.setText(`ReadMind / ${this.book.title}`);
    this.render();
  }

  private renderAnnotations(container: HTMLElement): void {
    const fragments = this.plugin.store.data.syncIndex[this.book.id]?.sourceFragments;
    if (fragments?.length) {
      for (const group of groupSourceFragmentsByChapter(fragments)) {
        container.createEl("h3", { text: group.chapterTitle });
        for (const highlight of highlightsInGroup(group)) {
          const item = container.createDiv({ cls: "readmind-annotation" });
          item.createEl("div", { cls: "readmind-muted", text: "划线" });
          item.createEl("p", { text: highlight.text });
        }
        const thoughts = group.fragments.filter((fragment) => fragment.type === "thought" || fragment.type === "review");
        for (const thought of thoughts) {
          const item = container.createDiv({ cls: "readmind-annotation" });
          item.createEl("div", { cls: "readmind-muted", text: "想法" });
          item.createEl("p", { text: thought.text });
        }
      }
      return;
    }

    if (this.book.annotations.length === 0) {
      container.createEl("p", { cls: "readmind-muted", text: this.errorMessage || "暂无笔记。" });
      return;
    }

    for (const annotation of this.book.annotations) {
      const item = container.createDiv({ cls: "readmind-annotation" });
      item.createEl("div", {
        cls: "readmind-muted",
        text: annotation.type === "highlight" ? "划线" : "想法",
      });
      item.createEl("p", { text: annotation.text });
    }
  }

  private renderAnalysis(container: HTMLElement): void {
    const syncRecord = this.plugin.store.data.syncIndex[this.book.id];
    const analysis = this.plugin.store.data.analysisIndex[this.book.id];
    container.createEl("p", { text: `状态：${aiStatusLabel(syncRecord?.aiStatus)}` });

    if (!syncRecord?.sourceFilePath || !syncRecord.sourceFragments?.length) {
      container.createEl("p", { cls: "readmind-muted", text: "请先同步此书，生成可引用的来源笔记。" });
      return;
    }

    new Setting(container)
      .addButton((button) => {
        button
          .setButtonText(syncRecord.aiStatus === "stale" ? "重新分析此书" : "AI 分析此书")
          .setDisabled(syncRecord.aiStatus === "analyzing")
          .onClick(async () => {
            if (!this.plugin.store.data.settings.ai.enabled) {
              new Notice("请先前往 ReadMind 设置配置并启用 AI。");
              this.plugin.openSettings();
              return;
            }
            await this.plugin.analyzeBooks([this.book.id]);
            await this.refreshDetails();
            this.activeTab = "analysis";
            this.render();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("打开分析笔记")
          .setDisabled(!analysis?.analysisFilePath)
          .onClick(async () => {
            if (analysis?.analysisFilePath) {
              await this.plugin.openMarkdownFile(analysis.analysisFilePath);
            }
          });
      });

    if (!analysis) {
      container.createEl("p", { cls: "readmind-muted", text: "尚未分析。" });
      return;
    }

    const evidence = new Map((analysis.sourceFragments ?? []).map((fragment) => [fragment.fragmentId, fragment]));
    container.createEl("h3", { text: "核心问题" });
    this.renderList(container, analysis.result.centralQuestions);
    container.createEl("h3", { text: "观点摘要" });
    container.createEl("p", { text: analysis.result.summary });
    container.createEl("h3", { text: "主题" });
    for (const theme of analysis.result.themes) {
      const item = container.createDiv({ cls: "readmind-annotation" });
      item.createEl("strong", { text: theme.name });
      item.createEl("p", { text: theme.rationale });
      this.renderEvidenceLinks(item, theme.sourceFragmentIds, evidence);
    }
    container.createEl("h3", { text: "概念候选" });
    for (const concept of analysis.result.concepts) {
      const item = container.createDiv({ cls: "readmind-annotation" });
      item.createEl("strong", { text: `${concept.name}（${this.confidenceLabel(concept.confidence)}）` });
      item.createEl("p", { text: concept.explanation });
      item.createEl("p", {
        cls: "readmind-muted",
        text: `可信度：${this.confidenceLabel(concept.confidence)} · 来源依据 ${concept.sourceFragmentIds.length} 条 · 整理状态：${this.conceptStatusLabel(concept.name)}`,
      });
      this.renderEvidenceLinks(item, concept.sourceFragmentIds, evidence);
      const card = this.plugin.findKnowledgeCardForConcept(concept.name);
      new Setting(item)
        .addButton((button) => {
          button
            .setButtonText("查看依据")
            .setDisabled(concept.sourceFragmentIds.length === 0)
            .onClick(async () => {
              const first = concept.sourceFragmentIds.map((id) => evidence.get(id)).find(Boolean);
              if (first) await this.plugin.openMarkdownBlock(first.sourceNotePath, first.blockId);
            });
        })
        .addButton((button) => {
          button
            .setButtonText(card ? "添加到已有卡片" : "创建知识卡片")
            .setDisabled(concept.sourceFragmentIds.length === 0)
            .onClick(async () => {
              await this.plugin.createKnowledgeCardFromConcept(this.book.id, concept.name);
              this.render();
            });
        })
        .addButton((button) => {
          button
            .setButtonText(card ? "打开知识卡片" : "暂不整理")
            .onClick(async () => {
              if (card) {
                await this.plugin.openMarkdownFile(card.filePath);
              } else {
                await this.plugin.dismissConceptCandidate(this.book.id, concept.name);
                this.render();
              }
            });
        });
    }
    container.createEl("h3", { text: "值得继续思考的问题" });
    this.renderList(container, analysis.result.reflectionQuestions);
  }

  private renderList(container: HTMLElement, values: string[]): void {
    const list = container.createEl("ul");
    for (const value of values.length ? values : ["暂无"]) {
      list.createEl("li", { text: value });
    }
  }

  private renderEvidenceLinks(
    container: HTMLElement,
    fragmentIds: string[],
    evidence: Map<string, { sourceNotePath: string; blockId: string }>,
  ): void {
    const row = container.createDiv({ cls: "readmind-muted" });
    row.createSpan({ text: "依据：" });
    fragmentIds.forEach((fragmentId, index) => {
      const fragment = evidence.get(fragmentId);
      if (!fragment) return;
      const link = row.createEl("a", { text: index === 0 ? "查看来源摘录" : "、查看来源摘录" });
      link.addEventListener("click", async (event) => {
        event.preventDefault();
        await this.plugin.openMarkdownBlock(fragment.sourceNotePath, fragment.blockId);
      });
    });
  }

  private confidenceLabel(value: string): string {
    if (value === "high") return "高";
    if (value === "low") return "低";
    return "中";
  }

  private conceptStatusLabel(conceptName: string): string {
    const analysis = this.plugin.store.data.analysisIndex[this.book.id];
    const status = analysis?.conceptCandidates?.[normalizeKnowledgeTitle(conceptName)]?.status;
    if (status === "card_created") return "已创建知识卡片";
    if (status === "attached_to_existing") return "已加入已有卡片";
    if (status === "dismissed") return "暂不整理";
    return "尚未整理";
  }
}
