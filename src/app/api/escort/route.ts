import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import {
  fetchCloudEscort,
  parseEscortPayload,
  putCloudEscort,
  sanitizeEscortMarks,
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
    return { updatedAt: null, marks: {} };
  }
}

export async function GET() {
  const cloud = cloudConfig();
  if (cloud.url) {
    const remote = await fetchCloudEscort(cloud);
    if (remote) return NextResponse.json(remote);
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
  const marks = sanitizeEscortMarks(
    body && typeof body === "object" && "marks" in body
      ? (body as { marks: unknown }).marks
      : body,
  );

  const cloud = cloudConfig();
  if (cloud.url) {
    const saved = await putCloudEscort(marks, cloud);
    if (!saved) {
      return NextResponse.json(
        { error: "Nie udało się zapisać kolorów do JSONBin." },
        { status: 502 },
      );
    }
    return NextResponse.json(saved);
  }

  const payload = { updatedAt: new Date().toISOString(), marks };
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
  return NextResponse.json(payload);
}
