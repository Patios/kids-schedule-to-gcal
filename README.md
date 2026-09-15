# Plan zajęć — Michał i Natalka

Tygodniowy plan zajęć ze SP nr 148 w Krakowie (ul. Żabia 20) na rok szkolny 2026/2027, odczytany z wydrukowanych kart:

- **Michał**, klasa **3d**
- **Natalka**, klasa **1d**

Aplikacja pokazuje siatkę tygodnia i udostępnia pliki **ICS** do importu jako **nowe kalendarze Google** (osobno albo razem).

## Kalendarz Google

Z tej aplikacji nie da się kliknąć „załóż kalendarz” na koncie Google — Google nie udostępnia tego bez Calendar API. Działa to tak:

1. Pobierz plik `.ics` (Michał, Natalka albo oboje).
2. Wejdź w [Kalendarz Google → Ustawienia](https://calendar.google.com/calendar/r/settings).
3. **Dodaj kalendarz → Utwórz nowy kalendarz** (np. „Michał 3d”).
4. **Importuj i eksportuj** → wybierz plik ICS i wskaż ten nowy kalendarz.

Wydarzenia powtarzają się co tydzień do **25 czerwca 2027**. Święta, ferie i dni wolne od zajęć **nie są wyłączone**.

Dopiski z kartki (taekwondo, balet, zajęcia dodatkowe) są w kalendarzu razem z lekcjami. Wtorkowe taekwondo Michała na zdjęciu ma godzinę końcową trudną do odczytu (13:00 albo 15:00) — w pliku jest **12:50–15:00**, analogicznie do czwartku.

## Uruchomienie

```bash
npm install
npm run dev
```

Aplikacja startuje na porcie **4317**. Pliki kalendarza:

- `/api/calendar/michal`
- `/api/calendar/natalka`
- `/api/calendar/all`

## Źródło

Plan wygenerowany przez szkołę 31.08.2026. Sale i kody nauczycieli są przepisane z wydruku (Sak, KA, KN, A-SU, itd.).
