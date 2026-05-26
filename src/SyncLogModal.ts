import { Modal } from "obsidian";
import type ReadMindPlugin from "./main";

export class SyncLogModal extends Modal {
  constructor(private readonly plugin: ReadMindPlugin) {
    super(plugin.app);
  }

  onOpen(): void {
    this.titleEl.setText("ReadMind 同步日志");
    const logs = this.plugin.store.data.syncLogs;
    if (logs.length === 0) {
      this.contentEl.createEl("p", { cls: "readmind-muted", text: "暂无同步日志。" });
      return;
    }
    for (const log of logs) {
      const item = this.contentEl.createDiv({ cls: "readmind-annotation" });
      item.createEl("div", { cls: "readmind-muted", text: `${log.at} · ${log.level}` });
      item.createEl("p", { text: `${log.title ?? log.bookId ?? "ReadMind"}：${log.message}` });
    }
  }
}
