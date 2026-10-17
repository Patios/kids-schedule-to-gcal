"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseIcs, type ParsedCalendar } from "./parse-ics";
import { loadEscortPayload, saveEscortMarks, type SkippedLessons } from "./escort-sync";
import {
  CHILDREN,
  escortKey,
  nextEscortColor,
  lessonsFor,
  visibleWeekDates,
  type EscortColor,
  type EscortSlot,
  type Lesson,
} from "./schedule";

const STORAGE_KEY = "plan-zajec-visible-calendars-v1";
const DELETIONS_MIGRATED_KEY = "plan-zajec-deletions-synced-v1";
const DELETIONS_PENDING_KEY = "plan-zajec-deletions-pending-v1";

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

export type LessonState = {
  patch?: LessonPatch;
  deleted: boolean;
  skippedDates: string[];
};

type StoredState = {
  hiddenBuiltin: string[];
  imported: Omit<ViewCalendar, "builtin">[];
  lessonPatches: Record<string, LessonPatch>;
  deletedLessonIds: string[];
  skippedLessons: SkippedLessons;
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
    skippedLessons: {},
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
      skippedLessons: parsed.skippedLessons ?? {},
      escortMarks: parsed.escortMarks ?? {},
    };
  } catch {
    return emptyStored();
  }
}

function unionIds(left: string[], right: string[]) {
  return [...new Set([...left, ...right])];
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const ids = new Set(left);
  return right.every((id) => ids.has(id));
}

function unionSkips(left: SkippedLessons, right: SkippedLessons): SkippedLessons {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const merged: SkippedLessons = {};
  for (const key of keys) {
    const dates = unionIds(left[key] ?? [], right[key] ?? []);
    if (dates.length) merged[key] = dates;
  }
  return merged;
}

function sameSkips(left: SkippedLessons, right: SkippedLessons) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!sameIds(left[key] ?? [], right[key] ?? [])) return false;
  }
  return true;
}

function withoutSkipped(lessons: Lesson[], skipped: SkippedLessons, week: Record<Lesson["weekday"], string>) {
  return lessons.filter((lesson) => !skipped[lesson.id]?.includes(week[lesson.weekday]));
}

