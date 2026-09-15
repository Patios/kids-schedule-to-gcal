"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CalendarPlus, ChevronDown, Download, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UnlockGate } from "@/components/unlock-gate";
import { useCalendars, type ViewCalendar } from "@/lib/use-calendars";
import {
  SCHOOL_YEAR,
  WEEKDAYS,
  kindClass,
  type Lesson,
  type Weekday,
} from "@/lib/schedule";

const DAY_START = 7 * 60;
const DAY_END = 19 * 60 + 30;
const RANGE = DAY_END - DAY_START;

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function top(lesson: Lesson) {
  return ((toMin(lesson.start) - DAY_START) / RANGE) * 100;
}

function height(lesson: Lesson) {
  return ((toMin(lesson.end) - toMin(lesson.start)) / RANGE) * 100;
}

function hours() {
  const out: number[] = [];
  for (let h = 7; h <= 19; h++) out.push(h);
  return out;
}

function DayColumn({
  day,
  lessons,
  names,
  showChild,
}: {
  day: Weekday;
  lessons: Lesson[];
  names: Record<string, string>;
  showChild: boolean;
}) {
  const items = lessons.filter((l) => l.weekday === day);
  const meta = WEEKDAYS.find((d) => d.id === day)!;
  const empty = items.length === 0;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2 text-center">
        <p className="text-sm font-semibold">{meta.label}</p>
        <p className="text-xs text-muted-foreground">{meta.short}</p>
      </div>
      <div className="relative h-[720px] rounded-xl border bg-card">
        {hours().map((h) => (
          <div
            key={h}
            className="pointer-events-none absolute right-0 left-0 border-t border-dashed border-border/70"
            style={{ top: `${((h * 60 - DAY_START) / RANGE) * 100}%` }}
          />
        ))}
        {empty ? (
          <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-sm text-muted-foreground">
            Brak zajęć
          </div>
        ) : (
          items.map((lesson) => {
            return (
              <article
                key={lesson.id}
                className={`absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-1 shadow-sm ${kindClass(lesson.kind)}`}
                style={{
                  top: `${top(lesson)}%`,
                  height: `${Math.max(height(lesson), 4.2)}%`,
                  zIndex: lesson.handwritten ? 2 : 1,
                }}
                title={`${lesson.start}–${lesson.end} ${lesson.title}`}
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
          })
        )}
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
            style={{ top: `${((h * 60 - DAY_START) / RANGE) * 100}%` }}
          >
            {String(h).padStart(2, "0")}:00
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekBoard({
  lessons,
  names,
  showChild,
}: {
  lessons: Lesson[];
  names: Record<string, string>;
  showChild: boolean;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      <TimeGutter />
      <div className="grid min-w-[720px] flex-1 grid-cols-5 gap-2 sm:min-w-0">
        {WEEKDAYS.map((d) => (
          <DayColumn
            key={d.id}
            day={d.id}
            lessons={lessons}
            names={names}
            showChild={showChild}
          />
        ))}
      </div>
    </div>
  );
}

function MobileList({
  lessons,
  names,
  showChild,
}: {
  lessons: Lesson[];
  names: Record<string, string>;
  showChild: boolean;
}) {
  return (
    <div className="space-y-4 md:hidden">
      {WEEKDAYS.map((day) => {
        const items = lessons
          .filter((l) => l.weekday === day.id)
          .sort((a, b) => a.start.localeCompare(b.start));
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
                  <li
                    key={lesson.id}
                    className={`rounded-lg border px-3 py-2 ${kindClass(lesson.kind)}`}
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

export function ScheduleApp() {
  const { calendars, remove, addFromIcs } = useCalendars();
  const [tab, setTab] = useState("all");
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const names = namesMap(calendars);
  const allLessons = calendars.flatMap((calendar) => calendar.lessons);

  useEffect(() => {
    if (tab === "all" && calendars.length < 2) {
      setTab(calendars[0]?.id ?? "all");
      return;
    }
    if (tab !== "all" && !calendars.some((calendar) => calendar.id === tab)) {
      setTab(calendars.length > 1 ? "all" : (calendars[0]?.id ?? "all"));
    }
  }, [calendars, tab]);

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

  return (
    <div className="min-h-screen bg-[oklch(0.985_0.01_90)]">
      <UnlockGate>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Rok szkolny {SCHOOL_YEAR.label}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
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

          <details className="group rounded-xl border bg-card text-card-foreground shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-6 py-4 font-semibold [&::-webkit-details-marker]:hidden">
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <TabsList className="h-auto w-fit max-w-full flex-wrap">
                  {calendars.length > 1 ? (
                    <TabsTrigger value="all">Razem</TabsTrigger>
                  ) : null}
                  {calendars.map((calendar) => (
                    <TabsTrigger
                      key={calendar.id}
                      value={calendar.id}
                      className="pr-1"
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
                  className="shrink-0"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload />
                  Importuj ICS
                </Button>
              </div>
              {notice ? (
                <p className="text-sm text-muted-foreground">{notice}</p>
              ) : null}
              {calendars.length > 1 ? (
                <TabsContent value="all" className="mt-4 space-y-4">
                  <div className="hidden md:block">
                    <WeekBoard lessons={allLessons} names={names} showChild />
                  </div>
                  <MobileList lessons={allLessons} names={names} showChild />
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
                  <div className="hidden md:block">
                    <WeekBoard
                      lessons={calendar.lessons}
                      names={names}
                      showChild={false}
                    />
                  </div>
                  <MobileList
                    lessons={calendar.lessons}
                    names={names}
                    showChild={false}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </UnlockGate>
    </div>
  );
}
