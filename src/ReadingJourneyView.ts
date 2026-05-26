import { ItemView, Notice, Setting, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_READING_JOURNEY } from "./constants";
import { BookDetailModal } from "./BookDetailModal";
import {
  formatCompareRatio,
  formatReadDuration,
  formatTrendLabel,
  preferTimeHourLabel,
  READING_PERIOD_LABELS,
} from "./readingJourneyService";
import { reviewIndexKey } from "./readingReviewService";
import type ReadMindPlugin from "./main";
import type { ReadingJourneySummary, ReadingPeriod, ReadingReviewPeriod } from "./types";

const PERIODS: ReadingPeriod[] = ["weekly", "monthly", "annually", "overall"];

export class ReadingJourneyView extends ItemView {
  private period: ReadingPeriod = "monthly";
  private summary: ReadingJourneySummary | null = null;
  private loading = false;
  private errorMessage = "";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ReadMindPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_READING_JOURNEY;
  }

  getDisplayText(): string {
    return "ReadMind / 阅读回顾";
  }

  async onOpen(): Promise<void> {
    await this.loadSummary();
  }

  private async loadSummary(): Promise<void> {
    if (!this.plugin.canLoadReadingJourney()) {
      this.summary = null;
      this.errorMessage = "";
      this.loading = false;
      this.render();
      return;
    }
    this.loading = true;
    this.errorMessage = "";
    this.render();
    try {
      this.summary = await this.plugin.loadReadingJourney(this.period);
    } catch (error) {
      this.summary = null;
      this.errorMessage = error instanceof Error ? error.message : "阅读统计加载失败。";
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("readmind-reading-journey-view");
    container.createEl("h2", { text: "ReadMind / 阅读回顾" });
    this.renderHeader(container);

    if (!this.plugin.canLoadReadingJourney()) {
      this.renderSetupState(container);
      return;
    }
    if (this.loading) {
      container.createEl("p", { cls: "readmind-muted", text: "正在读取阅读统计……" });
      return;
    }
    if (this.errorMessage) {
      this.renderErrorState(container);
      return;
    }
    if (!this.summary || !hasAnyData(this.summary)) {
      container.createEl("p", { cls: "readmind-muted", text: "这个周期还没有可展示的阅读记录。" });
      return;
    }

    this.renderOverview(container, this.summary);
    this.renderReviewActions(container, this.summary);
    this.renderTrend(container, this.summary);
    this.renderTopBooks(container, this.summary);
    this.renderReadingStats(container, this.summary);
    this.renderPreferences(container, this.summary);
    this.renderReadMindSummary(container);
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: "readmind-journey-header" });
    const periods = header.createDiv({ cls: "readmind-journey-periods" });
    for (const period of PERIODS) {
      const button = periods.createEl("button", { text: READING_PERIOD_LABELS[period] });
      button.addClass("readmind-period-button");
      if (this.period === period) button.addClass("is-active");
      button.addEventListener("click", async () => {
        this.period = period;
        await this.loadSummary();
      });
    }
    new Setting(header).addButton((button) => button.setButtonText("刷新数据").onClick(() => this.loadSummary()));
  }

  private renderSetupState(container: HTMLElement): void {
    const empty = container.createDiv({ cls: "readmind-empty-state" });
    empty.createEl("p", { cls: "readmind-muted", text: "请先在设置中连接微信读书官方 API，才能查看阅读回顾。" });
    new Setting(empty).addButton((button) => button.setButtonText("打开设置").onClick(() => this.plugin.openSettings()));
  }

  private renderErrorState(container: HTMLElement): void {
    const empty = container.createDiv({ cls: "readmind-empty-state" });
    empty.createEl("p", { cls: "readmind-muted", text: "阅读统计加载失败，请稍后重试或检查连接设置。" });
    new Setting(empty)
      .addButton((button) => button.setButtonText("重新加载").onClick(() => this.loadSummary()))
      .addButton((button) => button.setButtonText("打开设置").onClick(() => this.plugin.openSettings()));
  }

  private renderOverview(container: HTMLElement, summary: ReadingJourneySummary): void {
    const grid = container.createDiv({ cls: "readmind-journey-overview" });
    this.renderMetricCard(grid, "阅读天数", summary.readDays === undefined ? "暂无数据" : `${summary.readDays} 天`);
    this.renderMetricCard(grid, "总阅读时长", summary.totalReadSeconds === undefined ? "暂无数据" : formatReadDuration(summary.totalReadSeconds));
    this.renderMetricCard(grid, "自然日均", summary.naturalDayAverageSeconds === undefined ? "暂无数据" : formatReadDuration(summary.naturalDayAverageSeconds));
    this.renderMetricCard(grid, "较上周期", formatCompareRatio(summary.compareRatio));
  }

  private renderReviewActions(container: HTMLElement, summary: ReadingJourneySummary): void {
    const panel = container.createDiv({ cls: "readmind-journey-review-actions" });
    if (summary.period === "overall") {
      panel.createEl("p", { cls: "readmind-muted", text: "总计适合查看长期统计。生成阶段回顾请选择本周、本月或本年。" });
      return;
    }
    const key = reviewIndexKey(summary.period as ReadingReviewPeriod, summary.baseTime);
    const record = this.plugin.store.data.readingReviewIndex[key];
    if (record) {
      panel.createEl("p", { cls: "readmind-muted", text: `最近生成时间：${record.generatedAt.slice(0, 10)}` });
      new Setting(panel)
        .addButton((button) => button.setButtonText("打开已有回顾").onClick(() => this.plugin.openMarkdownFile(record.filePath)))
        .addButton((button) => button.setButtonText("重新生成").onClick(() => this.plugin.openReadingReviewConfirm(summary)));
      return;
    }
    new Setting(panel).addButton((button) => button.setButtonText("生成阶段回顾").setCta().onClick(() => this.plugin.openReadingReviewConfirm(summary)));
  }

  private renderMetricCard(container: HTMLElement, label: string, value: string): void {
    const card = container.createDiv({ cls: "readmind-journey-metric" });
    card.createEl("span", { cls: "readmind-muted", text: label });
    card.createEl("strong", { text: value });
  }

  private renderTrend(container: HTMLElement, summary: ReadingJourneySummary): void {
    container.createEl("h3", { text: "阅读趋势" });
    if (summary.timeBuckets.length === 0) {
      container.createEl("p", { cls: "readmind-muted", text: "当前周期暂无阅读趋势数据。" });
      return;
    }
    const max = Math.max(...summary.timeBuckets.map((item) => item.seconds), 1);
    const chart = container.createDiv({ cls: "readmind-journey-trend" });
    for (const item of summary.timeBuckets) {
      const bar = chart.createDiv({ cls: "readmind-journey-trend-bar" });
      bar.style.height = `${Math.max(8, Math.round(item.seconds / max * 120))}px`;
      bar.setAttribute("title", `${formatTrendLabel(summary.period, item.timestamp)} · ${formatReadDuration(item.seconds)}`);
      bar.createSpan({ text: formatTrendLabel(summary.period, item.timestamp) });
    }
  }

  private renderTopBooks(container: HTMLElement, summary: ReadingJourneySummary): void {
    if (summary.topBooks.length === 0) return;
    container.createEl("h3", { text: "投入最多的书" });
    const list = container.createDiv({ cls: "readmind-journey-top-books" });
    for (const book of summary.topBooks) {
      const item = list.createDiv({ cls: "readmind-journey-book" });
      if (book.cover) item.createEl("img", { cls: "readmind-journey-book-cover", attr: { src: book.cover, alt: book.title } });
      const info = item.createDiv({ cls: "readmind-journey-book-info" });
      info.createEl("strong", { text: book.title });
      info.createEl("p", { cls: "readmind-muted", text: [book.author, book.isAudio ? "有声内容" : undefined].filter(Boolean).join(" · ") });
      info.createEl("p", { text: `当前周期阅读 ${formatReadDuration(book.readSeconds)}` });
      if (book.tags?.length) info.createEl("p", { cls: "readmind-muted", text: book.tags.join(" · ") });
      const actions = item.createDiv({ cls: "readmind-journey-book-actions" });
      new Setting(actions)
        .addButton((button) => button.setButtonText("查看书籍详情").setDisabled(!book.bookId).onClick(() => this.openBookDetails(book.bookId)))
        .addButton((button) => {
          const sourcePath = book.bookId ? this.plugin.store.data.syncIndex[book.bookId]?.sourceFilePath : undefined;
          button.setButtonText("打开本地笔记").setDisabled(!sourcePath).onClick(() => {
            if (sourcePath) void this.plugin.openMarkdownFile(sourcePath);
          });
        });
    }
  }

  private renderReadingStats(container: HTMLElement, summary: ReadingJourneySummary): void {
    if (summary.readingStats.length === 0) return;
    container.createEl("h3", { text: "阅读统计摘要" });
    const grid = container.createDiv({ cls: "readmind-journey-stats" });
    for (const item of summary.readingStats) this.renderMetricCard(grid, item.label, item.valueText);
  }

  private renderPreferences(container: HTMLElement, summary: ReadingJourneySummary): void {
    const hasPreference = summary.categoryPreferences.length > 0
      || summary.preferredTimeLabel
      || summary.preferredTimeSeconds?.length
      || summary.preferredAuthors?.length
      || summary.preferredPublishers?.length;
    if (!hasPreference) return;
    container.createEl("h3", { text: "阅读偏好" });
    if (summary.categoryPreferences.length > 0) {
      const max = Math.max(...summary.categoryPreferences.map((item) => item.seconds ?? item.relativeValue ?? item.bookCount ?? 0), 1);
      const list = container.createDiv({ cls: "readmind-journey-preference-bars" });
      for (const item of summary.categoryPreferences) {
        const row = list.createDiv({ cls: "readmind-journey-preference-row" });
        row.createSpan({ text: item.title });
        const bar = row.createDiv({ cls: "readmind-journey-preference-bar" });
        const value = item.seconds ?? item.relativeValue ?? item.bookCount ?? 0;
        bar.createDiv({ cls: "readmind-journey-preference-fill" }).style.width = `${Math.max(4, Math.round(value / max * 100))}%`;
        row.createSpan({ cls: "readmind-muted", text: item.seconds !== undefined ? formatReadDuration(item.seconds) : `${value}` });
      }
    }
    if (summary.preferredTimeLabel || summary.preferredTimeSeconds?.length) {
      container.createEl("p", { text: summary.preferredTimeLabel ?? "偏好时段" });
      if (summary.preferredTimeSeconds?.length) {
        const max = Math.max(...summary.preferredTimeSeconds, 1);
        const strip = container.createDiv({ cls: "readmind-journey-time-strip" });
        summary.preferredTimeSeconds.forEach((seconds, index) => {
          const slot = strip.createDiv({ cls: "readmind-journey-time-slot" });
          slot.style.height = `${Math.max(6, Math.round(seconds / max * 56))}px`;
          slot.setAttribute("title", `${preferTimeHourLabel(index)} · ${formatReadDuration(seconds)}`);
        });
      }
    }
    if (summary.preferredAuthors?.length) {
      container.createEl("p", { cls: "readmind-muted", text: `偏好作者：${summary.preferredAuthors.map((item) => `${item.name}${item.readTimeText ? `（${item.readTimeText}）` : ""}`).join("、")}` });
    }
    if (summary.preferredPublishers?.length) {
      container.createEl("p", { cls: "readmind-muted", text: `偏好出版社：${summary.preferredPublishers.map((item) => item.name).join("、")}` });
    }
  }

  private renderReadMindSummary(container: HTMLElement): void {
    container.createEl("h3", { text: "ReadMind 沉淀" });
    const cards = Object.values(this.plugin.store.data.cardIndex);
    const relations = Object.values(this.plugin.store.data.confirmedRelations);
    const grid = container.createDiv({ cls: "readmind-journey-overview" });
    this.renderMetricCard(grid, "知识卡片", `${cards.length} 张`);
    this.renderMetricCard(grid, "已确认关系", `${relations.length} 条`);
    this.renderMetricCard(grid, "知识网络节点", `${cards.length} 个`);
    this.renderMetricCard(grid, "知识网络连线", `${relations.length} 条`);
    const actions = container.createDiv({ cls: "readmind-journey-actions" });
    new Setting(actions)
      .addButton((button) => button.setButtonText("打开知识卡片").onClick(() => this.plugin.openLinkSuggestions()))
      .addButton((button) => button.setButtonText("打开知识网络").onClick(() => this.plugin.openKnowledgeNetwork()));
    container.createEl("p", { cls: "readmind-muted", text: "这里展示的是当前累计沉淀，不按阅读统计周期过滤。" });
  }

  private async openBookDetails(bookId: string | undefined): Promise<void> {
    if (!bookId) return;
    try {
      const details = await this.plugin.getBookDetails(bookId);
      new BookDetailModal(this.plugin, details).open();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "无法打开书籍详情。");
    }
  }
}

function hasAnyData(summary: ReadingJourneySummary): boolean {
  return Boolean(
    summary.readDays
    || summary.totalReadSeconds
    || summary.naturalDayAverageSeconds
    || summary.timeBuckets.length
    || summary.topBooks.length
    || summary.readingStats.length
    || summary.categoryPreferences.length
    || summary.preferredTimeLabel
    || summary.preferredTimeSeconds?.length
    || summary.preferredAuthors?.length
    || summary.preferredPublishers?.length,
  );
}