function flagOn(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
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
  const deletedDirty = useRef(false);
  const pendingDeleted = useRef<string[] | null>(null);
  const pendingSkipped = useRef<SkippedLessons | null>(null);
  const persistGen = useRef(0);
  const [weekDates, setWeekDates] = useState<Record<Lesson["weekday"], string> | null>(null);

  const persistShared = useCallback(
    (
      marks: Record<string, EscortColor>,
      deletedLessonIds: string[],
      skippedLessons: SkippedLessons,
    ) => {
      const gen = ++persistGen.current;
      deletedDirty.current = true;
      try {
        localStorage.setItem(DELETIONS_PENDING_KEY, "1");
      } catch {
        /* private mode */
      }
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        skipFocusRefetch.current = true;
        saveEscortMarks(marks, deletedLessonIds, skippedLessons)
          .then((saved) => {
            if (persistGen.current !== gen) return;
            deletedDirty.current = false;
            pendingDeleted.current = null;
            pendingSkipped.current = null;
            try {
              localStorage.removeItem(DELETIONS_PENDING_KEY);
              localStorage.setItem(DELETIONS_MIGRATED_KEY, "1");
            } catch {
              /* private mode */
            }
            setStored((current) => ({
              ...current,
              escortMarks: saved.marks,
              deletedLessonIds: saved.deletedLessonIds,
              skippedLessons: saved.skippedLessons,
            }));
            setEscortOnServer(true);
          })
          .catch(() => setEscortOnServer(false))
          .finally(() => {
            if (persistGen.current === gen) skipFocusRefetch.current = false;
          });
      }, 400);
    },
    [],
  );

  const applyRemoteMarks = useCallback(async () => {
    const remote = await loadEscortPayload();
    remoteReady.current = true;
    if (!remote) {
      setEscortOnServer(false);
      return false;
    }
    const keepLocal = deletedDirty.current || flagOn(DELETIONS_PENDING_KEY);
    setStored((current) => ({
      ...current,
      escortMarks: remote.marks,
      deletedLessonIds: keepLocal ? current.deletedLessonIds : remote.deletedLessonIds,
      skippedLessons: keepLocal ? current.skippedLessons : remote.skippedLessons,
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
        const migrated = flagOn(DELETIONS_MIGRATED_KEY);
        let deletedLessonIds = remote.deletedLessonIds;
        let skippedLessons = remote.skippedLessons;
        setStored((current) => {
          const changedDuringLoad =
            !sameIds(current.deletedLessonIds, local.deletedLessonIds) ||
            !sameSkips(current.skippedLessons, local.skippedLessons);
          const pending = flagOn(DELETIONS_PENDING_KEY) || changedDuringLoad;
          if (pending) {
            deletedLessonIds = pendingDeleted.current ?? current.deletedLessonIds;
            skippedLessons = pendingSkipped.current ?? current.skippedLessons;
          } else if (!migrated) {
            deletedLessonIds = unionIds(current.deletedLessonIds, remote.deletedLessonIds);
            skippedLessons = unionSkips(current.skippedLessons, remote.skippedLessons);
          } else {
            deletedLessonIds = remote.deletedLessonIds;
            skippedLessons = remote.skippedLessons;
          }
          return {
            ...current,
            escortMarks: remote.marks,
            deletedLessonIds,
            skippedLessons,
          };
        });
        if (cancelled) return;
        if (
          !sameIds(deletedLessonIds, remote.deletedLessonIds) ||
          !sameSkips(skippedLessons, remote.skippedLessons)
        ) {
          persistShared(remote.marks, deletedLessonIds, skippedLessons);
        } else if (!migrated) {
          try {
            localStorage.setItem(DELETIONS_MIGRATED_KEY, "1");
          } catch {
            /* private mode */
          }
        }
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
  }, [persistShared]);

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

  useEffect(() => {
    const tick = () => setWeekDates(visibleWeekDates(new Date()));
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const calendars = useMemo(() => {
    const visible = visibleFrom(stored);
    if (!weekDates) return visible;
    return visible.map((calendar) => ({
      ...calendar,
      lessons: withoutSkipped(calendar.lessons, stored.skippedLessons, weekDates),
    }));
  }, [stored, weekDates]);

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

  const publishPlan = useCallback(
    (current: StoredState, deletedLessonIds: string[], skippedLessons: SkippedLessons) => {
      if (
        sameIds(current.deletedLessonIds, deletedLessonIds) &&
        sameSkips(current.skippedLessons, skippedLessons)
      ) {
        return;
      }
      pendingDeleted.current = deletedLessonIds;
      pendingSkipped.current = skippedLessons;
      deletedDirty.current = true;
      try {
        localStorage.setItem(DELETIONS_PENDING_KEY, "1");
      } catch {
        /* private mode */
      }
      if (remoteReady.current) {
        persistShared(current.escortMarks, deletedLessonIds, skippedLessons);
      }
    },
    [persistShared],
  );

  const updateLesson = useCallback((id: string, patch: LessonPatch) => {
    setStored((current) => {
      const deletedLessonIds = current.deletedLessonIds.filter((lessonId) => lessonId !== id);
      publishPlan(current, deletedLessonIds, current.skippedLessons);
      return {
        ...current,
        lessonPatches: {
          ...current.lessonPatches,
          [id]: { ...current.lessonPatches[id], ...patch },
        },
        deletedLessonIds,
      };
    });
  }, [publishPlan]);

  const restoreLesson = useCallback((id: string) => {
    setStored((current) => {
      const lessonPatches = { ...current.lessonPatches };
      delete lessonPatches[id];
      const deletedLessonIds = current.deletedLessonIds.filter((lessonId) => lessonId !== id);
      publishPlan(current, deletedLessonIds, current.skippedLessons);
      return {
        ...current,
        lessonPatches,
        deletedLessonIds,
      };
    });
  }, [publishPlan]);

  const deleteLesson = useCallback((id: string) => {
    setStored((current) => {
      const lessonPatches = { ...current.lessonPatches };
      delete lessonPatches[id];
      const deletedLessonIds = [...new Set([...current.deletedLessonIds, id])];
      const skippedLessons = { ...current.skippedLessons };
      delete skippedLessons[id];
      publishPlan(current, deletedLessonIds, skippedLessons);
      return {
        ...current,
        lessonPatches,
        deletedLessonIds,
        skippedLessons,
      };
    });
  }, [publishPlan]);

  const skipLesson = useCallback((id: string, date: string) => {
    setStored((current) => {
      const skippedLessons = {
        ...current.skippedLessons,
        [id]: unionIds(current.skippedLessons[id] ?? [], [date]),
      };
      publishPlan(current, current.deletedLessonIds, skippedLessons);
      return { ...current, skippedLessons };
    });
  }, [publishPlan]);

  const lessonState = useCallback(
    (id: string): LessonState => ({
      patch: stored.lessonPatches[id] ? { ...stored.lessonPatches[id] } : undefined,
      deleted: stored.deletedLessonIds.includes(id),
      skippedDates: [...(stored.skippedLessons[id] ?? [])],
    }),
    [stored.deletedLessonIds, stored.lessonPatches, stored.skippedLessons],
  );

  const restoreLessonState = useCallback((id: string, state: LessonState) => {
    setStored((current) => {
      const lessonPatches = { ...current.lessonPatches };
      if (state.patch) lessonPatches[id] = state.patch;
      else delete lessonPatches[id];
      const deletedLessonIds = state.deleted
        ? [...new Set([...current.deletedLessonIds, id])]
        : current.deletedLessonIds.filter((lessonId) => lessonId !== id);
      const skippedLessons = { ...current.skippedLessons };
      if (state.skippedDates.length) skippedLessons[id] = [...state.skippedDates];
      else delete skippedLessons[id];
      publishPlan(current, deletedLessonIds, skippedLessons);
      return {
        ...current,
        lessonPatches,
        deletedLessonIds,
        skippedLessons,
      };
    });
  }, [publishPlan]);

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
        if (remoteReady.current) {
          persistShared(escortMarks, current.deletedLessonIds, current.skippedLessons);
        }
        return { ...current, escortMarks };
      });
    },
    [persistShared],
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
    skipLesson,
    weekDates,
    lessonState,
    restoreLessonState,
    isModified,
    escortMarks: stored.escortMarks,
    cycleEscort,
    escortOnServer,
    refreshEscort: applyRemoteMarks,
  };
}
