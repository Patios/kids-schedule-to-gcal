import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIcs } from "../src/lib/ics";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "public", "calendars");
mkdirSync(dir, { recursive: true });

const files = [
  ["michal-3d.ics", buildIcs("michal")],
  ["natalka-1d.ics", buildIcs("natalka")],
  ["michal-i-natalka.ics", buildIcs("all")],
] as const;

for (const [name, body] of files) {
  writeFileSync(join(dir, name), body);
  console.log("wrote", name, body.length, "bytes");
}
