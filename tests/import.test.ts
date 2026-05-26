import { describe, expect, it } from "vitest";
import { fixtureData } from "../src/fixtures";
import { MemoryReadingSourceAdapter, parseImportedReadingData } from "../src/sourceAdapters";

describe("reading source adapters", () => {
  it("loads fixture books", async () => {
    const adapter = new MemoryReadingSourceAdapter("fixture", "示例数据", fixtureData);
    const books = await adapter.listBooks();

    expect(books).toHaveLength(2);
    expect(books[0].title).toBe("清醒思考的练习");
  });

  it("imports valid ReadMind JSON", () => {
    const imported = parseImportedReadingData(JSON.stringify(fixtureData));

    expect(imported.books).toHaveLength(2);
    expect(imported.books[0].source).toBe("import");
    expect(imported.books[0].annotations[0].sourceHash).toBeTruthy();
  });

  it("rejects invalid JSON", () => {
    expect(() => parseImportedReadingData("{bad")).toThrow("JSON 格式错误");
  });
});
