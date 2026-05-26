import { describe, expect, it } from "vitest";
import { findCardForSuggestion } from "../src/linkSuggestionUtils";
import { replaceManagedBlock } from "../src/managedBlockUtils";
import type { KnowledgeCardRecord, LinkSuggestion } from "../src/types";

const suggestion: LinkSuggestion = {
  id: "s1",
  leftTarget: { notePath: "left.md", annotationIds: ["a1"], concept: "A" },
  rightTarget: { notePath: "right.md", annotationIds: ["b1"], concept: "B" },
  relationType: "extension",
  rationale: "理由",
  confidence: "medium",
  status: "pending",
};

describe("link suggestions", () => {
  it("finds a card by source annotation", () => {
    const card: KnowledgeCardRecord = {
      id: "c1",
      title: "A",
      normalizedTitle: "a",
      path: "card.md",
      filePath: "card.md",
      sourceBookId: "book",
      sourceAnnotationIds: ["a1"],
      createdAt: "now",
      updatedAt: "now",
      evidence: [],
      sourceAnalysisPaths: [],
    };

    expect(findCardForSuggestion({ c1: card }, suggestion)?.id).toBe("c1");
  });

  it("updates only managed link block", () => {
    const content = [
      "# Card",
      "用户内容",
      "<!-- readmind:links:start -->",
      "old",
      "<!-- readmind:links:end -->",
    ].join("\n");
    const next = replaceManagedBlock(content, "<!-- readmind:links:start -->", "<!-- readmind:links:end -->", "new");

    expect(next).toContain("用户内容");
    expect(next).toContain("new");
    expect(next).not.toContain("old");
  });

  it("ignored suggestions are not pending", () => {
    const ignored: LinkSuggestion = { ...suggestion, status: "ignored" };
    expect(ignored.status === "pending").toBe(false);
  });
});
