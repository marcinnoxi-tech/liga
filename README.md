# SquashPoint League – nowa strona tabeli

Strona sama pobiera wyniki z obecnej strony ligi (squashweb.pl/sqliga) co ok. 15 minut
i pokazuje je w nowym wyglądzie: tabela, mecze bezpośrednie, profile zawodników,
podgląd awansów i spadków. Działa za darmo na GitHubie, nic nie musi być włączone w domu.

Wyniki dalej wpisuje się na starej stronie (ADMIN → dodaj mecz). Ta strona tylko je czyta.
Numery telefonów zawodników są pomijane i nigdzie tu nie trafiają.

---

## Uruchomienie krok po kroku (ok. 20 minut, jednorazowo)

### 1. Konto na GitHubie
Wejdź na https://github.com i załóż darmowe konto (jeśli jeszcze nie masz).
Twój login będzie częścią adresu strony.

### 2. Nowe repozytorium
1. Kliknij **+** (prawy górny róg) → **New repository**.
2. **Repository name:** `liga`
3. Zaznacz **Public** (darmowa strona wymaga publicznego repozytorium).
4. Kliknij **Create repository**.

### 3. Wgranie plików
1. Na stronie nowego repozytorium kliknij link **uploading an existing file**.
2. Rozpakuj paczkę ZIP na komputerze i przeciągnij do okna przeglądarki **foldery `site`, `scripts`, `test` oraz plik `README.md`**.
3. Na dole kliknij **Commit changes**.

### 4. Plik automatycznej aktualizacji
Folder `.github` jest „ukryty” i przeciąganie go często nie działa, dlatego dodaj go ręcznie:
1. W repozytorium kliknij **Add file → Create new file**.
2. W polu nazwy wpisz dokładnie: `.github/workflows/update.yml`
   (po wpisaniu `/` GitHub sam utworzy foldery).
3. Otwórz plik `.github/workflows/update.yml` z paczki w Notatniku, skopiuj całą zawartość i wklej.
4. Kliknij **Commit changes**.

### 5. Włączenie strony
1. **Settings** (zakładka repozytorium) → w menu po lewej **Pages**.
2. **Source:** wybierz **GitHub Actions**.

### 6. Pierwsze uruchomienie
1. Zakładka **Actions**. Jeśli GitHub pyta o włączenie workflowów, potwierdź.
2. Po lewej kliknij **Aktualizacja ligi** → po prawej **Run workflow** → **Run workflow**.
3. Po 1–2 minutach pojawi się zielony znaczek ✓.

### 7. Gotowe
Strona jest pod adresem: `https://TWÓJ-LOGIN.github.io/liga/`
Link do konkretnej grupy: `https://TWÓJ-LOGIN.github.io/liga/#g=80`

---

## Dobrze wiedzieć

- **Opóźnienie:** GitHub uruchamia aktualizację mniej więcej co 15 minut, czasem później (w godzinach szczytu nawet 30–60 min). Pilne odświeżenie: Actions → Aktualizacja ligi → Run workflow.
- **Historia miesięcy:** każdy miesiąc zapisuje się osobno (`site/data/2026-11.json` itd.) i można go wybrać na stronie w polu „Miesiąc”.
- **Przerwa w sezonie:** jeśli przez 60 dni nie będzie żadnych nowych wyników, GitHub sam wyłączy automatyczne uruchamianie. Włączysz je w zakładce Actions jednym przyciskiem.
- **Gdy stara strona nie działa:** aktualizacja się nie uda (żółte ostrzeżenie w Actions), a nowa strona pokazuje ostatnie pobrane dane.
- **Gdy ktoś przebuduje starą stronę ligi:** pobieranie może przestać działać – wtedy trzeba poprawić `scripts/fetch.mjs`.
- **Ustawienia ligi** (grupy, ile osób awansuje/spada) są na początku pliku `site/app.js`:
  `GROUPS = [100, 90, 80, 70, 60]` i `ZONE = 3`.
- **Własny adres** (np. liga.squashpoint.pl): Settings → Pages → Custom domain.

## Zasady w tabeli
- Kolejność: punkty → przy równej liczbie punktów mecz bezpośredni
  (przy 3+ osobach: mała tabela ich meczów między sobą) → bilans setów → bilans małych punktów.
- Miejsca 1–3 awansują, ostatnie 3 spadają (grupa 100 bez awansu, grupa 60 bez spadku).
- Panel „Przeniesienia” to podgląd. Samo przeniesienie zawodników między grupami
  trzeba zrobić na starej stronie (tam jest baza danych).

## Struktura
```
.github/workflows/update.yml   automat: pobierz → zapisz → opublikuj
scripts/fetch.mjs              pobieranie danych z squashweb.pl (bez telefonów)
site/index.html, style.css, app.js   strona
site/data/                     pobrane dane (aktualizowane automatycznie)
test/tabele-sample.json        przykładowe dane do testów
```
Test lokalnie: `node scripts/fetch.mjs test/tabele-sample.json`, potem otwórz `site/` przez dowolny serwer WWW.
