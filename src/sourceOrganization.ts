import { friendlyChapterTitle } from "./displayText";
import type { ReadMindSourceFragment, SourceChapterGroup } from "./types";

export function groupSourceFragmentsByChapter(fragments: ReadMindSourceFragment[]): SourceChapterGroup[] {
  const groups = new Map<string, SourceChapterGroup & { firstIndex: number }>();

  fragments.forEach((fragment, index) => {
    const title = friendlyChapterTitle(fragment.chapterTitle);
    const key = fragment.chapterUid === undefined ? `title:${title}` : `uid:${fragment.chapterUid}`;
    const existing = groups.get(key);
    if (existing) {
      existing.fragments.push(fragment);
      return;
    }
    groups.set(key, {
      chapterTitle: title,
      chapterUid: fragment.chapterUid,
      fragments: [fragment],
      firstIndex: index,
    });
  });

  return [...groups.values()]
    .sort(compareChapterGroups)
    .map(({ firstIndex: _firstIndex, ...group }) => ({
      ...group,
      fragments: orderFragmentsInChapter(group.fragments),
    }));
}

export function highlightsInGroup(group: SourceChapterGroup): ReadMindSourceFragment[] {
  return group.fragments.filter((fragment) => fragment.type === "highlight");
}

export function thoughtsForHighlight(
  group: SourceChapterGroup,
  highlight: ReadMindSourceFragment,
): ReadMindSourceFragment[] {
  return group.fragments.filter((fragment) => {
    if (fragment.type !== "thought" && fragment.type !== "review") return false;
    if (fragment.relatedHighlightId && fragment.relatedHighlightId === highlight.annotationId) return true;
    return Boolean(
      fragment.chapterUid !== undefined
      && highlight.chapterUid !== undefined
      && String(fragment.chapterUid) === String(highlight.chapterUid)
      && fragment.locationLabel
      && highlight.locationLabel
      && fragment.locationLabel === highlight.locationLabel,
    );
  });
}

export function unlinkedThoughtsInGroup(group: SourceChapterGroup): ReadMindSourceFragment[] {
  const attached = new Set(
    highlightsInGroup(group).flatMap((highlight) => thoughtsForHighlight(group, highlight).map((fragment) => fragment.fragmentId)),
  );
  return group.fragments.filter((fragment) => {
    if (fragment.type !== "thought" && fragment.type !== "review") return false;
    return !attached.has(fragment.fragmentId);
  });
}

function compareChapterGroups(
  left: SourceChapterGroup & { firstIndex: number },
  right: SourceChapterGroup & { firstIndex: number },
): number {
  const leftNumber = chapterNumber(left.chapterUid);
  const rightNumber = chapterNumber(right.chapterUid);
  if (leftNumber !== undefined && rightNumber !== undefined && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left.firstIndex - right.firstIndex;
}

function orderFragmentsInChapter(fragments: ReadMindSourceFragment[]): ReadMindSourceFragment[] {
  return [...fragments].sort((left, right) => {
    const leftTime = left.createdAt ?? "";
    const rightTime = right.createdAt ?? "";
    if (leftTime && rightTime && leftTime !== rightTime) return leftTime.localeCompare(rightTime);
    if (left.type !== right.type) return left.type === "highlight" ? -1 : 1;
    return left.annotationId.localeCompare(right.annotationId);
  });
}

function chapterNumber(value: string | number | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}
