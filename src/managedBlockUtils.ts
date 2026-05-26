export function replaceManagedBlock(content: string, start: string, end: string, nextInner: string): string {
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end);
  const nextBlock = [start, nextInner.trimEnd(), end].join("\n");
  if (startIndex < 0 || endIndex < startIndex) {
    return `${content.trimEnd()}\n\n${nextBlock}\n`;
  }
  return `${content.slice(0, startIndex)}${nextBlock}${content.slice(endIndex + end.length)}`;
}
