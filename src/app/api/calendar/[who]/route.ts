import { buildIcs, calendarName } from "@/lib/ics";
import type { ChildId } from "@/lib/schedule";

type Who = ChildId | "all";

function isWho(value: string): value is Who {
  return value === "michal" || value === "natalka" || value === "all";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ who: string }> }
) {
  const { who } = await params;
  const id = who.replace(/\.ics$/, "");
  if (!isWho(id)) {
    return new Response("Nieznany kalendarz", { status: 404 });
  }

  const body = buildIcs(id);
  const filename =
    id === "michal"
      ? "michal-3d.ics"
      : id === "natalka"
        ? "natalka-1d.ics"
        : "michal-i-natalka.ics";

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Calendar-Name": encodeURIComponent(calendarName(id)),
    },
  });
}
