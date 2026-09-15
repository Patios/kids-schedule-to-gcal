"use client";

import { CalendarPlus, Download, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CHILDREN,
  KIND_CLASS,
  SCHOOL,
  SCHOOL_YEAR,
  WEEKDAYS,
  lessonsFor,
  type ChildId,
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
  showChild,
}: {
  day: Weekday;
  lessons: Lesson[];
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
            const child = CHILDREN[lesson.child];
            return (
              <article
                key={lesson.id}
                className={`absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-1 shadow-sm ${KIND_CLASS[lesson.kind]}`}
                style={{
                  top: `${top(lesson)}%`,
                  height: `${Math.max(height(lesson), 4.2)}%`,
                  zIndex: lesson.handwritten ? 2 : 1,
                }}
                title={`${lesson.start}–${lesson.end} ${lesson.title}`}
              >
                <p className="text-[11px] leading-tight font-semibold">
                  {showChild ? `${child.name} · ` : null}
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
  child,
}: {
  child: ChildId | "all";
}) {
  const lessons = lessonsFor(child);
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      <TimeGutter />
      <div className="grid min-w-[720px] flex-1 grid-cols-5 gap-2 sm:min-w-0">
        {WEEKDAYS.map((d) => (
          <DayColumn
            key={d.id}
            day={d.id}
            lessons={lessons}
            showChild={child === "all"}
          />
        ))}
      </div>
    </div>
  );
}

function MobileList({ child }: { child: ChildId | "all" }) {
  const lessons = lessonsFor(child);
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
                    className={`rounded-lg border px-3 py-2 ${KIND_CLASS[lesson.kind]}`}
                  >
                    <p className="text-sm font-semibold">
                      {child === "all"
                        ? `${CHILDREN[lesson.child].name} · ${lesson.title}`
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

function ImportHelp({ who, label }: { who: string; label: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button asChild className="w-full sm:w-auto">
        <a href={`/api/calendar/${who}`}>
          <Download />
          Pobierz {label}
        </a>
      </Button>
    </div>
  );
}

export function ScheduleApp() {
  return (
    <div className="min-h-screen bg-[oklch(0.985_0.01_90)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Rok szkolny {SCHOOL_YEAR.label}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Plan zajęć Michała i Natalki
            </h1>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              {SCHOOL}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Michał · 3d</Badge>
            <Badge variant="secondary">Natalka · 1d</Badge>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="size-5" />
              Nowy kalendarz Google
            </CardTitle>
            <CardDescription>
              Google Calendar nie daje się utworzyć z tej aplikacji bezpośrednio.
              Pobierz plik ICS, załóż w Google nowy kalendarz i go zaimportuj —
              wtedy plan nie zmiesza się z Twoimi spotkaniami.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed">
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
              <ImportHelp who="michal" label="Michał.ics" />
              <ImportHelp who="natalka" label="Natalka.ics" />
              <ImportHelp who="all" label="oba dzieci" />
            </div>
            <p className="text-muted-foreground">
              Zajęcia powtarzają się co tydzień do 25 czerwca 2027. Święta, ferie
              i dni wolne trzeba wyłączyć ręcznie. Dopiski z kartki (taekwondo,
              balet, zajęcia dodatkowe) są oznaczone w opisie wydarzenia.
            </p>
          </CardContent>
        </Card>

        <Tabs defaultValue="all">
          <TabsList className="w-full max-w-md">
            <TabsTrigger value="all">Razem</TabsTrigger>
            <TabsTrigger value="michal">Michał 3d</TabsTrigger>
            <TabsTrigger value="natalka">Natalka 1d</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-4 space-y-4">
            <div className="hidden md:block">
              <WeekBoard child="all" />
            </div>
            <MobileList child="all" />
          </TabsContent>
          <TabsContent value="michal" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Wychowawczyni: {CHILDREN.michal.teacher}. Start zwykle od 8:00,
              poniedziałek kończy basen, wtorek i czwartek taekwondo
              17:30–19:00.
            </p>
            <div className="hidden md:block">
              <WeekBoard child="michal" />
            </div>
            <MobileList child="michal" />
          </TabsContent>
          <TabsContent value="natalka" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Wychowawczyni: {CHILDREN.natalka.teacher}. Poniedziałek od 9:45,
              wtorek basen i wieczorem balet, czwartek też balet.
            </p>
            <div className="hidden md:block">
              <WeekBoard child="natalka" />
            </div>
            <MobileList child="natalka" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
