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

// ===== Wyniki rund (grupy i mecze) =====
// Fragment HTML ze strony rundy: https://bo5.pl/clubs/ajax/getTab.php?tab=league/results&league-round-id=ID
// Struktura (wg skryptu league.v30.js z bo5.pl): każda grupa to <table class="roundGroup" gid="…">,
// gracz to <tr playerid="…">, mecz to zagnieżdżona <table mid="…"> z dwoma wierszami <tr pid="…">,
// w których komórki bez "rowspan" to punkty w kolejnych setach.
const ROUNDS_DIR = path.join(process.cwd(), 'site', 'data', 'czwartki-rundy');
const RESULTS_URL = (id) => `https://bo5.pl/clubs/ajax/getTab.php?tab=league/results&league-round-id=${id}`;
const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'col', 'area', 'base', 'embed', 'source', 'wbr', 'param', 'track']);

// Mały, tolerancyjny parser HTML do drzewa elementów (wystarczający dla tabel bo5.pl)
function parseDom(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<!\w[^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0, m;
  const addText = (t) => { if (t) cur.children.push({ tag: '#text', text: t, parent: cur }); };
  while ((m = re.exec(html))) {
    addText(html.slice(last, m.index));
    last = re.lastIndex;
    if (!m[2]) continue; // komentarz / doctype
    const tag = m[2].toLowerCase();
    if (m[1]) { // znacznik zamykający
      let n = cur;
      while (n && n !== root && n.tag !== tag) n = n.parent;
      if (n && n !== root) cur = n.parent;
      continue;
    }
    // niejawne zamknięcia w tabelach
    if (tag === 'td' || tag === 'th') {
      let n = cur;
      while (n && n !== root && !['td', 'th', 'tr', 'table'].includes(n.tag)) n = n.parent;
      if (n && (n.tag === 'td' || n.tag === 'th')) cur = n.parent;
    }
    if (tag === 'tr') {
      let n = cur;
      while (n && n !== root && !['tr', 'table', 'tbody', 'thead', 'tfoot'].includes(n.tag)) n = n.parent;
      if (n && n.tag === 'tr') cur = n.parent;
    }
    const attrs = {};
    for (const a of m[3].matchAll(/([^\s=\/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    }
    const el = { tag, attrs, children: [], parent: cur };
    cur.children.push(el);
    if (tag === 'script' || tag === 'style') { // treść surowa
      const end = html.toLowerCase().indexOf(`</${tag}`, last);
      last = end < 0 ? html.length : end;
      re.lastIndex = last;
      continue;
    }
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) cur = el;
  }
  addText(html.slice(last));
  return root;
}

const kids = (n) => n.children.filter((c) => c.tag !== '#text');
function findAll(n, pred, out = [], stopAt = null) {
  for (const c of n.children) {
    if (c.tag === '#text') continue;
    if (pred(c)) out.push(c);
    if (!(stopAt && stopAt(c))) findAll(c, pred, out, stopAt);
  }
  return out;
}
const nodeText = (n) => (n.tag === '#text' ? n.text : n.children.map(nodeText).join(' '));
const hasClass = (n, c) => (' ' + (n.attrs.class || '') + ' ').includes(' ' + c + ' ');

function parseRoundResults(html) {
  const dom = parseDom(html);
  const groupTables = findAll(dom, (n) => n.tag === 'table' && (hasClass(n, 'roundGroup') || n.attrs.gid != null) && n.attrs.mid == null);
  const groups = [];
  groupTables.forEach((gt, gi) => {
    // wiersze graczy tej grupy (bez wchodzenia w tabele meczów)
    const rows = findAll(gt, (n) => n.tag === 'tr' && n.attrs.playerid != null, [], (n) => n.tag === 'table' && n.attrs.mid != null);
    if (!rows.length) return;
    const players = [];
    const matches = new Map();
    for (const tr of rows) {
      const id = tr.attrs.playerid;
      const cells = kids(tr).filter((c) => c.tag === 'td' || c.tag === 'th');
      const first = cells[0];
      const link = first ? findAll(first, (n) => n.tag === 'a')[0] : null;
      const name = text(nodeText(link || first || { tag: '#text', text: '' })).replace(/^\d+\.\s*/, '');
      const placeCell = findAll(tr, (n) => n.tag === 'td' && hasClass(n, 'place'), [], (n) => n.tag === 'table' && n.attrs.mid != null)[0];
      const place = placeCell ? parseInt(text(nodeText(placeCell)), 10) : NaN;
      players.push({ id, name, place: Number.isFinite(place) ? place : null });

      for (const mt of findAll(tr, (n) => n.tag === 'table' && n.attrs.mid != null)) {
        const mid = mt.attrs.mid;
        if (matches.has(mid)) continue;
        const prs = findAll(mt, (n) => n.tag === 'tr' && n.attrs.pid != null);
        if (prs.length < 2) continue;
        const sets = prs.slice(0, 2).map((r) => findAll(r, (n) => n.tag === 'td' && n.attrs.rowspan == null)
          .map((td) => { const v = parseInt(text(nodeText(td)), 10); return Number.isFinite(v) ? v : null; }));
        const len = Math.max(sets[0].length, sets[1].length);
        const sa = [], sb = [];
        for (let k = 0; k < len; k++) {
          const x = sets[0][k], y = sets[1][k];
          if (x == null || y == null || x + y === 0) continue;
          sa.push(x); sb.push(y);
        }
        matches.set(mid, { id: mid, a: prs[0].attrs.pid, b: prs[1].attrs.pid, sa, sb });
      }
    }
    const header = findAll(gt, (n) => n.tag === 'tr' && hasClass(n, 'header1'))[0];
    const hText = header ? text(nodeText(kids(header)[0] || header)) : '';
    const name = (hText.match(/grupa\s*\S+/i) || [])[0] || `Grupa ${gi + 1}`;
    groups.push({ name, gid: gt.attrs.gid ?? String(gi + 1), players, matches: [...matches.values()].filter((x) => x.sa.length) });
  });
  return groups;
}

async function get(url, extra = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; squash-liga/1.0)', 'Accept-Language': 'pl', ...extra },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function load() {
  const file = process.argv[2];
  if (file) return readFile(file, 'utf8');
  return get(CONFIG.rankingUrl);
}

const roundId = (url) => ((url || '').match(/,(\d+)\.html/) || [])[1] || null;
const isoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date());
const addDays = (iso, d) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };

