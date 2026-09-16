"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseIcs, type ParsedCalendar } from "./parse-ics";
import { loadEscortPayload, saveEscortMarks } from "./escort-sync";
import {
  CHILDREN,
  escortKey,
  nextEscortColor,
  lessonsFor,
  type EscortColor,
  type EscortSlot,
  type Lesson,
} from "./schedule";

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

export type LessonPatch = Partial<
  Pick<Lesson, "weekday" | "start" | "end" | "title" | "kind" | "room" | "teacher" | "location" | "note">
>;

type StoredState = {
  hiddenBuiltin: string[];
  imported: Omit<ViewCalendar, "builtin">[];
  lessonPatches: Record<string, LessonPatch>;
  deletedLessonIds: string[];
  escortMarks: Record<string, EscortColor>;
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

function emptyStored(): StoredState {
  return {
    hiddenBuiltin: [],
    imported: [],
    lessonPatches: {},
    deletedLessonIds: [],
    escortMarks: {},
  };
}

function readStored(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStored();
    const parsed = JSON.parse(raw) as StoredState;
    return {
      hiddenBuiltin: parsed.hiddenBuiltin ?? [],
      imported: parsed.imported ?? [],
      lessonPatches: parsed.lessonPatches ?? {},
      deletedLessonIds: parsed.deletedLessonIds ?? [],
      escortMarks: parsed.escortMarks ?? {},
    };
  } catch {
    return emptyStored();
  }
}

function applyLessonEdits(lessons: Lesson[], stored: StoredState): Lesson[] {
  const deleted = new Set(stored.deletedLessonIds);
  return lessons
    .filter((lesson) => !deleted.has(lesson.id))
    .map((lesson) => {
      const patch = stored.lessonPatches[lesson.id];
      if (!patch) return lesson;
      return { ...lesson, ...patch, id: lesson.id, child: lesson.child };
    });
}

function visibleFrom(stored: StoredState): ViewCalendar[] {
  const builtins = builtinCalendars()
    .filter((calendar) => !stored.hiddenBuiltin.includes(calendar.id))
    .map((calendar) => ({
      ...calendar,
      lessons: applyLessonEdits(calendar.lessons, stored),
    }));
  const imported = stored.imported
    .filter((calendar) => !builtins.some((item) => item.id === calendar.id))
    .map((calendar) => ({
      ...calendar,
      builtin: false,
      lessons: applyLessonEdits(calendar.lessons, stored),
    }));
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
      ...current,
      hiddenBuiltin: [...hiddenBuiltin],
      imported,
    },
    added,
    skipped,
  };
}

export function useCalendars() {
  const [stored, setStored] = useState<StoredState>(emptyStored);
  const [ready, setReady] = useState(false);
  const [escortOnServer, setEscortOnServer] = useState<boolean | null>(null);
  const [escortSynced, setEscortSynced] = useState(false);
  const saveTimer = useRef<number>(0);
  const remoteReady = useRef(false);
  const skipFocusRefetch = useRef(false);

  const persistEscort = useCallback((marks: Record<string, EscortColor>) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      skipFocusRefetch.current = true;
      saveEscortMarks(marks)
        .then((saved) => {
          setStored((current) => ({ ...current, escortMarks: saved.marks }));
          setEscortOnServer(true);
        })
        .catch(() => setEscortOnServer(false))
        .finally(() => {
          skipFocusRefetch.current = false;
        });
    }, 400);
  }, []);

  const applyRemoteMarks = useCallback(async () => {
    const remote = await loadEscortPayload();
    remoteReady.current = true;
    if (!remote) {
      setEscortOnServer(false);
      return false;
    }
    setStored((current) => ({
      ...current,
      escortMarks: remote.marks,
    }));
    setEscortOnServer(true);
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const local = readStored();
    setStored({ ...local, escortMarks: {} });
    setReady(true);

    (async () => {
      const remote = await loadEscortPayload();
      if (cancelled) return;
      if (remote) {
        setStored((current) => ({
          ...current,
          escortMarks: remote.marks,
        }));
        setEscortOnServer(true);
      } else {
        setStored((current) => ({
          ...current,
          escortMarks: local.escortMarks,
        }));
      }
      remoteReady.current = true;
      setEscortSynced(true);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    function onFocus() {
      if (skipFocusRefetch.current || !remoteReady.current) return;
      if (document.visibilityState === "hidden") return;
      void applyRemoteMarks();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [applyRemoteMarks]);

  useEffect(() => {
    if (!ready || !escortSynced) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [ready, escortSynced, stored]);

  const calendars = useMemo(() => visibleFrom(stored), [stored]);

  const remove = useCallback((id: string) => {
    setStored((current) => {
      const builtin = builtinCalendars().some((calendar) => calendar.id === id);
      if (builtin) {
        return {
          ...current,
          hiddenBuiltin: [...new Set([...current.hiddenBuiltin, id])],
        };
      }
      const removed = current.imported.find((calendar) => calendar.id === id);
      const removedIds = new Set(removed?.lessons.map((lesson) => lesson.id) ?? []);
      const lessonPatches = { ...current.lessonPatches };
      for (const lessonId of removedIds) delete lessonPatches[lessonId];
      return {
        ...current,
        imported: current.imported.filter((calendar) => calendar.id !== id),
        lessonPatches,
        deletedLessonIds: current.deletedLessonIds.filter(
          (lessonId) => !removedIds.has(lessonId),
        ),
      };
    });
  }, []);

  const updateLesson = useCallback((id: string, patch: LessonPatch) => {
    setStored((current) => ({
      ...current,
      lessonPatches: {
        ...current.lessonPatches,
        [id]: { ...current.lessonPatches[id], ...patch },
      },
      deletedLessonIds: current.deletedLessonIds.filter((lessonId) => lessonId !== id),
    }));
  }, []);

  const restoreLesson = useCallback((id: string) => {
    setStored((current) => {
      const lessonPatches = { ...current.lessonPatches };
      delete lessonPatches[id];
      return {
        ...current,
        lessonPatches,
        deletedLessonIds: current.deletedLessonIds.filter((lessonId) => lessonId !== id),
      };
    });
  }, []);

  const deleteLesson = useCallback((id: string) => {
    setStored((current) => {
      const lessonPatches = { ...current.lessonPatches };
      delete lessonPatches[id];
      return {
        ...current,
        lessonPatches,
        deletedLessonIds: [...new Set([...current.deletedLessonIds, id])],
      };
    });
  }, []);

  const isModified = useCallback(
    (id: string) => Boolean(stored.lessonPatches[id]),
    [stored.lessonPatches],
  );

  const cycleEscort = useCallback(
    (child: string, weekday: Lesson["weekday"], slot: EscortSlot) => {
      const key = escortKey(child, weekday, slot);
      setStored((current) => {
        const next = nextEscortColor(current.escortMarks?.[key]);
        const escortMarks = { ...current.escortMarks };
        if (next) escortMarks[key] = next;
        else delete escortMarks[key];
        if (remoteReady.current) persistEscort(escortMarks);
        return { ...current, escortMarks };
      });
    },
    [persistEscort],
  );

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

  return {
    calendars,
    remove,
    addFromIcs,
    updateLesson,
    restoreLesson,
    deleteLesson,
    isModified,
    escortMarks: stored.escortMarks,
    cycleEscort,
    escortOnServer,
    refreshEscort: applyRemoteMarks,
  };
}
