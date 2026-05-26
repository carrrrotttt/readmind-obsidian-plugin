import { describe, expect, it } from "vitest";
import { buildDailyBlock, formatDate } from "../src/dailyNoteUtils";
import type { DailyNotesSettings } from "../src/types";

const settings: DailyNotesSettings = {
  enabled: true,
  folder: "ReadMind/05 Daily Reading",
  dateFormat: "YYYY-MM-DD",
  includeSyncedAnnotations: true,
  includeAIAnalysis: true,
  includeCards: true,
  includeAcceptedLinks: true,
};

describe("Daily Notes", () => {
  it("formats date", () => {
    expect(formatDate(new Date("2026-05-23T00:00:00Z"), "YYYY-MM-DD")).toBe("2026-05-23");
  });

  it("builds daily managed content", () => {
    const content = buildDailyBlock([
      {
        id: "1",
        at: "2026-05-23T12:00:00.000Z",
        type: "sync",
        title: "同步《书》",
        filePath: "ReadMind/01 Sources/Books/book.md",
        count: 2,
      },
    ], "2026-05-23", settings);

    expect(content).toContain("今日同步");
    expect(content).toContain("同步《书》");
  });
});
