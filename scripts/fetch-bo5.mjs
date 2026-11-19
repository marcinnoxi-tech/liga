// Pobiera ranking "Czwartkowe Granie" (Factory Squash&Fitness) z bo5.pl
// i zapisuje go jako site/data/czwartki.json dla podstrony czwartki.html.
//
// Użycie:
//   node scripts/fetch-bo5.mjs                 -> pobiera z bo5.pl
//   node scripts/fetch-bo5.mjs test/plik.html  -> czyta HTML z pliku (do testów)
//
// Uprzejmość wobec bo5.pl: przy automatycznym uruchomieniu pobieramy najwyżej raz na godzinę.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// ===== Ustawienia (zmień przy nowym sezonie) =====
const CONFIG = {
  name: 'Czwartkowe Granie',
  club: 'Factory Squash&Fitness, Sosnowiec',
  // Adres strony rankingu na bo5.pl (dla nowego sezonu zmienia się końcówka, np. ,451,2602.html)
  rankingUrl: 'https://bo5.pl/factory/CZWARTKOWE+GRANIE,ranking,451,2602.html',
  rulesUrl: 'https://bo5.pl/factory/CZWARTKOWE+GRANIE,rules,451,2602.html',
  clubUrl: 'https://bo5.pl/factory',
  bestOf: 12, // do rankingu liczy się suma N najlepszych rund
  rounds: [
    ['Runda 1', '2026-09-03', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+1,25018.html'],
    ['Runda 2', '2026-09-10', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+2,25019.html'],
    ['Runda 3', '2026-09-17', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+3,25020.html'],
    ['Runda 4', '2026-09-24', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+4,25021.html'],
    ['Runda 5', '2026-10-01', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+5,25022.html'],
    ['Runda 6', '2026-10-08', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+6,25023.html'],
    ['Runda 7', '2026-10-15', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+7,25024.html'],
    ['Runda 8', '2026-10-22', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+8,25025.html'],
    ['Runda 9', '2026-10-29', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+9,25026.html'],
    ['Runda 10', '2026-11-05', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+10,25027.html'],
    ['Runda 11', '2026-11-12', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+11,25028.html'],
    ['Runda 12', '2026-11-19', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+12,25029.html'],
    ['Runda 13', '2026-11-26', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+13,25030.html'],
    ['Runda 14', '2026-12-03', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+14,25031.html'],
    ['Runda 15', '2026-12-10', 'https://bo5.pl/factory/CZWARTKOWE+GRANIE-Runda+15,25032.html'],
    ['Finał', '2026-12-17', 'https://bo5.pl/t7682/Czwartkowe+Granie+-+FINA%C5%81.html'],
  ],
};

const OUT = path.join(process.cwd(), 'site', 'data', 'czwartki.json');
const warn = (m) => console.log(`::warning::${m}`);

// ===== Prosty parser tabel HTML (bez zewnętrznych bibliotek) =====
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function text(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENT[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}
function parseTables(html) {
  const tables = [];
  for (const t of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [];
    for (const tr of t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [];
      for (const c of tr[1].matchAll(/<(t[hd])\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi)) {
        const span = parseInt((c[2].match(/colspan\s*=\s*["']?(\d+)/i) || [])[1] || '1', 10);
        const v = text(c[3]);
        for (let i = 0; i < span; i++) cells.push(i === 0 ? v : '');
      }
      if (cells.length) rows.push(cells);
    }
    tables.push(rows);
  }
  return tables;
}

function parseRanking(html) {
  const tables = parseTables(html);
  const table = tables.find((rows) => rows.some((r) => r.some((c) => /^gracz$/i.test(c))));
  if (!table) throw new Error(`nie znaleziono tabeli z kolumną "Gracz" (tabel na stronie: ${tables.length})`);

  const hi = table.findIndex((r) => r.some((c) => /^gracz$/i.test(c)));
  const head = table[hi];
  const iPlayer = head.findIndex((c) => /^gracz$/i.test(c));
  const iPlace = head.findIndex((c) => /^miejsce$/i.test(c));
  const iSum = head.findIndex((c) => /^suma/i.test(c));
  const roundCols = head
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => /^runda\s*\d+$/i.test(c) || /^fina/i.test(c));
  if (iPlayer < 0 || !roundCols.length) throw new Error('nieoczekiwany układ nagłówka tabeli: ' + head.join(' | '));

  const num = (s) => {
    const m = String(s ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  };

  const players = [];
  for (const r of table.slice(hi + 1)) {
    const name = r[iPlayer];
    if (!name) continue;
    const results = roundCols.map(({ i }) => num(r[i]));
    const played = results.filter((v) => v != null);
    const sorted = played.slice().sort((a, b) => b - a);
    players.push({
      name,
      place: iPlace >= 0 ? num(r[iPlace]) : null,
      results,
      sum: iSum >= 0 && num(r[iSum]) != null ? num(r[iSum]) : sorted.slice(0, CONFIG.bestOf).reduce((s, v) => s + v, 0),
      played: played.length,
      best: sorted[0] ?? null,
    });
  }
  if (!players.length) throw new Error('tabela rankingu jest pusta');

  // Miejsca: z bo5.pl, a jeśli ich brak – liczymy po sumie (remis = to samo miejsce)
  players.sort((a, b) => b.sum - a.sum || a.name.localeCompare(b.name, 'pl'));
  players.forEach((p, i) => {
    if (p.place == null) p.place = i > 0 && players[i - 1].sum === p.sum ? players[i - 1].place : i + 1;
  });
  players.sort((a, b) => a.place - b.place || a.name.localeCompare(b.name, 'pl'));

  const seasonMatch = html.match(/(Pierwsza|Druga|Trzecia|Czwarta|Piąta)\s+Czwartka\s+\d{4}/i);
  return { columns: roundCols.map(({ c }) => c), players, season: seasonMatch ? seasonMatch[0] : null };
}

async function load() {
  const file = process.argv[2];
  if (file) return readFile(file, 'utf8');
  const res = await fetch(CONFIG.rankingUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; squash-liga/1.0)', 'Accept-Language': 'pl' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  // Automat (co 15 min) – bo5.pl odpytujemy tylko w pierwszym kwadransie każdej godziny.
  if (!process.argv[2] && process.env.GITHUB_EVENT_NAME === 'schedule' && new Date().getUTCMinutes() >= 15 && existsSync(OUT)) {
    console.log('bo5.pl: pomijam (pobieranie raz na godzinę).');
    return;
  }

  let parsed;
  try {
    parsed = parseRanking(await load());
  } catch (e) {
    warn(`Czwartkowe Granie: nie udało się odczytać rankingu z bo5.pl (${e.message}). Podstrona zostaje z ostatnimi danymi.`);
    return;
  }

  const data = {
    name: CONFIG.name,
    club: CONFIG.club,
    season: parsed.season,
    source: CONFIG.rankingUrl,
    rulesUrl: CONFIG.rulesUrl,
    clubUrl: CONFIG.clubUrl,
    bestOf: CONFIG.bestOf,
    rounds: parsed.columns.map((col, k) => {
      const cfg = CONFIG.rounds.find(([n]) => n.toLowerCase() === col.toLowerCase()) || CONFIG.rounds[k] || [col, null, null];
      return { name: col, date: cfg[1], url: cfg[2] };
    }),
    players: parsed.players,
  };

  const prev = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : null;
  if (prev && JSON.stringify({ ...prev, updated: null }) === JSON.stringify({ ...data, updated: null })) {
    console.log(`Czwartkowe Granie: bez zmian (${data.players.length} graczy).`);
    return;
  }
  data.updated = new Date().toISOString();
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data, null, 1) + '\n');
  console.log(`Czwartkowe Granie: zapisano ranking (${data.players.length} graczy, ${data.rounds.length} kolumn rund).`);
}

main().catch((e) => warn(`Czwartkowe Granie – błąd skryptu: ${e.message}`));
