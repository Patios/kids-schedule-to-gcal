import type { EscortColor } from "./schedule";

export type EscortPayload = {
  updatedAt: string | null;
  marks: Record<string, EscortColor>;
};

function asset(path: string) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}${path}`;
}

function unquote(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function env(name: string) {
  return unquote(process.env[name] ?? "");
}

export function cloudUrl() {
  return env("NEXT_PUBLIC_ESCORT_SYNC_URL") || env("ESCORT_SYNC_URL");
}

function cloudKey() {
  return env("NEXT_PUBLIC_ESCORT_SYNC_KEY") || env("ESCORT_SYNC_KEY");
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

function isLocalHost() {
  if (typeof window === "undefined") return false;
  return /^(localhost|127\.|\[::1\])/.test(window.location.hostname);
}

function authHeaders(includeContentType: boolean, key: string): HeadersInit[] {
  const base: Record<string, string> = {};
  if (includeContentType) base["Content-Type"] = "application/json";
  if (!key) return [base];
  return [
    { ...base, "X-Access-Key": key },
    { ...base, "X-Master-Key": key },
  ];
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

async function parseOk(response: Response) {
  if (!response.ok) return null;
  return parseEscortPayload(await response.json());
}

export async function fetchCloudEscort(
  overrides?: { url?: string; key?: string },
): Promise<EscortPayload | null> {
  const remote = (overrides?.url ?? cloudUrl()).trim();
  const key = (overrides?.key ?? cloudKey()).trim();
  if (!remote) return null;
  const url = readUrl(remote);
  for (const headers of authHeaders(false, key)) {
    try {
      const payload = await parseOk(
        await fetch(url, { cache: "no-store", headers }),
      );
      if (payload) return payload;
    } catch {
      /* try next auth header */
    }
  }
  return null;
}

export async function putCloudEscort(
  marks: Record<string, EscortColor>,
  overrides?: { url?: string; key?: string },
): Promise<EscortPayload | null> {
  const remote = (overrides?.url ?? cloudUrl()).trim();
  const key = (overrides?.key ?? cloudKey()).trim();
  if (!remote) return null;
  const payload: EscortPayload = {
    updatedAt: new Date().toISOString(),
    marks: sanitizeEscortMarks(marks),
  };
  const url = writeUrl(remote);
  const body = JSON.stringify(payload);
  for (const headers of authHeaders(true, key)) {
    try {
      const saved = await parseOk(
        await fetch(url, { method: "PUT", headers, body }),
      );
      if (saved) return saved;
    } catch {
      /* try next auth header */
    }
  }
  return null;
}

async function readJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  return parseEscortPayload(await response.json());
}

export async function loadEscortPayload(): Promise<EscortPayload | null> {
  if (isLocalHost()) {
    try {
      return await readJson(asset("/api/escort/"));
    } catch {
      return null;
    }
  }

  try {
    const cloud = await fetchCloudEscort();
    if (cloud) return cloud;
  } catch {
    /* Pages without a valid key */
  }

  try {
    return await readJson(asset("/api/escort/"));
  } catch {
    return null;
  }
}

export async function saveEscortMarks(marks: Record<string, EscortColor>) {
  const payload: EscortPayload = {
    updatedAt: new Date().toISOString(),
    marks: sanitizeEscortMarks(marks),
  };

  if (isLocalHost()) {
    const response = await fetch(asset("/api/escort/"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`escort save failed (${response.status})`);
    }
    return parseEscortPayload(await response.json());
  }

  const cloud = await putCloudEscort(payload.marks);
  if (cloud) return cloud;

  const response = await fetch(asset("/api/escort/"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`escort save failed (${response.status})`);
  }
  return parseEscortPayload(await response.json());
}
