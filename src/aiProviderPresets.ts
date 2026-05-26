import type { AIProviderId, AIProviderPreset, AIProviderSettings } from "./types";

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    protocol: "openai-chat-completions",
    baseUrl: "https://api.openai.com/v1",
    modelOptions: [{ id: "gpt-5.5", label: "GPT-5.5", recommended: true }],
    defaultModel: "gpt-5.5",
    allowCustomModel: true,
    apiKeyLabel: "OpenAI API Key",
    verifiedInReadMind: false,
    notes: "预设支持，模型列表更新较快，可在高级设置中输入自定义模型名。",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "openai-chat-completions",
    baseUrl: "https://api.deepseek.com",
    modelOptions: [
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", recommended: true },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    ],
    defaultModel: "deepseek-v4-flash",
    allowCustomModel: true,
    apiKeyLabel: "DeepSeek API Key",
    verifiedInReadMind: false,
    notes: "预设支持；旧模型名可通过自定义模型名使用。",
  },
  {
    id: "qwen",
    label: "通义千问 / 阿里云百炼",
    protocol: "openai-chat-completions",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelOptions: [
      { id: "qwen3.6-max-preview", label: "Qwen3.6 Max Preview", recommended: true },
      { id: "qwen3.7-max", label: "Qwen3.7 Max" },
      { id: "qwen3.6-plus", label: "Qwen3.6 Plus" },
      { id: "qwen3.6-flash", label: "Qwen3.6 Flash" },
    ],
    defaultModel: "qwen3.6-max-preview",
    allowCustomModel: true,
    apiKeyLabel: "阿里云百炼 API Key",
    verifiedInReadMind: true,
    notes: "已在 ReadMind 中验证单书分析流程。",
  },
  {
    id: "hunyuan",
    label: "腾讯混元",
    protocol: "openai-chat-completions",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    modelOptions: [{ id: "hunyuan-turbos-latest", label: "混元 TurboS Latest", recommended: true }],
    defaultModel: "hunyuan-turbos-latest",
    allowCustomModel: true,
    apiKeyLabel: "腾讯混元 API Key",
    verifiedInReadMind: false,
    notes: "预设支持官方 OpenAI 兼容文本接口。",
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    protocol: "openai-chat-completions",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4/",
    modelOptions: [
      { id: "glm-5.1", label: "GLM-5.1", recommended: true },
      { id: "glm-4.7", label: "GLM-4.7" },
    ],
    defaultModel: "glm-5.1",
    allowCustomModel: true,
    apiKeyLabel: "智谱 API Key",
    verifiedInReadMind: false,
    notes: "预设支持通用对话接口。",
  },
  {
    id: "kimi",
    label: "月之暗面 / Kimi",
    protocol: "openai-chat-completions",
    baseUrl: "https://api.moonshot.cn/v1",
    modelOptions: [{ id: "kimi-k2.6", label: "Kimi K2.6", recommended: true }],
    defaultModel: "kimi-k2.6",
    allowCustomModel: true,
    apiKeyLabel: "Moonshot API Key",
    verifiedInReadMind: false,
    notes: "预设支持 OpenAI 兼容文本接口。",
  },
  {
    id: "custom",
    label: "自定义 OpenAI-compatible",
    protocol: "openai-chat-completions",
    baseUrl: "",
    modelOptions: [],
    defaultModel: "",
    allowCustomModel: true,
    apiKeyLabel: "AI 模型 API Key",
    verifiedInReadMind: false,
    notes: "自行填写 Base URL 与模型名，连接测试通过后使用。",
  },
];

export function getAIProviderPreset(id: AIProviderId | undefined): AIProviderPreset {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === id) ?? AI_PROVIDER_PRESETS.find((preset) => preset.id === "qwen")!;
}

export function applyAIProviderPreset(settings: AIProviderSettings, providerId: AIProviderId): void {
  const preset = getAIProviderPreset(providerId);
  const currentModelIsValid = preset.modelOptions.some((model) => model.id === settings.model);
  settings.providerId = providerId;
  settings.baseUrl = preset.baseUrl;
  if (!currentModelIsValid) {
    settings.model = preset.defaultModel;
    settings.customModel = preset.defaultModel;
  }
}

export function providerStatusLabel(preset: AIProviderPreset): string {
  if (preset.verifiedInReadMind) return "已验证";
  if (preset.id === "custom") return "自行测试";
  return "预设支持";
}
