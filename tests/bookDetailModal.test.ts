import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("BookDetailModal source behavior", () => {
  it("refreshes remote details after refresh and sync actions", () => {
    const source = readFileSync("src/BookDetailModal.ts", "utf8");
    expect(source).toContain('setButtonText("刷新详情")');
    expect(source).toContain("this.book = await this.plugin.getBookDetails(this.book.id)");
    expect(source).toContain("await this.plugin.syncBooks([this.book.id])");
    expect(source).toContain("await this.refreshDetails()");
  });

  it("guards single-book AI analysis behind synced source fragments and AI settings", () => {
    const source = readFileSync("src/BookDetailModal.ts", "utf8");

    expect(source).toContain('setButtonText(record?.aiStatus === "stale" ? "重新分析此书" : "AI 分析此书")');
    expect(source).toContain("record.sourceFragments?.length");
    expect(source).toContain("请先前往 ReadMind 设置配置并启用 AI");
    expect(source).toContain("请先同步此书");
    expect(source).toContain("openMarkdownBlock(fragment.sourceNotePath, fragment.blockId)");
    expect(source).not.toContain("not_analyzed");
  });

  it("uses shared source chapter organization for the notes tab", () => {
    const source = readFileSync("src/BookDetailModal.ts", "utf8");

    expect(source).toContain("groupSourceFragmentsByChapter");
    expect(source).toContain("highlightsInGroup");
    expect(source).not.toContain("friendlyChapterTitle(annotation.chapterTitle)");
  });

  it("shows user-confirmed knowledge card actions for concept candidates", () => {
    const source = readFileSync("src/BookDetailModal.ts", "utf8");

    expect(source).toContain("创建知识卡片");
    expect(source).toContain("暂不整理");
    expect(source).toContain("添加到已有卡片");
    expect(source).toContain("打开知识卡片");
    expect(source).toContain("createKnowledgeCardFromConcept");
    expect(source).toContain("dismissConceptCandidate");
  });
});

describe("relation suggestion workspace source", () => {
  it("replaces old selected-book suggestion flow with knowledge-card selection", () => {
    const source = readFileSync("src/LinkSuggestionsView.ts", "utf8");

    expect(source).toContain("知识卡片");
    expect(source).toContain("生成关联建议");
    expect(source).toContain("generateRelationSuggestionsForCards");
    expect(source).toContain("至少选择 2 张知识卡片");
    expect(source).toContain("一次最多选择 5 张知识卡片");
    expect(source).toContain("readmind-suggestion-actions");
    expect(source).toContain("readmind-confirmed-relation-actions");
    expect(source).toContain("readmind-relation-filters");
    expect(source).toContain('.addOption("all", "全部")');
    expect(source).toContain('private filter: SuggestionFilter = "all"');
    expect(source).toContain('this.filter === "all"');
    expect(source).not.toContain("基于所选书生成建议");
  });

  it("adds a read-only knowledge network tab backed by confirmed relations", () => {
    const source = readFileSync("src/LinkSuggestionsView.ts", "utf8");
    const network = readFileSync("src/KnowledgeNetworkView.ts", "utf8");
    const main = readFileSync("src/main.ts", "utf8");
    const bookshelf = readFileSync("src/BookshelfView.ts", "utf8");

    expect(source).toContain('type ViewMode = "cards" | "suggestions" | "network"');
    expect(source).toContain("知识网络");
    expect(source).toContain("this.plugin.openKnowledgeNetwork()");
    expect(source).not.toContain("renderNetwork");
    expect(main).toContain("VIEW_TYPE_KNOWLEDGE_NETWORK");
    expect(main).toContain("new KnowledgeNetworkView");
    expect(main).toContain('this.app.workspace.getLeaf("tab")');
    expect(main).toContain("getLeavesOfType(VIEW_TYPE_KNOWLEDGE_NETWORK)");
    expect(network).toContain("buildKnowledgeNetwork");
    expect(network).toContain("filterKnowledgeNetwork");
    expect(network).toContain("Object.values(this.plugin.store.data.cardIndex)");
    expect(network).toContain("Object.values(this.plugin.store.data.confirmedRelations)");
    expect(source).not.toContain("generateRelationSuggestionsForCards([...this.selectedCardIds]) &&");
    expect(bookshelf).not.toContain("知识网络");
  });

  it("supports network filtering, details, and evidence navigation without writing data", () => {
    const source = readFileSync("src/KnowledgeNetworkView.ts", "utf8");

    expect(source).toContain("搜索知识卡片名称");
    expect(source).toContain("全部关系类型");
    expect(source).toContain("全部来源书籍");
    expect(source).toContain("仅显示当前选中节点的一度关联");
    expect(source).toContain("重置筛选");
    expect(source).toContain("打开知识卡片");
    expect(source).toContain("查看来源证据");
    expect(source).toContain("只看直接关联");
    expect(source).toContain("打开左侧卡片");
    expect(source).toContain("打开右侧卡片");
    expect(source).toContain("查看双方依据");
    expect(source).toContain("还没有知识卡片");
    expect(source).toContain("还没有已确认的关联");
    expect(source).toContain("当前筛选条件下没有匹配");
    expect(source).toContain("readmind-canvas-detail");
    expect(source).toContain("readmind-canvas-detail-close");
    expect(source).toContain("document.addEventListener(\"keydown\"");
    expect(source).not.toContain("缩小");
    expect(source).not.toContain("放大");
    expect(source).not.toContain("suggestRelations(");
    expect(source).not.toContain("writeConfirmedRelations(");
  });

  it("renders a draggable knowledge-card canvas with persistent local layout", () => {
    const source = readFileSync("src/KnowledgeNetworkView.ts", "utf8");
    const types = readFileSync("src/types.ts", "utf8");
    const service = readFileSync("src/relationService.ts", "utf8");

    expect(types).toContain("KnowledgeNetworkLayout");
    expect(types).toContain("nodePositions");
    expect(types).toContain("viewport");
    expect(service).toContain("defaultKnowledgeNodePosition");
    expect(source).toContain("readmind-canvas-card");
    expect(source).toContain("readmind-canvas-edge");
    expect(source).toContain("pointerdown");
    expect(source).toContain("pointermove");
    expect(source).toContain("wheel");
    expect(source).toContain("zoomAt(event");
    expect(source).toContain("anchorX");
    expect(source).toContain("Math.max(0.45, Math.min(1.8");
    expect(source).toContain("suppressNextClick");
    expect(source).toContain("适应画布");
    expect(source).toContain("恢复默认布局");
    expect(source).toContain("this.plugin.store.data.knowledgeNetworkLayout.nodePositions");
    expect(source).toContain("this.plugin.store.save()");
    expect(source).not.toContain("vault.modify");
  });
});
