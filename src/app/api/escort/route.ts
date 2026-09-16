import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { parseEscortPayload, sanitizeEscortMarks } from "@/lib/escort-sync";

const file = join(process.cwd(), "public", "escort.json");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const text = await readFile(file, "utf8");
    return NextResponse.json(parseEscortPayload(JSON.parse(text)));
  } catch {
    return NextResponse.json({ updatedAt: null, marks: {} });
  }
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
  const payload = { updatedAt: new Date().toISOString(), marks };
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
  return NextResponse.json(payload);
}
