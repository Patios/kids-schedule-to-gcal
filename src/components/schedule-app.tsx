"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, Download, RefreshCw, RotateCcw, Upload, X } from "lucide-react";
import { LessonEditor } from "@/components/lesson-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UnlockGate } from "@/components/unlock-gate";
import { WeekBoard } from "@/components/week-board";
import { useCalendars, type LessonPatch, type LessonState, type ViewCalendar } from "@/lib/use-calendars";
import { SCHOOL_YEAR, WEEKDAYS, type Lesson, type Weekday } from "@/lib/schedule";

function asset(path: string) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}${path}`;
}

function ImportHelp({ file, label }: { file: string; label: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button asChild className="w-full sm:w-auto">
        <a href={asset(`/calendars/${file}`)} download>
          <Download />
          Pobierz {label}
        </a>
      </Button>
    </div>
  );
}

function heading(calendars: ViewCalendar[]) {
  const ids = calendars.map((calendar) => calendar.id).sort().join(",");
  if (ids === "michal,natalka") return "Plan zajęć Michała i Natalki";
  if (calendars.length === 0) return "Plan zajęć";
  if (calendars.length === 1) return `Plan zajęć — ${calendars[0].label}`;
  return `Plan zajęć — ${calendars.map((calendar) => calendar.label).join(", ")}`;
}

function namesMap(calendars: ViewCalendar[]) {
  return Object.fromEntries(calendars.map((calendar) => [calendar.id, calendar.name]));
}

function planningDay(now = new Date()): { day: Weekday; upcoming: boolean } {
  const weekday = now.getDay();
  if (weekday >= 1 && weekday <= 5) return { day: WEEKDAYS[weekday - 1].id, upcoming: false };
  return { day: "MO", upcoming: true };
}

function minutesOfDay(now: Date) {
  return now.getHours() * 60 + now.getMinutes();
}

function lessonEndMinutes(lesson: Lesson) {
  const [hour, minute] = lesson.end.split(":").map(Number);
  return hour * 60 + minute;
}

function LessonSlider({
  lessons,
  names,
  nextId,
  label,
}: {
  lessons: Lesson[];
  names: Record<string, string>;
  nextId?: string;
  label: string;
}) {
  const scrollerRef = useRef<HTMLOListElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const updateEdges = () => {
      const prev = el.scrollLeft > 4;
      const next = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setEdges((current) => (current.prev === prev && current.next === next ? current : { prev, next }));
    };

    if (nextId) {
      const target = el.querySelector<HTMLElement>(`[data-lesson="${CSS.escape(nextId)}"]`);
      if (target) el.scrollLeft = Math.max(0, target.offsetLeft - 8);
    }

    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    el.addEventListener("scroll", updateEdges, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", updateEdges);
    };
  }, [lessons, nextId]);

  function slide(direction: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = (card?.getBoundingClientRect().width ?? el.clientWidth * 0.8) + 8;
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  }

  const showControls = edges.prev || edges.next;

  return (
    <div className="mt-3">
      <ol
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] xl:flex-wrap xl:overflow-visible xl:snap-none [&::-webkit-scrollbar]:hidden"
        aria-label={label}
      >
        {lessons.map((lesson) => (
          <li
            key={lesson.id}
            data-lesson={lesson.id}
            className={`w-[min(16rem,78%)] shrink-0 snap-start rounded-lg px-3 py-2 text-sm sm:w-44 xl:w-auto xl:min-w-36 xl:shrink ${
              lesson.id === nextId ? "bg-background ring-1 ring-foreground/15" : "bg-muted"
            }`}
          >
            <p className="font-medium tabular-nums">{lesson.start}–{lesson.end}</p>
            <p className="truncate text-muted-foreground">{names[lesson.child] ?? ""} · {lesson.title}</p>
          </li>
        ))}
      </ol>
      {showControls ? (
        <div className="mt-2 flex justify-end gap-1 xl:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Poprzednie zajęcia"
            disabled={!edges.prev}
            onClick={() => slide(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Następne zajęcia"
            disabled={!edges.next}
            onClick={() => slide(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TodaySummary({ lessons, names }: { lessons: Lesson[]; names: Record<string, string> }) {
  const [plan, setPlan] = useState<{ day: Weekday; upcoming: boolean } | null>(null);

  useEffect(() => {
    setPlan(planningDay());
  }, []);

  if (!plan) return null;

  const meta = WEEKDAYS.find((item) => item.id === plan.day)!;
  const dayLessons = lessons
    .filter((lesson) => lesson.weekday === plan.day)
    .sort((a, b) => a.start.localeCompare(b.start));
  const next = plan.upcoming
    ? dayLessons[0]
    : dayLessons.find((lesson) => lessonEndMinutes(lesson) >= minutesOfDay(new Date()));
  const heading = plan.upcoming ? `Najbliższy dzień · ${meta.label}` : `Dzisiaj · ${meta.label}`;

  return (
    <section className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm sm:px-5" aria-label={`Plan na ${meta.label}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-semibold">{heading}</h2>
        <p className="text-sm text-muted-foreground">
          {next
            ? `Najbliżej: ${names[next.child] ?? ""} · ${next.title} (${next.start})`
            : dayLessons.length > 0
              ? "Dzisiejsze zajęcia już się skończyły."
              : "Brak zajęć."}
        </p>
      </div>
      {dayLessons.length > 0 ? (
        <LessonSlider
          lessons={dayLessons}
          names={names}
          nextId={next?.id}
          label={plan.upcoming ? `Zajęcia: ${meta.label}` : "Dzisiejsze zajęcia"}
        />
      ) : null}
    </section>
  );
}

