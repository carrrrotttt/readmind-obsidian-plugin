import { Modal, Setting } from "obsidian";
import type ReadMindPlugin from "./main";
import type { KnowledgeCardRecord } from "./types";
import type { KnowledgeCardInput } from "./knowledgeService";

export class AnalysisConfirmModal extends Modal {
  private resolved = false;

  constructor(
    private readonly plugin: ReadMindPlugin,
    private readonly bookCount: number,
    private readonly annotationCount: number,
    private readonly onResolve: (confirmed: boolean) => void,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.titleEl.setText("确认发送给 AI 的数据");
    this.contentEl.createEl("p", {
      text: `本次将分析 ${this.bookCount} 本书、约 ${this.annotationCount} 条摘录。发送范围由设置中的“包含用户想法/元数据”控制。`,
    });
    this.contentEl.createEl("p", {
      cls: "readmind-muted",
      text: "ReadMind 不会把 API Key、Cookie、登录凭据发送给模型。",
    });
    new Setting(this.contentEl)
      .addButton((button) => {
        button.setCta().setButtonText("确认分析").onClick(() => this.resolve(true));
      })
      .addButton((button) => {
        button.setButtonText("取消").onClick(() => this.resolve(false));
      });
  }

  onClose(): void {
    if (!this.resolved) this.onResolve(false);
  }

  private resolve(value: boolean): void {
    this.resolved = true;
    this.close();
    this.onResolve(value);
  }
}

export class KnowledgeCardConfirmModal extends Modal {
  private resolved = false;

  constructor(
    private readonly plugin: ReadMindPlugin,
    private readonly input: KnowledgeCardInput,
    private readonly existingCard: KnowledgeCardRecord | undefined,
    private readonly onResolve: (action: "create" | "attach" | "open" | "cancel") => void,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    if (this.existingCard) {
      this.titleEl.setText(`已存在知识卡片《${this.existingCard.title}》`);
      this.contentEl.createEl("p", { text: `是否将当前书籍的证据追加到已有卡片？` });
    } else {
      this.titleEl.setText(`创建知识卡片：${this.input.title}`);
      this.contentEl.createEl("h3", { text: this.input.title });
      this.contentEl.createEl("p", { text: this.input.explanation });
    }
    const books = [...new Set(this.input.evidence.map((item) => `《${item.sourceBookTitle}》`))].join("、");
    this.contentEl.createEl("p", {
      cls: "readmind-muted",
      text: `将引用 ${this.input.evidence.length} 条来源依据。来源书籍：${books || "未知"}`,
    });
    new Setting(this.contentEl)
      .addButton((button) => {
        button
          .setCta()
          .setButtonText(this.existingCard ? "添加到已有卡片" : "确认创建")
          .onClick(() => this.resolve(this.existingCard ? "attach" : "create"));
      })
      .addButton((button) => {
        button
          .setButtonText("打开已有卡片")
          .setDisabled(!this.existingCard)
          .onClick(() => this.resolve("open"));
      })
      .addButton((button) => {
        button.setButtonText("取消").onClick(() => this.resolve("cancel"));
      });
  }

  onClose(): void {
    if (!this.resolved) this.onResolve("cancel");
  }

  private resolve(value: "create" | "attach" | "open" | "cancel"): void {
    this.resolved = true;
    this.close();
    this.onResolve(value);
  }
}
