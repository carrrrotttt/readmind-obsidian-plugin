import { describe, expect, it, vi } from "vitest";
import {
  buildKnowledgeCardMarkdown,
  buildKnowledgeEvidenceLinks,
  KnowledgeService,
  normalizeKnowledgeTitle,
  type KnowledgeCardInput,
} from "../src/knowledgeService";
import type { KnowledgeCardRecord } from "../src/types";
import { createConfirmedRelation, evidenceId } from "../src/relationService";

const { MockTFile } = vi.hoisted(() => ({
  MockTFile: class {
    constructor(readonly path: string) {}
  },
}));

vi.mock("obsidian", () => ({
  TFile: MockTFile,
  normalizePath: (path: string) => path.replace(/\\/g, "/"),
}));

describe("knowledge cards", () => {
  it("normalizes titles for dedupe", () => {
    expect(normalizeKnowledgeTitle("  Vanity， Test  ")).toBe("vanity, test");
  });

  it("creates markdown with stable block links and no visible internals", () => {
    const record = cardRecord();
    const markdown = buildKnowledgeCardMarkdown(record, "AI 初步解释");

    expect(markdown).toContain("# 虚荣");
    expect(markdown).toContain("[[ReadMind/01 Sources/Books/幸福之路 - 伯特兰·罗素.md#^rm-h-abc|查看原文划线]]");
    expect(markdown).toContain("## 我的理解");
    expect(markdown).not.toContain("fragmentId");
    expect(markdown).not.toContain("sourceBookId");
    expect(markdown).not.toContain("hash");
    expect(markdown).not.toContain("internal status");
  });

  it("keeps user understanding when updating markdown", () => {
    const record = cardRecord();
    const existing = buildKnowledgeCardMarkdown(record, "旧解释")
      .replace("<!-- 用户可以在此继续补充；插件不得覆盖该区域 -->", "用户手写理解");
    const next = buildKnowledgeCardMarkdown({ ...record, evidence: [...record.evidence, thoughtEvidence()] }, "新解释", existing);

    expect(next).toContain("用户手写理解");
    expect(next).toContain("#^rm-t-def");
  });

  it("does not duplicate the same source fragment", async () => {
    const app = mockApp();
    const service = new KnowledgeService(app as never, "ReadMind/03 Knowledge Cards", "ReadMind/04 Link Suggestions");
    const created = await service.createCard(input());
    const updated = await service.appendEvidence(created, input());

    expect(updated.evidence).toHaveLength(1);
    expect(app.files.get(created.filePath)).toContain("## 我的理解");
  });

  it("finds existing cards by normalized title", () => {
    const service = new KnowledgeService(mockApp() as never, "cards", "suggestions");
    expect(service.findExistingCard({ c1: cardRecord() }, " 虚荣 ")?.id).toBe("card-1");
  });

  it("builds evidence labels by fragment type", () => {
    expect(buildKnowledgeEvidenceLinks([highlightEvidence(), thoughtEvidence()]).join("\n")).toContain("查看我的想法");
  });

  it("writes confirmed relations to both cards without overwriting user understanding", async () => {
    const app = mockApp();
    const service = new KnowledgeService(app as never, "ReadMind/03 Knowledge Cards", "ReadMind/04 Link Suggestions");
    const left = await service.createCard(input());
    const right = await service.createCard({ ...input(), title: "痛苦", evidence: [thoughtEvidence()] });
    app.files.set(left.filePath, (app.files.get(left.filePath) ?? "").replace("<!-- 用户可以在此继续补充；插件不得覆盖该区域 -->", "用户自己的理解"));
    const suggestion = {
      id: "s1",
      title: "对照关系",
      relationType: "contrasts" as const,
      explanation: "两者构成对照。",
      leftCardId: left.id,
      rightCardId: right.id,
      leftEvidenceIds: [evidenceId(left.id, left.evidence[0].fragmentId, left.evidence[0].blockId)],
      rightEvidenceIds: [evidenceId(right.id, right.evidence[0].fragmentId, right.evidence[0].blockId)],
      confidence: "medium" as const,
      status: "pending" as const,
      createdAt: "now",
      updatedAt: "now",
    };
    const relation = createConfirmedRelation(suggestion);
    const cards = { [left.id]: left, [right.id]: right };

    await service.writeConfirmedRelations(left, [relation], cards);
    await service.writeConfirmedRelations(right, [relation], cards);

    expect(app.files.get(left.filePath)).toContain("[[ReadMind/03 Knowledge Cards/痛苦.md|痛苦]]");
    expect(app.files.get(left.filePath)).toContain("用户自己的理解");
    expect(app.files.get(right.filePath)).toContain("[[ReadMind/03 Knowledge Cards/虚荣.md|虚荣]]");
  });
});

function input(): KnowledgeCardInput {
  return {
    title: "虚荣",
    explanation: "AI 初步解释",
    evidence: [highlightEvidence()],
    sourceAnalysisPath: "ReadMind/02 AI Analyses/幸福之路 - AI分析.md",
  };
}

function cardRecord(): KnowledgeCardRecord {
  return {
    id: "card-1",
    title: "虚荣",
    normalizedTitle: "虚荣",
    path: "ReadMind/03 Knowledge Cards/虚荣.md",
    filePath: "ReadMind/03 Knowledge Cards/虚荣.md",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
    evidence: [highlightEvidence()],
    sourceAnalysisPaths: ["ReadMind/02 AI Analyses/幸福之路 - AI分析.md"],
  };
}

function highlightEvidence() {
  return {
    sourceBookId: "target-book",
    sourceBookTitle: "幸福之路",
    sourceBookAuthor: "伯特兰·罗素",
    sourceNotePath: "ReadMind/01 Sources/Books/幸福之路 - 伯特兰·罗素.md",
    blockId: "rm-h-abc",
    fragmentId: "fragment-h",
    fragmentType: "highlight" as const,
    chapterTitle: "拜伦式不幸",
  };
}

function thoughtEvidence() {
  return {
    ...highlightEvidence(),
    blockId: "rm-t-def",
    fragmentId: "fragment-t",
    fragmentType: "thought" as const,
  };
}

function mockApp() {
  const files = new Map<string, string>();
  return {
    files,
    vault: {
      adapter: { exists: async () => true },
      createFolder: async () => undefined,
      create: async (path: string, content: string) => {
        files.set(path, content);
      },
      getAbstractFileByPath: (path: string) => files.has(path) ? new MockTFile(path) : null,
      read: async (file: { path: string }) => files.get(file.path) ?? "",
      modify: async (file: { path: string }, content: string) => {
        files.set(file.path, content);
      },
    },
  };
}
