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

## Wspólne kolory odprowadzania (telefony rodziców)

GitHub Pages jest statyczny, więc kolory kółek (zielony / czerwony) same z siebie **nie zapiszą się** między telefonami. Żeby oboje rodziców widzieli to samo, podłącz darmowy JSONBin:

1. Załóż konto na [jsonbin.io](https://jsonbin.io) (darmowy plan wystarczy).
2. **Create Bin** i wklej:

```json
{ "updatedAt": null, "marks": {} }
```

3. Zapisz bin. Z paska adresu albo z panelu skopiuj **Bin ID** (ciąg typu `68c8…`).
4. Wejdź w **API Keys → Access Keys → Create**.
   - nazwa np. `plan-zajec-escort`
   - uprawnienia: **Bins: Read** i **Bins: Update** (bez Create/Delete)
   - skopiuj wygenerowany **Access Key**
5. Lokalnie skopiuj `.env.example` do `.env.local` i uzupełnij:

```bash
NEXT_PUBLIC_ESCORT_SYNC_URL=https://api.jsonbin.io/v3/b/BIN_ID
NEXT_PUBLIC_ESCORT_SYNC_KEY=$$2a$$10$$....
```

W kluczu JSONBin każde `$` zapisz jako `$$`. Next.js traktuje `$…` jak zmienną i bez tego klucz wychodzi pusty.

Zrestartuj `npm run dev`. Na stronie powinno być: „Kolor zapisuje się na serwerze.”

6. To samo w GitHubie, żeby działało na telefonach:
   - repo → **Settings → Secrets and variables → Actions → New repository secret**
   - sekret `NEXT_PUBLIC_ESCORT_SYNC_URL` = `https://api.jsonbin.io/v3/b/BIN_ID`
   - sekret `NEXT_PUBLIC_ESCORT_SYNC_KEY` = Access Key
   - **Actions → GitHub Pages → Run workflow** (albo push na `main`)

Po deployu odśwież stronę na obu telefonach. Zmiana koloru na jednym powinna pojawić się na drugim po odświeżeniu.

**Uwaga:** `NEXT_PUBLIC_…` trafia do JS w przeglądarce. Klucz umie odczytać każdy, kto ma kod strony — dlatego Access Key tylko z Read+Update, nigdy Master Key. To tylko kolory odprowadzania, nie hasło do kalendarza.

**Prywatność:** plan zawiera imiona dzieci, klasę i szkołę. Publiczne Pages jest widoczne dla każdego, kto ma link (i może zostać zindeksowane). Jeśli to za dużo, zostaw repo prywatne i używaj Vercel/Netlify z hasłem albo nie publikuj.

## Źródło

Plan wygenerowany przez szkołę 31.08.2026. Sale i kody nauczycieli są przepisane z wydruku (Sak, KA, KN, A-SU, itd.).
