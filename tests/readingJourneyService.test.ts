import { describe, expect, it } from "vitest";
import {
  formatCompareRatio,
  formatReadDuration,
  mapReadingJourneySummary,
  preferTimeHourLabel,
} from "../src/readingJourneyService";

describe("readingJourneyService", () => {
  it("keeps official total and average seconds as the main metrics", () => {
    const summary = mapReadingJourneySummary("monthly", {
      totalReadTime: 3600,
      dayAverageReadTime: 600,
      compare: 0.2,
      readTimes: [
        { time: 1716508800, readTime: 9999 },
        { time: 1716595200, readTime: 1 },
      ],
    });

    expect(summary.totalReadSeconds).toBe(3600);
    expect(summary.naturalDayAverageSeconds).toBe(600);
    expect(summary.compareRatio).toBe(0.2);
    expect(summary.timeBuckets.reduce((sum, item) => sum + item.seconds, 0)).toBe(10000);
  });

  it("formats seconds, natural compare ratio, and reading time fields safely", () => {
    expect(formatReadDuration(2220)).toBe("37 分钟");
    expect(formatReadDuration(66960)).toBe("18 小时 36 分钟");
    expect(formatCompareRatio(0.2)).toBe("增长 20%");
    expect(formatCompareRatio(-0.1)).toBe("下降 10%");

    const summary = mapReadingJourneySummary("weekly", {
      readLongest: [{ bookId: "b1", title: "书", readTime: 1800 }],
      preferCategory: [{ title: "哲学", readingTime: 1200 }],
      preferAuthor: [{ name: "作者", readTime: "3 小时 20 分钟" }],
    });

    expect(summary.topBooks[0].readSeconds).toBe(1800);
    expect(summary.categoryPreferences[0].seconds).toBe(1200);
    expect(summary.preferredAuthors?.[0].readTimeText).toBe("3 小时 20 分钟");
  });

  it("interprets preferTime from 6:00 through next day 5:00", () => {
    expect(preferTimeHourLabel(0)).toBe("6:00");
    expect(preferTimeHourLabel(18)).toBe("0:00");
    expect(preferTimeHourLabel(23)).toBe("5:00");

    const summary = mapReadingJourneySummary("overall", {
      preferTime: Array.from({ length: 24 }, (_, index) => index),
    });

    expect(summary.preferredTimeSeconds?.length).toBe(24);
    expect(summary.preferredTimeSeconds?.[23]).toBe(23);
  });

  it("omits missing optional modules without undefined or NaN values", () => {
    const summary = mapReadingJourneySummary("annually", {
      readLongest: [{}],
      preferCategory: [{}],
      preferAuthor: [{}],
      preferPublisher: [{}],
      readStat: {},
    });

    expect(summary.topBooks).toEqual([]);
    expect(summary.categoryPreferences).toEqual([]);
    expect(summary.preferredAuthors).toEqual([]);
    expect(summary.preferredPublishers).toEqual([]);
    expect(summary.readingStats).toEqual([]);
    expect(summary.totalReadSeconds).toBeUndefined();
  });
});
