"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseIcs, type ParsedCalendar } from "./parse-ics";
import { CHILDREN, lessonsFor, type Lesson } from "./schedule";

const STORAGE_KEY = "plan-zajec-visible-calendars-v1";

export type ViewCalendar = {
  id: string;
  name: string;
  className?: string;
  teacher?: string;
  label: string;
  lessons: Lesson[];
  builtin: boolean;
};

type StoredState = {
  hiddenBuiltin: string[];
  imported: Omit<ViewCalendar, "builtin">[];
};

function builtinCalendars(): ViewCalendar[] {
  return [
    {
      id: "michal",
      name: CHILDREN.michal.name,
      className: CHILDREN.michal.className,
      teacher: CHILDREN.michal.teacher,
      label: `${CHILDREN.michal.name} ${CHILDREN.michal.className}`,
      lessons: lessonsFor("michal"),
      builtin: true,
    },
    {
      id: "natalka",
      name: CHILDREN.natalka.name,
      className: CHILDREN.natalka.className,
      teacher: CHILDREN.natalka.teacher,
      label: `${CHILDREN.natalka.name} ${CHILDREN.natalka.className}`,
      lessons: lessonsFor("natalka"),
      builtin: true,
    },
  ];
}

function readStored(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { hiddenBuiltin: [], imported: [] };
    const parsed = JSON.parse(raw) as StoredState;
    return {
      hiddenBuiltin: parsed.hiddenBuiltin ?? [],
      imported: parsed.imported ?? [],
    };
  } catch {
    return { hiddenBuiltin: [], imported: [] };
  }
}

function visibleFrom(stored: StoredState): ViewCalendar[] {
  const builtins = builtinCalendars().filter(
    (calendar) => !stored.hiddenBuiltin.includes(calendar.id),
  );
  const imported = stored.imported
    .filter((calendar) => !builtins.some((item) => item.id === calendar.id))
    .map((calendar) => ({ ...calendar, builtin: false }));
  return [...builtins, ...imported];
}

function applyImport(current: StoredState, parsed: ParsedCalendar[]) {
  const visible = visibleFrom(current);
  const hiddenBuiltin = new Set(current.hiddenBuiltin);
  const imported = [...current.imported];
  const added: ParsedCalendar[] = [];
  const skipped: string[] = [];

  for (const calendar of parsed) {
    if (visible.some((item) => item.id === calendar.id)) {
      skipped.push(calendar.label);
      continue;
    }
    const isBuiltin = builtinCalendars().some((item) => item.id === calendar.id);
    if (isBuiltin) {
      hiddenBuiltin.delete(calendar.id);
      added.push(calendar);
      continue;
    }
    imported.push({
      id: calendar.id,
      name: calendar.name,
      className: calendar.className,
      teacher: calendar.teacher,
      label: calendar.label,
      lessons: calendar.lessons,
    });
    added.push(calendar);
  }

  return {
    next: {
      hiddenBuiltin: [...hiddenBuiltin],
      imported,
    },
    added,
    skipped,
  };
}

export function useCalendars() {
  const [stored, setStored] = useState<StoredState>({
    hiddenBuiltin: [],
    imported: [],
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStored(readStored());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [ready, stored]);

  const calendars = useMemo(() => visibleFrom(stored), [stored]);

  const remove = useCallback((id: string) => {
    setStored((current) => {
      const builtin = builtinCalendars().some((calendar) => calendar.id === id);
      return {
        hiddenBuiltin: builtin
          ? [...new Set([...current.hiddenBuiltin, id])]
          : current.hiddenBuiltin,
        imported: current.imported.filter((calendar) => calendar.id !== id),
      };
    });
  }, []);

  const addFromIcs = useCallback((text: string, filename?: string) => {
    const parsed = parseIcs(text, filename);
    if (parsed.length === 0) {
      return {
        added: [] as ParsedCalendar[],
        skipped: [] as string[],
        error: "Nie znaleziono zajęć w tym pliku ICS.",
      };
    }
    let result = applyImport(stored, parsed);
    setStored((current) => {
      result = applyImport(current, parsed);
      return result.next;
    });
    return { added: result.added, skipped: result.skipped, error: null as string | null };
  }, [stored]);

  return { calendars, remove, addFromIcs };
}
