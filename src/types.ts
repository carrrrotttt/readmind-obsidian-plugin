export type DataSourceMode = "fixture" | "import" | "weread" | "weread_official";
export type AIProviderId = "openai" | "deepseek" | "qwen" | "hunyuan" | "zhipu" | "kimi" | "custom";
export type ConnectionState = "disconnected" | "waiting_scan" | "confirming" | "connected" | "expired" | "failed";
export type SyncStatus = "not_synced" | "syncing" | "synced" | "update_available" | "failed";
export type AIStatus = "not_analyzed" | "analyzing" | "analyzed" | "stale" | "failed";
export type ReadingStatus = "reading" | "finished" | "unknown";
export type ReadingPeriod = "weekly" | "monthly" | "annually" | "overall";
export type ReadingReviewPeriod = "weekly" | "monthly" | "annually";
export type ReadingReviewEvidenceTimeScope = "period_confirmed" | "time_unconfirmed";
export type ReadingReviewKnowledgeTimeScope = "period_confirmed" | "cumulative_only";
export type AnnotationType = "highlight" | "thought" | "review" | "note";
export type AnnotationSubtype = "highlight_comment" | "chapter_thought" | "book_review";
export type Confidence = "high" | "medium" | "low";
export type RelationType =
  | "reinforces"
  | "complements"
  | "contrasts"
  | "causal"
  | "shared_question"
  | "same_concept"
  | "complement"
  | "contrast"
  | "extension"
  | "question";
export type LinkSuggestionStatus = "pending" | "accepted" | "edited_and_accepted" | "ignored" | "later";
export type RelationSuggestionStatus = "pending" | "accepted" | "edited_and_accepted" | "later" | "dismissed";
export type ConceptCandidateStatus = "unprocessed" | "card_created" | "attached_to_existing" | "dismissed";

export interface ConnectionStatus {
  state: ConnectionState;
  message: string;
  experimental?: boolean;
}

export interface ConnectionResult {
  ok: boolean;
  status: ConnectionStatus;
}

export interface ReadingBook {
  id: string;
  source: "weread" | "import" | "fixture";
  title: string;
  author?: string;
  coverUrl?: string;
  publisher?: string;
  isbn?: string;
  category?: string;
  description?: string;
  readingStatus: ReadingStatus;
  annotationCount: number;
  thoughtCount: number;
  readingProgress?: number;
  readingTimeMinutes?: number;
  lastReadAt?: string;
  sourceUpdatedAt?: string;
}

export interface WeReadSession {
  cookie: string;
  loginAt: string;
  lastVerifiedAt?: string;
  expired: boolean;
  userVid?: string;
}

export interface WeReadOfficialGatewaySettings {
  apiKey: string;
  skillVersion: string;
  connection: ConnectionStatus;
}

export interface ReadingAnnotation {
  id: string;
  bookId: string;
  chapterId?: string;
  chapterTitle?: string;
  type: AnnotationType;
  annotationSubtype?: AnnotationSubtype;
  text: string;
  relatedHighlightId?: string;
  locationLabel?: string;
  createdAt?: string;
  updatedAt?: string;
  sourceHash: string;
}

export interface ReadingBookDetails extends ReadingBook {
  annotations: ReadingAnnotation[];
}

export interface ReadingJourneySummary {
  period: ReadingPeriod;
  baseTime: number;
  readDays?: number;
  totalReadSeconds?: number;
  naturalDayAverageSeconds?: number;
  compareRatio?: number;
  timeBuckets: Array<{
    timestamp: number;
    seconds: number;
  }>;
  topBooks: Array<{
    bookId?: string;
    title: string;
    author?: string;
    cover?: string;
    readSeconds: number;
    tags?: string[];
    isAudio?: boolean;
  }>;
  readingStats: Array<{
    label: string;
    valueText: string;
  }>;
  categoryPreferences: Array<{
    title: string;
    seconds?: number;
    bookCount?: number;
    relativeValue?: number;
  }>;
  preferredTimeLabel?: string;
  preferredTimeSeconds?: number[];
  preferredAuthors?: Array<{
    name: string;
    count?: number;
    readTimeText?: string;
  }>;
  preferredPublishers?: Array<{
    name: string;
    count?: number;
  }>;
}

export interface ReadingReviewEvidence {
  evidenceId: string;
  fragmentId: string;
  blockId: string;
  sourceNotePath: string;
  sourceBookTitle: string;
  sourceBookAuthor?: string;
  fragmentType: "highlight" | "thought" | "review";
  chapterTitle?: string;
  text: string;
  createdAt?: string;
  timeScope: ReadingReviewEvidenceTimeScope;
}

