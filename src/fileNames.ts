const ILLEGAL_FILE_CHARS = /[\\/:*?"<>|#^[\]]/g;

export function safeFileName(input: string, fallback = "Untitled"): string {
  const cleaned = input
    .replace(ILLEGAL_FILE_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return cleaned.length > 0 ? cleaned : fallback;
}

export function bookSourceFileName(title: string, author?: string): string {
  const suffix = author ? ` - ${author}` : "";
  return `${safeFileName(`${title}${suffix}`)}.md`;
}
