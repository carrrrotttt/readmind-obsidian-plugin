import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("styles", () => {
  it("keeps detail tabs separated from the divider", () => {
    const css = readFileSync("styles.css", "utf8");

    expect(css).toContain(".readmind-detail-tabs");
    expect(css).toContain("padding-bottom: 6px");
    expect(css).toContain("margin-bottom: 16px");
    expect(css).toContain(".readmind-detail-tab.is-active");
  });

  it("keeps relation workspace actions usable in narrow panes", () => {
    const css = readFileSync("styles.css", "utf8");

    expect(css).toContain(".readmind-suggestion-actions .setting-item-control");
    expect(css).toContain(".readmind-confirmed-relation-actions .setting-item-control");
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain("justify-content: flex-end");
    expect(css).toContain("@media (max-width: 520px)");
    expect(css).toContain(".readmind-suggestion-actions .setting-item-control button");
    expect(css).toContain(".readmind-confirmed-relation-actions .setting-item-control button");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("background: transparent");
    expect(css).toContain("border: 0");
  });

  it("keeps bookshelf cards compact with a bottom action bar", () => {
    const css = readFileSync("styles.css", "utf8");

    expect(css).toContain(".readmind-bookshelf-card");
    expect(css).toContain("flex-direction: column");
    expect(css).toContain(".readmind-book-card-body");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) 54px");
    expect(css).toContain(".readmind-book-card-cover");
    expect(css).toContain(".readmind-book-card-actions");
    expect(css).toContain("margin-top: auto");
    expect(css).toContain("background: var(--background-secondary)");
    expect(css).toContain("padding: 4px 6px");
    expect(css).toContain("display: flex");
    expect(css).toContain("align-items: center");
    expect(css).toContain(".readmind-book-card-actions .setting-item-control");
  });

  it("keeps knowledge card action rows right-aligned without panel backgrounds", () => {
    const css = readFileSync("styles.css", "utf8");

    expect(css).toContain(".readmind-card-actions");
    expect(css).toContain(".readmind-card-actions .setting-item-control");
    expect(css).toContain("justify-content: flex-end");
    expect(css).toContain("width: 100%");
  });

  it("uses a lightweight icon toolbar on the bookshelf", () => {
    const css = readFileSync("styles.css", "utf8");

    expect(css).toContain(".readmind-icon-toolbar");
    expect(css).toContain("background: transparent");
    expect(css).toContain("gap: 3px");
    expect(css).toContain("padding: 0");
    expect(css).toContain("margin: 0");
    expect(css).toContain(".readmind-icon-button");
    expect(css).toContain(".readmind-icon-text-button");
    expect(css).toContain("min-width: 32px");
    expect(css).toContain("gap: 5px");
    expect(css).toContain(":focus-visible");
  });

  it("keeps the reading journey overview responsive", () => {
    const css = readFileSync("styles.css", "utf8");

    expect(css).toContain(".readmind-reading-journey-view");
    expect(css).toContain(".readmind-journey-header");
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain(".readmind-journey-overview");
    expect(css).toContain("grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))");
    expect(css).toContain(".readmind-journey-trend");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain(".readmind-journey-book-actions");
    expect(css).toContain("justify-content: flex-end");
    expect(css).toContain(".readmind-journey-time-strip");
  });

  it("keeps the knowledge network responsive and non-overflowing", () => {
    const css = readFileSync("styles.css", "utf8");

    expect(css).toContain(".readmind-canvas-shell");
    expect(css).toContain("display: block");
    expect(css).toContain(".readmind-canvas");
    expect(css).toContain(".readmind-canvas-stage");
    expect(css).toContain(".readmind-canvas-edge");
    expect(css).toContain(".readmind-canvas-card");
    expect(css).toContain(".readmind-canvas-detail");
    expect(css).toContain("position: absolute");
    expect(css).toContain("right: 12px");
    expect(css).toContain("box-shadow: var(--shadow-l)");
    expect(css).toContain("position: absolute");
    expect(css).toContain("z-index: 1");
    expect(css).toContain("z-index: 2");
    expect(css).toContain("z-index: 4");
    expect(css).toContain(".readmind-network-actions .setting-item-control");
    expect(css).toContain("@media (max-width: 520px)");
    expect(css).toContain("min-height: 430px");
    expect(css).toContain("bottom: 8px");
  });
});
