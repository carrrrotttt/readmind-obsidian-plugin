import { describe, expect, it } from "vitest";
import { buildAnalysisMarkdown, buildKnowledgeCardMarkdown, createKnowledgeCardDraft } from "../src/aiMarkdown";
import { fixtureData } from "../src/fixtures";
import type { AnalysisRecord, ReadMindSourceFragment } from "../src/types";

describe("ai markdown", () => {
  it("contains stable source block links", () => {
    const book = fixtureData.books[0];
    const fragment = fragmentFor("f1", "ct-001", "rm-h-stable001");
    const record: AnalysisRecord = {
      bookId: book.id,
      analysisFilePath: "ReadMind/02 AI Analysis/Books/demo.md",
      sourceNotePath: "ReadMind/01 Sources/Books/demo.md",
      analyzedAt: "2026-05-23T00:00:00.000Z",
      inputContentHash: "hash",
      model: "demo",
      result: {
        centralQuestions: ["如何判断"],
        summary: "摘要",
        themes: [{ name: "判断", rationale: "理由", sourceFragmentIds: ["f1"] }],
        concepts: [{ name: "事实解释行动", explanation: "说明", sourceFragmentIds: ["f1"], confidence: "high" }],
        reflectionQuestions: ["问题"],
      },
      sourceFragments: [fragment],
    };

    const markdown = buildAnalysisMarkdown(book, record);
    expect(markdown).toContain("#^rm-h-stable001");
    expect(markdown).toContain("# 清醒思考的练习｜AI 分析");
    expect(markdown).toContain("## 主题洞察");
    expect(markdown).not.toContain("rm-a-001");
    expect(markdown).not.toContain("input_content_hash");
    expect(markdown).not.toContain("readmind_type");
    expect(markdown).not.toContain("book_id");
    expect(markdown).not.toContain("source_note");
    expect(markdown).not.toContain("ai_model");
    expect(markdown).not.toContain("analyzed_at");
  });

  it("keeps user additions when rebuilding analysis markdown", () => {
    const book = fixtureData.books[0];
    const fragment = fragmentFor("f1", "ct-001", "rm-h-stable001");
    const record: AnalysisRecord = {
      bookId: book.id,
      analysisFilePath: "ReadMind/02 AI Analyses/demo.md",
      sourceNotePath: "ReadMind/01 Sources/Books/demo.md",
      analyzedAt: "2026-05-23T00:00:00.000Z",
      inputContentHash: "hash-2",
      model: "demo",
      result: {
        centralQuestions: ["新问题"],
        summary: "新摘要",
        themes: [{ name: "新主题", rationale: "理由", sourceFragmentIds: ["f1"] }],
        concepts: [{ name: "新概念", explanation: "说明", sourceFragmentIds: ["f1"], confidence: "medium" }],
        reflectionQuestions: ["新追问"],
      },
      sourceFragments: [fragment],
    };
    const existing = `${buildAnalysisMarkdown(book, record)}\n## 我的补充\n\n用户自己的内容`;

    const markdown = buildAnalysisMarkdown(book, record, existing);

    expect(markdown).toContain("用户自己的内容");
  });

  it("builds card user and managed areas", () => {
    const draft = createKnowledgeCardDraft("概念", "说明", ["ct-001"], ["主题"]);
    const markdown = buildKnowledgeCardMarkdown(draft, fixtureData.books[0]);

    expect(markdown).toContain("readmind:links:start");
    expect(markdown).toContain("##");
  });
});

function fragmentFor(fragmentId: string, annotationId: string, blockId: string): ReadMindSourceFragment {
  return {
    fragmentId,
    annotationId,
    blockId,
    sourceNotePath: "ReadMind/01 Sources/Books/demo.md",
    type: "highlight",
    sourceType: "highlight",
    bookId: "book",
    bookTitle: "demo",
    text: "划线",
    content: "划线",
    blockIdentifier: blockId,
    localNotePath: "ReadMind/01 Sources/Books/demo.md",
  };
}
