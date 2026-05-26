import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("knowledge card flow", () => {
  it("creates cards from existing concept candidates without calling AI", () => {
    const source = readFileSync("src/main.ts", "utf8");
    const start = source.indexOf("async createKnowledgeCardFromConcept");
    const end = source.indexOf("async dismissConceptCandidate", start);
    const method = source.slice(start, end);

    expect(method).toContain("buildKnowledgeCardInput");
    expect(method).toContain("KnowledgeCardConfirmModal");
    expect(method).not.toContain("OpenAICompatibleProvider");
    expect(method).not.toContain("generateBookAnalysis");
  });

  it("persists concept candidate states in the analysis record", () => {
    const source = readFileSync("src/main.ts", "utf8");

    expect(source).toContain("analysis.conceptCandidates");
    expect(source).toContain("card_created");
    expect(source).toContain("attached_to_existing");
    expect(source).toContain("dismissed");
  });
});
