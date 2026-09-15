"use client";

import { useRef, useState, type DragEvent } from "react";
import {
  BOARD_RANGE_MIN,
  BOARD_START_MIN,
  WEEKDAYS,
  kindClass,
  lessonDuration,
  placeLesson,
  toMin,
  type Lesson,
  type Weekday,
} from "@/lib/schedule";

function top(lesson: Lesson) {
  return ((toMin(lesson.start) - BOARD_START_MIN) / BOARD_RANGE_MIN) * 100;
}

function height(lesson: Lesson) {
  return ((toMin(lesson.end) - toMin(lesson.start)) / BOARD_RANGE_MIN) * 100;
}

type Lane = { col: number; cols: number };

function timeOverlap(a: Lesson, b: Lesson) {
  return toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);
}

/** Side-by-side lanes for concurrent lessons (combined Wednesday, etc.). */
function layoutLanes(lessons: Lesson[]) {
  const sorted = [...lessons].sort((a, b) => {
    const byStart = toMin(a.start) - toMin(b.start);
    if (byStart) return byStart;
    const byChild = a.child.localeCompare(b.child);
    if (byChild) return byChild;
    return toMin(b.end) - toMin(a.end);
  });

  const col: number[] = [];
  const colEnds: number[] = [];
  for (const lesson of sorted) {
    const start = toMin(lesson.start);
    let lane = colEnds.findIndex((end) => end <= start);
    if (lane < 0) {
      lane = colEnds.length;
      colEnds.push(0);
    }
    col.push(lane);
    colEnds[lane] = toMin(lesson.end);
  }

  const parent = sorted.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (timeOverlap(sorted[i], sorted[j])) parent[find(i)] = find(j);
    }
  }

  const clusterCols = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    const root = find(i);
    clusterCols.set(root, Math.max(clusterCols.get(root) ?? 0, col[i] + 1));
  }

  const lanes = new Map<string, Lane>();
  for (let i = 0; i < sorted.length; i++) {
    lanes.set(sorted[i].id, {
      col: col[i],
      cols: clusterCols.get(find(i)) ?? 1,
    });
  }
  return lanes;
}

function hours() {
  const out: number[] = [];
  for (let h = 7; h <= 19; h++) out.push(h);
  return out;
}

type Preview = { weekday: Weekday; start: string; end: string };

type DragState = {
  lesson: Lesson;
  grabOffsetMin: number;
  preview: Preview | null;
};

function hitDay(
  clientX: number,
  columns: Partial<Record<Weekday, HTMLElement | null>>,
): Weekday | null {
  let closest: { day: Weekday; dist: number } | null = null;
  for (const day of WEEKDAYS) {
    const el = columns[day.id];
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right) return day.id;
    const dist = Math.min(Math.abs(clientX - rect.left), Math.abs(clientX - rect.right));
    if (!closest || dist < closest.dist) closest = { day: day.id, dist };
  }
  return closest && closest.dist < 64 ? closest.day : null;
}

function previewFromPoint(
  lesson: Lesson,
  grabOffsetMin: number,
  clientX: number,
  clientY: number,
  columns: Partial<Record<Weekday, HTMLElement | null>>,
): Preview | null {
  const day = hitDay(clientX, columns);
  if (!day) return null;
  const column = columns[day];
  if (!column) return null;
  const rect = column.getBoundingClientRect();
  const startMin =
    BOARD_START_MIN +
    ((clientY - rect.top) / rect.height) * BOARD_RANGE_MIN -
    grabOffsetMin;
  return { weekday: day, ...placeLesson(startMin, lessonDuration(lesson)) };
}

