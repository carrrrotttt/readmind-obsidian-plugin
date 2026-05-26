import { describe, expect, it } from "vitest";
import { stableJsonHash } from "../src/hash";

describe("hash", () => {
  it("is stable for object key order", () => {
    expect(stableJsonHash({ b: 1, a: 2 })).toBe(stableJsonHash({ a: 2, b: 1 }));
  });
});
