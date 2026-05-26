import { createHash } from "crypto";

export function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function stableJsonHash(value: unknown): string {
  return hashText(JSON.stringify(sortValue(value)));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }

  return value;
}
