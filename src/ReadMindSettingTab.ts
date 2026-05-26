import { Notice, PluginSettingTab, Setting } from "obsidian";
import { AI_PROVIDER_PRESETS, applyAIProviderPreset, getAIProviderPreset, providerStatusLabel } from "./aiProviderPresets";
import { connectionStateLabel } from "./displayText";
import type ReadMindPlugin from "./main";
import type { AIProviderId } from "./types";

export class ReadMindSettingTab extends PluginSettingTab {
  private aiAdvancedOpen = false;

  constructor(private readonly plugin: ReadMindPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const settings = this.plugin.store.data.settings;
    containerEl.empty();
    containerEl.createEl("h2", { text: "ReadMind / 书脉设置" });

    containerEl.createEl("h3", { text: "微信读书连接" });
    new Setting(containerEl)
      .setName("数据来源")
      .setDesc("连接成功后，书架主页会展示微信读书真实书架。")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("fixture", "示例数据")
          .addOption("import", "本地导入")
          .addOption("weread_official", "微信读书官方 API")
          .addOption("weread", "微信读书")
          .setValue(settings.dataSourceMode)
          .onChange(async (value) => {
            settings.dataSourceMode = value as typeof settings.dataSourceMode;
            await this.plugin.store.save();
            this.display();
          });
      });

    if (settings.dataSourceMode === "fixture") {
      new Setting(containerEl)
        .setName("示例数据")
        .setDesc("用于演示或无真实账号时测试 ReadMind。")
        .addButton((button) => {
          button.setButtonText("载入示例数据").onClick(async () => {
            await this.plugin.useFixtureData();
            this.display();
          });
        });
    }

    new Setting(containerEl)
      .setName("补充导入")
      .setDesc("将本地阅读数据导入 ReadMind，用于已有笔记或离线数据整理。")
      .addButton((button) => {
        button.setButtonText("导入本地阅读数据").onClick(async () => {
          await this.plugin.importReadingDataFromPicker();
          this.display();
        });
      });

    containerEl.createEl("h3", { text: "微信读书官方 API" });
    new Setting(containerEl)
      .setName("获取 API Key")
      .setDesc("打开微信读书官方 Skills 页面。")
      .addButton((button) => {
        button.setButtonText("打开页面").onClick(() => {
          window.open("https://weread.qq.com/r/weread-skills");
        });
      });

    new Setting(containerEl)
      .setName("官方 API Key")
      .setDesc(`状态：${connectionStateLabel(settings.wereadOfficial.connection.state)}。${settings.wereadOfficial.connection.message}`)
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(settings.wereadOfficial.apiKey).onChange(async (value) => {
          settings.wereadOfficial.apiKey = value.trim();
          await this.plugin.store.save();
        });
      })
      .addButton((button) => {
        button.setButtonText("测试连接").onClick(async () => {
          await this.plugin.testOfficialGatewayConnection();
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("清除连接").onClick(async () => {
          await this.plugin.clearOfficialGatewayConnection();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("官方 skill_version")
      .setDesc("默认使用官方 SKILL.md 顶部版本。")
      .addText((text) => {
        text.setValue(settings.wereadOfficial.skillVersion).onChange(async (value) => {
          settings.wereadOfficial.skillVersion = value.trim() || "1.0.3";
          await this.plugin.store.save();
        });
      });

    new Setting(containerEl)
      .setName("微信读书扫码登录")
      .setDesc(`状态：${connectionStateLabel(settings.wereadConnection.state)}。${settings.wereadConnection.message}`)
      .addButton((button) => {
        button.setButtonText("扫码登录").onClick(async () => {
          await this.plugin.openWeReadExperimentalConnection();
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("验证状态").onClick(async () => {
          await this.plugin.verifyWeReadConnection();
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("清除登录").onClick(async () => {
          await this.plugin.clearWeReadExperimentalConnection();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("微信读书 Debug 日志")
      .setDesc("默认关闭。开启后仅输出脱敏诊断信息，用于排查登录与接口问题。")
      .addToggle((toggle) => {
        toggle.setValue(settings.weReadDebugEnabled).onChange(async (value) => {
          settings.weReadDebugEnabled = value;
          await this.plugin.store.save();
        });
      });

    containerEl.createEl("h3", { text: "文件与模板" });
    this.addTextSetting(containerEl, "根目录", settings.rootDir, async (value) => {
      settings.rootDir = value.trim() || "ReadMind";
      await this.plugin.store.save();
    });
    this.addTextSetting(containerEl, "来源笔记目录", settings.sourcesDir, async (value) => {
      settings.sourcesDir = value.trim() || "ReadMind/01 Sources/Books";
      await this.plugin.store.save();
    });
    this.addTextSetting(containerEl, "AI 分析目录", settings.aiDir, async (value) => {
      settings.aiDir = value.trim() || "ReadMind/02 AI Analyses";
      await this.plugin.store.save();
    });
    this.addTextSetting(containerEl, "知识卡片目录", settings.cardsDir, async (value) => {
      settings.cardsDir = value.trim() || "ReadMind/03 Knowledge Cards";
      await this.plugin.store.save();
    });
    this.addTextSetting(containerEl, "关联建议目录", settings.suggestionsDir, async (value) => {
      settings.suggestionsDir = value.trim() || "ReadMind/04 Link Suggestions";
      await this.plugin.store.save();
    });

    new Setting(containerEl)
      .setName("生成 Frontmatter")
      .addToggle((toggle) => {
        toggle.setValue(settings.frontmatter.enabled).onChange(async (value) => {
          settings.frontmatter.enabled = value;
          await this.plugin.store.save();
        });
      });

    containerEl.createEl("h3", { text: "Daily Notes" });
    new Setting(containerEl)
      .setName("启用 Daily Notes")
      .addToggle((toggle) => {
        toggle.setValue(settings.dailyNotes.enabled).onChange(async (value) => {
          settings.dailyNotes.enabled = value;
          await this.plugin.store.save();
        });
      });
    this.addTextSetting(containerEl, "Daily Notes 目录", settings.dailyNotes.folder, async (value) => {
      settings.dailyNotes.folder = value.trim() || "ReadMind/05 Daily Reading";
      await this.plugin.store.save();
    });
    this.addTextSetting(containerEl, "日期格式", settings.dailyNotes.dateFormat, async (value) => {
      settings.dailyNotes.dateFormat = value.trim() || "YYYY-MM-DD";
      await this.plugin.store.save();
    });
    this.addToggleSetting(containerEl, "写入今日同步", settings.dailyNotes.includeSyncedAnnotations, async (value) => {
      settings.dailyNotes.includeSyncedAnnotations = value;
      await this.plugin.store.save();
    });
    this.addToggleSetting(containerEl, "写入今日 AI 分析", settings.dailyNotes.includeAIAnalysis, async (value) => {
      settings.dailyNotes.includeAIAnalysis = value;
      await this.plugin.store.save();
    });
    this.addToggleSetting(containerEl, "写入今日知识卡片", settings.dailyNotes.includeCards, async (value) => {
      settings.dailyNotes.includeCards = value;
      await this.plugin.store.save();
    });
    this.addToggleSetting(containerEl, "写入今日确认关联", settings.dailyNotes.includeAcceptedLinks, async (value) => {
      settings.dailyNotes.includeAcceptedLinks = value;
      await this.plugin.store.save();
    });

    containerEl.createEl("h3", { text: "AI 设置" });
    containerEl.createEl("p", {
      cls: "readmind-muted",
      text: "AI 请求只发送用户确认范围内的书籍元数据、划线和可选想法；不会发送 Cookie、token 或 API Key。",
    });
    const preset = getAIProviderPreset(settings.ai.providerId);

    new Setting(containerEl)
      .setName("启用 AI")
      .addToggle((toggle) => {
        toggle.setValue(settings.ai.enabled).onChange(async (value) => {
          settings.ai.enabled = value;
          await this.plugin.store.save();
        });
      });

    new Setting(containerEl)
      .setName("模型供应商")
      .setDesc(`${providerStatusLabel(preset)}。${preset.notes ?? ""}`)
      .addDropdown((dropdown) => {
        for (const item of AI_PROVIDER_PRESETS) {
          dropdown.addOption(item.id, item.label);
        }
        dropdown.setValue(preset.id).onChange(async (value) => {
          applyAIProviderPreset(settings.ai, value as AIProviderId);
          await this.plugin.store.save();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("模型")
      .setDesc(preset.allowCustomModel ? "可在高级设置中输入自定义模型名。" : "")
      .addDropdown((dropdown) => {
        for (const model of preset.modelOptions) {
          dropdown.addOption(model.id, model.label);
        }
        if (preset.allowCustomModel) dropdown.addOption("__custom", "自定义模型名");
        const value = preset.modelOptions.some((model) => model.id === settings.ai.model) ? settings.ai.model : "__custom";
        dropdown.setValue(value).onChange(async (next) => {
          if (next === "__custom") {
            settings.ai.model = settings.ai.customModel || preset.defaultModel;
          } else {
            settings.ai.model = next;
            settings.ai.customModel = next;
          }
          await this.plugin.store.save();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("AI 模型 API Key")
      .setDesc(`${preset.apiKeyLabel}。这是 AI 模型服务密钥，不是微信读书官方 API Key。仅保存在本地插件配置中。`)
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder(preset.apiKeyPlaceholder ?? preset.apiKeyLabel);
        text.setValue(settings.ai.apiKey).onChange(async (value) => {
          settings.ai.apiKey = value;
          await this.plugin.store.save();
        });
      })
      .addButton((button) => {
        button.setButtonText("清除").onClick(async () => {
          settings.ai.apiKey = "";
          await this.plugin.store.save();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("测试 AI 连接")
      .setDesc("会先测试基础连接，再用内置虚拟摘录验证 ReadMind JSON 分析结构。")
      .addButton((button) => {
        button.setButtonText("测试").onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("正在测试基础连接…");
          const result = await this.plugin.testAIConnection({
            onStage: (stage) => {
              button.setButtonText(stage === "basic" ? "正在测试基础连接…" : "正在验证 ReadMind 分析能力…");
            },
          });
          button.setDisabled(false);
          button.setButtonText("测试");
          new Notice(result.detail ? `${result.message}${result.kind === "format_error" ? ` ${result.detail}` : ""}` : result.message);
        });
      });

    new Setting(containerEl)
      .setName("高级设置")
      .setDesc(this.aiAdvancedOpen ? "已展开" : "默认隐藏 Base URL 与参数，普通用户无需修改。")
      .addButton((button) => {
        button.setButtonText(this.aiAdvancedOpen ? "收起" : "展开").onClick(() => {
          this.aiAdvancedOpen = !this.aiAdvancedOpen;
          this.display();
        });
      });

    if (this.aiAdvancedOpen || preset.id === "custom") {
      new Setting(containerEl)
        .setName("Base URL")
        .setDesc("兼容 OpenAI Chat Completions。预设供应商会自动填入，可按需覆盖。")
        .addText((text) => {
          text.setValue(settings.ai.baseUrl).onChange(async (value) => {
            settings.ai.baseUrl = value.trim();
            await this.plugin.store.save();
          });
        });

      new Setting(containerEl)
        .setName("自定义模型名")
        .setDesc("用于新模型、旧模型或自定义 OpenAI-compatible 服务。")
        .addText((text) => {
          text.setValue(settings.ai.customModel || settings.ai.model).onChange(async (value) => {
            settings.ai.customModel = value.trim();
            if (!preset.modelOptions.some((model) => model.id === settings.ai.model)) {
              settings.ai.model = settings.ai.customModel;
            }
            if (preset.id === "custom") settings.ai.model = settings.ai.customModel;
            await this.plugin.store.save();
          });
        });

      new Setting(containerEl)
        .setName("Temperature")
        .addText((text) => {
          text.setValue(String(settings.ai.temperature)).onChange(async (value) => {
            const next = Number(value);
            settings.ai.temperature = Number.isFinite(next) ? next : 0.2;
            await this.plugin.store.save();
          });
        });

      new Setting(containerEl)
        .setName("最大输入字符数")
        .addText((text) => {
          text.setValue(String(settings.ai.maxInputChars)).onChange(async (value) => {
            const next = Number(value);
            settings.ai.maxInputChars = Number.isFinite(next) && next > 0 ? Math.floor(next) : 12000;
            await this.plugin.store.save();
          });
        });

      new Setting(containerEl)
        .setName("包含用户想法")
        .addToggle((toggle) => {
          toggle.setValue(settings.ai.includeUserThoughts).onChange(async (value) => {
            settings.ai.includeUserThoughts = value;
            await this.plugin.store.save();
          });
        });

      new Setting(containerEl)
        .setName("包含书籍元数据")
        .addToggle((toggle) => {
          toggle.setValue(settings.ai.includeMetadata).onChange(async (value) => {
            settings.ai.includeMetadata = value;
            await this.plugin.store.save();
          });
        });
    }

    containerEl.createEl("h3", { text: "Prompt 配置" });
    this.addTextAreaSetting(containerEl, "单书分析 Prompt", settings.prompts.bookAnalysis, async (value) => {
      settings.prompts.bookAnalysis = value;
      settings.prompts.version = `prompt-${Date.now()}`;
      await this.plugin.store.save();
    });
    this.addTextAreaSetting(containerEl, "知识卡片 Prompt", settings.prompts.knowledgeCard, async (value) => {
      settings.prompts.knowledgeCard = value;
      settings.prompts.version = `prompt-${Date.now()}`;
      await this.plugin.store.save();
    });
    this.addTextAreaSetting(containerEl, "关联建议 Prompt", settings.prompts.linkSuggestion, async (value) => {
      settings.prompts.linkSuggestion = value;
      settings.prompts.version = `prompt-${Date.now()}`;
      await this.plugin.store.save();
    });

    containerEl.createEl("h3", { text: "隐私与安全" });
    containerEl.createEl("p", {
      cls: "readmind-muted",
      text: "微信读书 Cookie 只用于读取用户本人授权数据；Cookie 与 API Key 不会写入日志、Markdown 或发送给 AI 模型。",
    });
  }

  private addTextSetting(container: HTMLElement, name: string, value: string, onChange: (value: string) => Promise<void>): void {
    new Setting(container)
      .setName(name)
      .addText((text) => {
        text.setValue(value).onChange(onChange);
      });
  }

  private addToggleSetting(container: HTMLElement, name: string, value: boolean, onChange: (value: boolean) => Promise<void>): void {
    new Setting(container)
      .setName(name)
      .addToggle((toggle) => {
        toggle.setValue(value).onChange(onChange);
      });
  }

  private addTextAreaSetting(container: HTMLElement, name: string, value: string, onChange: (value: string) => Promise<void>): void {
    new Setting(container)
      .setName(name)
      .addTextArea((text) => {
        text.inputEl.rows = 5;
        text.inputEl.cols = 48;
        text.setValue(value).onChange(onChange);
      });
  }
}
