# Plan zajęć — Michał i Natalka

## Kalendarz Google

1. Pobierz plik `.ics` (Michał, Natalka albo oboje).
2. Wejdź w [Kalendarz Google → Ustawienia](https://calendar.google.com/calendar/r/settings).
3. **Dodaj kalendarz → Utwórz nowy kalendarz** (np. „Michał 3d”).
4. **Importuj i eksportuj** → wybierz plik ICS i wskaż ten nowy kalendarz.

Wydarzenia powtarzają się co tydzień do **25 czerwca 2027**. Święta, ferie i dni wolne od zajęć **nie są wyłączone**.

Taekwondo Michała: **wtorek i czwartek, 17:30–19:00**. Natalka nie ma języka francuskiego.

## Uruchomienie lokalnie

```bash
npm install
npm run dev
```

Aplikacja startuje na porcie **4317**. Statyczne kalendarze:

- `/calendars/michal-3d.ics`
- `/calendars/natalka-1d.ics`
- `/calendars/michal-i-natalka.ics`

Po zmianie planu: `npm run ics`.

## Hosting publiczny na GitHub Pages

Tak — strona jest eksportem statycznym i da się ją wystawić za darmo.

1. Utwórz publiczne repo na GitHubie (w tym projekcie Cursor: **Create repo**).
2. W repo: **Settings → Pages → Source: GitHub Actions**.
3. Push na `main` odpala workflow `.github/workflows/pages.yml`.
4. Adres będzie w stylu `https://<konto>.github.io/<nazwa-repo>/`.

Jeśli repo nazywa się `konto.github.io`, strona wyląduje w korzeniu domeny.

**Prywatność:** plan zawiera imiona dzieci, klasę i szkołę. Publiczne Pages jest widoczne dla każdego, kto ma link (i może zostać zindeksowane). Jeśli to za dużo, zostaw repo prywatne i używaj Vercel/Netlify z hasłem albo nie publikuj.

## Źródło

Plan wygenerowany przez szkołę 31.08.2026. Sale i kody nauczycieli są przepisane z wydruku (Sak, KA, KN, A-SU, itd.).
