import { describe, expect, it, vi } from "vitest";
import {
  buildReadingReviewMarkdown,
  buildReadingReviewPreview,
  defaultReadingReviewOptions,
  periodRange,
  periodKey,
  prepareReadingReview,
  validateReadingReviewResultForInput,
} from "../src/readingReviewService";
import type { ReadMindPluginData, ReadingJourneySummary } from "../src/types";
import { DEFAULT_PLUGIN_DATA } from "../src/defaultSettings";

vi.mock("obsidian", () => ({
  normalizePath: (path: string) => path.replace(/\\/g, "/"),
  TFile: class TFile {},
}));

describe("readingReviewService", () => {
  it("only auto-selects fragments with createdAt inside the current period", () => {
    const data = pluginData();
    const summary = monthlySummary();
    const options = defaultReadingReviewOptions(data, summary);
    const preview = buildReadingReviewPreview(data, summary, options);

    expect(options.selectedBookIds).toEqual(["book-a"]);
    expect(preview.counts.periodEvidence).toBe(1);
    expect(preview.counts.unconfirmedEvidence).toBe(0);
    expect(preview.input.books[0].evidences[0]).toMatchObject({
      fragmentId: "f-period",
      blockId: "rm-h-period",
      timeScope: "period_confirmed",
    });
  });

  it("marks missing createdAt evidence as time_unconfirmed only after user opts in", () => {
    const data = pluginData();
    const summary = monthlySummary();
    const options = {
      ...defaultReadingReviewOptions(data, summary),
      includeUnconfirmedEvidence: true,
    };
    const preview = buildReadingReviewPreview(data, summary, options);

    expect(preview.counts.unconfirmedEvidence).toBe(1);
    expect(preview.input.books[0].evidences.map((item) => item.timeScope)).toContain("time_unconfirmed");
  });

  it("filters new cards and confirmed relations by createdAt and acceptedAt", () => {
    const preview = buildReadingReviewPreview(pluginData(), monthlySummary(), {
      selectedBookIds: ["book-a"],
      includePeriodEvidence: true,
      includeUnconfirmedEvidence: false,
      includePeriodCards: true,
      includePeriodRelations: true,
      includeCumulativeKnowledge: false,
    });

    expect(preview.counts.periodCards).toBe(1);
    expect(preview.input.knowledgeCards).toEqual([expect.objectContaining({ cardId: "card-a", timeScope: "period_confirmed" })]);
    expect(preview.counts.periodRelations).toBe(1);
    expect(preview.input.confirmedRelations).toEqual([expect.objectContaining({ relationId: "rel-a", timeScope: "period_confirmed" })]);
  });

  it("keeps cumulative knowledge separate from period-confirmed content", () => {
    const preview = buildReadingReviewPreview(pluginData(), monthlySummary(), {
      selectedBookIds: ["book-a"],
      includePeriodEvidence: true,
      includeUnconfirmedEvidence: false,
      includePeriodCards: false,
      includePeriodRelations: false,
      includeCumulativeKnowledge: true,
    });

    expect(preview.input.knowledgeCards.every((card) => card.timeScope === "cumulative_only")).toBe(true);
    expect(preview.input.confirmedRelations.every((relation) => relation.timeScope === "cumulative_only")).toBe(true);
  });

  it("filters unknown ids from AI output before Markdown generation", () => {
    const preview = buildReadingReviewPreview(pluginData(), monthlySummary(), defaultReadingReviewOptions(pluginData(), monthlySummary()));
    const result = validateReadingReviewResultForInput({
      overview: "概览",
      focusBooks: [
        { bookTitle: "书 A", observation: "观察", evidenceIds: [preview.input.books[0].evidences[0].evidenceId, "unknown"] },
        { bookTitle: "不存在", observation: "观察", evidenceIds: [preview.input.books[0].evidences[0].evidenceId] },
      ],
      themes: [{ title: "主题", interpretation: "理解", evidenceIds: ["unknown"], relatedCardIds: ["missing"] }],
      confirmedKnowledgeConnections: [{ relationId: "missing", reflection: "关系" }],
      nextQuestions: ["问题"],
    }, preview.input);

    expect(result.focusBooks).toHaveLength(1);
    expect(result.focusBooks[0].evidenceIds).toHaveLength(1);
    expect(result.themes).toEqual([]);
    expect(result.confirmedKnowledgeConnections).toEqual([]);
  });

  it("renders official statistics directly and preserves the user review area", () => {
    const data = pluginData();
    const preview = buildReadingReviewPreview(data, monthlySummary(), {
      ...defaultReadingReviewOptions(data, monthlySummary()),
      includeCumulativeKnowledge: true,
    });
    const evidenceId = preview.input.books[0].evidences[0].evidenceId;
    const markdown = buildReadingReviewMarkdown(monthlySummary(), preview.input, {
      overview: "AI 不改统计",
      focusBooks: [{ bookTitle: "书 A", observation: "观察", evidenceIds: [evidenceId] }],
      themes: [{ title: "主题", interpretation: "理解", evidenceIds: [evidenceId], relatedCardIds: ["card-a"] }],
      confirmedKnowledgeConnections: [{ relationId: "rel-a", reflection: "关系说明" }],
      nextQuestions: ["继续想什么？"],
    }, data, "model", "2026-05-25T00:00:00.000Z", "旧内容\n<!-- readmind:reading-review:start -->x<!-- readmind:reading-review:end -->\n## 我的回顾\n用户文字");

    expect(markdown).toContain("- 总阅读时长：2 小时");
    expect(markdown).toContain("- 自然日均：30 分钟");
    expect(markdown).toContain("[[ReadMind/01 Sources/Books/书 A.md#^rm-h-period|查看划线]]");
    expect(markdown).toContain("当前累计知识沉淀");
    expect(markdown).toContain("用户文字");
    expect(markdown).not.toContain("remote");
    expect(markdown).not.toContain("hash");
  });

  it("computes monthly period range from baseTime", () => {
    const range = periodRange("monthly", Math.floor(new Date("2026-05-25T00:00:00Z").getTime() / 1000));
    expect(range.start.getMonth()).toBe(4);
    expect(range.end.getMonth()).toBe(5);
  });

  it("includes the same current-week evidence in weekly, monthly, and annual ranges", () => {
    const timestamp = "2026-05-25T10:00:00.000Z";
    const baseTime = Math.floor(new Date("2026-05-25T12:00:00Z").getTime() / 1000);
    for (const period of ["weekly", "monthly", "annually"] as const) {
      const data = pluginData();
      data.syncIndex["book-a"].sourceFragments![0].createdAt = timestamp;
      const summary = { ...monthlySummary(), period, baseTime };
      const preview = buildReadingReviewPreview(data, summary, defaultReadingReviewOptions(data, summary));
      expect(preview.input.books.flatMap((book) => book.evidences).some((evidence) => evidence.fragmentId === "f-period"), period).toBe(true);
    }
  });

  it("computes annual boundaries and file keys predictably", () => {
    const baseTime = Math.floor(new Date("2026-05-25T12:00:00Z").getTime() / 1000);
    const range = periodRange("annually", baseTime);

    expect(range.start.getFullYear()).toBe(2026);
    expect(range.start.getMonth()).toBe(0);
    expect(range.end.getFullYear()).toBe(2027);
    expect(periodKey("annually", baseTime)).toBe("2026");
  });

  it("keeps top statistic books without synced source notes as disabled candidates instead of throwing", () => {
    const data = pluginData();
    const summary = {
      ...monthlySummary(),
      topBooks: [
        ...monthlySummary().topBooks,
        { bookId: "book-stat-only", title: "只有统计的书", readSeconds: 600 },
      ],
    };
    const prepared = prepareReadingReview(data, summary);
    const statOnly = prepared.preview.candidates.find((book) => book.bookId === "book-stat-only");

    expect(statOnly).toMatchObject({
      title: "只有统计的书",
      confirmedEvidenceCount: 0,
      selectable: false,
      selected: false,
    });
  });

  it("does not let invalid createdAt break preparation", () => {
    const data = pluginData();
    data.syncIndex["book-a"].sourceFragments![0].createdAt = "not-a-date";
    const preview = buildReadingReviewPreview(data, monthlySummary(), {
      ...defaultReadingReviewOptions(data, monthlySummary()),
      selectedBookIds: ["book-a"],
      includeUnconfirmedEvidence: true,
    });

    expect(preview.counts.periodEvidence).toBe(0);
    expect(preview.input.books.flatMap((book) => book.evidences).some((evidence) => evidence.fragmentId === "f-period" && evidence.timeScope === "time_unconfirmed")).toBe(true);
  });
});

