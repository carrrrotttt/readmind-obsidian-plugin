import { describe, expect, it, vi } from "vitest";
import { filterAnalysisEvidence } from "../src/analysisService";
import type { BookAnalysisResult, ReadMindSourceFragment } from "../src/types";

vi.mock("obsidian", () => ({
  TFile: class TFile {},
  normalizePath: (path: string) => path.replace(/\\/g, "/"),
}));

describe("analysis evidence filtering", () => {
  it("keeps only existing sourceFragmentIds for themes and concepts", () => {
    const result: BookAnalysisResult = {
      centralQuestions: ["问题"],
      summary: "摘要",
      themes: [
        { name: "有效主题", rationale: "理由", sourceFragmentIds: ["f1", "missing"] },
        { name: "无效主题", rationale: "理由", sourceFragmentIds: ["missing"] },
      ],
      concepts: [
        { name: "有效概念", explanation: "说明", sourceFragmentIds: ["f1"], confidence: "high" },
        { name: "无效概念", explanation: "说明", sourceFragmentIds: ["missing"], confidence: "low" },
      ],
      reflectionQuestions: ["追问"],
    };

    const filtered = filterAnalysisEvidence(result, [fragment("f1")]);

    expect(filtered.themes).toEqual([{ name: "有效主题", rationale: "理由", sourceFragmentIds: ["f1"] }]);
    expect(filtered.concepts).toEqual([{ name: "有效概念", explanation: "说明", sourceFragmentIds: ["f1"], confidence: "high" }]);
  });
});

function fragment(fragmentId: string): ReadMindSourceFragment {
  return {
    fragmentId,
    annotationId: "h1",
    blockId: "rm-h-stable",
    sourceNotePath: "ReadMind/01 Sources/Books/幸福之路.md",
    type: "highlight",
    sourceType: "highlight",
    bookId: "target-book",
    bookTitle: "幸福之路",
    text: "真实划线",
    content: "真实划线",
    blockIdentifier: "rm-h-stable",
    localNotePath: "ReadMind/01 Sources/Books/幸福之路.md",
  };
}
