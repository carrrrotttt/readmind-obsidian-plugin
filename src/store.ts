import type ReadMindPlugin from "./main";
import { DEFAULT_PLUGIN_DATA } from "./defaultSettings";
import type { ReadMindPluginData, SyncLogEntry } from "./types";

export class PluginStore {
  data: ReadMindPluginData = structuredClone(DEFAULT_PLUGIN_DATA);

  constructor(private readonly plugin: ReadMindPlugin) {}

  async load(): Promise<void> {
    const raw = await this.plugin.loadData();
    this.data = {
      ...structuredClone(DEFAULT_PLUGIN_DATA),
      ...(raw ?? {}),
      settings: {
        ...structuredClone(DEFAULT_PLUGIN_DATA.settings),
        ...(raw?.settings ?? {}),
        wereadOfficial: {
          ...structuredClone(DEFAULT_PLUGIN_DATA.settings.wereadOfficial),
          ...(raw?.settings?.wereadOfficial ?? {}),
          connection: {
            ...structuredClone(DEFAULT_PLUGIN_DATA.settings.wereadOfficial.connection),
            ...(raw?.settings?.wereadOfficial?.connection ?? {}),
          },
        },
        ai: {
          ...structuredClone(DEFAULT_PLUGIN_DATA.settings.ai),
          ...(raw?.settings?.ai ?? {}),
        },
      },
      syncIndex: raw?.syncIndex ?? {},
      analysisIndex: raw?.analysisIndex ?? {},
      cardIndex: raw?.cardIndex ?? {},
      linkSuggestions: raw?.linkSuggestions ?? {},
      relationSuggestions: raw?.relationSuggestions ?? {},
      confirmedRelations: raw?.confirmedRelations ?? {},
      readingReviewIndex: raw?.readingReviewIndex ?? {},
      knowledgeNetworkLayout: {
        ...structuredClone(DEFAULT_PLUGIN_DATA.knowledgeNetworkLayout),
        ...(raw?.knowledgeNetworkLayout ?? {}),
        nodePositions: raw?.knowledgeNetworkLayout?.nodePositions ?? {},
      },
      dailyEvents: raw?.dailyEvents ?? [],
      selectedBookIds: raw?.selectedBookIds ?? [],
      syncLogs: raw?.syncLogs ?? [],
    };
  }

  async save(): Promise<void> {
    await this.plugin.saveData(this.data);
  }

  async addLog(entry: SyncLogEntry): Promise<void> {
    this.data.syncLogs = [entry, ...this.data.syncLogs].slice(0, 80);
  }

  isSelected(bookId: string): boolean {
    return this.data.selectedBookIds.includes(bookId);
  }

  async setSelected(bookId: string, selected: boolean): Promise<void> {
    const next = new Set(this.data.selectedBookIds);
    if (selected) {
      next.add(bookId);
    } else {
      next.delete(bookId);
    }
    this.data.selectedBookIds = [...next];
    await this.save();
  }
}
