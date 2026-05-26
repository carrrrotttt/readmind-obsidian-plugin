import { App, normalizePath, TFile } from "obsidian";

export async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const normalized = normalizePath(folderPath);
  const parts = normalized.split("/");
  let current = "";

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!(await app.vault.adapter.exists(current))) {
      await app.vault.createFolder(current);
    }
  }
}

export async function writeTextFile(app: App, filePath: string, content: string): Promise<void> {
  const normalized = normalizePath(filePath);
  const folder = normalized.split("/").slice(0, -1).join("/");
  if (folder) {
    await ensureFolder(app, folder);
  }
  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content);
  } else {
    await app.vault.create(normalized, content);
  }
}

export async function createUniqueTextFile(app: App, dir: string, baseName: string, content: string): Promise<string> {
  await ensureFolder(app, dir);
  const dot = baseName.toLowerCase().endsWith(".md") ? baseName.slice(0, -3) : baseName;
  let candidate = normalizePath(`${dir}/${dot}.md`);
  let index = 2;
  while (await app.vault.adapter.exists(candidate)) {
    candidate = normalizePath(`${dir}/${dot} ${index}.md`);
    index += 1;
  }
  await app.vault.create(candidate, content);
  return candidate;
}
