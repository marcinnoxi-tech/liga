'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dm = (iso) => { if (!iso) return ''; const p = iso.split('-'); return Number(p[2]) + '.' + p[1]; };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date());

const state = { data: null, ligaNames: new Set(), q: '', round: null, roundData: null, roundErr: null };

// Kolor komórki rundy: im więcej punktów, tym mocniejsza zieleń
function cellStyle(v, max) {
  if (v == null) return '';
  const t = Math.max(0, Math.min(1, v / max));
  const a = (0.08 + t * 0.62).toFixed(2);
  const ink = t > 0.6 ? '#ffffff' : '#1d241c';
  return `background:rgba(63,122,23,${a});color:${ink}`;
}

function render() {
  const d = state.data;
  const now = today();
  const playedCols = d.rounds.map((_, k) => d.players.some((p) => p.results[k] != null));
  const playedCount = playedCols.filter(Boolean).length;
  const nextIdx = d.rounds.findIndex((r, k) => !playedCols[k] && (!r.date || r.date >= now));
  const max = Math.max(1, ...d.players.flatMap((p) => p.results.filter((v) => v != null)));
  const leader = d.players[0];

  $('kicker').textContent = (d.season ? d.season + ' · ' : '') + 'Factory Squash&Fitness · Sosnowiec';
  $('statPlayers').textContent = d.players.length;
  $('statRounds').textContent = `${playedCount}/${d.rounds.length}`;
  $('srcLink').href = d.source;
  $('updated').textContent = 'Ostatnia zmiana danych: ' + new Date(d.updated).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Warsaw' });

  const q = state.q.trim().toLowerCase();
  const rows = d.players.filter((p) => !q || p.name.toLowerCase().includes(q));
  const most = d.players.slice().sort((a, b) => b.played - a.played)[0];
  const nextR = nextIdx >= 0 ? d.rounds[nextIdx] : null;
  const inLiga = d.players.filter((p) => state.ligaNames.has(p.name.toLowerCase()));

  let html = `<div class="kpis">
    <div class="kpi"><span class="lab">Lider</span><span class="val">${esc(leader.name)}</span><span class="small">${leader.sum} pkt · ${leader.played} rund</span></div>
    <div class="kpi"><span class="lab">Następna runda</span><span class="val">${nextR ? esc(nextR.name) + ' · ' + dm(nextR.date) : 'Sezon zakończony'}</span><span class="small">${nextR && nextR.url ? `<a href="${esc(nextR.url)}" rel="noopener">zapisy i grupy na bo5.pl</a>` : '&nbsp;'}</span></div>
    <div class="kpi"><span class="lab">Najwięcej występów</span><span class="val">${esc(most.name)}</span><span class="small">${most.played} z ${playedCount} rund</span></div>
    <div class="kpi"><span class="lab">Zasada rankingu</span><span class="small" style="color:var(--ink)">Liczy się suma ${d.bestOf} najlepszych wyników z rund. <a href="${esc(d.rulesUrl)}" rel="noopener">Regulamin</a></span></div>
  </div>`;

  html += roundSection();

  html += `<section class="card" style="padding:22px 0 10px" aria-labelledby="t1">
    <div class="sec-head"><h2 id="t1">Ranking</h2></div>
    <div class="tools">
      <label class="sub" style="display:flex;align-items:center;gap:8px">Szukaj gracza
        <input id="search" class="search" type="search" placeholder="np. Kowalski" value="${esc(state.q)}" autocomplete="off"></label>
      <div class="legend">
        ${inLiga.length ? '<span><span class="pill sp">SquashPoint</span> gra też w lidze SquashPoint</span>' : ''}
        <span>Kliknij numer rundy, aby zobaczyć grupy i wyniki</span>
      </div>
    </div>
    <div class="scroll"><table class="rk">
      <thead><tr>
        <th class="stick s1">#</th><th class="stick s2" style="text-align:left">Gracz</th>
        <th>Rundy</th><th>Najl.</th><th>Śr.</th>
        ${d.rounds.map((r) => { const href = r.details ? `#r=${r.id}` : r.url; const ext = !r.details && r.url;
          return `<th class="rc">${href ? `<a href="${esc(href)}"${ext ? ' rel="noopener"' : ''} title="${esc(r.name)} – ${dm(r.date)}">` : ''}${esc(r.name.replace(/^Runda\s*/i, 'R').replace(/^Finał/i, 'F'))}<small>${dm(r.date)}</small>${href ? '</a>' : ''}</th>`; }).join('')}
        <th style="text-align:right;padding-right:16px">Suma</th>
      </tr></thead>
      <tbody>
      ${rows.map((p) => {
        const vals = p.results.filter((v) => v != null);
        const avg = vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : '–';
        const medal = p.place <= 3 ? ` m${p.place}` : '';
        const sp = state.ligaNames.has(p.name.toLowerCase());
        return `<tr>
          <td class="stick s1"><span class="medal${medal}">${p.place}</span></td>
          <td class="stick s2"><span class="pname">${esc(p.name)}${sp ? ' <span class="pill sp" title="Gra też w lidze SquashPoint">SquashPoint</span>' : ''}</span></td>
          <td class="num">${p.played}</td><td class="num">${p.best ?? '–'}</td><td class="num" style="color:var(--muted)">${avg}</td>
          ${p.results.map((v, k) => `<td class="rc">${v != null
            ? `<span style="${cellStyle(v, max)}" title="${esc(d.rounds[k].name)}: ${v} pkt">${v}</span>`
            : `<span class="${playedCols[k] ? 'dash' : 'future'}">${playedCols[k] ? '–' : '·'}</span>`}</td>`).join('')}
          <td class="sum">${p.sum}</td></tr>`;
      }).join('') || `<tr><td colspan="${d.rounds.length + 6}" class="sub" style="text-align:left;padding-left:16px">Brak gracza o takim nazwisku.</td></tr>`}
      </tbody>
    </table></div>
    <p class="note">Rundy – liczba rozegranych rund, Najl. – najlepszy wynik, Śr. – średnia punktów na rundę. Kolor komórki: im ciemniejszy, tym więcej punktów.</p>
  </section>`;

  html += `<section class="card pad" style="display:flex;flex-direction:column;gap:14px" aria-labelledby="t2">
    <h2 id="t2">Terminarz</h2>
    <span class="sub">Czwartki, start 19:00. Kliknij rundę, aby zobaczyć grupy i wyniki.</span>
    <div class="rounds">
      ${d.rounds.map((r, k) => {
        const cls = k === nextIdx ? ' next' : playedCols[k] ? ' done' : '';
        const label = k === nextIdx ? 'najbliższa' : playedCols[k] ? 'rozegrana' : 'zaplanowana';
        const sel = state.round === r.id ? ' active' : '';
        const inner = `<b>${esc(r.name)}</b><span>${dm(r.date)} · ${r.details && !playedCols[k] && k === nextIdx ? 'grupy' : label}${r.details ? ' · wyniki' : ''}</span>`;
        if (r.details) return `<a class="round${cls}${sel}" href="#r=${esc(r.id)}">${inner}</a>`;
        return r.url ? `<a class="round${cls}" href="${esc(r.url)}" rel="noopener">${inner}<span class="ext">bo5.pl ↗</span></a>` : `<div class="round${cls}">${inner}</div>`;
      }).join('')}
    </div>
  </section>`;

  $('main').innerHTML = html;
  const s = $('search');
  if (state.focus) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}


// ===== Widok rundy: grupy i wyniki =====
function groupTable(g) {
  const st = {};
  g.players.forEach((p) => (st[p.id] = { ...p, mp: 0, mw: 0, sw: 0, sl: 0, pw: 0, pl: 0, res: {} }));
  g.matches.forEach((m) => {
    const A = st[m.a], B = st[m.b];
    if (!A || !B) return;
    let wa = 0, wb = 0, pa = 0, pb = 0;
    m.sa.forEach((x, k) => { const y = m.sb[k]; pa += x; pb += y; x > y ? wa++ : wb++; });
    A.mp++; B.mp++; A.sw += wa; A.sl += wb; B.sw += wb; B.sl += wa; A.pw += pa; A.pl += pb; B.pw += pb; B.pl += pa;
    if (wa > wb) A.mw++; else B.mw++;
    A.res[m.b] = { w: wa, l: wb, sets: m.sa.map((x, k) => x + ':' + m.sb[k]).join('  ') };
    B.res[m.a] = { w: wb, l: wa, sets: m.sb.map((x, k) => x + ':' + m.sa[k]).join('  ') };
  });
  const list = Object.values(st).sort((a, b) =>
    b.mw - a.mw || (b.sw - b.sl) - (a.sw - a.sl) || (b.pw - b.pl) - (a.pw - a.pl) ||
    (a.res[b.id] ? (a.res[b.id].w > a.res[b.id].l ? -1 : 1) : 0) || a.name.localeCompare(b.name, 'pl'));
  list.forEach((p, i) => (p.pos = i + 1));
  return list;
}

function roundSection() {
  if (!state.round) return '';
  const d = state.data;
  const idx = d.rounds.findIndex((r) => r.id === state.round);
  const r = d.rounds[idx];
  if (!r) return '';
  const withDetails = d.rounds.filter((x) => x.details);
  const pos = withDetails.findIndex((x) => x.id === r.id);
  const prev = withDetails[pos - 1], next = withDetails[pos + 1];
  const nav = `<div class="rnav">
      ${prev ? `<a class="btn" href="#r=${esc(prev.id)}">← ${esc(prev.name)}</a>` : ''}
      ${next ? `<a class="btn" href="#r=${esc(next.id)}">${esc(next.name)} →</a>` : ''}
      ${r.url ? `<a class="btn ghost" href="${esc(r.url)}" rel="noopener">bo5.pl ↗</a>` : ''}
      <a class="btn ghost" href="#">Zamknij</a></div>`;
  let body;
  if (state.roundErr) body = `<p class="error">Nie udało się wczytać wyników tej rundy.</p>`;
  else if (!state.roundData || state.roundData.id !== r.id) body = `<p class="sub">Wczytywanie…</p>`;
  else {
    const rd = state.roundData;
    const played = rd.groups.reduce((s, g) => s + g.matches.length, 0);
    body = `<div class="sub">${rd.groups.length} grup · ${played} rozegranych meczów${played ? '' : ' – przydział do grup przed rundą'}</div>
      <div class="rgroups">${rd.groups.map((g) => {
        const t = groupTable(g);
        const n = t.length;
        const cols = `grid-template-columns:24px minmax(96px,150px) repeat(${n},minmax(52px,1fr))`;
        return `<div class="rgroup">
          <h3>${esc(g.name)}</h3>
          <div class="scroll"><div class="gtab">
            <div class="gr gh"><span>#</span><span>Gracz</span><span class="c">Mecze</span><span class="c">Sety</span><span class="c">+/−</span><span class="c hm">Małe pkt</span></div>
            ${t.map((p) => `<div class="gr">
              <span><span class="medal${p.mp && p.pos <= 3 ? ' m' + p.pos : ''}">${p.pos}</span></span>
              <span class="pname">${esc(p.name)}${state.ligaNames.has(p.name.toLowerCase()) ? ' <span class="pill sp" title="Gra też w lidze SquashPoint">SP</span>' : ''}</span>
              <span class="c num">${p.mw}–${p.mp - p.mw}</span><span class="c num">${p.sw}:${p.sl}</span>
              <span class="c num">${p.mp ? (p.sw - p.sl > 0 ? '+' : '') + (p.sw - p.sl) : '–'}</span>
              <span class="c num hm" style="color:var(--muted)">${p.mp ? (p.pw - p.pl > 0 ? '+' : '') + (p.pw - p.pl) : '–'}</span></div>`).join('')}
          </div></div>
          <div class="scroll"><div class="xt">
            <div class="xr" style="${cols};align-items:end"><span></span><span></span>${t.map((p) => `<span class="mh" title="${esc(p.name)}">${p.pos}</span>`).join('')}</div>
            ${t.map((p) => `<div class="xr" style="${cols}"><span class="mrank">${p.pos}</span><span class="xname">${esc(p.name)}</span>
              ${t.map((q) => {
                if (q.id === p.id) return '<span class="cell"><span class="self" aria-hidden="true"></span></span>';
                const v = p.res[q.id];
                if (!v) return '<span class="cell"><span class="empty">–</span></span>';
                return `<span class="cell"><span class="${v.w > v.l ? 'w' : 'l'}" title="${esc(p.name + ' – ' + q.name + ': ' + v.sets)}"><strong>${v.w}:${v.l}</strong><small>${esc(v.sets.replace(/  /g, ' '))}</small></span></span>`;
              }).join('')}</div>`).join('')}
          </div></div>
        </div>`;
      }).join('')}</div>`;
  }
  return `<section class="card pad" id="runda" style="display:flex;flex-direction:column;gap:14px" aria-labelledby="tr">
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px">
      <h2 id="tr">${esc(r.name)} · ${dm(r.date)}</h2>${nav}</div>
    ${body}
  </section>`;
}

async function route() {
  const id = new URLSearchParams(location.hash.slice(1)).get('r');
  state.round = id && state.data && state.data.rounds.some((r) => r.id === id && r.details) ? id : null;
  state.roundErr = null;
  if (state.round && (!state.roundData || state.roundData.id !== state.round)) {
    render();
    try { state.roundData = await getJson(`data/czwartki-rundy/${state.round}.json`); } catch (e) { state.roundErr = e; }
  }
  state.focus = false;
  render();
  if (state.round) { const el = $('runda'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}
window.addEventListener('hashchange', route);

document.addEventListener('input', (e) => {
  if (e.target.id === 'search') { state.q = e.target.value; state.focus = true; render(); }
});

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function init() {
  try {
    state.data = await getJson('data/czwartki.json');
  } catch (e) {
    $('main').innerHTML = '<p class="error">Ranking nie został jeszcze pobrany z bo5.pl albo chwilowo jest niedostępny. Spróbuj ponownie za kilka minut.</p>';
    return;
  }
  // Oznaczenie graczy, którzy grają też w lidze SquashPoint (dopasowanie po „Nazwisko Imię”)
  try {
    const idx = await getJson('data/months.json');
    const liga = await getJson(`data/${idx.latest}.json`);
    liga.players.forEach((p) => state.ligaNames.add((p.nazwisko + ' ' + p.imie).trim().toLowerCase()));
  } catch (_) { /* bez oznaczeń */ }
  route();
}

setInterval(async () => {
  if (document.hidden || !state.data) return;
  try {
    const d = await getJson('data/czwartki.json');
    if (d.updated !== state.data.updated) { state.data = d; state.focus = false; render(); }
  } catch (_) {}
}, 10 * 60 * 1000);

init();