// Pobiera grupy i wyniki rund: brakujące rundy z przeszłości, ostatnie 7 dni (poprawki wyników)
// oraz najbliższą rundę (przydział do grup bywa wcześniej).
async function updateRounds(rounds) {
  await mkdir(ROUNDS_DIR, { recursive: true });
  const today = isoToday();
  const testFile = process.argv[3];
  const status = {};
  for (const r of rounds) {
    const id = roundId(r.url);
    if (!id || !r.date || /fina/i.test(r.name)) continue;
    const file = path.join(ROUNDS_DIR, `${id}.json`);
    const exists = existsSync(file);
    if (exists) status[id] = true;
    const recent = r.date >= addDays(today, -7) && r.date <= addDays(today, 7);
    const pastMissing = r.date <= today && !exists;
    if (!testFile && !recent && !pastMissing) continue;
    if (testFile && id !== roundId(CONFIG.rounds[10][2])) continue; // test: tylko runda 11
    try {
      const html = testFile ? await readFile(testFile, 'utf8')
        : await get(RESULTS_URL(id), { 'X-Requested-With': 'XMLHttpRequest', Referer: r.url });
      const groups = parseRoundResults(html);
      if (!groups.length) {
        if (r.date <= today) warn(`${r.name}: nie znaleziono grup w odpowiedzi bo5.pl (${html.length} znaków).`);
        continue;
      }
      const data = { id, name: r.name, date: r.date, url: r.url, groups };
      const text = JSON.stringify(data, null, 1) + '\n';
      const old = exists ? await readFile(file, 'utf8') : null;
      if (old !== text) {
        await writeFile(file, text);
        const n = groups.reduce((s, g) => s + g.matches.length, 0);
        console.log(`${r.name}: zapisano ${groups.length} grup, ${n} meczów.`);
      }
      status[id] = true;
      if (!testFile) await new Promise((res) => setTimeout(res, 1500)); // nie obciążamy bo5.pl
    } catch (e) {
      warn(`${r.name}: nie udało się pobrać wyników rundy (${e.message}).`);
    }
  }
  return status;
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

  const rounds = parsed.columns.map((col, k) => {
    const cfg = CONFIG.rounds.find(([n]) => n.toLowerCase() === col.toLowerCase()) || CONFIG.rounds[k] || [col, null, null];
    return { name: col, date: cfg[1], url: cfg[2] };
  });
  const have = await updateRounds(rounds);

  const data = {
    name: CONFIG.name,
    club: CONFIG.club,
    season: parsed.season,
    source: CONFIG.rankingUrl,
    rulesUrl: CONFIG.rulesUrl,
    clubUrl: CONFIG.clubUrl,
    bestOf: CONFIG.bestOf,
    rounds: rounds.map((r) => { const id = roundId(r.url); return { ...r, id, details: !!(id && have[id]) }; }),
    players: parsed.players,
  };

  const prev = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : null;
  if (prev && JSON.stringify({ ...prev, updated: null }) === JSON.stringify({ ...data, updated: null })) {
    console.log(`Czwartkowe Granie: ranking bez zmian (${data.players.length} graczy).`);
    return;
  }
  data.updated = new Date().toISOString();
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data, null, 1) + '\n');
  console.log(`Czwartkowe Granie: zapisano ranking (${data.players.length} graczy, ${data.rounds.length} kolumn rund).`);
}

main().catch((e) => warn(`Czwartkowe Granie – błąd skryptu: ${e.message}`));
