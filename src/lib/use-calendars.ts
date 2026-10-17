"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseIcs, type ParsedCalendar } from "./parse-ics";
import {
  loadEscortPayload,
  sanitizeAddedLessons,
  sanitizeDeletedLessonIds,
  sanitizeLessonPatches,
  sanitizeSkippedLessons,
  saveEscortMarks,
  type LessonPatch,
  type SkippedLessons,
} from "./escort-sync";
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
const LESSONS_SYNCED_KEY = "plan-zajec-lessons-synced-v1";
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

export type { LessonPatch };

export type LessonState = {
  patch?: LessonPatch;
  deleted: boolean;
  skippedDates: string[];
  /** Null means this id is not a lesson added in the app. */
  addedLesson: Lesson | null;
};

type StoredState = {
  hiddenBuiltin: string[];
  imported: Omit<ViewCalendar, "builtin">[];
  lessonPatches: Record<string, LessonPatch>;
  addedLessons: Lesson[];
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
    addedLessons: [],
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
      lessonPatches: sanitizeLessonPatches(parsed.lessonPatches),
      addedLessons: sanitizeAddedLessons(parsed.addedLessons),
      deletedLessonIds: sanitizeDeletedLessonIds(parsed.deletedLessonIds),
      skippedLessons: sanitizeSkippedLessons(parsed.skippedLessons),
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

function samePatches(left: Record<string, LessonPatch>, right: Record<string, LessonPatch>) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (JSON.stringify(left[key] ?? null) !== JSON.stringify(right[key] ?? null)) return false;
  }
  return true;
}

function sameAdded(left: Lesson[], right: Lesson[]) {
  if (left.length !== right.length) return false;
  const byId = new Map(right.map((lesson) => [lesson.id, lesson]));
  return left.every((lesson) => JSON.stringify(lesson) === JSON.stringify(byId.get(lesson.id)));
}

function unionAdded(local: Lesson[], remote: Lesson[]) {
  const byId = new Map<string, Lesson>();
  for (const lesson of remote) byId.set(lesson.id, lesson);
  for (const lesson of local) byId.set(lesson.id, lesson);
  return [...byId.values()];
}

type SharedPlan = {
  deletedLessonIds: string[];
  skippedLessons: SkippedLessons;
  lessonPatches: Record<string, LessonPatch>;
  addedLessons: Lesson[];
};

function samePlan(left: SharedPlan, right: SharedPlan) {
  return (
    sameIds(left.deletedLessonIds, right.deletedLessonIds) &&
    sameSkips(left.skippedLessons, right.skippedLessons) &&
    samePatches(left.lessonPatches, right.lessonPatches) &&
    sameAdded(left.addedLessons, right.addedLessons)
  );
}

