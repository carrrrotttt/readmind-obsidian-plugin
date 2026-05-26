export function sanitizeCookie(cookie: string): string {
  return cookie
    .replace(/wr_skey=[^;]+/g, "wr_skey=[REDACTED]")
    .replace(/wr_vid=[^;]+/g, "wr_vid=[REDACTED]")
    .replace(/([^=;\s]+)=([^;]+)/g, "$1=[REDACTED]");
}

export function extractUserVidFromCookie(cookie: string): string | undefined {
  return cookie.match(/(?:^|;\s*)wr_vid=([^;]+)/)?.[1];
}

export function cookieNames(cookie: string): string[] {
  return cookie
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter(Boolean)
    .sort();
}

export function summarizeCookieHeader(cookie: string): { count: number; names: string[]; hasWrVid: boolean; hasWrSkey: boolean } {
  const names = cookieNames(cookie);
  return {
    count: names.length,
    names,
    hasWrVid: names.includes("wr_vid"),
    hasWrSkey: names.includes("wr_skey"),
  };
}

export function mergeSetCookieHeader(cookieHeader: string, setCookieHeader: string | undefined): { cookie: string; updatedNames: string[] } {
  if (!setCookieHeader) return { cookie: cookieHeader, updatedNames: [] };
  const cookies = new Map(parseCookiePairs(cookieHeader));
  const updatedNames: string[] = [];
  for (const [name, value] of parseSetCookiePairs(setCookieHeader)) {
    if (!name.startsWith("wr_")) continue;
    cookies.set(name, value);
    updatedNames.push(name);
  }
  return {
    cookie: [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
    updatedNames: [...new Set(updatedNames)].sort(),
  };
}

function parseCookiePairs(cookieHeader: string): Array<[string, string]> {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): [string, string] | undefined => {
      const index = part.indexOf("=");
      if (index <= 0) return undefined;
      return [part.slice(0, index), part.slice(index + 1)];
    })
    .filter((item): item is [string, string] => Boolean(item));
}

function parseSetCookiePairs(setCookieHeader: string): Array<[string, string]> {
  return splitSetCookieHeader(setCookieHeader)
    .map((part): [string, string] | undefined => {
      const pair = part.split(";")[0]?.trim() ?? "";
      const index = pair.indexOf("=");
      if (index <= 0) return undefined;
      return [pair.slice(0, index), pair.slice(index + 1)];
    })
    .filter((item): item is [string, string] => Boolean(item));
}

function splitSetCookieHeader(value: string): string[] {
  return value.split(/,(?=\s*[^;,=\s]+=[^;]*)/g).map((part) => part.trim()).filter(Boolean);
}
