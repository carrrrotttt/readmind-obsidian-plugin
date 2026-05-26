import { Modal, Setting } from "obsidian";
import { formatCompareRatio, formatReadDuration } from "./readingJourneyService";
import {
  buildReadingReviewPreview,
  hasReviewEvidence,
  prepareReadingReview,
  type ReadingReviewOptions,
  type ReadingReviewPreview,
} from "./readingReviewService";
import type ReadMindPlugin from "./main";
import type { ReadingJourneySummary } from "./types";

export class ReadingReviewConfirmModal extends Modal {
  private options: ReadingReviewOptions;
  private preview: ReadingReviewPreview;

  constructor(
    private readonly plugin: ReadMindPlugin,
    private readonly summary: ReadingJourneySummary,
    private readonly onConfirm: (preview: ReadingReviewPreview) => void,
  ) {
    super(plugin.app);
    const prepared = prepareReadingReview(plugin.store.data, summary);
    this.options = prepared.options;
    this.preview = prepared.preview;
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.preview = buildReadingReviewPreview(this.plugin.store.data, this.summary, this.options);
    contentEl.createEl("h2", { text: `生成 ${this.preview.input.periodLabel}阅读回顾` });
    contentEl.createEl("h3", { text: "阅读概览" });
    const stats = contentEl.createEl("ul");
    stats.createEl("li", { text: `阅读天数：${this.summary.readDays === undefined ? "暂无数据" : `${this.summary.readDays} 天`}` });
    stats.createEl("li", { text: `总阅读时长：${this.summary.totalReadSeconds === undefined ? "暂无数据" : formatReadDuration(this.summary.totalReadSeconds)}` });
    stats.createEl("li", { text: `自然日均：${this.summary.naturalDayAverageSeconds === undefined ? "暂无数据" : formatReadDuration(this.summary.naturalDayAverageSeconds)}` });
    stats.createEl("li", { text: `较上周期：${formatCompareRatio(this.summary.compareRatio)}` });

    contentEl.createEl("h3", { text: "可纳入的书籍" });
    const list = contentEl.createDiv({ cls: "readmind-review-book-list" });
    for (const book of this.preview.candidates) {
      new Setting(list)
        .setName(book.title)
        .setDesc([
          book.author,
          `本周期可确认划线 / 想法 ${book.confirmedEvidenceCount} 条`,
          `时间未确认 ${book.unconfirmedEvidenceCount} 条`,
          book.hasKnowledgeCards ? "已有知识卡片" : "暂无知识卡片",
          book.hasConfirmedRelations ? "已有确认关系" : "暂无确认关系",
        ].filter(Boolean).join(" · "))
        .addToggle((toggle) => toggle
          .setValue(book.selected)
          .setDisabled(!book.selectable)
          .onChange((value) => {
            const next = new Set(this.options.selectedBookIds);
            if (value) next.add(book.bookId);
            else next.delete(book.bookId);
            this.options.selectedBookIds = [...next];
            this.render();
          }));
    }

    contentEl.createEl("h3", { text: "证据范围" });
    this.addOption(contentEl, "本周期可确认的划线与想法", "includePeriodEvidence");
    this.addOption(contentEl, "时间未确认的补充来源证据", "includeUnconfirmedEvidence");
    this.addOption(contentEl, "本期新建知识卡片", "includePeriodCards");
    this.addOption(contentEl, "本期确认关系", "includePeriodRelations");
    this.addOption(contentEl, "当前累计知识沉淀", "includeCumulativeKnowledge");
    if (this.options.includeUnconfirmedEvidence) {
      contentEl.createEl("p", { cls: "readmind-muted", text: "时间未确认的补充来源证据只作为背景，不会被写成本期新增。" });
    }
    if (this.options.includeCumulativeKnowledge) {
      contentEl.createEl("p", { cls: "readmind-muted", text: "当前累计知识沉淀不代表全部形成于本周期。" });
    }

    contentEl.createEl("h3", { text: "发送内容预览" });
    const preview = contentEl.createEl("ul");
    preview.createEl("li", { text: `${this.preview.counts.selectedBooks} 本书的元数据` });
    preview.createEl("li", { text: `${this.preview.counts.periodEvidence} 条本期可确认划线 / 想法` });
    preview.createEl("li", { text: `${this.preview.counts.unconfirmedEvidence} 条时间未确认的补充证据` });
    preview.createEl("li", { text: `${this.preview.counts.periodCards} 张本期新建知识卡片` });
    preview.createEl("li", { text: `${this.preview.counts.periodRelations} 条本期确认关系` });
    if (this.options.includeCumulativeKnowledge) {
      preview.createEl("li", { text: `${this.preview.counts.cumulativeCards} 张累计知识卡片 / ${this.preview.counts.cumulativeRelations} 条累计关系` });
    }

    const promptLength = JSON.stringify(this.preview.input).length;
    const tooLarge = promptLength > this.plugin.store.data.settings.ai.maxInputChars;
    const noEvidence = !hasReviewEvidence(this.preview.input);
    if (noEvidence) contentEl.createEl("p", { cls: "readmind-muted", text: "当前选择没有可用于回顾的阅读证据。" });
    if (tooLarge) contentEl.createEl("p", { cls: "readmind-muted", text: "选择内容过多，请减少书籍或证据范围后重试。" });

    new Setting(contentEl)
      .addButton((button) => button
        .setButtonText("确认生成")
        .setCta()
        .setDisabled(noEvidence || tooLarge)
        .onClick(() => {
          this.close();
          this.onConfirm(this.preview);
        }))
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()));
  }

  private addOption(container: HTMLElement, label: string, key: keyof ReadingReviewOptions): void {
    if (key === "selectedBookIds") return;
    new Setting(container)
      .setName(label)
      .addToggle((toggle) => toggle.setValue(Boolean(this.options[key])).onChange((value) => {
        this.options = { ...this.options, [key]: value };
        this.render();
      }));
  }
}
