import {
  KIND_LABEL,
  type Lesson,
  type LessonKind,
  type Weekday,
} from "./schedule";

export type ParsedCalendar = {
  id: string;
  name: string;
  className?: string;
  teacher?: string;
  label: string;
  lessons: Lesson[];
};

const WEEKDAY_FROM_JS: Record<number, Weekday> = {
  1: "MO",
  2: "TU",
  3: "WE",
  4: "TH",
  5: "FR",
};

const KIND_FROM_TITLE: [RegExp, LessonKind][] = [
  [/taekwondo/i, "taekwondo"],
  [/balet/i, "balet"],
  [/basen/i, "basen"],
  [/\bwf\b/i, "wf"],
  [/angielsk/i, "angielski"],
  [/informatyk/i, "informatyka"],
  [/muzyk/i, "muzyka"],
  [/plastyk/i, "plastyka"],
  [/religi/i, "religia"],
  [/wyrównawcz|wyrownawcz|zdw/i, "zdw"],
  [/dodatkow/i, "extra"],
  [/edukacja wczesnoszkolna|edwcz/i, "edwcz"],
];

function unfold(ics: string) {
  const normalized = ics.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines: string[] = [];
  for (const line of normalized.split("\n")) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line !== "") {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeText(value: string) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function prop(line: string) {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  const left = line.slice(0, idx);
  return {
    name: left.split(";")[0].toUpperCase(),
    value: line.slice(idx + 1),
  };
}

function parseStamp(value: string) {
  const match = value.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!match) return null;
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    time: `${match[4]}:${match[5]}`,
  };
}

function weekdayFromDate(date: string): Weekday | null {
  const [year, month, day] = date.split("-").map(Number);
  const jsDay = new Date(year, month - 1, day).getDay();
  return WEEKDAY_FROM_JS[jsDay] ?? null;
}

function kindFrom(categories: string | undefined, title: string): LessonKind {
  const cat = categories?.trim().toLowerCase();
  if (cat && cat in KIND_LABEL) return cat as LessonKind;
  for (const [pattern, kind] of KIND_FROM_TITLE) {
    if (pattern.test(title)) return kind;
  }
  return "extra";
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "kalendarz";
}

function parseCalName(raw: string | undefined, filename: string | undefined) {
  const fromFile = filename?.replace(/\.ics$/i, "").replace(/[_-]+/g, " ").trim();
  const source = (raw ?? fromFile ?? "Kalendarz").replace(/\s*[—–-]\s*plan zajęć.*/i, "").trim();
  const withClass = source.match(/^(.+?)\s+(\d+[a-z])$/i);
  if (withClass) {
    return {
      name: withClass[1].trim(),
      className: withClass[2],
      label: `${withClass[1].trim()} ${withClass[2]}`,
    };
  }
  return { name: source, label: source };
}

function roomFrom(location: string | undefined, description: string) {
  const sala = description.match(/Sala:\s*(.+)/i);
  if (sala) return sala[1].trim();
  const paren = location?.match(/\(([^)]+)\)\s*$/);
  return paren?.[1]?.trim();
}

function teacherFrom(description: string) {
  return description.match(/Nauczyciel:\s*(.+)/i)?.[1]?.trim();
}

function classFrom(description: string) {
  return description.match(/klasa\s+([0-9]+[a-z])/i)?.[1];
}

function personFromSummary(summary: string) {
  const split = summary.split(/\s*[·•|]\s*/);
  if (split.length >= 2) {
    return { name: split[0].trim(), title: split.slice(1).join(" · ").trim() };
  }
  return { title: summary.trim() };
}

function builtinIdFrom(name: string, uids: string[]) {
  const blob = `${name} ${uids.join(" ")}`.toLowerCase();
  if (blob.includes("natalk") || uids.every((id) => id.startsWith("n-"))) {
    return "natalka";
  }
  if (blob.includes("micha") || uids.every((id) => id.startsWith("m-"))) {
    return "michal";
  }
  return null;
}

function eventsFrom(ics: string) {
  const events: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const line of unfold(ics)) {
    const parsed = prop(line);
    if (!parsed) continue;
    if (parsed.name === "BEGIN" && parsed.value === "VEVENT") {
      current = {};
    } else if (parsed.name === "END" && parsed.value === "VEVENT") {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      current[parsed.name] = unescapeText(parsed.value);
    }
  }
  return events;
}

function calendarNameFrom(ics: string) {
  for (const line of unfold(ics)) {
    const parsed = prop(line);
    if (parsed?.name === "X-WR-CALNAME") return unescapeText(parsed.value);
  }
  return undefined;
}

export function parseIcs(ics: string, filename?: string): ParsedCalendar[] {
  const events = eventsFrom(ics);
  const calMeta = parseCalName(calendarNameFrom(ics), filename);
  const grouped = new Map<
    string,
    { name: string; className?: string; teacher?: string; lessons: Lesson[] }
  >();

  for (const event of events) {
    const start = event.DTSTART ? parseStamp(event.DTSTART) : null;
    const end = event.DTEND ? parseStamp(event.DTEND) : null;
    if (!start || !end) continue;
    const weekday = weekdayFromDate(start.date);
    if (!weekday) continue;

    const description = event.DESCRIPTION ?? "";
    const summary = event.SUMMARY ?? "Zajęcia";
    const person = personFromSummary(summary);
    const name = person.name ?? calMeta.name;
    const title = person.title || summary;
    const className = classFrom(description) ?? calMeta.className;
    const teacher = teacherFrom(description);
    const key = slug(`${name}-${className ?? ""}`);
    const child =
      builtinIdFrom(name, event.UID ? [event.UID.split("@")[0]] : []) ?? key;
    const lesson: Lesson = {
      id: event.UID?.split("@")[0] || `${child}-${weekday}-${start.time}`,
      child,
      weekday,
      start: start.time,
      end: end.time,
      title,
      kind: kindFrom(event.CATEGORIES, title),
      room: roomFrom(event.LOCATION, description),
      teacher,
      location: event.LOCATION,
      note: description
        .split("\n")
        .find(
          (line) =>
            line &&
            !/^Sala:/i.test(line) &&
            !/^Nauczyciel:/i.test(line) &&
            !/^Rok szkolny/i.test(line) &&
            !/klasa\s+/i.test(line) &&
            line !== `${name}, klasa ${className}`,
        ),
    };

    const existing = grouped.get(key);
    if (existing) {
      existing.lessons.push(lesson);
      existing.teacher ??= teacher;
      existing.className ??= className;
    } else {
      grouped.set(key, {
        name,
        className,
        teacher,
        lessons: [lesson],
      });
    }
  }

  return [...grouped.values()].map((group) => {
    const uids = group.lessons.map((lesson) => lesson.id);
    const builtin = builtinIdFrom(group.name, uids);
    const id = builtin ?? slug(`${group.name}-${group.className ?? ""}`);
    const label = group.className
      ? `${group.name} ${group.className}`
      : group.name;
    return {
      id,
      name: group.name,
      className: group.className,
      teacher: group.teacher,
      label,
      lessons: group.lessons.map((lesson) => ({ ...lesson, child: id })),
    };
  });
}