function monthlySummary(): ReadingJourneySummary {
  return {
    period: "monthly",
    baseTime: Math.floor(new Date("2026-05-25T00:00:00Z").getTime() / 1000),
    readDays: 4,
    totalReadSeconds: 7200,
    naturalDayAverageSeconds: 1800,
    compareRatio: 0.2,
    timeBuckets: [],
    topBooks: [{ bookId: "book-a", title: "书 A", author: "作者", readSeconds: 3600 }],
    readingStats: [],
    categoryPreferences: [],
  };
}

function pluginData(): ReadMindPluginData {
  const data = structuredClone(DEFAULT_PLUGIN_DATA);
  data.syncIndex = {
    "book-a": {
      bookId: "book-a",
      sourceFilePath: "ReadMind/01 Sources/Books/书 A.md",
      lastSyncedAt: "2026-05-25T00:00:00.000Z",
      sourceContentHash: "hash",
      syncStatus: "synced",
      aiStatus: "analyzed",
      pendingSuggestionCount: 0,
      sourceFragments: [
        fragment("f-period", "rm-h-period", "highlight", "2026-05-10T00:00:00.000Z"),
        fragment("f-old", "rm-h-old", "highlight", "2026-04-10T00:00:00.000Z"),
        fragment("f-unknown", "rm-t-unknown", "thought", undefined),
      ],
    },
  };
  data.cardIndex = {
    "card-a": {
      id: "card-a",
      title: "概念 A",
      normalizedTitle: "概念a",
      path: "ReadMind/03 Knowledge Cards/概念 A.md",
      filePath: "ReadMind/03 Knowledge Cards/概念 A.md",
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
      evidence: [{ sourceBookId: "book-a", sourceBookTitle: "书 A", sourceNotePath: "ReadMind/01 Sources/Books/书 A.md", blockId: "rm-h-period", fragmentId: "f-period", fragmentType: "highlight", text: "证据" }],
      sourceAnalysisPaths: [],
    },
    "card-old": {
      id: "card-old",
      title: "旧概念",
      normalizedTitle: "旧概念",
      path: "ReadMind/03 Knowledge Cards/旧概念.md",
      filePath: "ReadMind/03 Knowledge Cards/旧概念.md",
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
      evidence: [],
      sourceAnalysisPaths: [],
    },
  };
  data.confirmedRelations = {
    "rel-a": {
      id: "rel-a",
      leftCardId: "card-a",
      rightCardId: "card-old",
      title: "关系",
      relationType: "complements",
      explanation: "说明",
      leftEvidenceIds: [],
      rightEvidenceIds: [],
      acceptedAt: "2026-05-12T00:00:00.000Z",
      sourceSuggestionId: "s1",
    },
    "rel-old": {
      id: "rel-old",
      leftCardId: "card-old",
      rightCardId: "card-a",
      title: "旧关系",
      relationType: "contrasts",
      explanation: "说明",
      leftEvidenceIds: [],
      rightEvidenceIds: [],
      acceptedAt: "2026-04-12T00:00:00.000Z",
      sourceSuggestionId: "s2",
    },
  };
  return data;
}

function fragment(fragmentId: string, blockId: string, type: "highlight" | "thought", createdAt: string | undefined) {
  return {
    fragmentId,
    annotationId: fragmentId,
    blockId,
    sourceNotePath: "ReadMind/01 Sources/Books/书 A.md",
    type,
    bookId: "book-a",
    bookTitle: "书 A",
    author: "作者",
    text: "真实证据",
    sourceType: type,
    content: "真实证据",
    blockIdentifier: blockId,
    localNotePath: "ReadMind/01 Sources/Books/书 A.md",
    createdAt,
  };
}