export interface ReadingReviewInput {
  period: ReadingReviewPeriod;
  periodLabel: string;
  statistics: {
    readDays?: number;
    totalReadSeconds?: number;
    naturalDayAverageSeconds?: number;
    compareRatio?: number;
    selectedBooks: Array<{
      title: string;
      author?: string;
      readSeconds?: number;
    }>;
  };
  books: Array<{
    title: string;
    author?: string;
    evidences: ReadingReviewEvidence[];
  }>;
  knowledgeCards: Array<{
    cardId: string;
    title: string;
    explanation: string;
    evidenceIds: string[];
    timeScope: ReadingReviewKnowledgeTimeScope;
  }>;
  confirmedRelations: Array<{
    relationId: string;
    title: string;
    relationType: string;
    explanation: string;
    leftCardId: string;
    rightCardId: string;
    timeScope: ReadingReviewKnowledgeTimeScope;
  }>;
}

export interface ReadingReviewResult {
  overview: string;
  focusBooks: Array<{
    bookTitle: string;
    observation: string;
    evidenceIds: string[];
  }>;
  themes: Array<{
    title: string;
    interpretation: string;
    evidenceIds: string[];
    relatedCardIds?: string[];
  }>;
  confirmedKnowledgeConnections: Array<{
    relationId: string;
    reflection: string;
  }>;
  nextQuestions: string[];
}

export interface SyncedBookRecord {
  bookId: string;
  sourceFilePath: string;
  lastSyncedAt: string;
  sourceContentHash: string;
  syncStatus: SyncStatus;
  aiStatus: AIStatus;
  lastAnalyzedHash?: string;
  generatedCardIds?: string[];
  pendingSuggestionCount: number;
  sourceFragments?: ReadMindSourceFragment[];
}

export interface ReadMindSourceFragment {
  fragmentId: string;
  annotationId: string;
  blockId: string;
  sourceNotePath: string;
  type: "highlight" | "thought" | "review";
  chapterUid?: string | number;
  bookId: string;
  bookTitle: string;
  author?: string;
  chapterTitle?: string;
  relatedHighlightId?: string;
  locationLabel?: string;
  text: string;
  sourceType: "highlight" | "thought";
  content: string;
  blockIdentifier: string;
  localNotePath: string;
  createdAt?: string;
}

export interface SourceChapterGroup {
  chapterTitle: string;
  chapterUid?: string | number;
  fragments: ReadMindSourceFragment[];
}

export interface AIProviderSettings {
  enabled: boolean;
  providerType: "openai-compatible";
  providerId: AIProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  customModel: string;
  temperature: number;
  maxInputChars: number;
  includeUserThoughts: boolean;
  includeMetadata: boolean;
  lastConnectionTest?: {
    ok: boolean;
    providerId: AIProviderId;
    model: string;
    testedAt: string;
  };
}

export interface AIProviderPreset {
  id: AIProviderId;
  label: string;
  protocol: "openai-chat-completions";
  baseUrl: string;
  modelOptions: Array<{
    id: string;
    label: string;
    recommended?: boolean;
  }>;
  defaultModel: string;
  allowCustomModel: boolean;
  apiKeyLabel: string;
  apiKeyPlaceholder?: string;
  verifiedInReadMind: boolean;
  notes?: string;
}

export interface PromptSettings {
  version: string;
  bookAnalysis: string;
  knowledgeCard: string;
  linkSuggestion: string;
}

export interface TemplateSettings {
  sourceNote: string;
  aiAnalysis: string;
  knowledgeCard: string;
  dailyNote: string;
}

export interface FrontmatterSettings {
  enabled: boolean;
  includeBookId: boolean;
  includeSource: boolean;
  includeTitle: boolean;
  includeAuthor: boolean;
  includeSyncStatus: boolean;
  includeAIStatus: boolean;
  includeTags: boolean;
}

export interface DailyNotesSettings {
  enabled: boolean;
  folder: string;
  dateFormat: string;
  includeSyncedAnnotations: boolean;
  includeAIAnalysis: boolean;
  includeCards: boolean;
  includeAcceptedLinks: boolean;
}

export interface DailyEvent {
  id: string;
  at: string;
  type: "sync" | "analysis" | "card" | "link";
  title: string;
  filePath?: string;
  count?: number;
}

export interface BookAnalysisResult {
  centralQuestions: string[];
  summary: string;
  themes: Array<{ name: string; rationale: string; sourceFragmentIds: string[] }>;
  concepts: Array<{
    name: string;
    explanation: string;
    sourceFragmentIds: string[];
    confidence: Confidence;
  }>;
  reflectionQuestions: string[];
}

export interface KnowledgeCardDraft {
  title: string;
  definition: string;
  sourceAnnotationIds: string[];
  relatedThemeNames: string[];
  userPrompts?: string[];
}

