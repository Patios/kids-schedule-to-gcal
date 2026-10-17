import type { EscortColor } from "./schedule";

export type SkippedLessons = Record<string, string[]>;

export type EscortPayload = {
  updatedAt: string | null;
  marks: Record<string, EscortColor>;
  deletedLessonIds: string[];
  skippedLessons: SkippedLessons;
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

function normalizeKey(value: string) {
  return unquote(value).replaceAll("$$", "$").trim();
}

/** Next inlinuje tylko statyczny odczyt `process.env.NAZWA`, nie `process.env[name]`. */
function envFromBuild() {
  return {
    url: unquote(
      process.env.NEXT_PUBLIC_ESCORT_SYNC_URL ||
        process.env.ESCORT_SYNC_URL ||
        "",
    ).trim(),
    key: normalizeKey(
      process.env.NEXT_PUBLIC_ESCORT_SYNC_KEY ||
        process.env.ESCORT_SYNC_KEY ||
        "",
    ),
  };
}

export function cloudUrl() {
  return envFromBuild().url;
}

let fileConfigPromise: Promise<{ url: string; key: string } | null> | null =
  null;

async function configFromFile() {
  if (typeof window === "undefined") return null;
  if (!fileConfigPromise) {
    fileConfigPromise = (async () => {
      try {
        const response = await fetch(asset("/escort-sync.json"), {
          cache: "no-store",
        });
        if (!response.ok) return null;
        const data = (await response.json()) as { url?: unknown; key?: unknown };
        const url = typeof data.url === "string" ? data.url.trim() : "";
        const key = typeof data.key === "string" ? normalizeKey(data.key) : "";
        if (!url) return null;
        return { url, key };
      } catch {
        return null;
      }
    })();
  }
  return fileConfigPromise;
}

async function resolveCloud(overrides?: { url?: string; key?: string }) {
  if (overrides?.url) {
    return {
      url: overrides.url.trim(),
      key: normalizeKey(overrides.key ?? ""),
    };
  }
  const fromEnv = envFromBuild();
  if (fromEnv.url && fromEnv.key) return fromEnv;
  const fromFile = await configFromFile();
  if (fromFile?.url) return fromFile;
  return fromEnv;
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
  return { updatedAt: null, marks: {}, deletedLessonIds: [], skippedLessons: {} };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function freshSkipCutoff() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - 21);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function sanitizeSkippedLessons(raw: unknown): SkippedLessons {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const cutoff = freshSkipCutoff();
  const skipped: SkippedLessons = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = key.trim();
    if (!LESSON_ID.test(id) || !Array.isArray(value)) continue;
    const dates: string[] = [];
    for (const item of value) {
      if (typeof item !== "string" || !ISO_DATE.test(item) || item < cutoff) continue;
      if (!dates.includes(item)) dates.push(item);
    }
    if (dates.length) skipped[id] = dates;
  }
  return skipped;
}

const LESSON_ID = /^[a-z0-9-]{1,80}$/;

export function sanitizeDeletedLessonIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!LESSON_ID.test(id) || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
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
  const data = raw as {
    record?: unknown;
    updatedAt?: unknown;
    marks?: unknown;
    deletedLessonIds?: unknown;
    skippedLessons?: unknown;
  };
  const source =
    data.record && typeof data.record === "object" && !Array.isArray(data.record)
      ? (data.record as {
          updatedAt?: unknown;
          marks?: unknown;
          deletedLessonIds?: unknown;
          skippedLessons?: unknown;
        })
      : data;
  return {
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
    marks: sanitizeEscortMarks(source.marks),
    deletedLessonIds: sanitizeDeletedLessonIds(source.deletedLessonIds),
    skippedLessons: sanitizeSkippedLessons(source.skippedLessons),
  };
}

async function parseOk(response: Response) {
  if (!response.ok) return null;
  return parseEscortPayload(await response.json());
}

export async function fetchCloudEscort(
  overrides?: { url?: string; key?: string },
): Promise<EscortPayload | null> {
  const { url: remote, key } = await resolveCloud(overrides);
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
  data: {
    marks: Record<string, EscortColor>;
    deletedLessonIds?: string[];
    skippedLessons?: SkippedLessons;
  },
  overrides?: { url?: string; key?: string },
): Promise<EscortPayload | null> {
  const { url: remote, key } = await resolveCloud(overrides);
  if (!remote) return null;
  let deletedLessonIds = data.deletedLessonIds;
  let skippedLessons = data.skippedLessons;
  if (deletedLessonIds === undefined || skippedLessons === undefined) {
    const existing = await fetchCloudEscort(overrides);
    if (deletedLessonIds === undefined) deletedLessonIds = existing?.deletedLessonIds ?? [];
    if (skippedLessons === undefined) skippedLessons = existing?.skippedLessons ?? {};
  }
  const payload: EscortPayload = {
    updatedAt: new Date().toISOString(),
    marks: sanitizeEscortMarks(data.marks),
    deletedLessonIds: sanitizeDeletedLessonIds(deletedLessonIds),
    skippedLessons: sanitizeSkippedLessons(skippedLessons),
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

export async function saveEscortMarks(
  marks: Record<string, EscortColor>,
  deletedLessonIds?: string[],
  skippedLessons?: SkippedLessons,
) {
  const payload: EscortPayload = {
    updatedAt: new Date().toISOString(),
    marks: sanitizeEscortMarks(marks),
    deletedLessonIds:
      deletedLessonIds === undefined ? [] : sanitizeDeletedLessonIds(deletedLessonIds),
    skippedLessons:
      skippedLessons === undefined ? {} : sanitizeSkippedLessons(skippedLessons),
  };
  const wire: {
    updatedAt: string | null;
    marks: Record<string, EscortColor>;
    deletedLessonIds?: string[];
    skippedLessons?: SkippedLessons;
  } = { updatedAt: payload.updatedAt, marks: payload.marks };
  if (deletedLessonIds !== undefined) wire.deletedLessonIds = payload.deletedLessonIds;
  if (skippedLessons !== undefined) wire.skippedLessons = payload.skippedLessons;
  const body = JSON.stringify(wire);

  const cloudBody: {
    marks: Record<string, EscortColor>;
    deletedLessonIds?: string[];
    skippedLessons?: SkippedLessons;
  } = { marks: payload.marks };
  if (deletedLessonIds !== undefined) cloudBody.deletedLessonIds = payload.deletedLessonIds;
  if (skippedLessons !== undefined) cloudBody.skippedLessons = payload.skippedLessons;

  if (isLocalHost()) {
    const response = await fetch(asset("/api/escort/"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!response.ok) {
      throw new Error(`escort save failed (${response.status})`);
    }
    return parseEscortPayload(await response.json());
  }

  const cloud = await putCloudEscort(cloudBody);
  if (cloud) return cloud;

  const response = await fetch(asset("/api/escort/"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!response.ok) {
    throw new Error(`escort save failed (${response.status})`);
  }
  return parseEscortPayload(await response.json());
}
