import { describe, expect, it } from "vitest";
import { buildBookAnalysisPrompt } from "../src/aiPrompts";
import type { AIProviderSettings, ReadingBookDetails, ReadMindSourceFragment } from "../src/types";

describe("ai prompts", () => {
  it("uses only real source fragments with stable ids", () => {
    const prompt = buildBookAnalysisPrompt(book(), [fragment("f-real", "rm-h-stable")], settings());

    expect(prompt).toContain("f-real");
    expect(prompt).toContain("rm-h-stable");
    expect(prompt).toContain("sourceFragmentIds");
    expect(prompt).not.toContain("sourceAnnotationIds");
    expect(prompt).not.toContain("rm-a-001");
  });
});

function book(): ReadingBookDetails {
  return {
    id: "target-book",
    source: "weread",
    title: "幸福之路",
    author: "伯特兰·罗素",
    readingStatus: "reading",
    annotationCount: 1,
    thoughtCount: 0,
    annotations: [{ id: "h1", bookId: "target-book", type: "highlight", text: "真实划线", sourceHash: "hash" }],
  };
}

function fragment(fragmentId: string, blockId: string): ReadMindSourceFragment {
  return {
    fragmentId,
    annotationId: "h1",
    blockId,
    sourceNotePath: "ReadMind/01 Sources/Books/幸福之路.md",
    type: "highlight",
    sourceType: "highlight",
    bookId: "target-book",
    bookTitle: "幸福之路",
    text: "真实划线",
    content: "真实划线",
    blockIdentifier: blockId,
    localNotePath: "ReadMind/01 Sources/Books/幸福之路.md",
  };
}

function settings(): AIProviderSettings {
  return {
    enabled: true,
    providerType: "openai-compatible",
    providerId: "qwen",
    baseUrl: "https://example.com/v1",
    apiKey: "test",
    model: "test",
    customModel: "test",
    temperature: 0.2,
    maxInputChars: 12000,
    includeUserThoughts: true,
    includeMetadata: true,
  };
}