export interface KnowledgeEvidence {
  sourceBookId: string;
  sourceBookTitle: string;
  sourceBookAuthor?: string;
  sourceNotePath: string;
  blockId: string;
  fragmentId: string;
  fragmentType: "highlight" | "thought" | "review";
  chapterTitle?: string;
  text?: string;
}

export interface RelationInputEvidence {
  evidenceId: string;
  fragmentId: string;
  sourceBookTitle: string;
  sourceBookAuthor?: string;
  fragmentType: "highlight" | "thought" | "review";
  chapterTitle?: string;
  text: string;
  sourceNotePath: string;
  blockId: string;
}

export interface RelationInputCard {
  cardId: string;
  title: string;
  explanation: string;
  evidence: RelationInputEvidence[];
}

export interface ConceptCandidateRecord {
  status: ConceptCandidateStatus;
  cardId?: string;
  updatedAt: string;
}

export interface LinkSuggestion {
  id: string;
  leftTarget: { notePath: string; annotationIds: string[]; concept?: string };
  rightTarget: { notePath: string; annotationIds: string[]; concept?: string };
  relationType: RelationType;
  rationale: string;
  confidence: Confidence;
  status: LinkSuggestionStatus;
  leftEvidence?: string[];
  rightEvidence?: string[];
}

export interface RelationSuggestion {
  id: string;
  title: string;
  relationType: RelationType;
  explanation: string;
  leftCardId: string;
  rightCardId: string;
  leftEvidenceIds: string[];
  rightEvidenceIds: string[];
  confidence: Confidence;
  status: RelationSuggestionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ConfirmedRelation {
  id: string;
  leftCardId: string;
  rightCardId: string;
  title: string;
  relationType: RelationType;
  explanation: string;
  leftEvidenceIds: string[];
  rightEvidenceIds: string[];
  acceptedAt: string;
  sourceSuggestionId: string;
}

export interface KnowledgeNetworkLayout {
  nodePositions: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; scale: number };
  updatedAt: string;
}

export interface AnalysisRecord {
  bookId: string;
  analysisFilePath: string;
  sourceNotePath: string;
  analyzedAt: string;
  inputContentHash: string;
  model: string;
  result: BookAnalysisResult;
  sourceFragments: ReadMindSourceFragment[];
  conceptCandidates?: Record<string, ConceptCandidateRecord>;
}

export interface KnowledgeCardRecord {
  id: string;
  title: string;
  normalizedTitle: string;
  path: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  evidence: KnowledgeEvidence[];
  sourceAnalysisPaths: string[];
  sourceBookId?: string;
  sourceAnnotationIds?: string[];
}

export interface SyncLogEntry {
  id: string;
  at: string;
  bookId?: string;
  title?: string;
  level: "info" | "error";
  message: string;
}

export interface ReadMindSettings {
  schemaVersion: number;
  dataSourceMode: DataSourceMode;
  rootDir: string;
  sourcesDir: string;
  aiDir: string;
  cardsDir: string;
  suggestionsDir: string;
  readingReviewsDir: string;
  importedData?: ImportedReadingData;
  wereadConnection: ConnectionStatus;
  wereadSession?: WeReadSession;
  wereadOfficial: WeReadOfficialGatewaySettings;
  weReadDebugEnabled: boolean;
  dailyNotes: DailyNotesSettings;
  templates: TemplateSettings;
  frontmatter: FrontmatterSettings;
  prompts: PromptSettings;
  ai: AIProviderSettings;
  firstAnalysisConfirmed: boolean;
}

export interface ReadMindPluginData {
  settings: ReadMindSettings;
  syncIndex: Record<string, SyncedBookRecord>;
  analysisIndex: Record<string, AnalysisRecord>;
  cardIndex: Record<string, KnowledgeCardRecord>;
  linkSuggestions: Record<string, LinkSuggestion>;
  relationSuggestions: Record<string, RelationSuggestion>;
  confirmedRelations: Record<string, ConfirmedRelation>;
  readingReviewIndex: Record<string, {
    period: ReadingReviewPeriod;
    periodKey: string;
    filePath: string;
    generatedAt: string;
    model: string;
  }>;
  knowledgeNetworkLayout: KnowledgeNetworkLayout;
  dailyEvents: DailyEvent[];
  selectedBookIds: string[];
  syncLogs: SyncLogEntry[];
}

export interface ImportedReadingData {
  books: ReadingBookDetails[];
}

export interface ReadingSourceAdapter {
  id: DataSourceMode;
  name: string;
  getConnectionStatus(): Promise<ConnectionStatus>;
  connect?(): Promise<ConnectionResult>;
  disconnect?(): Promise<void>;
  listBooks(): Promise<ReadingBook[]>;
  getBookDetails(bookId: string): Promise<ReadingBookDetails>;
  getAnnotations(bookId: string): Promise<ReadingAnnotation[]>;
}
