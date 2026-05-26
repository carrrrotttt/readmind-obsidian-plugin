import { ItemView, Notice, Setting, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_LINK_SUGGESTIONS } from "./constants";
import { buildRelationInputCards, relationStatusLabel, relationTypeLabel } from "./relationService";
import type ReadMindPlugin from "./main";
import type { ConfirmedRelation, KnowledgeCardRecord, RelationSuggestion, RelationSuggestionStatus, RelationType } from "./types";

type ViewMode = "cards" | "suggestions" | "network";
type SuggestionFilter = "all" | "pending" | "accepted" | "later" | "dismissed";

export class LinkSuggestionsView extends ItemView {
  private mode: ViewMode = "cards";
  private filter: SuggestionFilter = "all";
  private selectedCardIds = new Set<string>();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ReadMindPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_LINK_SUGGESTIONS;
  }

  getDisplayText(): string {
    return "ReadMind 关联建议";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.createEl("h2", { text: this.mode === "cards" ? "ReadMind / 知识卡片" : "ReadMind / 关联建议" });
    this.renderTabs(container);
    if (this.mode === "cards") this.renderCards(container);
    if (this.mode === "suggestions") this.renderSuggestions(container);
  }

  private renderTabs(container: HTMLElement): void {
    const tabs = container.createDiv({ cls: "readmind-relation-tabs" });
    new Setting(tabs)
      .addButton((button) => {
        button.setButtonText("知识卡片").onClick(() => {
          this.mode = "cards";
          this.render();
        });
      })
      .addButton((button) => {
        button.setButtonText("关联建议").onClick(() => {
          this.mode = "suggestions";
          this.render();
        });
      })
      .addButton((button) => {
        button.setButtonText("知识网络").onClick(() => this.plugin.openKnowledgeNetwork());
      });
  }

  private renderCards(container: HTMLElement): void {
    const cards = Object.values(this.plugin.store.data.cardIndex);
    if (cards.length === 0) {
      container.createEl("p", { cls: "readmind-muted", text: "暂无知识卡片。请先从 AI 分析 Tab 中确认创建。" });
      return;
    }

    for (const card of cards) {
      const item = container.createDiv({ cls: "readmind-book" });
      item.createEl("h3", { text: card.title });
      item.createEl("p", {
        cls: "readmind-muted",
        text: `来自 ${new Set((card.evidence ?? []).map((evidence) => evidence.sourceBookId)).size} 本书 · 证据 ${(card.evidence ?? []).length} 条 · 最近更新：${card.updatedAt?.slice(0, 10) ?? "未知"}`,
      });
      const actions = item.createDiv({ cls: "readmind-card-actions" });
      new Setting(actions)
        .addToggle((toggle) => {
          toggle.setValue(this.selectedCardIds.has(card.id)).onChange((selected) => {
            if (selected) this.selectedCardIds.add(card.id);
            else this.selectedCardIds.delete(card.id);
            this.render();
          });
        })
        .addButton((button) => {
          button.setButtonText("打开卡片").onClick(() => this.plugin.openMarkdownFile(card.filePath));
        });
    }

    const selectionActions = container.createDiv({ cls: "readmind-card-selection-actions" });
    new Setting(selectionActions)
      .setName(`已选择 ${this.selectedCardIds.size} 张知识卡片`)
      .setDesc(this.selectionHint())
      .addButton((button) => {
        button
          .setCta()
          .setButtonText("生成关联建议")
          .setDisabled(this.selectedCardIds.size < 2 || this.selectedCardIds.size > 5)
          .onClick(async () => {
            await this.plugin.generateRelationSuggestionsForCards([...this.selectedCardIds]);
            this.mode = "suggestions";
            this.render();
          });
      });
  }

  private renderSuggestions(container: HTMLElement): void {
    const filters = container.createDiv({ cls: "readmind-relation-filters" });
    new Setting(filters)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("all", "全部")
          .addOption("pending", "待处理")
          .addOption("accepted", "已确认")
          .addOption("later", "暂不处理")
          .addOption("dismissed", "已忽略")
          .setValue(this.filter)
          .onChange((value) => {
            this.filter = value as SuggestionFilter;
            this.render();
          });
      });

    const suggestions = Object.values(this.plugin.store.data.relationSuggestions)
      .filter((item) => this.filter === "all"
        ? item.status !== "accepted" && item.status !== "edited_and_accepted"
        : this.filter === "accepted"
        ? item.status === "accepted" || item.status === "edited_and_accepted"
        : item.status === this.filter);
    const confirmed = Object.values(this.plugin.store.data.confirmedRelations);

    if (suggestions.length === 0 && (this.filter === "all" || this.filter === "accepted") && confirmed.length === 0) {
      container.createEl("p", { cls: "readmind-muted", text: "暂无关联建议。" });
      return;
    }
    if (suggestions.length === 0 && this.filter !== "all" && this.filter !== "accepted") {
      container.createEl("p", { cls: "readmind-muted", text: "暂无关联建议。" });
      return;
    }
    if ((this.filter === "all" || this.filter === "accepted") && confirmed.length > 0) {
      for (const relation of confirmed) this.renderConfirmedRelation(container, relation);
    }
    for (const suggestion of suggestions) this.renderSuggestion(container, suggestion);
  }

  private renderSuggestion(container: HTMLElement, suggestion: RelationSuggestion): void {
    const cards = this.plugin.store.data.cardIndex;
    const left = cards[suggestion.leftCardId];
    const right = cards[suggestion.rightCardId];
    const card = container.createDiv({ cls: "readmind-book readmind-relation-card" });
    card.createEl("h3", { text: `${relationTypeLabel(suggestion.relationType)}：${suggestion.title}` });
    card.createEl("p", { text: suggestion.explanation });
    card.createEl("p", {
      cls: "readmind-muted",
      text: `可信度：${this.confidenceLabel(suggestion.confidence)} · 状态：${relationStatusLabel(suggestion.status)}`,
    });
    card.createEl("p", { text: `知识卡片 A：${left?.title ?? "未知"}；知识卡片 B：${right?.title ?? "未知"}` });

    const actions = card.createDiv({ cls: "readmind-suggestion-actions" });
    new Setting(actions)
      .addButton((button) => {
        button.setButtonText("查看双方依据").onClick(async () => {
          await this.openFirstEvidence(left, suggestion.leftEvidenceIds);
          await this.openFirstEvidence(right, suggestion.rightEvidenceIds);
        });
      })
      .addButton((button) => {
        button.setCta().setButtonText("接受并建立双链").onClick(async () => {
          await this.plugin.acceptRelationSuggestion(suggestion.id);
          this.render();
        });
      })
      .addButton((button) => {
        button.setButtonText("编辑后接受").onClick(async () => {
          const edited = this.promptRelationEdits(suggestion);
          if (edited) await this.plugin.acceptRelationSuggestion(suggestion.id, edited);
          this.render();
        });
      })
      .addButton((button) => {
        button.setButtonText("暂不处理").onClick(async () => {
          await this.plugin.setRelationSuggestionStatus(suggestion.id, "later");
          new Notice("已标记为暂不处理。");
          this.render();
        });
      })
      .addButton((button) => {
        button.setButtonText("忽略").onClick(async () => {
          await this.plugin.setRelationSuggestionStatus(suggestion.id, "dismissed");
          this.render();
        });
      });
  }

  private renderConfirmedRelation(container: HTMLElement, relation: ConfirmedRelation): void {
    const left = this.plugin.store.data.cardIndex[relation.leftCardId];
    const right = this.plugin.store.data.cardIndex[relation.rightCardId];
    const item = container.createDiv({ cls: "readmind-book readmind-relation-card readmind-confirmed-relation-card" });
    item.createEl("h3", { text: `${relationTypeLabel(relation.relationType)}：${relation.title}` });
    item.createEl("p", { text: relation.explanation });
    item.createEl("p", { cls: "readmind-muted", text: `${left?.title ?? "未知"} ↔ ${right?.title ?? "未知"}` });
    const actions = item.createDiv({ cls: "readmind-confirmed-relation-actions" });
    new Setting(actions)
      .addButton((button) => button.setButtonText("打开左侧卡片").onClick(() => left && this.plugin.openMarkdownFile(left.filePath)))
      .addButton((button) => button.setButtonText("打开右侧卡片").onClick(() => right && this.plugin.openMarkdownFile(right.filePath)));
  }

  private async openFirstEvidence(card: KnowledgeCardRecord | undefined, evidenceIds: string[]): Promise<void> {
    if (!card) return;
    const input = buildRelationInputCards([card])[0];
    const evidence = input.evidence.find((item) => evidenceIds.includes(item.evidenceId));
    if (evidence) await this.plugin.openMarkdownBlock(evidence.sourceNotePath, evidence.blockId);
  }

  private promptRelationEdits(suggestion: RelationSuggestion): { title: string; relationType: RelationType; explanation: string } | null {
    const title = window.prompt("关联标题", suggestion.title);
    if (title === null) return null;
    const explanation = window.prompt("关联说明", suggestion.explanation);
    if (explanation === null) return null;
    const relationType = (window.prompt("关系类型：reinforces / complements / contrasts / causal / shared_question", suggestion.relationType) || suggestion.relationType) as RelationType;
    return { title, relationType, explanation };
  }

  private selectionHint(): string {
    if (this.selectedCardIds.size < 2) return "请至少选择 2 张知识卡片。";
    if (this.selectedCardIds.size > 5) return "一次最多选择 5 张知识卡片。";
    const cards = [...this.selectedCardIds].map((id) => this.plugin.store.data.cardIndex[id]).filter(Boolean);
    const bookCount = new Set(cards.flatMap((card) => (card.evidence ?? []).map((item) => item.sourceBookId))).size;
    return bookCount > 1 ? "已选择来自不同书籍证据的卡片。" : "建议优先选择来自不同书籍证据的卡片。";
  }

  private confidenceLabel(value: string): string {
    if (value === "high") return "高";
    if (value === "low") return "低";
    return "中";
  }
}
