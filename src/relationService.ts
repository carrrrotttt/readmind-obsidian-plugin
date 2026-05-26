import { stableJsonHash } from "./hash";
import type {
  ConfirmedRelation,
  KnowledgeCardRecord,
  RelationInputCard,
  RelationInputEvidence,
  RelationSuggestion,
  RelationType,
} from "./types";

export function relationTypeLabel(type: RelationType): string {
  if (type === "reinforces") return "相互印证";
  if (type === "complements") return "补充延展";
  if (type === "contrasts") return "观点对照";
  if (type === "causal") return "因果关联";
  if (type === "shared_question") return "共同问题";
  return "补充延展";
}

export function relationStatusLabel(status: string): string {
  if (status === "accepted" || status === "edited_and_accepted") return "已确认";
  if (status === "later") return "暂不处理";
  if (status === "dismissed" || status === "ignored") return "已忽略";
  return "待处理";
}

export function evidenceId(cardId: string, fragmentId: string, blockId: string): string {
  return `ev-${stableJsonHash({ cardId, fragmentId, blockId }).slice(0, 12)}`;
}

export function buildRelationInputCards(cards: KnowledgeCardRecord[]): RelationInputCard[] {
  return cards.map((card) => ({
    cardId: card.id,
    title: card.title,
    explanation: "",
    evidence: (card.evidence ?? []).map((item): RelationInputEvidence => ({
      evidenceId: evidenceId(card.id, item.fragmentId, item.blockId),
      fragmentId: item.fragmentId,
      sourceBookTitle: item.sourceBookTitle,
      sourceBookAuthor: item.sourceBookAuthor,
      fragmentType: item.fragmentType,
      chapterTitle: item.chapterTitle,
      text: item.text ?? "",
      sourceNotePath: item.sourceNotePath,
      blockId: item.blockId,
    })),
  }));
}

export function validateRelationSuggestionsForInput(
  suggestions: RelationSuggestion[],
  inputCards: RelationInputCard[],
  existingRelations: Record<string, ConfirmedRelation> = {},
): RelationSuggestion[] {
  const cardIds = new Set(inputCards.map((card) => card.cardId));
  const evidenceByCard = new Map(inputCards.map((card) => [card.cardId, new Set(card.evidence.map((item) => item.evidenceId))]));
  const existingKeys = new Set(Object.values(existingRelations).map(relationKey));
  return suggestions.filter((suggestion) => {
    if (!cardIds.has(suggestion.leftCardId) || !cardIds.has(suggestion.rightCardId)) return false;
    if (suggestion.leftCardId === suggestion.rightCardId) return false;
    if (suggestion.leftEvidenceIds.length === 0 || suggestion.rightEvidenceIds.length === 0) return false;
    if (!suggestion.leftEvidenceIds.every((id) => evidenceByCard.get(suggestion.leftCardId)?.has(id))) return false;
    if (!suggestion.rightEvidenceIds.every((id) => evidenceByCard.get(suggestion.rightCardId)?.has(id))) return false;
    if (existingKeys.has(relationKey(suggestion))) return false;
    return true;
  });
}

export function createConfirmedRelation(suggestion: RelationSuggestion): ConfirmedRelation {
  const acceptedAt = new Date().toISOString();
  return {
    id: `rel-${stableJsonHash({
      leftCardId: suggestion.leftCardId,
      rightCardId: suggestion.rightCardId,
      title: suggestion.title,
      relationType: suggestion.relationType,
    }).slice(0, 12)}`,
    leftCardId: suggestion.leftCardId,
    rightCardId: suggestion.rightCardId,
    title: suggestion.title,
    relationType: suggestion.relationType,
    explanation: suggestion.explanation,
    leftEvidenceIds: suggestion.leftEvidenceIds,
    rightEvidenceIds: suggestion.rightEvidenceIds,
    acceptedAt,
    sourceSuggestionId: suggestion.id,
  };
}

export function relationKey(value: Pick<RelationSuggestion | ConfirmedRelation, "leftCardId" | "rightCardId" | "title" | "relationType">): string {
  const pair = [value.leftCardId, value.rightCardId].sort().join("|");
  return `${pair}|${value.relationType}|${value.title.trim().toLowerCase()}`;
}

export function buildKnowledgeNetwork(cards: KnowledgeCardRecord[], relations: ConfirmedRelation[]): { cards: KnowledgeCardRecord[]; relations: ConfirmedRelation[] } {
  const cardIds = new Set(cards.map((card) => card.id));
  return {
    cards,
    relations: relations.filter((relation) => cardIds.has(relation.leftCardId) && cardIds.has(relation.rightCardId)),
  };
}

export function filterKnowledgeNetwork(
  network: { cards: KnowledgeCardRecord[]; relations: ConfirmedRelation[] },
  filters: { query?: string; relationType?: RelationType | "all"; sourceBookId?: string; directCardId?: string } = {},
): { cards: KnowledgeCardRecord[]; relations: ConfirmedRelation[] } {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const sourceBookId = filters.sourceBookId ?? "all";
  let cards = network.cards.filter((card) => {
    const queryOk = !query || card.title.toLowerCase().includes(query);
    const bookOk = sourceBookId === "all" || (card.evidence ?? []).some((item) => item.sourceBookId === sourceBookId);
    return queryOk && bookOk;
  });
  const cardIds = new Set(cards.map((card) => card.id));
  let relations = network.relations.filter((relation) => {
    if (!cardIds.has(relation.leftCardId) || !cardIds.has(relation.rightCardId)) return false;
    return !filters.relationType || filters.relationType === "all" || relation.relationType === filters.relationType;
  });
  if (filters.directCardId) {
    relations = relations.filter((relation) => relation.leftCardId === filters.directCardId || relation.rightCardId === filters.directCardId);
  }
  if (filters.directCardId || (filters.relationType && filters.relationType !== "all")) {
    const visibleCardIds = new Set(relations.flatMap((relation) => [relation.leftCardId, relation.rightCardId]));
    cards = cards.filter((card) => visibleCardIds.has(card.id));
  }
  return { cards, relations };
}

export function defaultKnowledgeNodePosition(index: number): { x: number; y: number } {
  const columns = 4;
  return {
    x: (index % columns) * 300,
    y: Math.floor(index / columns) * 210,
  };
}