type UndoAction = { id: string; state: LessonState; label: string };

export function ScheduleApp() {
  const {
    calendars,
    remove,
    addFromIcs,
    updateLesson,
    restoreLesson,
    deleteLesson,
    lessonState,
    restoreLessonState,
    isModified,
    escortMarks,
    cycleEscort,
    escortOnServer,
    refreshEscort,
  } = useCalendars();
  const [tab, setTab] = useState("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [refreshingEscort, setRefreshingEscort] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const names = namesMap(calendars);
  const allLessons = calendars.flatMap((calendar) => calendar.lessons);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  function rememberUndo(id: string, label: string) {
    setUndo({ id, state: lessonState(id), label });
  }

  function undoLastAction() {
    if (!undo) return;
    restoreLessonState(undo.id, undo.state);
    setNotice("Cofnięto ostatnią zmianę.");
    setUndo(null);
  }

  useEffect(() => {
    if (tab === "all" && calendars.length < 2) {
      setTab(calendars[0]?.id ?? "all");
      return;
    }
    if (tab !== "all" && !calendars.some((calendar) => calendar.id === tab)) {
      setTab(calendars.length > 1 ? "all" : (calendars[0]?.id ?? "all"));
    }
  }, [calendars, tab]);

  useEffect(() => {
    setEditing((current) => {
      if (!current) return current;
      const visible = calendars.flatMap((calendar) => calendar.lessons);
      return visible.find((lesson) => lesson.id === current.id) ?? null;
    });
  }, [calendars]);

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const text = await file.text();
    const result = addFromIcs(text, file.name);
    if (result.error) {
      setNotice(result.error);
      return;
    }
    if (result.added.length === 0) {
      setNotice("Ten kalendarz jest już w widoku.");
      return;
    }
    setNotice(`Dodano: ${result.added.map((calendar) => calendar.label).join(", ")}`);
    if (calendars.length + result.added.length === 1) {
      setTab(result.added[0].id);
    } else {
      setTab("all");
    }
  }

  function onRemove(id: string, label: string) {
    remove(id);
    setNotice(`Usunięto ${label}. Możesz dodać ten kalendarz z powrotem plikiem ICS.`);
  }

  function onSave(patch: LessonPatch) {
    if (!editing) return;
    rememberUndo(editing.id, "Cofnij zapis zajęć");
    updateLesson(editing.id, patch);
    setEditing(null);
    setNotice("Zapisano zmiany zajęć.");
  }

  function onRestore() {
    if (!editing) return;
    rememberUndo(editing.id, "Cofnij przywrócenie oryginału");
    restoreLesson(editing.id);
    setEditing(null);
    setNotice("Przywrócono oryginalne zajęcia.");
  }

  function onDelete() {
    if (!editing) return;
    rememberUndo(editing.id, "Przywróć usunięte zajęcia");
    deleteLesson(editing.id);
    setEditing(null);
    setNotice("Usunięto zajęcia z planu.");
  }

  async function onRefreshEscort() {
    setRefreshingEscort(true);
    const ok = await refreshEscort();
    setRefreshingEscort(false);
    setNotice(ok ? "Odświeżono kolory z serwera." : "Nie udało się pobrać kolorów z serwera.");
  }

  const board = (lessons: Lesson[], showChild: boolean) => (
    <>
      <p className="hidden text-sm text-muted-foreground md:block">
        Kliknij zajęcia, żeby je edytować. Przeciągnij, żeby zmienić dzień i godzinę.
        Kółko ze śladami na pierwszej i ostatniej lekcji, na basenie, po ZDW i po EarlyStage: kto odprowadza / odbiera (zielony / czerwony, EarlyStage szary).
        {escortOnServer === true
          ? " Kolor zapisuje się na serwerze."
          : escortOnServer === false
            ? " Kolor zapisuje się na tym urządzeniu — serwer nie przyjął zapisu."
            : ""}
      </p>
      <p className="text-sm text-muted-foreground md:hidden">
        Wybierz dzień albo przesuń w bok. Dotknij zajęcia, żeby je edytować.
        Kółko na pierwszej i ostatniej lekcji, na basenie, po ZDW i po EarlyStage oznacza, kto odprowadza / odbiera
        {escortOnServer === true
          ? " i zapisuje się na serwerze."
            : "."}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Odprowadzenie / odbiór:</span>
        <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-full bg-green-500" /> zielony</span>
        <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-full bg-red-500" /> czerwony</span>
        <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-full bg-stone-400" /> EarlyStage</span>
        <span>Dotknij kółka, aby zmienić status.</span>
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="touch-manipulation"
          disabled={refreshingEscort}
          onClick={() => void onRefreshEscort()}
        >
          <RefreshCw className={refreshingEscort ? "animate-spin" : undefined} />
          Odśwież status
        </Button>
      </div>
      <WeekBoard
        lessons={lessons}
        names={names}
        showChild={showChild}
        onOpen={setEditing}
        onMove={(id, next) => {
          rememberUndo(id, "Cofnij przesunięcie");
          updateLesson(id, next);
          setNotice("Przesunięto zajęcia.");
        }}
        escortMarks={escortMarks}
        onCycleEscort={cycleEscort}
      />
    </>
  );

  return (
    <div className="min-h-screen bg-[oklch(0.985_0.01_90)]">
      <UnlockGate>
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-3 py-4 sm:px-6 sm:py-8 sm:gap-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Rok szkolny {SCHOOL_YEAR.label}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {heading(calendars)}
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {calendars.map((calendar) => (
                <Badge key={calendar.id} variant="secondary">
                  {calendar.label}
                </Badge>
              ))}
            </div>
          </header>

          {calendars.length > 0 ? <TodaySummary lessons={allLessons} names={names} /> : null}

          <details className="group rounded-xl border bg-card text-card-foreground shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold sm:px-6 sm:py-4 [&::-webkit-details-marker]:hidden">
              <CalendarPlus className="size-5 shrink-0" />
              <span className="flex-1">Nowy kalendarz Google</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-4 px-6 pb-6 text-sm leading-relaxed">
              <p className="text-muted-foreground">
                Google Calendar nie daje się utworzyć z tej aplikacji bezpośrednio.
                Pobierz plik ICS, załóż w Google nowy kalendarz i go zaimportuj —
                wtedy plan nie zmiesza się z Twoimi spotkaniami. Tym samym plikiem
                możesz później z powrotem dodać kalendarz do widoku.
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Otwórz{" "}
                  <a
                    className="underline underline-offset-2"
                    href="https://calendar.google.com/calendar/r/settings"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ustawienia Kalendarza Google
                  </a>
                  .
                </li>
                <li>
                  Po lewej wybierz <strong>Dodaj kalendarz → Utwórz nowy kalendarz</strong>.
                  Nazwij go np. „Michał 3d”, potem drugi „Natalka 1d”.
                </li>
                <li>
                  Wejdź w <strong>Importuj i eksportuj</strong>, wybierz pobrany plik{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">.ics</code>{" "}
                  i wskaż właściwy nowy kalendarz.
                </li>
              </ol>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <ImportHelp file="michal-3d.ics" label="Michał.ics" />
                <ImportHelp file="natalka-1d.ics" label="Natalka.ics" />
                <ImportHelp file="michal-i-natalka.ics" label="oba dzieci" />
              </div>
              <p className="text-muted-foreground">
                Zajęcia powtarzają się co tydzień do 25 czerwca 2027. Święta, ferie
                i dni wolne trzeba wyłączyć ręcznie. Dopiski z kartki (taekwondo,
                balet, zajęcia dodatkowe) są oznaczone w opisie wydarzenia.
              </p>
            </div>
          </details>

          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            className="sr-only"
            onChange={onImport}
          />

          {calendars.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center">
              <p className="font-medium">Brak kalendarzy w widoku</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Dodaj plan, importując plik ICS, np. natalka-1d.ics.
              </p>
              <Button className="mt-4" onClick={() => fileRef.current?.click()}>
                <Upload />
                Importuj ICS
              </Button>
            </div>
          ) : (
            <Tabs value={tab} onValueChange={setTab}>
              <div className="flex flex-col gap-3">
                <TabsList className="h-auto w-full max-w-full flex-wrap justify-start">
                  {calendars.length > 1 ? (
                    <TabsTrigger value="all">Razem</TabsTrigger>
                  ) : null}
                  {calendars.map((calendar) => (
                    <TabsTrigger
                      key={calendar.id}
                      value={calendar.id}
                      className="min-h-11 pr-1 touch-manipulation md:min-h-0"
                    >
                      {calendar.label}
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Usuń ${calendar.label}`}
                        className="ml-1 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onRemove(calendar.id, calendar.label);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            onRemove(calendar.id, calendar.label);
                          }
                        }}
                      >
                        <X className="size-3.5" />
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full touch-manipulation sm:w-auto"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload />
                  Importuj ICS
                </Button>
              </div>
              {notice || undo ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" role="status">
                  {notice ? <p>{notice}</p> : null}
                  {undo ? (
                    <Button type="button" variant="outline" size="sm" onClick={undoLastAction}>
                      <RotateCcw />
                      {undo.label}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {calendars.length > 1 ? (
                <TabsContent value="all" className="mt-4 space-y-4">
                  {board(allLessons, true)}
                </TabsContent>
              ) : null}
              {calendars.map((calendar) => (
                <TabsContent
                  key={calendar.id}
                  value={calendar.id}
                  className="mt-4 space-y-4"
                >
                  {calendar.teacher ? (
                    <p className="text-sm text-muted-foreground">
                      Wychowawczyni: {calendar.teacher}.
                    </p>
                  ) : null}
                  {board(calendar.lessons, false)}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </UnlockGate>

      {editing ? (
        <LessonEditor
          lesson={editing}
          childName={names[editing.child]}
          modified={isModified(editing.id)}
          onSave={onSave}
          onRestore={onRestore}
          onDelete={onDelete}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
