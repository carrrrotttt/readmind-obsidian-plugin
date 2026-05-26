import { describe, expect, it } from "vitest";
import {
  buildKnowledgeNetwork,
  buildRelationInputCards,
  createConfirmedRelation,
  defaultKnowledgeNodePosition,
  filterKnowledgeNetwork,
  relationTypeLabel,
  validateRelationSuggestionsForInput,
} from "../src/relationService";
import type { ConfirmedRelation, KnowledgeCardRecord, RelationSuggestion } from "../src/types";

describe("relation service", () => {
  it("builds AI input only from selected knowledge cards and evidence", () => {
    const input = buildRelationInputCards([card("c1", "虚荣")]);

    expect(input).toHaveLength(1);
    expect(input[0].cardId).toBe("c1");
    expect(input[0].evidence[0]).toMatchObject({
      sourceBookTitle: "幸福之路",
      blockId: "rm-h-c1",
      text: "证据 c1",
    });
  });

  it("drops suggestions with unknown card ids or evidence ids", () => {
    const input = buildRelationInputCards([card("c1", "A"), card("c2", "B")]);
    const valid = suggestion("c1", "c2", input[0].evidence[0].evidenceId, input[1].evidence[0].evidenceId);

    expect(validateRelationSuggestionsForInput([
      valid,
      suggestion("missing", "c2", input[0].evidence[0].evidenceId, input[1].evidence[0].evidenceId),
      suggestion("c1", "c2", "missing", input[1].evidence[0].evidenceId),
      { ...valid, id: "empty", leftEvidenceIds: [] },
    ], input)).toEqual([valid]);
  });

  it("maps relation type labels to Chinese", () => {
    expect(relationTypeLabel("contrasts")).toBe("观点对照");
    expect(relationTypeLabel("shared_question")).toBe("共同问题");
  });

  it("does not return already confirmed relations as new pending suggestions", () => {
    const input = buildRelationInputCards([card("c1", "A"), card("c2", "B")]);
    const candidate = suggestion("c1", "c2", input[0].evidence[0].evidenceId, input[1].evidence[0].evidenceId);
    const confirmed = createConfirmedRelation(candidate);

    expect(validateRelationSuggestionsForInput([candidate], input, { [confirmed.id]: confirmed })).toEqual([]);
  });

  it("builds network nodes only from knowledge cards and edges only from confirmed relations", () => {
    const network = buildKnowledgeNetwork([card("c1", "虚荣"), card("c2", "经验")], [
      relation("r1", "c1", "c2", "contrasts"),
      relation("missing", "c1", "missing", "contrasts"),
    ]);

    expect(network.cards.map((item) => item.id)).toEqual(["c1", "c2"]);
    expect(network.relations.map((item) => item.id)).toEqual(["r1"]);
  });

  it("filters knowledge network by name, relation type, source book, and direct card", () => {
    const c1 = card("c1", "虚荣", "book-a");
    const c2 = card("c2", "经验", "book-b");
    const c3 = card("c3", "快乐", "book-b");
    const network = buildKnowledgeNetwork([c1, c2, c3], [
      relation("r1", "c1", "c2", "contrasts"),
      relation("r2", "c2", "c3", "complements"),
    ]);

    expect(filterKnowledgeNetwork(network, { query: "虚" }).cards.map((item) => item.id)).toEqual(["c1"]);
    expect(filterKnowledgeNetwork(network, { relationType: "complements" }).relations.map((item) => item.id)).toEqual(["r2"]);
    expect(filterKnowledgeNetwork(network, { sourceBookId: "book-a" }).cards.map((item) => item.id)).toEqual(["c1"]);
    expect(filterKnowledgeNetwork(network, { directCardId: "c2" }).relations.map((item) => item.id)).toEqual(["r1", "r2"]);
  });

  it("gives new network nodes stable default positions", () => {
    expect(defaultKnowledgeNodePosition(0)).toEqual({ x: 0, y: 0 });
    expect(defaultKnowledgeNodePosition(1)).toEqual({ x: 300, y: 0 });
    expect(defaultKnowledgeNodePosition(4)).toEqual({ x: 0, y: 210 });
  });
});

function card(id: string, title: string, sourceBookId = `book-${id}`): KnowledgeCardRecord {
  return {
    id,
    title,
    normalizedTitle: title.toLowerCase(),
    path: `${title}.md`,
    filePath: `${title}.md`,
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
    evidence: [{
      sourceBookId,
      sourceBookTitle: "幸福之路",
      sourceNotePath: "ReadMind/01 Sources/Books/幸福之路.md",
      blockId: `rm-h-${id}`,
      fragmentId: `fragment-${id}`,
      fragmentType: "highlight",
      text: `证据 ${id}`,
    }],
    sourceAnalysisPaths: [],
  };
}

function relation(id: string, leftCardId: string, rightCardId: string, relationType: ConfirmedRelation["relationType"]): ConfirmedRelation {
  return {
    id,
    title: "关系",
    relationType,
    explanation: "说明",
    leftCardId,
    rightCardId,
    leftEvidenceIds: [],
    rightEvidenceIds: [],
    acceptedAt: "now",
    sourceSuggestionId: "s1",
  };
}

function suggestion(leftCardId: string, rightCardId: string, leftEvidenceId: string, rightEvidenceId: string): RelationSuggestion {
  return {
    id: `${leftCardId}-${rightCardId}`,
    title: "关系",
    relationType: "contrasts",
    explanation: "说明",
    leftCardId,
    rightCardId,
    leftEvidenceIds: [leftEvidenceId],
    rightEvidenceIds: [rightEvidenceId],
    confidence: "medium",
    status: "pending",
    createdAt: "now",
    updatedAt: "now",
  };
}
