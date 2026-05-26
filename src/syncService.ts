import { App, normalizePath, TFile } from "obsidian";
import { stableJsonHash } from "./hash";
import { buildSourceNote, mergeManagedSourceBlock } from "./markdown";
import type { FrontmatterSettings, ReadingBookDetails, SyncLogEntry, SyncedBookRecord } from "./types";
import { ensureFolder } from "./vaultUtils";

export interface SyncServiceState {
  syncIndex: Record<string, SyncedBookRecord>;
  addLog(entry: SyncLogEntry): Promise<void>;
  save(): Promise<void>;
}

export class SyncService {
  constructor(
    private readonly app: App,
    private readonly sourcesDir: string,
    private readonly state: SyncServiceState,
    private readonly frontmatterSettings?: FrontmatterSettings,
  ) {}

  async syncBook(book: ReadingBookDetails): Promise<SyncedBookRecord> {
    const now = new Date().toISOString();
    const sourceHash = stableJsonHash({
      book: {
        id: book.id,
        source: book.source,
        title: book.title,
        author: book.author,
        sourceUpdatedAt: book.sourceUpdatedAt,
      },
      annotations: book.annotations,
    });

    const previous = this.state.syncIndex[book.id];
    const aiStatus = previous && previous.lastAnalyzedHash && previous.sourceContentHash !== sourceHash
      ? "stale"
      : previous?.aiStatus ?? "not_analyzed";

    const draftRecord: SyncedBookRecord = {
      bookId: book.id,
      sourceFilePath: previous?.sourceFilePath ?? "",
      lastSyncedAt: now,
      sourceContentHash: sourceHash,
      syncStatus: "synced",
      aiStatus,
      lastAnalyzedHash: previous?.lastAnalyzedHash,
      generatedCardIds: previous?.generatedCardIds ?? [],
      pendingSuggestionCount: previous?.pendingSuggestionCount ?? 0,
      sourceFragments: previous?.sourceFragments ?? [],
    };

    const built = buildSourceNote(book, draftRecord, this.frontmatterSettings);
    const filePath = normalizePath(`${this.sourcesDir}/${built.fileName}`);
    const record: SyncedBookRecord = { ...draftRecord, sourceFilePath: filePath };
    const finalBuilt = buildSourceNote(book, record, this.frontmatterSettings);
    record.sourceFragments = finalBuilt.sourceFragments;

    await ensureFolder(this.app, this.sourcesDir);
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      const existingContent = await this.app.vault.read(existing);
      await this.app.vault.modify(existing, mergeManagedSourceBlock(existingContent, finalBuilt.content));
    } else {
      await this.app.vault.create(filePath, finalBuilt.content);
    }

    this.state.syncIndex[book.id] = record;
    await this.state.addLog({
      id: `${now}-${book.id}`,
      at: now,
      bookId: book.id,
      title: book.title,
      level: "info",
      message: `同步完成：${book.annotations.length} 条笔记`,
    });
    await this.state.save();
    return record;
  }
}