function LessonCard({
  lesson,
  names,
  showChild,
  dragging,
  ghost,
  lane,
  onDragStart,
  onOpen,
}: {
  lesson: Lesson;
  names: Record<string, string>;
  showChild: boolean;
  dragging?: boolean;
  ghost?: boolean;
  lane?: Lane;
  onDragStart?: (event: DragEvent<HTMLElement>, lesson: Lesson) => void;
  onOpen?: (lesson: Lesson) => void;
}) {
  const col = lane?.col ?? 0;
  const cols = lane?.cols ?? 1;
  return (
    <article
      role={ghost ? undefined : "button"}
      tabIndex={ghost ? undefined : 0}
      draggable={!ghost}
      aria-hidden={ghost || undefined}
      aria-label={
        ghost ? undefined : `Edytuj ${lesson.title}, ${lesson.start}–${lesson.end}`
      }
      className={`absolute overflow-hidden rounded-md border px-1.5 py-1 shadow-sm select-none ${kindClass(lesson.kind)} ${
        ghost
          ? "pointer-events-none z-30 ring-2 ring-ring"
          : dragging
            ? "cursor-grabbing opacity-40"
            : "cursor-grab"
      }`}
      style={{
        top: `${top(lesson)}%`,
        height: `${Math.max(height(lesson), 4.2)}%`,
        left: `calc(${(col / cols) * 100}% + 0.25rem)`,
        width: `calc(${100 / cols}% - 0.5rem)`,
        zIndex: ghost ? 30 : dragging ? 20 : 1 + col,
      }}
      title={`${lesson.start}–${lesson.end} ${lesson.title}`}
      onDragStart={
        onDragStart ? (event) => onDragStart(event, lesson) : undefined
      }
      onClick={onOpen ? () => onOpen(lesson) : undefined}
      onKeyDown={
        onOpen
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(lesson);
              }
            }
          : undefined
      }
    >
      <p className="text-[11px] leading-tight font-semibold">
        {showChild ? `${names[lesson.child] ?? ""} · ` : null}
        {lesson.title}
      </p>
      <p className="text-[10px] leading-tight opacity-80">
        {lesson.start}–{lesson.end}
        {lesson.room ? ` · ${lesson.room}` : ""}
      </p>
    </article>
  );
}

function DayColumn({
  day,
  lessons,
  names,
  showChild,
  draggingId,
  preview,
  dropTarget,
  columnRef,
  onDragStart,
  onDragOver,
  onDrop,
  onOpen,
}: {
  day: Weekday;
  lessons: Lesson[];
  names: Record<string, string>;
  showChild: boolean;
  draggingId: string | null;
  preview: (Preview & { lesson: Lesson }) | null;
  dropTarget: boolean;
  columnRef: (el: HTMLDivElement | null) => void;
  onDragStart: (event: DragEvent<HTMLElement>, lesson: Lesson) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onOpen: (lesson: Lesson) => void;
}) {
  const items = lessons.filter((l) => l.weekday === day);
  const lanes = layoutLanes(items);
  const meta = WEEKDAYS.find((d) => d.id === day)!;
  const ghost = preview?.weekday === day ? preview : null;
  const empty = items.length === 0 && !ghost;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2 text-center">
        <p className="text-sm font-semibold">{meta.label}</p>
        <p className="text-xs text-muted-foreground">{meta.short}</p>
      </div>
      <div
        ref={columnRef}
        data-weekday={day}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`relative h-[720px] rounded-xl border bg-card ${
          dropTarget ? "ring-2 ring-ring/70" : ""
        }`}
      >
        {hours().map((h) => (
          <div
            key={h}
            className="pointer-events-none absolute right-0 left-0 border-t border-dashed border-border/70"
            style={{ top: `${((h * 60 - BOARD_START_MIN) / BOARD_RANGE_MIN) * 100}%` }}
          />
        ))}
        {empty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-3 text-center text-sm text-muted-foreground">
            Brak zajęć
          </div>
        ) : null}
        {items.map((lesson) => (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            names={names}
            showChild={showChild}
            dragging={draggingId === lesson.id}
            lane={lanes.get(lesson.id)}
            onDragStart={onDragStart}
            onOpen={onOpen}
          />
        ))}
        {ghost ? (
          <LessonCard
            lesson={{
              ...ghost.lesson,
              weekday: ghost.weekday,
              start: ghost.start,
              end: ghost.end,
            }}
            names={names}
            showChild={showChild}
            ghost
          />
        ) : null}
      </div>
    </div>
  );
}

