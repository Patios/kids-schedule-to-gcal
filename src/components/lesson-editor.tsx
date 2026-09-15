"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  KIND_LABEL,
  WEEKDAYS,
  toMin,
  type Lesson,
  type LessonKind,
  type Weekday,
} from "@/lib/schedule";
import type { LessonPatch } from "@/lib/use-calendars";

const KINDS = Object.entries(KIND_LABEL) as [LessonKind, string][];

const fieldClass =
  "h-11 w-full rounded-md border bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:h-9 md:text-sm";

export function LessonEditor({
  lesson,
  childName,
  modified,
  onSave,
  onRestore,
  onDelete,
  onClose,
}: {
  lesson: Lesson;
  childName?: string;
  modified: boolean;
  onSave: (patch: LessonPatch) => void;
  onRestore: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [weekday, setWeekday] = useState<Weekday>(lesson.weekday);
  const [start, setStart] = useState(lesson.start);
  const [end, setEnd] = useState(lesson.end);
  const [room, setRoom] = useState(lesson.room ?? "");
  const [teacher, setTeacher] = useState(lesson.teacher ?? "");
  const [note, setNote] = useState(lesson.note ?? "");
  const [kind, setKind] = useState<LessonKind>(
    (lesson.kind as LessonKind) in KIND_LABEL ? (lesson.kind as LessonKind) : "extra",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(lesson.title);
    setWeekday(lesson.weekday);
    setStart(lesson.start);
    setEnd(lesson.end);
    setRoom(lesson.room ?? "");
    setTeacher(lesson.teacher ?? "");
    setNote(lesson.note ?? "");
    setKind(
      (lesson.kind as LessonKind) in KIND_LABEL ? (lesson.kind as LessonKind) : "extra",
    );
    setError(null);
  }, [lesson]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("Podaj nazwę zajęć.");
      return;
    }
    if (!start || !end || toMin(end) <= toMin(start)) {
      setError("Godzina zakończenia musi być późniejsza niż rozpoczęcia.");
      return;
    }
    onSave({
      title: nextTitle,
      weekday,
      start,
      end,
      kind,
      room: room.trim(),
      teacher: teacher.trim(),
      note: note.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-background/75 p-0 backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[min(92dvh,100%)] w-full max-w-md overflow-y-auto rounded-t-2xl border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-card-foreground shadow-lg md:rounded-xl md:p-6"
      >
        <h2 className="text-lg font-semibold">Edytuj zajęcia</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {childName ? `${childName} · ${lesson.start}–${lesson.end}` : `${lesson.start}–${lesson.end}`}
        </p>

        <label className="mt-4 block text-sm font-medium" htmlFor="lesson-title">
          Nazwa
        </label>
        <input
          id="lesson-title"
          className={`mt-1 ${fieldClass}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium" htmlFor="lesson-day">
              Dzień
            </label>
            <select
              id="lesson-day"
              className={`mt-1 ${fieldClass}`}
              value={weekday}
              onChange={(event) => setWeekday(event.target.value as Weekday)}
            >
              {WEEKDAYS.map((day) => (
                <option key={day.id} value={day.id}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="lesson-kind">
              Rodzaj
            </label>
            <select
              id="lesson-kind"
              className={`mt-1 ${fieldClass}`}
              value={kind}
              onChange={(event) => setKind(event.target.value as LessonKind)}
            >
              {KINDS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium" htmlFor="lesson-start">
              Od
            </label>
            <input
              id="lesson-start"
              type="time"
              className={`mt-1 ${fieldClass}`}
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="lesson-end">
              Do
            </label>
            <input
              id="lesson-end"
              type="time"
              className={`mt-1 ${fieldClass}`}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium" htmlFor="lesson-room">
              Sala
            </label>
            <input
              id="lesson-room"
              className={`mt-1 ${fieldClass}`}
              value={room}
              onChange={(event) => setRoom(event.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="lesson-teacher">
              Nauczyciel
            </label>
            <input
              id="lesson-teacher"
              className={`mt-1 ${fieldClass}`}
              value={teacher}
              onChange={(event) => setTeacher(event.target.value)}
            />
          </div>
        </div>

        <label className="mt-3 block text-sm font-medium" htmlFor="lesson-note">
          Notatka
        </label>
        <textarea
          id="lesson-note"
          rows={2}
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {modified ? (
            <Button type="button" variant="ghost" className="min-h-11 sm:mr-auto md:min-h-9" onClick={onRestore}>
              Przywróć oryginał
            </Button>
          ) : null}
          <Button type="button" variant="ghost" className="min-h-11 md:min-h-9" onClick={onClose}>
            Anuluj
          </Button>
          <Button type="submit" className="min-h-11 md:min-h-9">Zapisz</Button>
        </div>
        <button
          type="button"
          className="mt-3 min-h-11 text-sm text-destructive underline-offset-2 hover:underline md:min-h-0"
          onClick={onDelete}
        >
          Usuń zajęcia z planu
        </button>
      </form>
    </div>
  );
}
