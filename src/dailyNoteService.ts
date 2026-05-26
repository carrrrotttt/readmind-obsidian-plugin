import { App, normalizePath } from "obsidian";
import { DAILY_BLOCK_END, DAILY_BLOCK_START } from "./constants";
import { buildDailyBlock, formatDate } from "./dailyNoteUtils";
import { replaceManagedBlock } from "./managedBlockUtils";
import type { DailyEvent, DailyNotesSettings } from "./types";
import { ensureFolder, writeTextFile } from "./vaultUtils";

export class DailyNoteService {
  constructor(
    private readonly app: App,
    private readonly settings: DailyNotesSettings,
  ) {}

  async updateToday(events: DailyEvent[]): Promise<string | undefined> {
    if (!this.settings.enabled) return undefined;
    const date = formatDate(new Date(), this.settings.dateFormat);
    const path = normalizePath(`${this.settings.folder}/${date}.md`);
    await ensureFolder(this.app, this.settings.folder);
    const exists = await this.app.vault.adapter.exists(path);
    const existing = exists ? await this.app.vault.adapter.read(path) : `# ${date}\n\n`;
    const content = replaceManagedBlock(existing, DAILY_BLOCK_START, DAILY_BLOCK_END, buildDailyBlock(events, date, this.settings));
    await writeTextFile(this.app, path, content);
    return path;
  }

}