function TimeGutter() {
  return (
    <div className="hidden w-12 shrink-0 sm:block">
      <div className="mb-2 h-[40px]" />
      <div className="relative h-[720px]">
        {hours().map((h) => (
          <div
            key={h}
            className="absolute -translate-y-1/2 text-[11px] text-muted-foreground"
            style={{ top: `${((h * 60 - BOARD_START_MIN) / BOARD_RANGE_MIN) * 100}%` }}
          >
            {String(h).padStart(2, "0")}:00
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeekBoard({
  lessons,
  names,
  showChild,
  onOpen,
  onMove,
}: {
  lessons: Lesson[];
  names: Record<string, string>;
  showChild: boolean;
  onOpen: (lesson: Lesson) => void;
  onMove: (id: string, next: Preview) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const columnsRef = useRef<Partial<Record<Weekday, HTMLElement | null>>>({});
  const suppressClick = useRef(false);

  function setDragState(next: DragState | null) {
    dragRef.current = next;
    setDrag(next);
  }

  function commitMove(preview: Preview | null, origin: Lesson) {
    if (!preview) return;
    if (
      preview.weekday === origin.weekday &&
      preview.start === origin.start &&
      preview.end === origin.end
    ) {
      return;
    }
    onMove(origin.id, preview);
  }

  function onDragStart(event: DragEvent<HTMLElement>, lesson: Lesson) {
    suppressClick.current = true;
    event.dataTransfer.setData("text/plain", lesson.id);
    event.dataTransfer.effectAllowed = "move";
    const column = columnsRef.current[lesson.weekday];
    const rect = column?.getBoundingClientRect();
    const grabOffsetMin = rect
      ? ((event.clientY - rect.top) / rect.height) * BOARD_RANGE_MIN -
        (toMin(lesson.start) - BOARD_START_MIN)
      : 0;
    setDragState({ lesson, grabOffsetMin, preview: null });
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const current = dragRef.current;
    if (!current) return;
    const preview = previewFromPoint(
      current.lesson,
      current.grabOffsetMin,
      event.clientX,
      event.clientY,
      columnsRef.current,
    );
    setDragState({ ...current, preview });
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const current = dragRef.current;
    if (!current) return;
    const preview =
      previewFromPoint(
        current.lesson,
        current.grabOffsetMin,
        event.clientX,
        event.clientY,
        columnsRef.current,
      ) ?? current.preview;
    setDragState(null);
    commitMove(preview, current.lesson);
  }

  function onOpenCard(lesson: Lesson) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onOpen(lesson);
  }

  const preview = drag?.preview
    ? { ...drag.preview, lesson: drag.lesson }
    : null;

  return (
    <div
      className={`flex gap-2 overflow-x-auto pb-2 ${drag ? "select-none" : ""}`}
      onDragEnd={() => {
        setDragState(null);
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 50);
      }}
    >
      <TimeGutter />
      <div className="grid min-w-[720px] flex-1 grid-cols-5 gap-2 sm:min-w-0">
        {WEEKDAYS.map((d) => (
          <DayColumn
            key={d.id}
            day={d.id}
            lessons={lessons}
            names={names}
            showChild={showChild}
            draggingId={drag?.lesson.id ?? null}
            preview={preview}
            dropTarget={preview?.weekday === d.id}
            columnRef={(el) => {
              columnsRef.current[d.id] = el;
            }}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onOpen={onOpenCard}
          />
        ))}
      </div>
    </div>
  );
}

export function MobileList({
  lessons,
  names,
  showChild,
  onOpen,
}: {
  lessons: Lesson[];
  names: Record<string, string>;
  showChild: boolean;
  onOpen: (lesson: Lesson) => void;
}) {
  return (
    <div className="space-y-4 md:hidden">
      {WEEKDAYS.map((day) => {
        const items = lessons
          .filter((l) => l.weekday === day.id)
          .sort(
            (a, b) =>
              a.start.localeCompare(b.start) || a.child.localeCompare(b.child),
          );
        return (
          <section key={day.id}>
            <h3 className="mb-2 text-sm font-semibold">{day.label}</h3>
            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                Brak zajęć tego dnia.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((lesson) => (
                  <li key={lesson.id}>
                    <button
                      type="button"
                      className={`w-full rounded-lg border px-3 py-2 text-left ${kindClass(lesson.kind)}`}
                      onClick={() => onOpen(lesson)}
                    >
                      <p className="text-sm font-semibold">
                        {showChild
                          ? `${names[lesson.child] ?? ""} · ${lesson.title}`
                          : lesson.title}
                      </p>
                      <p className="text-xs opacity-80">
                        {lesson.start}–{lesson.end}
                        {lesson.room ? ` · sala ${lesson.room}` : ""}
                        {lesson.teacher ? ` · ${lesson.teacher}` : ""}
                      </p>
                      {lesson.note ? (
                        <p className="mt-1 text-xs opacity-80">{lesson.note}</p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
