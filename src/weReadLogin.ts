import type { ConnectionResult, WeReadSession } from "./types";
import type { WeReadDebugLogger } from "./weReadDiagnostics";
import { cookieNames, extractUserVidFromCookie } from "./weReadSession";

const WEREAD_LOGIN_URL = "https://weread.qq.com/#login";

interface WeReadLoginOptions {
  verifySession?: (session: WeReadSession) => Promise<boolean>;
  onDebug?: WeReadDebugLogger;
}

interface ElectronCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  session?: boolean;
}

interface ElectronSession {
  cookies: {
    get(filter: { domain?: string; url?: string }): Promise<ElectronCookie[]>;
  };
  webRequest?: {
    onCompleted(
      filter: { urls: string[] },
      listener: (details: {
        url: string;
        method: string;
        statusCode: number;
        responseHeaders?: Record<string, string[]>;
      }) => void,
    ): void;
  };
}

interface ElectronBrowserWindow {
  loadURL(url: string): Promise<void>;
  on(event: "closed", listener: () => void): void;
  close(): void;
  webContents?: {
    session?: ElectronSession;
    on(event: "did-navigate" | "did-finish-load", listener: () => void): void;
    getURL?(): string;
  };
}

interface ElectronRemote {
  BrowserWindow: new (options: Record<string, unknown>) => ElectronBrowserWindow;
  session: { defaultSession: ElectronSession };
}

export async function openWeReadQrLoginWindow(
  options: WeReadLoginOptions = {},
): Promise<ConnectionResult & { session?: WeReadSession }> {
  const remote = getElectronRemote();
  if (!remote) {
    return {
      ok: false,
      status: {
        state: "failed",
        message: "当前 Obsidian 环境无法访问 Electron 登录窗口。请确认在桌面端使用。",
      },
    };
  }

  return new Promise((resolve) => {
    options.onDebug?.({ stage: "window_opening", message: "创建微信读书登录窗口" });
    const win = new remote.BrowserWindow({
      width: 960,
      height: 720,
      title: "ReadMind - 微信读书扫码登录",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: `readmind-weread-login-${Date.now()}`,
      },
    });

    let finished = false;
    const loginSession = win.webContents?.session ?? remote.session.defaultSession;
    attachWindowRequestDiagnostics(loginSession, options.onDebug);
    let lastCookieSignature = "";
    let lastUrl = "";
    const timer = window.setInterval(async () => {
      const currentUrl = sanitizeUrl(win.webContents?.getURL?.() ?? "");
      if (currentUrl && currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        options.onDebug?.({ stage: "window_url_changed", data: { url: currentUrl } });
      }
      const session = await readWeReadSession(loginSession);
      if (!session) return;
      if (session.cookie === lastCookieSignature) return;
      lastCookieSignature = session.cookie;
      options.onDebug?.({
        stage: "cookie_read_finished",
        data: {
          cookieCount: cookieNames(session.cookie).length,
          cookieNames: cookieNames(session.cookie),
          hasUserVid: Boolean(session.userVid),
          hasWrVid: cookieNames(session.cookie).includes("wr_vid"),
          hasWrSkey: cookieNames(session.cookie).includes("wr_skey"),
          hasWrName: cookieNames(session.cookie).includes("wr_name"),
        },
      });
      options.onDebug?.({
        stage: "cookie_metadata",
        data: {
          cookies: (await readWereadCookies(loginSession)).map(describeCookieForDebug),
        },
      });
      if (options.verifySession) {
        options.onDebug?.({ stage: "session_verify_started", data: { cookieCount: cookieNames(session.cookie).length } });
        const verified = await options.verifySession(session);
        options.onDebug?.({ stage: verified ? "session_verify_succeeded" : "session_verify_failed" });
        if (!verified) return;
      }
      finished = true;
      window.clearInterval(timer);
      win.close();
      resolve({
        ok: true,
        session,
        status: {
          state: "connected",
          message: "微信读书登录成功，已保存本地会话。",
        },
      });
    }, 1500);

    win.on("closed", () => {
      window.clearInterval(timer);
      if (!finished) {
        options.onDebug?.({ stage: "window_closed_without_verified_session" });
        resolve({
          ok: false,
          status: {
            state: "failed",
            message: "扫码登录窗口已关闭，尚未获得有效微信读书登录态。",
          },
        });
      }
    });

    void win.loadURL(WEREAD_LOGIN_URL);
    options.onDebug?.({ stage: "window_opened", data: { url: WEREAD_LOGIN_URL } });
  });
}

