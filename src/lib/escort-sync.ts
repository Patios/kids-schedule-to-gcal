import type { EscortColor } from "./schedule";

export type EscortPayload = {
  updatedAt: string | null;
  marks: Record<string, EscortColor>;
};

function asset(path: string) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}${path}`;
}

function cloudUrl() {
  return process.env.NEXT_PUBLIC_ESCORT_SYNC_URL?.trim() ?? "";
}

function cloudKey() {
  return process.env.NEXT_PUBLIC_ESCORT_SYNC_KEY?.trim() ?? "";
}

function isJsonBin(url: string) {
  return /jsonbin\.io/i.test(url);
}

function jsonBinBase(url: string) {
  return url.replace(/\/+$/, "").replace(/\/latest$/i, "");
}

function readUrl(url: string) {
  if (!isJsonBin(url)) return url;
  return `${jsonBinBase(url)}/latest`;
}

function writeUrl(url: string) {
  if (!isJsonBin(url)) return url;
  return jsonBinBase(url);
}

function requestHeaders(includeContentType: boolean): HeadersInit {
  const headers: Record<string, string> = {};
  if (includeContentType) headers["Content-Type"] = "application/json";
  const key = cloudKey();
  if (key) headers["X-Access-Key"] = key;
  return headers;
}

export function emptyEscortPayload(): EscortPayload {
  return { updatedAt: null, marks: {} };
}

export function sanitizeEscortMarks(raw: unknown): Record<string, EscortColor> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const marks: Record<string, EscortColor> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === "green" || value === "red") marks[key] = value;
  }
  return marks;
}

export function parseEscortPayload(raw: unknown): EscortPayload {
  if (!raw || typeof raw !== "object") return emptyEscortPayload();
  const data = raw as { record?: unknown; updatedAt?: unknown; marks?: unknown };
  const source =
    data.record && typeof data.record === "object" && !Array.isArray(data.record)
      ? (data.record as { updatedAt?: unknown; marks?: unknown })
      : data;
  return {
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
    marks: sanitizeEscortMarks(source.marks),
  };
}

async function readJson(url: string, headers?: HeadersInit) {
  const response = await fetch(url, { cache: "no-store", headers });
  if (!response.ok) return null;
  return parseEscortPayload(await response.json());
}

export async function loadEscortPayload(): Promise<EscortPayload | null> {
  const remote = cloudUrl();
  if (remote) {
    try {
      return await readJson(readUrl(remote), requestHeaders(false));
    } catch {
      return null;
    }
  }

  try {
    const live = await readJson(asset("/api/escort/"));
    if (live) return live;
  } catch {
    /* static hosting has no API */
  }
  try {
    return await readJson(asset("/escort.json"));
  } catch {
    return null;
  }
}

export async function saveEscortMarks(marks: Record<string, EscortColor>) {
  const payload: EscortPayload = {
    updatedAt: new Date().toISOString(),
    marks: sanitizeEscortMarks(marks),
  };
  const remote = cloudUrl();
  const url = remote ? writeUrl(remote) : asset("/api/escort/");
  const response = await fetch(url, {
    method: "PUT",
    headers: requestHeaders(true),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`escort save failed (${response.status})`);
  }
  return parseEscortPayload(await response.json());
}
