import type {
  AIProviderSettings,
  BookAnalysisResult,
  Confidence,
  LinkSuggestion,
  RelationSuggestion,
  RelationType,
  ReadingReviewResult,
} from "./types";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface ChatRequest {
  model: string;
  temperature: number;
  messages: ChatMessage[];
  response_format: { type: "json_object" };
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  kind?: "success" | "api_error" | "format_error";
  detail?: string;
}

export type ConnectionTestStage = "basic" | "ability";

export class AIRequestError extends Error {}
export class AIFormatError extends Error {
  constructor(message: string, readonly userMessage = "返回的分析结构不完整。") {
    super(message);
  }
}

export class OpenAICompatibleProvider {
  async testConnection(
    settings: AIProviderSettings,
    options: { onStage?: (stage: ConnectionTestStage) => void; timeoutMs?: number } = {},
  ): Promise<ConnectionTestResult> {
    validateAISettings(settings);
    try {
      options.onStage?.("basic");
      await this.generateJson(settings, {
        model: settings.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: "Return JSON only: {\"ok\": true}" }],
      }, options.timeoutMs);

      options.onStage?.("ability");
      const ability = validateBookAnalysisResult(await this.generateJson(settings, {
        model: settings.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是 ReadMind 的连接测试助手。只返回严格 JSON。" },
          { role: "user", content: buildReadMindAbilityTestPrompt() },
        ],
      }, options.timeoutMs));
      const filtered = validateKnownFragmentIds(ability, ["test-fragment-highlight", "test-fragment-thought"]);
      if (!filtered) {
        return {
          ok: false,
          kind: "format_error",
          message: "模型已连接，但未通过 ReadMind 分析格式验证。请重试或更换模型。",
          detail: "返回的来源依据不是测试摘录中的合法 ID。",
        };
      }
      return { ok: true, kind: "success", message: "连接成功，可用于 ReadMind AI 分析。" };
    } catch (error) {
      if (error instanceof AIFormatError) {
        return {
          ok: false,
          kind: "format_error",
          message: "模型已连接，但未通过 ReadMind 分析格式验证。请重试或更换模型。",
          detail: error.userMessage,
        };
      }
      return {
        ok: false,
        kind: "api_error",
        message: isTimeoutError(error) ? "请求超时，请重试或选择响应更快的模型。" : "连接失败，请检查 API Key、模型或网络设置。",
        detail: sanitizeAIError(error),
      };
    }
  }

  async generateBookAnalysis(settings: AIProviderSettings, request: ChatRequest): Promise<BookAnalysisResult> {
    const raw = await this.generateJson(settings, request);
    return validateBookAnalysisResult(raw);
  }

  async generateLinkSuggestions(settings: AIProviderSettings, request: ChatRequest): Promise<LinkSuggestion[]> {
    const raw = await this.generateJson(settings, request);
    return validateLinkSuggestions(raw);
  }

  async generateRelationSuggestions(settings: AIProviderSettings, request: ChatRequest): Promise<RelationSuggestion[]> {
    const raw = await this.generateJson(settings, request);
    return validateRelationSuggestions(raw);
  }

  async generateReadingReview(settings: AIProviderSettings, request: ChatRequest): Promise<ReadingReviewResult> {
    const raw = await this.generateJson(settings, request);
    return validateReadingReviewResult(raw);
  }

  private async generateJson(settings: AIProviderSettings, request: ChatRequest, timeoutMs = 60000): Promise<unknown> {
    validateAISettings(settings);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(buildChatCompletionsUrl(settings.baseUrl), {
        method: "POST",
        headers: buildHeaders(settings.apiKey),
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new AIRequestError(`AI 请求失败：HTTP ${response.status}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new AIRequestError("AI 响应为空。");
    }
    return extractJsonObject(content);
  }
}

export function validateAISettings(settings: AIProviderSettings): void {
  if (!settings.enabled) {
    throw new Error("请先在 ReadMind 设置中启用 AI。");
  }
  if (!settings.baseUrl.trim() || !settings.apiKey.trim() || !settings.model.trim()) {
    throw new Error("请完整配置 AI 的 Base URL、API Key 和 Model。");
  }
}

export function buildChatRequest(settings: AIProviderSettings, userContent: string): ChatRequest {
  return {
    model: settings.model,
    temperature: settings.temperature,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "你是 ReadMind 的阅读分析助手。只返回严格 JSON，不要返回 Markdown。",
      },
      {
        role: "user",
        content: userContent.slice(0, settings.maxInputChars),
      },
    ],
  };
}

export function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (trimmed.endsWith("/v1") || trimmed.endsWith("/v4")) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

export function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export function sanitizeAIError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "AI 连接失败，请检查 Base URL、模型名、密钥和网络。";
  }
  return error.message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "[REDACTED_API_KEY]");
}

export function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return JSON.parse(fenced[1].trim());
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }

  throw new AIFormatError("AI 响应不是有效 JSON。", "返回内容不是有效 JSON。");
}

export function validateBookAnalysisResult(raw: unknown): BookAnalysisResult {
  const value = raw as Partial<BookAnalysisResult>;
  if (!value || typeof value !== "object") {
    throw new AIFormatError("AI 输出结构无效。", "返回的整体结构无效。");
  }

  return {
    centralQuestions: stringArray(value.centralQuestions, "centralQuestions"),
    summary: requiredString(value.summary, "summary"),
    themes: array(value.themes, "themes").map((theme) => {
      const item = theme as {
        name?: unknown;
        title?: unknown;
        rationale?: unknown;
        sourceFragmentIds?: unknown;
        sourceAnnotationIds?: unknown;
        evidenceIds?: unknown;
      };
      return {
        name: requiredString(item.name ?? item.title, "theme.name"),
        rationale: requiredString(item.rationale, "theme.rationale"),
        sourceFragmentIds: stringArray(item.sourceFragmentIds ?? item.evidenceIds ?? item.sourceAnnotationIds, "theme.sourceFragmentIds"),
      };
    }),
    concepts: array(value.concepts, "concepts").map((concept) => {
      const item = concept as {
        name?: unknown;
        title?: unknown;
        explanation?: unknown;
        sourceFragmentIds?: unknown;
        sourceAnnotationIds?: unknown;
        evidenceIds?: unknown;
        confidence?: unknown;
      };
      return {
        name: requiredString(item.name ?? item.title, "concept.name"),
        explanation: requiredString(item.explanation, "concept.explanation"),
        sourceFragmentIds: stringArray(item.sourceFragmentIds ?? item.evidenceIds ?? item.sourceAnnotationIds, "concept.sourceFragmentIds"),
        confidence: confidence(item.confidence),
      };
    }),
    reflectionQuestions: stringArray(value.reflectionQuestions, "reflectionQuestions"),
  };
}

export function validateLinkSuggestions(raw: unknown): LinkSuggestion[] {
  const list = Array.isArray(raw) ? raw : array((raw as { suggestions?: unknown })?.suggestions, "suggestions");
  return list.map((suggestion, index) => {
    const item = suggestion as Partial<LinkSuggestion>;
    return {
      id: typeof item.id === "string" && item.id ? item.id : `suggestion-${index + 1}`,
      leftTarget: validateTarget(item.leftTarget, "leftTarget"),
      rightTarget: validateTarget(item.rightTarget, "rightTarget"),
      relationType: relationType(item.relationType),
      rationale: requiredString(item.rationale, "rationale"),
      confidence: confidence(item.confidence),
      status: "pending",
      leftEvidence: optionalStringArray(item.leftEvidence),
      rightEvidence: optionalStringArray(item.rightEvidence),
    };
  });
}

export function validateRelationSuggestions(raw: unknown): RelationSuggestion[] {
  const list = Array.isArray(raw) ? raw : array((raw as { suggestions?: unknown })?.suggestions, "suggestions");
  const now = new Date().toISOString();
  return list.map((suggestion, index) => {
    const item = suggestion as Partial<RelationSuggestion>;
    return {
      id: typeof item.id === "string" && item.id ? item.id : `relation-suggestion-${index + 1}`,
      title: requiredString(item.title, "title"),
      relationType: relationType(item.relationType),
      explanation: requiredString(item.explanation, "explanation"),
      leftCardId: requiredString(item.leftCardId, "leftCardId"),
      rightCardId: requiredString(item.rightCardId, "rightCardId"),
      leftEvidenceIds: stringArray(item.leftEvidenceIds, "leftEvidenceIds"),
      rightEvidenceIds: stringArray(item.rightEvidenceIds, "rightEvidenceIds"),
      confidence: confidence(item.confidence),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function validateReadingReviewResult(raw: unknown): ReadingReviewResult {
  const value = raw as Partial<ReadingReviewResult>;
  if (!value || typeof value !== "object") {
    throw new AIFormatError("阶段回顾输出结构无效。", "阶段回顾生成未完成，请重试或更换模型。");
  }
  return {
    overview: requiredString(value.overview, "overview"),
    focusBooks: array(value.focusBooks, "focusBooks").map((book) => {
      const item = book as { bookTitle?: unknown; observation?: unknown; evidenceIds?: unknown };
      return {
        bookTitle: requiredString(item.bookTitle, "focusBooks.bookTitle"),
        observation: requiredString(item.observation, "focusBooks.observation"),
        evidenceIds: stringArray(item.evidenceIds, "focusBooks.evidenceIds"),
      };
    }),
    themes: array(value.themes, "themes").map((theme) => {
      const item = theme as { title?: unknown; interpretation?: unknown; evidenceIds?: unknown; relatedCardIds?: unknown };
      return {
        title: requiredString(item.title, "themes.title"),
        interpretation: requiredString(item.interpretation, "themes.interpretation"),
        evidenceIds: stringArray(item.evidenceIds, "themes.evidenceIds"),
        relatedCardIds: optionalStringArray(item.relatedCardIds),
      };
    }),
    confirmedKnowledgeConnections: array(value.confirmedKnowledgeConnections, "confirmedKnowledgeConnections").map((relation) => {
      const item = relation as { relationId?: unknown; reflection?: unknown };
      return {
        relationId: requiredString(item.relationId, "confirmedKnowledgeConnections.relationId"),
        reflection: requiredString(item.reflection, "confirmedKnowledgeConnections.reflection"),
      };
    }),
    nextQuestions: stringArray(value.nextQuestions, "nextQuestions"),
  };
}

function validateTarget(value: unknown, name: string): { notePath: string; annotationIds: string[]; concept?: string } {
  const target = value as { notePath?: unknown; annotationIds?: unknown; concept?: unknown };
  return {
    notePath: requiredString(target?.notePath, `${name}.notePath`),
    annotationIds: stringArray(target?.annotationIds, `${name}.annotationIds`),
    concept: typeof target?.concept === "string" ? target.concept : undefined,
  };
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AIFormatError(`AI 输出缺少 ${name}。`, readableMissingField(name));
  }
  return value.trim();
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new AIFormatError(`AI 输出字段 ${name} 必须是数组。`, readableMissingField(name));
  }
  return value;
}

function stringArray(value: unknown, name: string): string[] {
  return array(value, name).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function confidence(value: unknown): Confidence {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function relationType(value: unknown): RelationType {
  if (
    value === "reinforces" ||
    value === "complements" ||
    value === "contrasts" ||
    value === "causal" ||
    value === "shared_question"
  ) {
    return value;
  }
  if (
    value === "same_concept" ||
    value === "complement" ||
    value === "contrast" ||
    value === "extension" ||
    value === "question"
  ) {
    return value;
  }
  return "extension";
}

export function buildReadMindAbilityTestPrompt(): string {
  return [
    "请基于以下两条虚拟测试摘录生成 ReadMind 单书分析结构。",
    "只返回 JSON，不要返回 Markdown 代码块，不要返回解释性文字。",
    "必须严格返回以下结构，不得省略字段：",
    JSON.stringify({
      centralQuestions: ["string"],
      summary: "string",
      themes: [{ name: "string", rationale: "string", sourceFragmentIds: ["test-fragment-highlight"] }],
      concepts: [{ name: "string", explanation: "string", sourceFragmentIds: ["test-fragment-thought"], confidence: "high|medium|low" }],
      reflectionQuestions: ["string"],
    }),
    "themes 每一项必须具有 name、rationale、sourceFragmentIds。",
    "concepts 每一项必须具有 name、explanation、sourceFragmentIds、confidence。",
    "sourceFragmentIds 只能引用输入中的 fragmentId。",
    "证据不足时可以少生成主题或概念，但不得省略结构字段。",
    "最小合法 JSON 示例：",
    JSON.stringify({
      centralQuestions: ["如何把注意力从自我转向世界？"],
      summary: "测试摘录强调幸福与注意力方向有关。",
      themes: [{ name: "注意力转向", rationale: "摘录直接说明从封闭自我转向世界。", sourceFragmentIds: ["test-fragment-highlight"] }],
      concepts: [{ name: "自我关注", explanation: "用户想继续观察自我关注的时刻。", sourceFragmentIds: ["test-fragment-thought"], confidence: "medium" }],
      reflectionQuestions: ["我何时最容易陷入封闭的自我关注？"],
    }),
    "测试输入：",
    JSON.stringify([
      {
        fragmentId: "test-fragment-highlight",
        annotationId: "test-highlight",
        blockId: "rm-h-test",
        sourceNotePath: "ReadMind/Test.md",
        type: "highlight",
        chapterTitle: "测试章节",
        text: "幸福需要把注意力从封闭的自我转向可参与的世界。",
      },
      {
        fragmentId: "test-fragment-thought",
        annotationId: "test-thought",
        blockId: "rm-t-test",
        sourceNotePath: "ReadMind/Test.md",
        type: "thought",
        chapterTitle: "测试章节",
        text: "我想继续观察自己什么时候会陷入自我关注。",
      },
    ]),
  ].join("\n");
}

export function validateKnownFragmentIds(result: BookAnalysisResult, fragmentIds: string[]): boolean {
  const allowed = new Set(fragmentIds);
  const themeOk = result.themes.length > 0
    && result.themes.every((theme) => theme.sourceFragmentIds.length > 0 && theme.sourceFragmentIds.every((id) => allowed.has(id)));
  const conceptOk = result.concepts.length > 0
    && result.concepts.every((concept) => concept.sourceFragmentIds.length > 0 && concept.sourceFragmentIds.every((id) => allowed.has(id)));
  return themeOk && conceptOk;
}

function readableMissingField(name: string): string {
  if (name.startsWith("theme.")) return "返回的主题结构不完整。";
  if (name.startsWith("concept.")) return "返回的概念结构不完整。";
  if (name === "themes") return "返回的主题列表格式不正确。";
  if (name === "concepts") return "返回的概念列表格式不正确。";
  return "返回的分析结构不完整。";
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
