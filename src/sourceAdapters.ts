import { stableJsonHash } from "./hash";
import type {
  ConnectionResult,
  ConnectionStatus,
  DataSourceMode,
  ImportedReadingData,
  ReadingAnnotation,
  ReadingBook,
  ReadingBookDetails,
  ReadingSourceAdapter,
  WeReadSession,
  WeReadOfficialGatewaySettings,
} from "./types";
import type { WeReadDebugLogger } from "./weReadDiagnostics";

export class MemoryReadingSourceAdapter implements ReadingSourceAdapter {
  constructor(
    public readonly id: DataSourceMode,
    public readonly name: string,
    private readonly data: ImportedReadingData,
  ) {}

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return {
      state: "connected",
      message: `${this.name} 已就绪`,
    };
  }

  async listBooks(): Promise<ReadingBook[]> {
    return this.data.books.map(({ annotations: _annotations, ...book }) => book);
  }

  async getBookDetails(bookId: string): Promise<ReadingBookDetails> {
    const book = this.data.books.find((item) => item.id === bookId);
    if (!book) {
      throw new Error(`未找到书籍：${bookId}`);
    }
    return book;
  }

  async getAnnotations(bookId: string): Promise<ReadingAnnotation[]> {
    return (await this.getBookDetails(bookId)).annotations;
  }
}

export class WeReadReadingSourceAdapter implements ReadingSourceAdapter {
  readonly id = "weread" as const;
  readonly name = "微信读书";

  constructor(
    private status: ConnectionStatus,
    private session?: WeReadSession,
    private readonly onDebug?: WeReadDebugLogger,
    private readonly onSessionUpdated?: (session: WeReadSession) => void | Promise<void>,
  ) {}

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return this.status;
  }

  async connect(): Promise<ConnectionResult> {
    this.status = this.session && !this.session.expired
      ? { state: "connected", message: "微信读书已连接。" }
      : { state: "disconnected", message: "请在设置页扫码登录微信读书。" };
    return { ok: false, status: this.status };
  }

  async disconnect(): Promise<void> {
    this.status = {
      state: "disconnected",
      message: "已清除本地微信读书登录状态。",
    };
    this.session = undefined;
  }

  async listBooks(): Promise<ReadingBook[]> {
    return (await this.client()).listBooks();
  }

  async getBookDetails(bookId: string): Promise<ReadingBookDetails> {
    return (await this.client()).getBookDetails(bookId);
  }

  async getAnnotations(bookId: string): Promise<ReadingAnnotation[]> {
    return (await this.getBookDetails(bookId)).annotations;
  }

  private async client() {
    if (!this.session || this.session.expired) {
      throw new Error("请先在设置页扫码登录微信读书。");
    }
    const { WeReadApiClient } = await import("./weReadApiClient");
    return new WeReadApiClient(this.session, this.onDebug, async (session) => {
      this.session = session;
      await this.onSessionUpdated?.(session);
    });
  }
}

export class OfficialGatewayProvider implements ReadingSourceAdapter {
  readonly id = "weread_official" as const;
  readonly name = "微信读书官方 API";

  constructor(
    private readonly settings: WeReadOfficialGatewaySettings,
    private readonly onDebug?: WeReadDebugLogger,
  ) {}

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return this.settings.connection;
  }

  async connect(): Promise<ConnectionResult> {
    await (await this.client()).testConnection();
    return {
      ok: true,
      status: { state: "connected", message: "微信读书官方 API 已连接。" },
    };
  }

  async disconnect(): Promise<void> {
    this.settings.apiKey = "";
    this.settings.connection = { state: "disconnected", message: "已清除微信读书官方 API Key。" };
  }

  async listBooks(): Promise<ReadingBook[]> {
    return (await this.client()).listBooks();
  }

  async getBookDetails(bookId: string): Promise<ReadingBookDetails> {
    return (await this.client()).getBookDetails(bookId);
  }

  async getAnnotations(bookId: string): Promise<ReadingAnnotation[]> {
    return (await this.getBookDetails(bookId)).annotations;
  }

  private async client() {
    const { OfficialGatewayClient } = await import("./officialGatewayClient");
    return new OfficialGatewayClient(this.settings, this.onDebug);
  }
}

export function parseImportedReadingData(raw: string): ImportedReadingData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("导入失败：JSON 格式错误。");
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as ImportedReadingData).books)) {
    throw new Error("导入失败：文件必须包含 books 数组。");
  }

  const books = (parsed as ImportedReadingData).books.map((book, index) => normalizeBook(book, index));
  return { books };
}

function normalizeBook(book: ReadingBookDetails, index: number): ReadingBookDetails {
  if (!book || typeof book !== "object") {
    throw new Error(`导入失败：第 ${index + 1} 本书不是有效对象。`);
  }
  if (!book.id || !book.title) {
    throw new Error(`导入失败：第 ${index + 1} 本书缺少 id 或 title。`);
  }
  if (!Array.isArray(book.annotations)) {
    throw new Error(`导入失败：《${book.title}》缺少 annotations 数组。`);
  }

  const annotations = book.annotations.map((annotation, annotationIndex) => {
    if (!annotation.id || !annotation.text || !annotation.type) {
      throw new Error(`导入失败：《${book.title}》第 ${annotationIndex + 1} 条摘录缺少必要字段。`);
    }

    return {
      ...annotation,
      bookId: book.id,
      sourceHash: annotation.sourceHash || stableJsonHash(annotation),
    };
  });

  return {
    ...book,
    source: book.source === "weread" ? "weread" : "import",
    readingStatus: book.readingStatus || "unknown",
    annotationCount: annotations.filter((item) => item.type !== "thought").length,
    thoughtCount: annotations.filter((item) => item.type === "thought").length,
    annotations,
  };
}
