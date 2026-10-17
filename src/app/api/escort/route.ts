import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import {
  fetchCloudEscort,
  parseEscortPayload,
  putCloudEscort,
  sanitizeAddedLessons,
  sanitizeDeletedLessonIds,
  sanitizeEscortMarks,
  sanitizeLessonPatches,
  sanitizeSkippedLessons,
} from "@/lib/escort-sync";

const file = join(process.cwd(), "public", "escort.json");
const envLocal = join(process.cwd(), ".env.local");

export const dynamic = "force-dynamic";

/** Next.js dotenv-expand zjada `$` w kluczu JSONBin — czytamy plik bez ekspansji. */
function envFromLocalFile(name: string) {
  try {
    const text = readFileSync(envLocal, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index < 0) continue;
      if (line.slice(0, index).trim() !== name) continue;
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))
      ) {
        value = value.slice(1, -1);
      }
      return value.replaceAll("$$", "$");
    }
  } catch {
    /* no .env.local */
  }
  return (process.env[name] ?? "").trim();
}

function cloudConfig() {
  return {
    url: envFromLocalFile("NEXT_PUBLIC_ESCORT_SYNC_URL") || envFromLocalFile("ESCORT_SYNC_URL"),
    key: envFromLocalFile("NEXT_PUBLIC_ESCORT_SYNC_KEY") || envFromLocalFile("ESCORT_SYNC_KEY"),
  };
}

async function readLocalFile() {
  try {
    const text = await readFile(file, "utf8");
    return parseEscortPayload(JSON.parse(text));
  } catch {
    return {
      updatedAt: null,
      marks: {},
      deletedLessonIds: [],
      skippedLessons: {},
      lessonPatches: {},
      addedLessons: [],
    };
  }
}

export async function GET() {
  const cloud = cloudConfig();
  if (cloud.url) {
    const remote = await fetchCloudEscort(cloud);
    if (remote) {
      try {
        await writeFile(file, `${JSON.stringify(remote, null, 2)}\n`);
      } catch {
        /* cache file is optional */
      }
      return NextResponse.json(remote);
    }
    return NextResponse.json(
      { error: "Nie udało się odczytać kolorów z JSONBin." },
      { status: 502 },
    );
  }
  return NextResponse.json(await readLocalFile());
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Niepoprawny JSON." }, { status: 400 });
  }
  const source =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as {
          marks?: unknown;
          deletedLessonIds?: unknown;
          skippedLessons?: unknown;
          lessonPatches?: unknown;
          addedLessons?: unknown;
        })
      : {};
  const marks = sanitizeEscortMarks("marks" in source ? source.marks : body);
  const hasDeleted = "deletedLessonIds" in source;
  const hasSkipped = "skippedLessons" in source;
  const hasPatches = "lessonPatches" in source;
  const hasAdded = "addedLessons" in source;
  const deletedLessonIds = hasDeleted
    ? sanitizeDeletedLessonIds(source.deletedLessonIds)
    : null;
  const skippedLessons = hasSkipped ? sanitizeSkippedLessons(source.skippedLessons) : null;
  const lessonPatches = hasPatches ? sanitizeLessonPatches(source.lessonPatches) : null;
  const addedLessons = hasAdded ? sanitizeAddedLessons(source.addedLessons) : null;

  const cloud = cloudConfig();
  if (cloud.url) {
    const saved = await putCloudEscort(
      {
        marks,
        ...(hasDeleted ? { deletedLessonIds: deletedLessonIds ?? [] } : {}),
        ...(hasSkipped ? { skippedLessons: skippedLessons ?? {} } : {}),
        ...(hasPatches ? { lessonPatches: lessonPatches ?? {} } : {}),
        ...(hasAdded ? { addedLessons: addedLessons ?? [] } : {}),
      },
      cloud,
    );
    if (!saved) {
      return NextResponse.json(
        { error: "Nie udało się zapisać kolorów do JSONBin." },
        { status: 502 },
      );
    }
    try {
      await writeFile(file, `${JSON.stringify(saved, null, 2)}\n`);
    } catch {
      /* cache file is optional */
    }
    return NextResponse.json(saved);
  }

  const previous = await readLocalFile();
  const payload = {
    updatedAt: new Date().toISOString(),
    marks,
    deletedLessonIds: hasDeleted ? (deletedLessonIds ?? []) : previous.deletedLessonIds,
    skippedLessons: hasSkipped ? (skippedLessons ?? {}) : previous.skippedLessons,
    lessonPatches: hasPatches ? (lessonPatches ?? {}) : previous.lessonPatches,
    addedLessons: hasAdded ? (addedLessons ?? []) : previous.addedLessons,
  };
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
  return NextResponse.json(payload);
}