function planOf(state: StoredState): SharedPlan {
  return {
    deletedLessonIds: state.deletedLessonIds,
    skippedLessons: state.skippedLessons,
    lessonPatches: state.lessonPatches,
    addedLessons: state.addedLessons,
  };
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

function withAdded(calendarId: string, lessons: Lesson[], stored: StoredState) {
  const extras = stored.addedLessons.filter((lesson) => lesson.child === calendarId);
  return applyLessonEdits([...lessons, ...extras], stored);
}

function visibleFrom(stored: StoredState): ViewCalendar[] {
  const builtins = builtinCalendars()
    .filter((calendar) => !stored.hiddenBuiltin.includes(calendar.id))
    .map((calendar) => ({
      ...calendar,
      lessons: withAdded(calendar.id, calendar.lessons, stored),
    }));
  const imported = stored.imported
    .filter((calendar) => !builtins.some((item) => item.id === calendar.id))
    .map((calendar) => ({
      ...calendar,
      builtin: false,
      lessons: withAdded(calendar.id, calendar.lessons, stored),
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
  const pendingPatches = useRef<Record<string, LessonPatch> | null>(null);
  const pendingAdded = useRef<Lesson[] | null>(null);
  const persistGen = useRef(0);
  const [weekDates, setWeekDates] = useState<Record<Lesson["weekday"], string> | null>(null);

  const persistShared = useCallback((marks: Record<string, EscortColor>, plan: SharedPlan) => {
    const gen = ++persistGen.current;
    deletedDirty.current = true;
    pendingDeleted.current = plan.deletedLessonIds;
    pendingSkipped.current = plan.skippedLessons;
    pendingPatches.current = plan.lessonPatches;
    pendingAdded.current = plan.addedLessons;
    try {
      localStorage.setItem(DELETIONS_PENDING_KEY, "1");
    } catch {
      /* private mode */
    }
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      skipFocusRefetch.current = true;
      saveEscortMarks({ marks, ...plan })
        .then((saved) => {
          if (persistGen.current !== gen) return;
          deletedDirty.current = false;
          pendingDeleted.current = null;
          pendingSkipped.current = null;
          pendingPatches.current = null;
          pendingAdded.current = null;
          try {
            localStorage.removeItem(DELETIONS_PENDING_KEY);
            localStorage.setItem(DELETIONS_MIGRATED_KEY, "1");
            localStorage.setItem(LESSONS_SYNCED_KEY, "1");
          } catch {
            /* private mode */
          }
          setStored((current) => ({
            ...current,
            escortMarks: saved.marks,
            deletedLessonIds: saved.deletedLessonIds,
            skippedLessons: saved.skippedLessons,
            lessonPatches: saved.lessonPatches,
            addedLessons: saved.addedLessons,
          }));
          setEscortOnServer(true);
        })
        .catch(() => setEscortOnServer(false))
        .finally(() => {
          if (persistGen.current === gen) skipFocusRefetch.current = false;
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
    const keepLocal = deletedDirty.current || flagOn(DELETIONS_PENDING_KEY);
    setStored((current) => ({
      ...current,
      escortMarks: remote.marks,
      deletedLessonIds: keepLocal ? current.deletedLessonIds : remote.deletedLessonIds,
      skippedLessons: keepLocal ? current.skippedLessons : remote.skippedLessons,
      lessonPatches: keepLocal ? current.lessonPatches : remote.lessonPatches,
      addedLessons: keepLocal ? current.addedLessons : remote.addedLessons,
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
        const lessonsSynced = flagOn(LESSONS_SYNCED_KEY);
        let deletedLessonIds = remote.deletedLessonIds;
        let skippedLessons = remote.skippedLessons;
        let lessonPatches = remote.lessonPatches;
        let addedLessons = remote.addedLessons;
        setStored((current) => {
          const changedDuringLoad = !samePlan(planOf(current), planOf(local));
          const pending = flagOn(DELETIONS_PENDING_KEY) || changedDuringLoad;
          if (pending) {
            deletedLessonIds = pendingDeleted.current ?? current.deletedLessonIds;
            skippedLessons = pendingSkipped.current ?? current.skippedLessons;
            lessonPatches = pendingPatches.current ?? current.lessonPatches;
            addedLessons = pendingAdded.current ?? current.addedLessons;
          } else {
            if (!migrated) {
              deletedLessonIds = unionIds(current.deletedLessonIds, remote.deletedLessonIds);
              skippedLessons = unionSkips(current.skippedLessons, remote.skippedLessons);
            }
            if (!lessonsSynced) {
              lessonPatches = sanitizeLessonPatches({
                ...remote.lessonPatches,
                ...current.lessonPatches,
              });
              addedLessons = sanitizeAddedLessons(
                unionAdded(current.addedLessons, remote.addedLessons),
              );
            }
          }
          return {
            ...current,
            escortMarks: remote.marks,
            deletedLessonIds,
            skippedLessons,
            lessonPatches,
            addedLessons,
          };
        });
        if (cancelled) return;
        const nextPlan = { deletedLessonIds, skippedLessons, lessonPatches, addedLessons };
        if (
          !sameIds(deletedLessonIds, remote.deletedLessonIds) ||
          !sameSkips(skippedLessons, remote.skippedLessons) ||
          !samePatches(lessonPatches, remote.lessonPatches) ||
          !sameAdded(addedLessons, remote.addedLessons)
        ) {
          persistShared(remote.marks, nextPlan);
        } else if (!migrated || !lessonsSynced) {
          try {
            localStorage.setItem(DELETIONS_MIGRATED_KEY, "1");
            localStorage.setItem(LESSONS_SYNCED_KEY, "1");
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
    (current: StoredState, next: SharedPlan) => {
      if (samePlan(planOf(current), next)) return;
      if (remoteReady.current) persistShared(current.escortMarks, next);
    },
    [persistShared],
  );

  const updateLesson = useCallback((id: string, patch: LessonPatch) => {
    const clean = sanitizeLessonPatches({ [id]: { ...patch } })[id];
    if (!clean) return;
    setStored((current) => {
      const lessonPatches = {
        ...current.lessonPatches,
        [id]: { ...current.lessonPatches[id], ...clean },
      };
      const deletedLessonIds = current.deletedLessonIds.filter((lessonId) => lessonId !== id);
      publishPlan(current, {
        deletedLessonIds,
        skippedLessons: current.skippedLessons,
        lessonPatches,
        addedLessons: current.addedLessons,
      });
      return { ...current, lessonPatches, deletedLessonIds };
    });
  }, [publishPlan]);

  const addLesson = useCallback((lesson: Lesson) => {
    const [clean] = sanitizeAddedLessons([lesson]);
    if (!clean) return false;
    setStored((current) => {
      const addedLessons = current.addedLessons.some((item) => item.id === clean.id)
        ? current.addedLessons.map((item) => (item.id === clean.id ? clean : item))
        : [...current.addedLessons, clean];
      publishPlan(current, { ...planOf(current), addedLessons });
      return { ...current, addedLessons };
    });
    return true;
  }, [publishPlan]);

  const restoreLesson = useCallback((id: string) => {
    setStored((current) => {
      const lessonPatches = { ...current.lessonPatches };
      delete lessonPatches[id];
      const deletedLessonIds = current.deletedLessonIds.filter((lessonId) => lessonId !== id);
      publishPlan(current, {
        deletedLessonIds,
        skippedLessons: current.skippedLessons,
        lessonPatches,
        addedLessons: current.addedLessons,
      });
      return { ...current, lessonPatches, deletedLessonIds };
    });
  }, [publishPlan]);

  const deleteLesson = useCallback((id: string) => {
    setStored((current) => {
      const lessonPatches = { ...current.lessonPatches };
      delete lessonPatches[id];
      const skippedLessons = { ...current.skippedLessons };
      delete skippedLessons[id];
      const added = current.addedLessons.some((lesson) => lesson.id === id);
      const addedLessons = added
        ? current.addedLessons.filter((lesson) => lesson.id !== id)
        : current.addedLessons;
      const deletedLessonIds = added
        ? current.deletedLessonIds.filter((lessonId) => lessonId !== id)
        : [...new Set([...current.deletedLessonIds, id])];
      publishPlan(current, { deletedLessonIds, skippedLessons, lessonPatches, addedLessons });
      return { ...current, lessonPatches, deletedLessonIds, skippedLessons, addedLessons };
    });
  }, [publishPlan]);

  const skipLesson = useCallback((id: string, date: string) => {
    setStored((current) => {
      const skippedLessons = {
        ...current.skippedLessons,
        [id]: unionIds(current.skippedLessons[id] ?? [], [date]),
      };
      publishPlan(current, { ...planOf(current), skippedLessons });
      return { ...current, skippedLessons };
    });
  }, [publishPlan]);

  const lessonState = useCallback(
    (id: string): LessonState => ({
      patch: stored.lessonPatches[id] ? { ...stored.lessonPatches[id] } : undefined,
      deleted: stored.deletedLessonIds.includes(id),
      skippedDates: [...(stored.skippedLessons[id] ?? [])],
      addedLesson: stored.addedLessons.find((lesson) => lesson.id === id) ?? null,
    }),
    [stored.addedLessons, stored.deletedLessonIds, stored.lessonPatches, stored.skippedLessons],
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
      const addedLessons = current.addedLessons.filter((lesson) => lesson.id !== id);
      if (state.addedLesson) addedLessons.push(state.addedLesson);
      publishPlan(current, { deletedLessonIds, skippedLessons, lessonPatches, addedLessons });
      return { ...current, lessonPatches, deletedLessonIds, skippedLessons, addedLessons };
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
          persistShared(escortMarks, planOf(current));
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
    addLesson,
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