async function readWeReadSession(electronSession: ElectronSession): Promise<WeReadSession | undefined> {
  const cookies = await readWereadCookies(electronSession);
  const relevant = cookies.filter(isLikelyWeReadCookie);
  const hasAnyWeReadCookie = relevant.some((cookie) => cookie.name.startsWith("wr_") || cookieDomain(cookie).includes("weread"));
  if (!hasAnyWeReadCookie) return undefined;

  const cookie = relevant.map((item) => `${item.name}=${item.value}`).join("; ");
  return {
    cookie,
    loginAt: new Date().toISOString(),
    lastVerifiedAt: undefined,
    expired: false,
    userVid: extractUserVidFromCookie(cookie),
  };
}

async function readWereadCookies(electronSession: ElectronSession): Promise<ElectronCookie[]> {
  const candidates = await Promise.all([
    electronSession.cookies.get({}).catch(() => []),
    electronSession.cookies.get({ url: "https://weread.qq.com" }).catch(() => []),
    electronSession.cookies.get({ url: "https://weread.qq.com/" }).catch(() => []),
    electronSession.cookies.get({ url: "https://i.weread.qq.com" }).catch(() => []),
    electronSession.cookies.get({ url: "https://i.weread.qq.com/" }).catch(() => []),
    electronSession.cookies.get({ domain: "weread.qq.com" }).catch(() => []),
    electronSession.cookies.get({ domain: ".weread.qq.com" }).catch(() => []),
    electronSession.cookies.get({ domain: "qq.com" }).catch(() => []),
    electronSession.cookies.get({ domain: ".qq.com" }).catch(() => []),
  ]);
  const byName = new Map<string, ElectronCookie>();
  for (const cookie of candidates.flat()) {
    byName.set(`${cookie.domain ?? ""}|${cookie.path ?? ""}|${cookie.name}`, cookie);
  }
  return [...byName.values()];
}

function attachWindowRequestDiagnostics(electronSession: ElectronSession, onDebug: WeReadDebugLogger | undefined): void {
  if (!electronSession.webRequest || !onDebug) return;
  electronSession.webRequest.onCompleted({ urls: ["*://*.weread.qq.com/*", "*://weread.qq.com/*"] }, (details) => {
    const safeUrl = sanitizeUrl(details.url);
    onDebug({
      stage: "window_request_completed",
      data: {
        url: safeUrl,
        method: details.method,
        status: details.statusCode,
        responseHeaderNames: Object.keys(details.responseHeaders ?? {}).sort(),
      },
    });
    if (safeUrl === "https://weread.qq.com/api/auth/getLoginInfo" && details.statusCode >= 200 && details.statusCode < 300) {
      onDebug({
        stage: "login_info_detected",
        data: {
          url: safeUrl,
          status: details.statusCode,
        },
      });
    }
  });
}

function isLikelyWeReadCookie(cookie: ElectronCookie): boolean {
  const domain = cookieDomain(cookie);
  return domain.includes("weread.qq.com") || domain.endsWith(".qq.com") || cookie.name.startsWith("wr_");
}

function describeCookieForDebug(cookie: ElectronCookie) {
  const saved = isLikelyWeReadCookie(cookie);
  return {
    name: cookie.name,
    domain: cookie.domain ?? "",
    path: cookie.path ?? "",
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    hasExpiration: typeof cookie.expirationDate === "number",
    session: Boolean(cookie.session),
    saved,
    excludedReason: saved ? undefined : "not_weread_domain_or_wr_prefix",
  };
}

function cookieDomain(cookie: ElectronCookie): string {
  return (cookie.domain ?? "").replace(/^\./, "");
}

function sanitizeUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split("?")[0] ?? "";
  }
}

function getElectronRemote(): ElectronRemote | undefined {
  const maybeRequire = (window as Window & { require?: (name: string) => unknown }).require;
  try {
    const electron = maybeRequire?.("electron") as { remote?: ElectronRemote } | undefined;
    return electron?.remote;
  } catch {
    return undefined;
  }
}
