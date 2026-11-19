// Pobiera aktualne dane ligi z squashweb.pl i zapisuje je jako pliki JSON dla strony.
// Uruchamiane automatycznie przez GitHub Actions (patrz .github/workflows/update.yml).
//
// Użycie:
//   node scripts/fetch.mjs                      -> pobiera z serwera ligi
//   node scripts/fetch.mjs test/plik.json       -> czyta dane z pliku (do testów)
//
// Numery telefonów zawodników są celowo pomijane i nigdy nie trafiają do repozytorium.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SOURCE_URL = 'http://squashweb.pl/sqliga/php/tabele.php';
const DATA_DIR = path.join(process.cwd(), 'site', 'data');

function warn(msg) {
  // Ostrzeżenie widoczne w GitHub Actions, ale bez przerywania – strona zostaje z ostatnimi danymi.
  console.log(`::warning::${msg}`);
}

async function loadRaw() {
  const file = process.argv[2];
  if (file) return JSON.parse(await readFile(file, 'utf8'));

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(SOURCE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'squash-liga-mirror' },
        body: '',
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return JSON.parse(text.replace(/^﻿/, ''));
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw lastErr;
}

const int = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};

function normalize(raw) {
  if (!raw || !Array.isArray(raw.zaw) || !Array.isArray(raw.mecz)) {
    throw new Error('Nieoczekiwany format danych (brak list "zaw" lub "mecz")');
  }
  const players = raw.zaw
    .filter((z) => z && z.idzaw != null && z.nazwisko != null)
    .map((z) => ({
      id: int(z.idzaw),
      nazwisko: String(z.nazwisko).trim(),
      imie: String(z.imie ?? '').trim(),
      grupa: int(z.grupa),
      kontuzja: String(z.stan ?? 'ok').trim() !== 'ok',
    }));

  const matches = raw.mecz
    .filter((m) => m && m.idgr1 != null && m.idgr2 != null && m.data)
    .map((m) => ({
      id: int(m.idm),
      data: String(m.data).slice(0, 10),
      a: int(m.idgr1),
      b: int(m.idgr2),
      wa: int(m.w1),
      wb: int(m.w2),
      pa: int(m.gr1pkt),
      pb: int(m.gr2pkt),
      sa: [1, 2, 3, 4, 5].map((k) => int(m[`gr1s${k}`])),
      sb: [1, 2, 3, 4, 5].map((k) => int(m[`gr2s${k}`])),
    }))
    .sort((x, y) => (x.data === y.data ? x.id - y.id : x.data < y.data ? -1 : 1));

  return { players, matches };
}

function warsawMonth(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit' }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  return `${y}-${m}`;
}

// Miesiąc rozgrywek = najczęstszy miesiąc w datach meczów (na wypadek spóźnionych wpisów),
// a gdy meczów jeszcze nie ma – bieżący miesiąc.
function leagueMonth(matches) {
  if (!matches.length) return warsawMonth();
  const count = {};
  for (const m of matches) count[m.data.slice(0, 7)] = (count[m.data.slice(0, 7)] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0][0];
}

async function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function writeIfChanged(file, obj) {
  const text = JSON.stringify(obj, null, 1) + '\n';
  const old = existsSync(file) ? await readFile(file, 'utf8') : null;
  if (old === text) return false;
  await writeFile(file, text);
  return true;
}

async function main() {
  let raw;
  try {
    raw = await loadRaw();
  } catch (e) {
    warn(`Nie udało się pobrać danych ligi: ${e.message}. Strona zostaje z ostatnimi danymi.`);
    return;
  }

  let data;
  try {
    data = normalize(raw);
  } catch (e) {
    warn(`${e.message}. Strona zostaje z ostatnimi danymi.`);
    return;
  }
  if (!data.players.length) {
    warn('Serwer ligi zwrócił pustą listę zawodników – pomijam aktualizację.');
    return;
  }

  await mkdir(DATA_DIR, { recursive: true });
  const month = leagueMonth(data.matches);
  const monthFile = path.join(DATA_DIR, `${month}.json`);

  // Ten sam stan danych co ostatnio? Nic nie zmieniamy (żadnego commita, żadnej publikacji).
  const prev = await readJson(monthFile, null);
  const same = prev && JSON.stringify({ players: prev.players, matches: prev.matches }) === JSON.stringify(data);
  if (same) {
    console.log(`Bez zmian (${month}: ${data.players.length} zawodników, ${data.matches.length} meczów).`);
    return;
  }

  const now = new Date().toISOString();
  await writeIfChanged(monthFile, { month, updated: now, ...data });

  const index = await readJson(path.join(DATA_DIR, 'months.json'), { months: [] });
  if (!index.months.includes(month)) index.months.push(month);
  index.months.sort().reverse();
  index.latest = index.months[0];
  index.updated = now;
  await writeIfChanged(path.join(DATA_DIR, 'months.json'), index);

  console.log(`Zaktualizowano ${month}: ${data.players.length} zawodników, ${data.matches.length} meczów.`);
}

main().catch((e) => {
  warn(`Błąd skryptu: ${e.message}`);
});
