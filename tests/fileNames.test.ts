import { describe, expect, it } from "vitest";
import { bookSourceFileName, safeFileName } from "../src/fileNames";

describe("file names", () => {
  it("removes unsafe characters", () => {
    expect(safeFileName('A/B:C*D?"E<>|#^[]')).toBe("A B C D E");
  });

  it("builds source file name", () => {
    expect(bookSourceFileName("清醒思考", "Demo")).toBe("清醒思考 - Demo.md");
  });
});
