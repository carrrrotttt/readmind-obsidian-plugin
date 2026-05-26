import { ButtonComponent, ItemView, Notice, Setting, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_BOOKSHELF } from "./constants";
import { BookDetailModal } from "./BookDetailModal";
import { buildBookCardMeta } from "./displayText";
import type ReadMindPlugin from "./main";
import type { ReadingBook } from "./types";

type SyncFilter = "all" | "not_synced" | "synced" | "failed";
type ReadingFilter = "all" | "reading" | "finished" | "unknown";
type SortMode = "updated" | "annotations" | "thoughts" | "title";

export class BookshelfView extends ItemView {
  private books: ReadingBook[] = [];
  private query = "";
  private filter: SyncFilter = "all";
  private readingFilter: ReadingFilter = "all";
  private sortMode: SortMode = "updated";
  private errorMessage = "";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ReadMindPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_BOOKSHELF;
  }

  getDisplayText(): string {
    return "ReadMind / 书脉";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      this.errorMessage = "";
      this.books = await this.plugin.listBooks();
    } catch (error) {
      this.books = [];
      this.errorMessage = error instanceof Error ? error.message : "书架加载失败。";
      new Notice(this.errorMessage);
    }
    this.render();
  }

  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("h2", { text: "ReadMind / 书脉" });
    this.renderToolbar(container as HTMLElement);
    this.renderBooks(container as HTMLElement);
  }

  private renderToolbar(container: HTMLElement): void {
    const toolbar = container.createDiv({ cls: "readmind-toolbar" });
    const status = this.plugin.getDataSourceStatusLabel();
    toolbar.createEl("div", { cls: "readmind-source-status", text: `数据来源：${status}` });

    const actions = toolbar.createDiv({ cls: "readmind-toolbar-actions readmind-icon-toolbar" });
    this.addToolbarIconButton(actions, "refresh-cw", "刷新书架", async () => {
      await this.plugin.refreshBookshelf();
      await this.refresh();
    });
    this.addToolbarIconButton(actions, "download-cloud", "同步所选", async () => {
      await this.plugin.syncSelectedBooks();
      await this.refresh();
    });
    this.addToolbarIconButton(actions, "scroll-text", "同步日志", () => this.plugin.openSyncLogs());
    this.addToolbarIconButton(actions, "settings", "设置", () => this.plugin.openSettings());
    this.addToolbarIconButton(actions, "library", "知识卡片", () => this.plugin.openLinkSuggestions(), true);
    this.addToolbarIconButton(actions, "network", "关联建议", () => this.plugin.openLinkSuggestions(), true);
    this.addToolbarIconButton(actions, "bar-chart-3", "阅读回顾", () => this.plugin.openReadingJourney(), true);

    const filters = toolbar.createDiv({ cls: "readmind-toolbar-filters" });
    new Setting(filters)
      .addText((text) => {
        text
          .setPlaceholder("搜索书名或作者")
          .setValue(this.query)
          .onChange((value) => {
            this.query = value;
            this.render();
          });
      })
      .addDropdown((dropdown) => {
        dropdown
          .addOption("all", "全部")
          .addOption("not_synced", "尚未同步")
          .addOption("synced", "已同步")
          .addOption("failed", "同步失败")
          .setValue(this.filter)
          .onChange((value) => {
            this.filter = value as SyncFilter;
            this.render();
          });
      })
      .addDropdown((dropdown) => {
        dropdown
          .addOption("all", "全部阅读状态")
          .addOption("reading", "在读")
          .addOption("finished", "已读完")
          .addOption("unknown", "暂无阅读状态")
          .setValue(this.readingFilter)
          .onChange((value) => {
            this.readingFilter = value as ReadingFilter;
            this.render();
          });
      })
      .addDropdown((dropdown) => {
        dropdown
          .addOption("updated", "按最近更新")
          .addOption("annotations", "按划线数")
          .addOption("thoughts", "按想法数")
          .addOption("title", "按书名")
          .setValue(this.sortMode)
          .onChange((value) => {
            this.sortMode = value as SortMode;
            this.render();
          });
      });
  }

  private renderBooks(container: HTMLElement): void {
    const filtered = this.books.filter((book) => this.matches(book)).sort((left, right) => this.compareBooks(left, right));
    if (filtered.length === 0) {
      container.createEl("p", {
        cls: "readmind-muted",
        text: this.errorMessage || (this.books.length === 0 ? "暂无数据。请先连接微信读书官方 API，或在设置中选择示例数据 / 本地导入。" : "没有匹配的书籍。"),
      });
      return;
    }

    const grid = container.createDiv({ cls: "readmind-books" });
    for (const book of filtered) {
      this.renderBookCard(grid, book);
    }
  }

  private renderBookCard(container: HTMLElement, book: ReadingBook): void {
    const selected = this.plugin.store.isSelected(book.id);
    const record = this.plugin.store.data.syncIndex[book.id];
    const card = container.createDiv({ cls: `readmind-book readmind-bookshelf-card${selected ? " is-selected" : ""}` });
    const body = card.createDiv({ cls: "readmind-book-card-body" });
    const info = body.createDiv({ cls: "readmind-book-card-info" });
    const coverSlot = body.createDiv({ cls: "readmind-book-card-cover" });

    info.createDiv({ cls: "readmind-book-title", text: book.title });
    for (const item of buildBookCardMeta(book, record)) {
      info.createDiv({ cls: "readmind-muted", text: item });
    }

    if (book.coverUrl) {
      const cover = coverSlot.createEl("img", { attr: { src: book.coverUrl, alt: book.title } });
      cover.addClass("readmind-cover");
    } else {
      coverSlot.createDiv({ cls: "readmind-cover-placeholder", text: "ReadMind" });
    }

    const actions = card.createDiv({ cls: "readmind-book-card-actions" });
    new Setting(actions)
      .addToggle((toggle) => {
        toggle.setValue(selected).onChange(async (value) => {
          await this.plugin.store.setSelected(book.id, value);
          this.render();
        });
      })
      .addButton((button) => {
        button.setButtonText("查看详情").onClick(async () => {
          const detail = await this.plugin.getBookDetails(book.id);
          new BookDetailModal(this.plugin, detail).open();
        });
      })
      .addButton((button) => {
        button.setButtonText("同步").onClick(async () => {
          await this.plugin.syncBooks([book.id]);
          await this.refresh();
        });
      });
  }

  private addToolbarIconButton(container: HTMLElement, icon: string, label: string, onClick: () => void | Promise<void>, showText = false): void {
    new Setting(container)
      .addButton((button) => {
        this.configureIconButton(button, icon, label, showText);
        button.onClick(onClick);
      });
  }

  private configureIconButton(button: ButtonComponent, icon: string, label: string, showText: boolean): void {
    button.setIcon(icon).setTooltip(label);
    if (showText) button.setButtonText(label);
    button.buttonEl.setAttribute("aria-label", label);
    button.buttonEl.addClass(showText ? "readmind-icon-text-button" : "readmind-icon-button");
  }

  private matches(book: ReadingBook): boolean {
    const record = this.plugin.store.data.syncIndex[book.id];
    const syncStatus = record?.syncStatus ?? "not_synced";
    const q = this.query.trim().toLowerCase();
    const queryOk = !q || `${book.title} ${book.author ?? ""}`.toLowerCase().includes(q);
    const filterOk = this.filter === "all" || syncStatus === this.filter;
    const readingOk = this.readingFilter === "all" || book.readingStatus === this.readingFilter;
    return queryOk && filterOk && readingOk;
  }

  private compareBooks(left: ReadingBook, right: ReadingBook): number {
    if (this.sortMode === "annotations") return right.annotationCount - left.annotationCount;
    if (this.sortMode === "thoughts") return right.thoughtCount - left.thoughtCount;
    if (this.sortMode === "title") return left.title.localeCompare(right.title);
    return (right.sourceUpdatedAt ?? right.lastReadAt ?? "").localeCompare(left.sourceUpdatedAt ?? left.lastReadAt ?? "");
  }
}
