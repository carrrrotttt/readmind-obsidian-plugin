import { stableJsonHash } from "./hash";
import type { ReadingBookDetails, ReadMindSourceFragment } from "./types";

export function buildSourceFragments(
  book: ReadingBookDetails,
  localNotePath: string,
  blockIds: Record<string, string>,
): ReadMindSourceFragment[] {
  return book.annotations
    .filter((annotation) => annotation.type === "highlight" || annotation.type === "thought")
    .map((annotation) => ({
      fragmentId: stableJsonHash({
        sourceType: annotation.type,
        sourceHash: annotation.sourceHash,
        annotationId: annotation.id,
      }),
      annotationId: annotation.id,
      blockId: blockIds[annotation.id],
      sourceNotePath: localNotePath,
      type: annotation.type === "thought" ? "thought" : "highlight",
      chapterUid: annotation.chapterId,
      sourceType: annotation.type === "thought" ? "thought" : "highlight",
      bookId: book.id,
      bookTitle: book.title,
      author: book.author,
      chapterTitle: annotation.chapterTitle,
      relatedHighlightId: annotation.relatedHighlightId,
      locationLabel: annotation.locationLabel,
      text: annotation.text,
      content: annotation.text,
      blockIdentifier: blockIds[annotation.id],
      localNotePath,
      createdAt: annotation.createdAt,
    }));
}
