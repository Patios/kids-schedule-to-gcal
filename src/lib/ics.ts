import {
  CHILDREN,
  FIRST_DATES,
  SCHOOL,
  SCHOOL_YEAR,
  lessonsFor,
  type ChildId,
  type Lesson,
} from "./schedule";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function fold(line: string) {
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function localStamp(date: string, time: string) {
  const [y, m, d] = date.split("-");
  const [hh, mm] = time.split(":");
  return `${y}${m}${d}T${hh}${mm}00`;
}

function utcNow() {
  const n = new Date();
  return (
    `${n.getUTCFullYear()}${pad(n.getUTCMonth() + 1)}${pad(n.getUTCDate())}` +
    `T${pad(n.getUTCHours())}${pad(n.getUTCMinutes())}${pad(n.getUTCSeconds())}Z`
  );
}

function untilUtc() {
  return "20270625T210000Z";
}

function description(lesson: Lesson) {
  const bits = [
    `${CHILDREN[lesson.child].name}, klasa ${CHILDREN[lesson.child].className}`,
    lesson.room ? `Sala: ${lesson.room}` : null,
    lesson.teacher ? `Nauczyciel: ${lesson.teacher}` : null,
    lesson.note ?? null,
    `Rok szkolny ${SCHOOL_YEAR.label}. Wydarzenie cykliczne co tydzień do ${SCHOOL_YEAR.end}. Święta i ferie nie są wyłączone — usuń je w Kalendarzu Google.`,
  ].filter(Boolean);
  return bits.join("\n");
}

function vevent(lesson: Lesson) {
  const child = CHILDREN[lesson.child];
  const startDate = FIRST_DATES[lesson.weekday];
  const summary = `${child.name} · ${lesson.title}`;
  const location = lesson.location ?? (lesson.room ? `${SCHOOL} (${lesson.room})` : SCHOOL);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${lesson.id}@plan-dzieci-nowek`,
    `DTSTAMP:${utcNow()}`,
    `DTSTART;TZID=Europe/Warsaw:${localStamp(startDate, lesson.start)}`,
    `DTEND;TZID=Europe/Warsaw:${localStamp(startDate, lesson.end)}`,
    `RRULE:FREQ=WEEKLY;UNTIL=${untilUtc()}`,
    `SUMMARY:${escapeText(summary)}`,
    `LOCATION:${escapeText(location)}`,
    `DESCRIPTION:${escapeText(description(lesson))}`,
    `CATEGORIES:${escapeText(lesson.kind)}`,
    "END:VEVENT",
  ];
  return lines.map(fold).join("\r\n");
}

const VTIMEZONE = `BEGIN:VTIMEZONE
TZID:Europe/Warsaw
X-LIC-LOCATION:Europe/Warsaw
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`.replace(/\n/g, "\r\n");

export function calendarName(who: ChildId | "all") {
  if (who === "michal") return "Michał 3d — plan zajęć";
  if (who === "natalka") return "Natalka 1d — plan zajęć";
  return "Michał i Natalka — plan zajęć";
}

export function buildIcs(who: ChildId | "all") {
  const lessons = lessonsFor(who);
  const name = calendarName(who);
  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nowek//Plan zajec dzieci//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${escapeText(name)}`),
    "X-WR-TIMEZONE:Europe/Warsaw",
    VTIMEZONE,
  ].join("\r\n");
  return `${header}\r\n${lessons.map(vevent).join("\r\n")}\r\nEND:VCALENDAR\r\n`;
}
