"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type TouchEvent } from "react";
import { Footprints } from "lucide-react";
import {
  BOARD_END_MIN,
  BOARD_RANGE_MIN,
  BOARD_START_MIN,
  WEEKDAYS,
  escortKey,
  escortSlotsByLesson,
  kindClass,
  lessonDuration,
  placeLesson,
  toMin,
  type EscortColor,
  type EscortSlot,
  type Lesson,
  type Weekday,
} from "@/lib/schedule";

function top(lesson: Lesson, rangeStart = BOARD_START_MIN, rangeMin = BOARD_RANGE_MIN) {
  return ((toMin(lesson.start) - rangeStart) / rangeMin) * 100;
}

function height(lesson: Lesson, rangeMin = BOARD_RANGE_MIN) {
  return ((toMin(lesson.end) - toMin(lesson.start)) / rangeMin) * 100;
}

function hourMarks(rangeStart: number, rangeEnd: number) {
  const out: number[] = [];
  for (let h = Math.floor(rangeStart / 60); h <= Math.floor(rangeEnd / 60); h++) {
    out.push(h);
  }
  return out;
}

function dayRange(lessons: Lesson[], day: Weekday) {
  const items = lessons.filter((lesson) => lesson.weekday === day);
  if (items.length === 0) {
    return { start: 8 * 60, end: 15 * 60 };
  }
  const first = Math.min(...items.map((lesson) => toMin(lesson.start)));
  const last = Math.max(...items.map((lesson) => toMin(lesson.end)));
  const start = Math.max(BOARD_START_MIN, Math.floor(first / 60) * 60);
  const end = Math.min(
    BOARD_END_MIN,
    Math.max(start + 60, Math.ceil(last / 60) * 60),
  );
  return { start, end };
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

function currentSchoolDay(): Weekday {
  const day = new Date().getDay();
  if (day >= 1 && day <= 5) return WEEKDAYS[day - 1].id;
  return "MO";
}

function shiftDay(day: Weekday, delta: number): Weekday {
  const index = WEEKDAYS.findIndex((item) => item.id === day);
  return WEEKDAYS[(index + delta + WEEKDAYS.length) % WEEKDAYS.length].id;
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

const ESCORT_LABEL: Record<EscortSlot, string> = {
  start: "Odprowadzenie do szkoły",
  end: "Odbiór ze szkoły",
};

const ESCORT_COLOR_LABEL: Record<EscortColor, string> = {
  green: "zielony",
  red: "czerwony",
};

function EscortMark({
  slot,
  color,
  onCycle,
}: {
  slot: EscortSlot;
  color?: EscortColor;
  onCycle?: (slot: EscortSlot) => void;
}) {
  const label = color
    ? `${ESCORT_LABEL[slot]}, ${ESCORT_COLOR_LABEL[color]}`
    : `${ESCORT_LABEL[slot]}, nieoznaczone`;
  return (
    <button
      type="button"
      data-escort={slot}
      draggable={false}
      aria-label={`${label}. Kliknij, żeby zmienić kolor.`}
      title={label}
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border shadow-sm touch-manipulation md:size-5 ${
        color === "green"
          ? "border-green-700 bg-green-500 text-white"
          : color === "red"
            ? "border-red-700 bg-red-500 text-white"
            : "border-foreground/25 bg-white/90 text-foreground/70"
      }`}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCycle?.(slot);
      }}
    >
      <Footprints className="size-3.5 md:size-3" strokeWidth={2.4} />
    </button>
  );
}

function LessonCard({
  lesson,
  names,
  showChild,
  dragging,
  ghost,
  lane,
  canDrag,
  rangeStart = BOARD_START_MIN,
  rangeMin = BOARD_RANGE_MIN,
  escortSlots,
  escortColor,
  onCycleEscort,
  onDragStart,
  onOpen,
}: {
  lesson: Lesson;
  names: Record<string, string>;
  showChild: boolean;
  dragging?: boolean;
  ghost?: boolean;
  lane?: Lane;
  canDrag?: boolean;
  rangeStart?: number;
  rangeMin?: number;
  escortSlots?: EscortSlot[];
  escortColor?: (slot: EscortSlot) => EscortColor | undefined;
  onCycleEscort?: (slot: EscortSlot) => void;
  onDragStart?: (event: DragEvent<HTMLElement>, lesson: Lesson) => void;
  onOpen?: (lesson: Lesson) => void;
}) {
  const col = lane?.col ?? 0;
  const cols = lane?.cols ?? 1;
  const marks = ghost ? [] : (escortSlots ?? []);
  return (
    <article
      role={ghost || marks.length ? undefined : "button"}
      tabIndex={ghost || marks.length ? undefined : 0}
      draggable={!ghost && canDrag}
      aria-hidden={ghost || undefined}
      aria-label={
        ghost ? undefined : `Edytuj ${lesson.title}, ${lesson.start}–${lesson.end}`
      }
      className={`absolute overflow-hidden rounded-md border px-1.5 py-1 shadow-sm select-none touch-manipulation ${kindClass(lesson.kind)} ${
        ghost
          ? "pointer-events-none z-30 ring-2 ring-ring"
          : dragging
            ? "cursor-grabbing opacity-40"
            : canDrag
              ? "cursor-grab"
              : "cursor-pointer"
      }`}
      style={{
        top: `${top(lesson, rangeStart, rangeMin)}%`,
        height: `${Math.max(height(lesson, rangeMin), 4.2)}%`,
        left: `calc(${(col / cols) * 100}% + 0.25rem)`,
        width: `calc(${100 / cols}% - 0.5rem)`,
        zIndex: ghost ? 30 : dragging ? 20 : 1 + col,
      }}
      title={`${lesson.start}–${lesson.end} ${lesson.title}`}
      onDragStart={
        onDragStart
          ? (event) => {
              if ((event.target as HTMLElement).closest("[data-escort]")) {
                event.preventDefault();
                return;
              }
              onDragStart(event, lesson);
            }
          : undefined
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
      {marks.length > 0 ? (
        <div className="absolute top-0.5 right-0.5 z-10 flex flex-col gap-0.5">
          {marks.map((slot) => (
            <EscortMark
              key={slot}
              slot={slot}
              color={escortColor?.(slot)}
              onCycle={onCycleEscort}
            />
          ))}
        </div>
      ) : null}
      <p className={`text-[11px] leading-tight font-semibold ${marks.length ? "pr-6" : ""}`}>
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
  hideHeader,
  canDrag,
  rangeStart = BOARD_START_MIN,
  rangeEnd = BOARD_END_MIN,
  columnRef,
  onDragStart,
  onDragOver,
  onDrop,
  onOpen,
  escortByLesson,
  escortMarks,
  onCycleEscort,
}: {
  day: Weekday;
  lessons: Lesson[];
  names: Record<string, string>;
  showChild: boolean;
  draggingId: string | null;
  preview: (Preview & { lesson: Lesson }) | null;
  dropTarget: boolean;
  hideHeader?: boolean;
  canDrag?: boolean;
  rangeStart?: number;
  rangeEnd?: number;
  columnRef: (el: HTMLDivElement | null) => void;
  onDragStart: (event: DragEvent<HTMLElement>, lesson: Lesson) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onOpen: (lesson: Lesson) => void;
  escortByLesson?: Map<string, EscortSlot[]>;
  escortMarks?: Record<string, EscortColor>;
  onCycleEscort?: (child: string, weekday: Weekday, slot: EscortSlot) => void;
}) {
  const items = lessons.filter((l) => l.weekday === day);
  const lanes = layoutLanes(items);
  const meta = WEEKDAYS.find((d) => d.id === day)!;
  const ghost = preview?.weekday === day ? preview : null;
  const empty = items.length === 0 && !ghost;
  const rangeMin = Math.max(60, rangeEnd - rangeStart);
  const marks = hourMarks(rangeStart, rangeEnd);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {hideHeader ? null : (
        <div className="mb-2 text-center">
          <p className="text-sm font-semibold">{meta.label}</p>
          <p className="text-xs text-muted-foreground">{meta.short}</p>
        </div>
      )}
      <div
        ref={columnRef}
        data-weekday={day}
        onDragOver={canDrag ? onDragOver : undefined}
        onDrop={canDrag ? onDrop : undefined}
        className={`relative h-[min(720px,calc(100dvh-11rem))] min-h-[560px] rounded-xl border bg-card md:h-[720px] md:min-h-0 ${
          dropTarget ? "ring-2 ring-ring/70" : ""
        }`}
      >
        {marks.map((h) => (
          <div
            key={h}
            className="pointer-events-none absolute right-0 left-0 border-t border-dashed border-border/70"
            style={{ top: `${((h * 60 - rangeStart) / rangeMin) * 100}%` }}
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
            canDrag={canDrag}
            rangeStart={rangeStart}
            rangeMin={rangeMin}
            escortSlots={escortByLesson?.get(lesson.id)}
            escortColor={(slot) =>
              escortMarks?.[escortKey(lesson.child, lesson.weekday, slot)]
            }
            onCycleEscort={
              onCycleEscort
                ? (slot) => onCycleEscort(lesson.child, lesson.weekday, slot)
                : undefined
            }
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
            rangeStart={rangeStart}
            rangeMin={rangeMin}
            ghost
          />
        ) : null}
      </div>
    </div>
  );
}

function TimeGutter({
  compact,
  rangeStart = BOARD_START_MIN,
  rangeEnd = BOARD_END_MIN,
}: {
  compact?: boolean;
  rangeStart?: number;
  rangeEnd?: number;
}) {
  const rangeMin = Math.max(60, rangeEnd - rangeStart);
  const heightClass = compact
    ? "h-[min(720px,calc(100dvh-11rem))] min-h-[560px]"
    : "h-[720px]";
  return (
    <div className={`shrink-0 ${compact ? "w-9" : "w-12"}`}>
      <div className={compact ? "h-0" : "mb-2 h-[40px]"} />
      <div className={`relative ${heightClass}`}>
        {hourMarks(rangeStart, rangeEnd).map((h) => (
          <div
            key={h}
            className="absolute -translate-y-1/2 text-[10px] text-muted-foreground sm:text-[11px]"
            style={{ top: `${((h * 60 - rangeStart) / rangeMin) * 100}%` }}
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
  escortMarks,
  onCycleEscort,
}: {
  lessons: Lesson[];
  names: Record<string, string>;
  showChild: boolean;
  onOpen: (lesson: Lesson) => void;
  onMove: (id: string, next: Preview) => void;
  escortMarks: Record<string, EscortColor>;
  onCycleEscort: (child: string, weekday: Weekday, slot: EscortSlot) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [mobileDay, setMobileDay] = useState<Weekday>("MO");
  const dragRef = useRef<DragState | null>(null);
  const columnsRef = useRef<Partial<Record<Weekday, HTMLElement | null>>>({});
  const suppressClick = useRef(false);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const escortByLesson = useMemo(() => escortSlotsByLesson(lessons), [lessons]);

  useEffect(() => {
    setMobileDay(currentSchoolDay());
  }, []);

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

  const mobileMeta = WEEKDAYS.find((day) => day.id === mobileDay)!;
  const mobileRange = dayRange(lessons, mobileDay);

  function onSwipeStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0];
    swipeRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function onSwipeEnd(event: TouchEvent<HTMLDivElement>) {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    suppressClick.current = true;
    setMobileDay((day) => shiftDay(day, dx < 0 ? 1 : -1));
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 80);
  }

  return (
    <>
      <div className="md:hidden">
        <div className="sticky top-0 z-20 -mx-1 mb-3 bg-[oklch(0.985_0.01_90)]/95 px-1 pt-1 pb-2 backdrop-blur-sm">
          <div className="grid grid-cols-5 gap-1">
            {WEEKDAYS.map((day) => {
              const active = day.id === mobileDay;
              return (
                <button
                  key={day.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMobileDay(day.id)}
                  className={`min-h-11 touch-manipulation rounded-lg border px-1 text-sm ${
                    active
                      ? "border-foreground/20 bg-background font-semibold shadow-sm"
                      : "border-transparent bg-muted/70 text-muted-foreground"
                  }`}
                >
                  {day.short}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm font-medium">{mobileMeta.label}</p>
        </div>
        <div
          className="flex gap-1 touch-pan-y overscroll-x-contain"
          onTouchStart={onSwipeStart}
          onTouchEnd={onSwipeEnd}
        >
          <TimeGutter
            compact
            rangeStart={mobileRange.start}
            rangeEnd={mobileRange.end}
          />
          <DayColumn
            day={mobileDay}
            lessons={lessons}
            names={names}
            showChild={showChild}
            draggingId={null}
            preview={null}
            dropTarget={false}
            hideHeader
            rangeStart={mobileRange.start}
            rangeEnd={mobileRange.end}
            columnRef={() => {}}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onOpen={onOpenCard}
            escortByLesson={escortByLesson}
            escortMarks={escortMarks}
            onCycleEscort={onCycleEscort}
          />
        </div>
      </div>

      <div
        className={`hidden gap-2 overflow-x-auto pb-2 md:flex ${drag ? "select-none" : ""}`}
        onDragEnd={() => {
          setDragState(null);
          window.setTimeout(() => {
            suppressClick.current = false;
          }, 50);
        }}
      >
        <TimeGutter />
        <div className="grid min-w-[720px] flex-1 grid-cols-5 gap-2 xl:min-w-0">
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
              canDrag
              columnRef={(el) => {
                columnsRef.current[d.id] = el;
              }}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onOpen={onOpenCard}
              escortByLesson={escortByLesson}
              escortMarks={escortMarks}
              onCycleEscort={onCycleEscort}
            />
          ))}
        </div>
      </div>
    </>
  );
}
