import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("ReadingJourneyView", () => {
  it("registers and opens a center reading journey tab without duplicating leaves", () => {
    const main = readFileSync(join(process.cwd(), "src", "main.ts"), "utf8");
    const constants = readFileSync(join(process.cwd(), "src", "constants.ts"), "utf8");

    expect(constants).toContain('VIEW_TYPE_READING_JOURNEY = "readmind-reading-journey-view"');
    expect(main).toContain("new ReadingJourneyView");
    expect(main).toContain("getLeavesOfType(VIEW_TYPE_READING_JOURNEY)");
    expect(main).toContain('this.app.workspace.getLeaf("tab")');
    expect(main).toContain("async openReadingJourney()");
  });

  it("defaults to monthly and requests all four official modes through the plugin service", () => {
    const source = readFileSync(join(process.cwd(), "src", "ReadingJourneyView.ts"), "utf8");
    const client = readFileSync(join(process.cwd(), "src", "officialGatewayClient.ts"), "utf8");

    expect(source).toContain('private period: ReadingPeriod = "monthly"');
    expect(source).toContain('const PERIODS: ReadingPeriod[] = ["weekly", "monthly", "annually", "overall"]');
    expect(source).toContain("this.plugin.loadReadingJourney(this.period)");
    expect(source).toContain("private async loadSummary()");
    expect(client).toContain('this.callGateway<unknown>("/readdata/detail", { mode: period })');
  });

  it("keeps reading journey read-only and shows local ReadMind sediment from structured store data", () => {
    const source = readFileSync(join(process.cwd(), "src", "ReadingJourneyView.ts"), "utf8");

    expect(source).toContain("Object.values(this.plugin.store.data.cardIndex)");
    expect(source).toContain("Object.values(this.plugin.store.data.confirmedRelations)");
    expect(source).toContain("打开知识网络");
    expect(source).toContain("请先在设置中连接微信读书官方 API");
    expect(source).not.toContain("analyzeBooks");
    expect(source).not.toContain("generateRelationSuggestionsForCards");
    expect(source).not.toContain("openai");
  });
});
