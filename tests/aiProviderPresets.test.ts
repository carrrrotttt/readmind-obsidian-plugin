import { describe, expect, it } from "vitest";
import { AI_PROVIDER_PRESETS, applyAIProviderPreset, getAIProviderPreset } from "../src/aiProviderPresets";
import type { AIProviderId, AIProviderSettings } from "../src/types";

describe("ai provider presets", () => {
  it("contains mainstream providers and custom OpenAI-compatible", () => {
    expect(AI_PROVIDER_PRESETS.map((preset) => preset.id)).toEqual([
      "openai",
      "deepseek",
      "qwen",
      "hunyuan",
      "zhipu",
      "kimi",
      "custom",
    ]);
  });

  it("applies base url and default model without clearing API key", () => {
    const settings = aiSettings("qwen");
    settings.apiKey = "local-only-key";

    applyAIProviderPreset(settings, "hunyuan");

    expect(settings.baseUrl).toBe("https://api.hunyuan.cloud.tencent.com/v1");
    expect(settings.model).toBe("hunyuan-turbos-latest");
    expect(settings.apiKey).toBe("local-only-key");
  });

  it("does not reuse the previous provider model when switching providers", () => {
    const settings = aiSettings("qwen");
    settings.model = "qwen3.6-max-preview";

    applyAIProviderPreset(settings, "deepseek");

    expect(settings.model).toBe("deepseek-v4-flash");
    expect(settings.model).not.toContain("qwen");
    expect(getAIProviderPreset("deepseek").modelOptions.map((model) => model.id)).not.toContain("deepseek-chat");
    expect(getAIProviderPreset("deepseek").modelOptions.map((model) => model.id)).not.toContain("deepseek-reasoner");
  });

  it("keeps custom provider editable", () => {
    const custom = getAIProviderPreset("custom");

    expect(custom.baseUrl).toBe("");
    expect(custom.defaultModel).toBe("");
    expect(custom.allowCustomModel).toBe(true);
  });
});

function aiSettings(providerId: AIProviderId): AIProviderSettings {
  const preset = getAIProviderPreset(providerId);
  return {
    enabled: true,
    providerType: "openai-compatible",
    providerId,
    baseUrl: preset.baseUrl,
    apiKey: "",
    model: preset.defaultModel,
    customModel: preset.defaultModel,
    temperature: 0.2,
    maxInputChars: 12000,
    includeUserThoughts: true,
    includeMetadata: true,
  };
}
