import type { KnowledgeCardRecord, LinkSuggestion } from "./types";

export function findCardForSuggestion(
  cards: Record<string, KnowledgeCardRecord>,
  suggestion: LinkSuggestion,
): KnowledgeCardRecord | undefined {
  const leftIds = new Set(suggestion.leftTarget.annotationIds);
  return Object.values(cards).find((card) => (card.sourceAnnotationIds ?? []).some((id) => leftIds.has(id)));
}
