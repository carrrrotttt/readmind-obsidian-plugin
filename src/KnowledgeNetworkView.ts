import { ItemView, Setting, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_KNOWLEDGE_NETWORK } from "./constants";
import {
  buildKnowledgeNetwork,
  defaultKnowledgeNodePosition,
  evidenceId,
  filterKnowledgeNetwork,
  relationTypeLabel,
} from "./relationService";
import type ReadMindPlugin from "./main";
import type { ConfirmedRelation, KnowledgeCardRecord, RelationType } from "./types";

type NetworkRelationFilter = RelationType | "all";
type NetworkSelection = { type: "card"; id: string } | { type: "relation"; id: string };
type DragState =
  | { type: "node"; cardId: string; startX: number; startY: number; originalX: number; originalY: number; moved: boolean }
  | { type: "pan"; startX: number; startY: number; originalX: number; originalY: number; moved: boolean };

export class KnowledgeNetworkView extends ItemView {
  private query = "";
  private relationFilter: NetworkRelationFilter = "all";
  private bookFilter = "all";
  private directOnly = false;
  private selection: NetworkSelection | null = null;
  private dragState: DragState | null = null;
  private suppressNextClick = false;
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this.selection) return;
    this.selection = null;
    this.render();
  };

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ReadMindPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_KNOWLEDGE_NETWORK;
  }

  getDisplayText(): string {
    return "ReadMind / 知识网络";
  }

  async onOpen(): Promise<void> {
    document.addEventListener("keydown", this.handleKeyDown);
    this.render();
  }

  async onClose(): Promise<void> {
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("readmind-network-view");
    container.createEl("h2", { text: "ReadMind / 知识网络" });
    const cards = Object.values(this.plugin.store.data.cardIndex);
    const relations = Object.values(this.plugin.store.data.confirmedRelations);
    if (cards.length === 0) {
      this.renderNoCards(container);
      return;
    }
    this.ensureDefaultPositions(cards);
    this.renderToolbar(container, cards);
    const visible = this.visibleNetwork(cards, relations);
    if (visible.cards.length === 0) {
      this.renderNoFilterResult(container);
      return;
    }
    if (relations.length === 0) {
      const empty = container.createDiv({ cls: "readmind-network-empty-inline" });
      empty.createEl("p", { cls: "readmind-muted", text: "还没有已确认的关联。你可以先查看知识卡片，或前往“关联建议”确认关系。" });
      new Setting(empty).addButton((button) => button.setButtonText("前往关联建议").onClick(() => this.plugin.openLinkSuggestions()));
    }
    const layout = container.createDiv({ cls: "readmind-canvas-shell" });
    const canvas = layout.createDiv({ cls: "readmind-canvas" });
    this.renderCanvas(canvas, visible.cards, visible.relations);
    if (this.selection) {
      const detail = canvas.createDiv({ cls: "readmind-canvas-detail" });
      detail.addEventListener("pointerdown", (event) => event.stopPropagation());
      detail.addEventListener("click", (event) => event.stopPropagation());
      this.renderDetail(detail, visible.relations);
    }
  }

  private renderToolbar(container: HTMLElement, cards: KnowledgeCardRecord[]): void {
    const filters = container.createDiv({ cls: "readmind-network-filters readmind-canvas-toolbar" });
    new Setting(filters)
      .addText((text) => text
        .setPlaceholder("搜索知识卡片名称")
        .setValue(this.query)
        .onChange((value) => {
          this.query = value;
          this.render();
        }))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("all", "全部关系类型")
          .addOption("reinforces", "相互印证")
          .addOption("complements", "补充延展")
          .addOption("contrasts", "观点对照")
          .addOption("causal", "因果关联")
          .addOption("shared_question", "共同问题")
          .setValue(this.relationFilter)
          .onChange((value) => {
            this.relationFilter = value as NetworkRelationFilter;
            this.render();
          });
      })
      .addDropdown((dropdown) => {
        dropdown.addOption("all", "全部来源书籍");
        for (const item of this.sourceBookOptions(cards)) dropdown.addOption(item.id, item.title);
        dropdown.setValue(this.bookFilter).onChange((value) => {
          this.bookFilter = value;
          this.render();
        });
      })
      .addToggle((toggle) => {
        toggle.setTooltip("仅显示当前选中节点的一度关联");
        toggle.setValue(this.directOnly).setDisabled(this.selection?.type !== "card").onChange((value) => {
          this.directOnly = value;
          this.render();
        });
      })
      .addButton((button) => button.setButtonText("重置筛选").onClick(() => {
        this.resetFilters();
        this.render();
      }))
      .addButton((button) => button.setButtonText("适应画布").onClick(async () => {
        await this.fitToCanvas();
        this.render();
      }))
      .addButton((button) => button.setButtonText("恢复默认布局").onClick(async () => {
        await this.resetDefaultLayout();
        this.render();
      }));
  }

  private renderCanvas(container: HTMLElement, cards: KnowledgeCardRecord[], relations: ConfirmedRelation[]): void {
    const viewport = this.viewport();
    const stage = container.createDiv({ cls: "readmind-canvas-stage" });
    stage.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    stage.addEventListener("pointerdown", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest(".readmind-canvas-card") || target.closest(".readmind-canvas-edge")) return;
      stage.setPointerCapture(event.pointerId);
      this.dragState = { type: "pan", startX: event.clientX, startY: event.clientY, originalX: viewport.x, originalY: viewport.y, moved: false };
    });
    stage.addEventListener("pointermove", async (event) => this.handlePointerMove(event));
    stage.addEventListener("pointerup", async (event) => this.finishDrag(event.pointerId, stage));
    stage.addEventListener("wheel", async (event) => {
      event.preventDefault();
      await this.zoomAt(event, event.deltaY > 0 ? 0.92 : 1.08, container);
      this.updateCanvasPositions();
    }, { passive: false });

    const edges = stage.createDiv({ cls: "readmind-canvas-edges" });
    const nodes = stage.createDiv({ cls: "readmind-canvas-nodes" });
    for (const relation of relations) this.renderEdge(edges, relation);
    for (const card of cards) this.renderNode(nodes, card, relations);
  }

  private renderNode(container: HTMLElement, card: KnowledgeCardRecord, relations: ConfirmedRelation[]): void {
    const position = this.positionFor(card.id);
    const node = container.createDiv({ cls: "readmind-canvas-card" });
    node.setAttribute("data-card-id", card.id);
    node.style.left = `${position.x}px`;
    node.style.top = `${position.y}px`;
    if (this.selection?.type === "card" && this.selection.id === card.id) node.addClass("is-selected");
    node.createEl("h3", { text: card.title });
    node.createEl("p", { cls: "readmind-canvas-card-summary", text: this.cardSummary(card) });
    node.createEl("p", { cls: "readmind-muted", text: `来源 ${this.cardSourceBooks(card).length} 本 · 证据 ${card.evidence.length} · 关联 ${this.relationsForCard(card.id, relations).length}` });
    node.addEventListener("click", () => {
      if (this.suppressNextClick) {
        this.suppressNextClick = false;
        return;
      }
      this.selection = { type: "card", id: card.id };
      this.render();
    });
    node.addEventListener("dblclick", () => this.plugin.openMarkdownFile(card.filePath));
    node.addEventListener("pointerdown", (event) => {
      node.setPointerCapture(event.pointerId);
      this.selection = { type: "card", id: card.id };
      this.dragState = { type: "node", cardId: card.id, startX: event.clientX, startY: event.clientY, originalX: position.x, originalY: position.y, moved: false };
      event.stopPropagation();
    });
    node.addEventListener("pointermove", async (event) => this.handlePointerMove(event));
    node.addEventListener("pointerup", async (event) => this.finishDrag(event.pointerId, node));
  }

  private renderEdge(container: HTMLElement, relation: ConfirmedRelation): void {
    const left = this.positionFor(relation.leftCardId);
    const right = this.positionFor(relation.rightCardId);
    const from = { x: left.x + 110, y: left.y + 70 };
    const to = { x: right.x + 110, y: right.y + 70 };
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    const edge = container.createDiv({ cls: "readmind-canvas-edge" });
    edge.setAttribute("data-relation-id", relation.id);
    if (this.selection?.type === "relation" && this.selection.id === relation.id) edge.addClass("is-selected");
    edge.style.left = `${from.x}px`;
    edge.style.top = `${from.y}px`;
    edge.style.width = `${length}px`;
    edge.style.transform = `rotate(${angle}deg)`;
    edge.createSpan({ cls: "readmind-canvas-edge-label", text: relationTypeLabel(relation.relationType) });
    edge.addEventListener("click", (event) => {
      event.stopPropagation();
      this.selection = { type: "relation", id: relation.id };
      this.directOnly = false;
      this.render();
    });
  }

  private renderDetail(container: HTMLElement, visibleRelations: ConfirmedRelation[]): void {
    container.createEl("button", { cls: "readmind-canvas-detail-close", text: "关闭" }).addEventListener("click", () => {
      this.selection = null;
      this.render();
    });
    if (!this.selection) {
      container.createEl("h3", { text: "详情" });
      container.createEl("p", { cls: "readmind-muted", text: "点击知识卡片或关系连线查看详情。" });
      return;
    }
    if (this.selection.type === "card") {
      const card = this.plugin.store.data.cardIndex[this.selection.id];
      if (!card) return;
      const relatedCount = Object.values(this.plugin.store.data.confirmedRelations).filter((relation) => relation.leftCardId === card.id || relation.rightCardId === card.id).length;
      container.createEl("h3", { text: card.title });
      container.createEl("p", { text: this.cardSummary(card) });
      container.createEl("p", { cls: "readmind-muted", text: `来源书籍：${this.cardSourceBooks(card).join("、") || "暂无"} · 证据 ${card.evidence.length} 条 · 已确认关系 ${relatedCount} 条` });
      const actions = container.createDiv({ cls: "readmind-network-actions" });
      new Setting(actions)
        .addButton((button) => button.setButtonText("打开知识卡片").onClick(() => this.plugin.openMarkdownFile(card.filePath)))
        .addButton((button) => button.setButtonText("查看来源证据").onClick(() => this.openCardEvidence(card)))
        .addButton((button) => button.setButtonText("只看直接关联").onClick(() => {
          this.directOnly = true;
          this.render();
        }));
      return;
    }
    const relation = visibleRelations.find((item) => item.id === this.selection?.id) ?? this.plugin.store.data.confirmedRelations[this.selection.id];
    if (!relation) return;
    const left = this.plugin.store.data.cardIndex[relation.leftCardId];
    const right = this.plugin.store.data.cardIndex[relation.rightCardId];
    container.createEl("h3", { text: `${relationTypeLabel(relation.relationType)}：${relation.title}` });
    container.createEl("p", { text: relation.explanation });
    container.createEl("p", { cls: "readmind-muted", text: `左侧知识卡片：${left?.title ?? "未知"} · 右侧知识卡片：${right?.title ?? "未知"}` });
    container.createEl("p", { cls: "readmind-muted", text: `双方来源书籍：${[...new Set([...this.cardSourceBooks(left), ...this.cardSourceBooks(right)])].join("、") || "暂无"}` });
    const actions = container.createDiv({ cls: "readmind-network-actions" });
    new Setting(actions)
      .addButton((button) => button.setButtonText("打开左侧卡片").onClick(() => left && this.plugin.openMarkdownFile(left.filePath)))
      .addButton((button) => button.setButtonText("打开右侧卡片").onClick(() => right && this.plugin.openMarkdownFile(right.filePath)))
      .addButton((button) => button.setButtonText("查看双方依据").onClick(async () => {
        await this.openFirstEvidence(left, relation.leftEvidenceIds);
        await this.openFirstEvidence(right, relation.rightEvidenceIds);
      }));
  }

  private async handlePointerMove(event: PointerEvent): Promise<void> {
    if (!this.dragState) return;
    const viewport = this.viewport();
    const rawDx = event.clientX - this.dragState.startX;
    const rawDy = event.clientY - this.dragState.startY;
    if (Math.hypot(rawDx, rawDy) > 4) this.dragState.moved = true;
    if (this.dragState.type === "node") {
      const dx = rawDx / viewport.scale;
      const dy = rawDy / viewport.scale;
      this.plugin.store.data.knowledgeNetworkLayout.nodePositions[this.dragState.cardId] = {
        x: this.dragState.originalX + dx,
        y: this.dragState.originalY + dy,
      };
      this.plugin.store.data.knowledgeNetworkLayout.updatedAt = new Date().toISOString();
      this.updateCanvasPositions();
      return;
    }
    this.plugin.store.data.knowledgeNetworkLayout.viewport = {
      ...viewport,
      x: this.dragState.originalX + event.clientX - this.dragState.startX,
      y: this.dragState.originalY + event.clientY - this.dragState.startY,
    };
    this.plugin.store.data.knowledgeNetworkLayout.updatedAt = new Date().toISOString();
    this.updateCanvasPositions();
  }

  private async finishDrag(pointerId: number, target: HTMLElement): Promise<void> {
    if (!this.dragState) return;
    const finished = this.dragState;
    try {
      target.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already be released by Obsidian.
    }
    this.dragState = null;
    if (finished.type === "pan" && !finished.moved) {
      this.selection = null;
      this.render();
      return;
    }
    if (finished.type === "node" && finished.moved) this.suppressNextClick = true;
    await this.plugin.store.save();
  }

  private visibleNetwork(cards: KnowledgeCardRecord[], relations: ConfirmedRelation[]): { cards: KnowledgeCardRecord[]; relations: ConfirmedRelation[] } {
    return filterKnowledgeNetwork(buildKnowledgeNetwork(cards, relations), {
      query: this.query,
      relationType: this.relationFilter,
      sourceBookId: this.bookFilter,
      directCardId: this.directOnly && this.selection?.type === "card" ? this.selection.id : undefined,
    });
  }

  private ensureDefaultPositions(cards: KnowledgeCardRecord[]): void {
    const layout = this.plugin.store.data.knowledgeNetworkLayout;
    const sorted = [...cards].sort((left, right) => left.title.localeCompare(right.title));
    sorted.forEach((card, index) => {
      if (!layout.nodePositions[card.id]) layout.nodePositions[card.id] = defaultKnowledgeNodePosition(index);
    });
  }

  private positionFor(cardId: string): { x: number; y: number } {
    return this.plugin.store.data.knowledgeNetworkLayout.nodePositions[cardId] ?? { x: 0, y: 0 };
  }

  private viewport(): { x: number; y: number; scale: number } {
    return this.plugin.store.data.knowledgeNetworkLayout.viewport ?? { x: 0, y: 0, scale: 1 };
  }

  private updateCanvasPositions(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    const viewport = this.viewport();
    const stage = root.querySelector<HTMLElement>(".readmind-canvas-stage");
    if (stage) stage.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    for (const node of Array.from(root.querySelectorAll<HTMLElement>(".readmind-canvas-card[data-card-id]"))) {
      const cardId = node.getAttribute("data-card-id");
      if (!cardId) continue;
      const position = this.positionFor(cardId);
      node.style.left = `${position.x}px`;
      node.style.top = `${position.y}px`;
    }
    for (const edge of Array.from(root.querySelectorAll<HTMLElement>(".readmind-canvas-edge[data-relation-id]"))) {
      const relationId = edge.getAttribute("data-relation-id");
      const relation = relationId ? this.plugin.store.data.confirmedRelations[relationId] : undefined;
      if (!relation) continue;
      const left = this.positionFor(relation.leftCardId);
      const right = this.positionFor(relation.rightCardId);
      const from = { x: left.x + 110, y: left.y + 70 };
      const to = { x: right.x + 110, y: right.y + 70 };
      edge.style.left = `${from.x}px`;
      edge.style.top = `${from.y}px`;
      edge.style.width = `${Math.hypot(to.x - from.x, to.y - from.y)}px`;
      edge.style.transform = `rotate(${Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI}deg)`;
    }
  }

  private async zoomAt(event: WheelEvent, factor: number, canvas: HTMLElement): Promise<void> {
    const viewport = this.viewport();
    const rect = canvas.getBoundingClientRect();
    const nextScale = Math.max(0.45, Math.min(1.8, viewport.scale * factor));
    const anchorX = (event.clientX - rect.left - viewport.x) / viewport.scale;
    const anchorY = (event.clientY - rect.top - viewport.y) / viewport.scale;
    this.plugin.store.data.knowledgeNetworkLayout.viewport = {
      x: event.clientX - rect.left - anchorX * nextScale,
      y: event.clientY - rect.top - anchorY * nextScale,
      scale: nextScale,
    };
    this.plugin.store.data.knowledgeNetworkLayout.updatedAt = new Date().toISOString();
    await this.plugin.store.save();
  }

  private async fitToCanvas(): Promise<void> {
    const cards = this.visibleNetwork(Object.values(this.plugin.store.data.cardIndex), Object.values(this.plugin.store.data.confirmedRelations)).cards;
    if (cards.length === 0) return;
    const xs = cards.map((card) => this.positionFor(card.id).x);
    const ys = cards.map((card) => this.positionFor(card.id).y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    this.plugin.store.data.knowledgeNetworkLayout.viewport = { x: 60 - minX * 0.85, y: 60 - minY * 0.85, scale: 0.85 };
    this.plugin.store.data.knowledgeNetworkLayout.updatedAt = new Date().toISOString();
    await this.plugin.store.save();
  }

  private async resetDefaultLayout(): Promise<void> {
    const sorted = Object.values(this.plugin.store.data.cardIndex).sort((left, right) => left.title.localeCompare(right.title));
    this.plugin.store.data.knowledgeNetworkLayout.nodePositions = Object.fromEntries(sorted.map((card, index) => [card.id, defaultKnowledgeNodePosition(index)]));
    this.plugin.store.data.knowledgeNetworkLayout.viewport = { x: 40, y: 40, scale: 1 };
    this.plugin.store.data.knowledgeNetworkLayout.updatedAt = new Date().toISOString();
    await this.plugin.store.save();
  }

  private resetFilters(): void {
    this.query = "";
    this.relationFilter = "all";
    this.bookFilter = "all";
    this.directOnly = false;
    this.selection = null;
  }

  private renderNoCards(container: HTMLElement): void {
    container.createEl("p", { cls: "readmind-muted", text: "还没有知识卡片。请先从一本书的 AI 分析中确认并创建概念卡片。" });
    new Setting(container).addButton((button) => button.setButtonText("返回书架").onClick(() => this.plugin.openBookshelf()));
  }

  private renderNoFilterResult(container: HTMLElement): void {
    container.createEl("p", { cls: "readmind-muted", text: "当前筛选条件下没有匹配的知识卡片或关系。" });
    new Setting(container).addButton((button) => button.setButtonText("清除筛选").onClick(() => {
      this.resetFilters();
      this.render();
    }));
  }

  private sourceBookOptions(cards: KnowledgeCardRecord[]): Array<{ id: string; title: string }> {
    const options = new Map<string, string>();
    for (const card of cards) for (const item of card.evidence ?? []) options.set(item.sourceBookId, `《${item.sourceBookTitle}》`);
    return [...options.entries()].map(([id, title]) => ({ id, title })).sort((left, right) => left.title.localeCompare(right.title));
  }

  private cardSourceBooks(card: KnowledgeCardRecord | undefined): string[] {
    if (!card) return [];
    return [...new Set((card.evidence ?? []).map((item) => `《${item.sourceBookTitle}》`))];
  }

  private relationsForCard(cardId: string, relations: ConfirmedRelation[]): ConfirmedRelation[] {
    return relations.filter((relation) => relation.leftCardId === cardId || relation.rightCardId === cardId);
  }

  private cardSummary(card: KnowledgeCardRecord): string {
    const first = card.evidence?.[0]?.text?.trim();
    return first ? first.slice(0, 96) : "打开知识卡片查看初步理解。";
  }

  private async openCardEvidence(card: KnowledgeCardRecord): Promise<void> {
    const first = card.evidence?.[0];
    if (first) await this.plugin.openMarkdownBlock(first.sourceNotePath, first.blockId);
  }

  private async openFirstEvidence(card: KnowledgeCardRecord | undefined, evidenceIds: string[]): Promise<void> {
    if (!card) return;
    const byId = new Map((card.evidence ?? []).map((item) => [evidenceId(card.id, item.fragmentId, item.blockId), item]));
    const evidence = evidenceIds.map((id) => byId.get(id)).find(Boolean);
    if (evidence) await this.plugin.openMarkdownBlock(evidence.sourceNotePath, evidence.blockId);
  }
}
