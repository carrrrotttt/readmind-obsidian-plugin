import type { AIProviderSettings, AnalysisRecord, PromptSettings, ReadingBookDetails, ReadingReviewInput, ReadMindSourceFragment, RelationInputCard } from "./types";

export function buildBookAnalysisPrompt(
  book: ReadingBookDetails,
  fragments: ReadMindSourceFragment[],
  settings: AIProviderSettings,
  prompts?: PromptSettings,
): string {
  const metadata = settings.includeMetadata
    ? {
      title: book.title,
      author: book.author ?? "未知",
      category: book.category ?? "未知",
      description: book.description ?? "",
    }
    : { bookId: book.id };

  const evidence = fragments
    .filter((fragment) => settings.includeUserThoughts || fragment.type !== "thought")
    .map((fragment) => ({
      fragmentId: fragment.fragmentId,
      annotationId: fragment.annotationId,
      blockId: fragment.blockId,
      sourceNotePath: fragment.sourceNotePath,
      type: fragment.type,
      chapterTitle: fragment.chapterTitle,
      text: fragment.text,
    }));

  return [
    prompts?.bookAnalysis?.trim() || "",
    "请只基于下方提供的真实来源摘录，生成单书 AI 分析。",
    "禁止补充摘录中没有出现的书中观点，证据不足时少输出，不要为了完整而编造。",
    "优先区分原文划线与用户想法：highlight 是作者观点或原文证据，thought 是读者自己的理解、疑问或回应。",
    "每条主题 themes 和每条概念 concepts 必须引用一个或多个输入中的 fragmentId。",
    "不要生成跨书关联、知识卡片、推荐或阅读统计。",
    "只返回严格 JSON，不要返回 Markdown。",
    "JSON 结构如下：",
    JSON.stringify({
      centralQuestions: ["string"],
      summary: "string",
      themes: [{ name: "string", rationale: "string", sourceFragmentIds: ["fragment-id"] }],
      concepts: [{ name: "string", explanation: "string", sourceFragmentIds: ["fragment-id"], confidence: "high|medium|low" }],
      reflectionQuestions: ["string"],
    }),
    "",
    "书籍元数据：",
    JSON.stringify(metadata),
    "",
    "真实来源摘录：",
    JSON.stringify(evidence),
  ].join("\n");
}

export function buildLinkSuggestionPrompt(records: AnalysisRecord[], prompts?: PromptSettings): string {
  const payload = records.map((record) => ({
    bookId: record.bookId,
    notePath: record.analysisFilePath,
    summary: record.result.summary,
    centralQuestions: record.result.centralQuestions,
    themes: record.result.themes,
    concepts: record.result.concepts,
  }));

  return [
    prompts?.linkSuggestion?.trim() || "",
    "请基于以下多本书的分析结果，找出跨书关联建议。",
    "要求：每条建议必须包含双方目标、annotationIds、关系类型、理由和置信度。",
    "只返回 JSON，结构如下：",
    JSON.stringify({
      suggestions: [
        {
          id: "string",
          leftTarget: { notePath: "string", annotationIds: ["annotation-id"], concept: "string" },
          rightTarget: { notePath: "string", annotationIds: ["annotation-id"], concept: "string" },
          relationType: "same_concept|complement|contrast|extension|question",
          rationale: "string",
          confidence: "high|medium|low",
          leftEvidence: ["string"],
          rightEvidence: ["string"],
        },
      ],
    }),
    "",
    JSON.stringify(payload),
  ].join("\n");
}

export function buildRelationSuggestionPrompt(cards: RelationInputCard[], prompts?: PromptSettings): string {
  return [
    prompts?.linkSuggestion?.trim() || "",
    "请只基于输入中的已确认知识卡片与真实阅读证据，生成跨卡片关联建议。",
    "不得补充输入之外的书籍内容、概念或摘录。",
    "每条关系必须说明为什么相关，并分别引用左右双方至少一个 evidenceId。",
    "优先少而可靠；证据不足时返回空 suggestions 数组。",
    "不要替用户确认，不要写入双链。",
    "只返回严格 JSON，不要返回 Markdown。",
    "JSON 结构：",
    JSON.stringify({
      suggestions: [{
        title: "string",
        relationType: "reinforces|complements|contrasts|causal|shared_question",
        explanation: "string",
        leftCardId: "card-id",
        rightCardId: "card-id",
        leftEvidenceIds: ["evidence-id"],
        rightEvidenceIds: ["evidence-id"],
        confidence: "high|medium|low",
      }],
    }),
    "",
    JSON.stringify({ cards }),
  ].join("\n");
}

export function buildReadingReviewPrompt(input: ReadingReviewInput): string {
  return [
    "请基于用户确认发送的统计摘要、书籍、来源证据、知识卡片和确认关系，生成阶段阅读回顾。",
    "统计数字属于事实信息，不能改写、补全、推算或纠错。",
    "period_confirmed 表示能够确认属于当前周期的内容。",
    "time_unconfirmed 表示只作为补充背景，不得称为本期新增。",
    "cumulative_only 表示当前累计知识沉淀，不得称为本期形成。",
    "每个关于阅读内容或关注主题的判断必须引用输入中的 evidenceId。",
    "每个知识联系判断只能引用输入中的 relationId。",
    "不生成不存在的摘录、书籍、卡片或关系，不生成书籍推荐。",
    "证据不足时允许少输出主题，不要强行扩写。",
    "只返回严格 JSON，不要返回 Markdown。",
    "JSON 结构如下：",
    JSON.stringify({
      overview: "string",
      focusBooks: [{ bookTitle: "string", observation: "string", evidenceIds: ["evidence-id"] }],
      themes: [{ title: "string", interpretation: "string", evidenceIds: ["evidence-id"], relatedCardIds: ["card-id"] }],
      confirmedKnowledgeConnections: [{ relationId: "relation-id", reflection: "string" }],
      nextQuestions: ["string"],
    }),
    "",
    "用户确认发送的输入：",
    JSON.stringify(input),
  ].join("\n");
}
