import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildChatCompletionsUrl,
  buildChatRequest,
  buildReadMindAbilityTestPrompt,
  extractJsonObject,
  OpenAICompatibleProvider,
  sanitizeAIError,
  validateBookAnalysisResult,
  validateKnownFragmentIds,
  validateLinkSuggestions,
} from "../src/aiProvider";
import type { AIProviderSettings } from "../src/types";

const settings: AIProviderSettings = {
  enabled: true,
  providerType: "openai-compatible",
  providerId: "qwen",
  baseUrl: "https://example.com/v1",
  apiKey: "sk-secret",
  model: "demo-model",
  customModel: "demo-model",
  temperature: 0.2,
  maxInputChars: 1000,
  includeUserThoughts: true,
  includeMetadata: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ai provider helpers", () => {
  it("does not put API keys in request body", () => {
    const request = buildChatRequest(settings, "hello cookie token");
    const body = JSON.stringify(request);

    expect(body).not.toContain(settings.apiKey);
    expect(body).toContain("hello cookie token");
  });

  it("sanitizes API keys from errors", () => {
    expect(sanitizeAIError(new Error("bad Bearer sk-secret"))).not.toContain("sk-secret");
  });

  it("extracts fenced JSON", () => {
    expect(extractJsonObject("```json\n{\"ok\":true}\n```")).toEqual({ ok: true });
  });

  it("validates book analysis output", () => {
    const result = validateBookAnalysisResult({
      centralQuestions: ["问题"],
      summary: "摘要",
      themes: [{ name: "主题", rationale: "理由", sourceFragmentIds: ["f1"] }],
      concepts: [{ name: "概念", explanation: "说明", sourceFragmentIds: ["f1"], confidence: "high" }],
      reflectionQuestions: ["继续想"],
    });

    expect(result.concepts[0].confidence).toBe("high");
    expect(result.themes[0].sourceFragmentIds).toEqual(["f1"]);
  });

  it("normalizes safe analysis aliases before validation", () => {
    const result = validateBookAnalysisResult({
      centralQuestions: ["问题"],
      summary: "摘要",
      themes: [{ title: "主题", rationale: "理由", evidenceIds: ["f1"] }],
      concepts: [{ title: "概念", explanation: "说明", evidenceIds: ["f1"], confidence: "medium" }],
      reflectionQuestions: ["继续想"],
    });

    expect(result.themes[0]).toMatchObject({ name: "主题", sourceFragmentIds: ["f1"] });
    expect(result.concepts[0]).toMatchObject({ name: "概念", sourceFragmentIds: ["f1"] });
  });

  it("rejects invalid book analysis output", () => {
    expect(() => validateBookAnalysisResult({ summary: "missing" })).toThrow();
  });

  it("validates link suggestions output", () => {
    const suggestions = validateLinkSuggestions({
      suggestions: [{
        id: "s1",
        leftTarget: { notePath: "a.md", annotationIds: ["a1"] },
        rightTarget: { notePath: "b.md", annotationIds: ["b1"] },
        relationType: "contrast",
        rationale: "理由",
        confidence: "medium",
      }],
    });

    expect(suggestions[0].status).toBe("pending");
  });

  it("builds provider chat completion urls including v4 endpoints", () => {
    expect(buildChatCompletionsUrl("https://open.bigmodel.cn/api/paas/v4/")).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
    expect(buildChatCompletionsUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("uses only virtual fragments in ReadMind ability test", () => {
    const prompt = buildReadMindAbilityTestPrompt();

    expect(prompt).toContain("test-fragment-highlight");
    expect(prompt).toContain("test-fragment-thought");
    expect(prompt).not.toContain("幸福之路");
    expect(prompt).not.toContain("用户真实");
  });

  it("validates sourceFragmentIds for structure test", () => {
    expect(validateKnownFragmentIds({
      centralQuestions: ["问题"],
      summary: "摘要",
      themes: [{ name: "主题", rationale: "理由", sourceFragmentIds: ["test-fragment-highlight"] }],
      concepts: [{ name: "概念", explanation: "说明", sourceFragmentIds: ["missing"], confidence: "medium" }],
      reflectionQuestions: ["追问"],
    }, ["test-fragment-highlight"])).toBe(false);
  });

  it("separates API failures from ReadMind structure failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));

    const result = await new OpenAICompatibleProvider().testConnection(settings);

    expect(result.kind).toBe("api_error");
    expect(result.message).toBe("连接失败，请检查 API Key、模型或网络设置。");
  });

  it("returns a user-facing format failure for incomplete structures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ choices: [{ message: { content: "{\"ok\":true}" } }] }))
      .mockResolvedValueOnce(response({
        choices: [{
          message: {
            content: JSON.stringify({
              centralQuestions: ["问题"],
              summary: "摘要",
              themes: [{ rationale: "缺少名称", sourceFragmentIds: ["test-fragment-highlight"] }],
              concepts: [{ name: "概念", explanation: "说明", sourceFragmentIds: ["test-fragment-thought"], confidence: "medium" }],
              reflectionQuestions: ["追问"],
            }),
          },
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenAICompatibleProvider().testConnection(settings);

    expect(result.kind).toBe("format_error");
    expect(result.message).toBe("模型已连接，但未通过 ReadMind 分析格式验证。请重试或更换模型。");
    expect(result.detail).toBe("返回的主题结构不完整。");
  });

  it("passes ReadMind ability test for complete legal structures and emits stages", async () => {
    const stages: string[] = [];
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ choices: [{ message: { content: "{\"ok\":true}" } }] }))
      .mockResolvedValueOnce(response({
        choices: [{
          message: {
            content: JSON.stringify({
              centralQuestions: ["问题"],
              summary: "摘要",
              themes: [{ title: "主题", rationale: "理由", evidenceIds: ["test-fragment-highlight"] }],
              concepts: [{ title: "概念", explanation: "说明", evidenceIds: ["test-fragment-thought"], confidence: "medium" }],
              reflectionQuestions: ["追问"],
            }),
          },
        }],
      })));

    const result = await new OpenAICompatibleProvider().testConnection(settings, { onStage: (stage) => stages.push(stage) });

    expect(result).toMatchObject({ ok: true, kind: "success", message: "连接成功，可用于 ReadMind AI 分析。" });
    expect(stages).toEqual(["basic", "ability"]);
  });

  it("has timeout handling for slow connection tests", () => {
    const source = readFileSync("src/aiProvider.ts", "utf8");

    expect(source).toContain("timeoutMs = 60000");
    expect(source).toContain("请求超时，请重试或选择响应更快的模型。");
  });
});

function response(json: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => json,
  };
}
