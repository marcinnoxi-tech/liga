'use strict';

// ===== Ustawienia ligi =====
const GROUPS = [100, 90, 80, 70, 60];  // od najwyższej do najniższej
const ZONE = 3;                         // ile osób awansuje i ile spada
const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

const state = { months: [], month: null, data: null, group: 100, sel: null };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (s) => { const p = s.split('-'); return p[2] + '.' + p[1]; };
const signed = (n) => (n > 0 ? '+' + n : String(n));

// ===== Obliczenia =====
function compute(data) {
  const byId = {};
  data.players.forEach((p) => { byId[p.id] = { ...p, name: (p.nazwisko + ' ' + p.imie).trim() }; });

  // najnowsze najpierw
  const ms = data.matches.slice().sort((x, y) => (x.data === y.data ? y.id - x.id : x.data < y.data ? 1 : -1))
    .filter((m) => byId[m.a] && byId[m.b]);

  function view(m, id) {
    const me = m.a === id;
    const my = me ? m.sa : m.sb, op = me ? m.sb : m.sa;
    const w = me ? m.wa : m.wb, l = me ? m.wb : m.wa;
    return {
      opp: me ? m.b : m.a, w, l, win: w > l, pts: me ? m.pa : m.pb, date: m.data,
      rf: my.reduce((s, v) => s + v, 0), ra: op.reduce((s, v) => s + v, 0),
      sets: my.map((v, k) => v + ':' + op[k]).join('  '),
    };
  }

  function standings(g) {
    const list = Object.values(byId).filter((p) => p.grupa === g).map((p) => {
      const mine = ms.filter((m) => m.a === p.id || m.b === p.id).map((m) => view(m, p.id));
      const st = { id: p.id, name: p.name, injured: p.kontuzja, list: mine, m: mine.length, w: 0, l: 0, sw: 0, sl: 0, rf: 0, ra: 0, pts: 0, hw: 0, hs: 0, h2h: false };
      mine.forEach((v) => { st.pts += v.pts; st.sw += v.w; st.sl += v.l; st.rf += v.rf; st.ra += v.ra; v.win ? st.w++ : st.l++; });
      return st;
    });

    // Równa liczba punktów: decydują mecze bezpośrednie między remisującymi
    // (liczba zwycięstw, potem bilans setów w tych meczach), dalej bilans setów i małych punktów.
    const byPts = {};
    list.forEach((p) => (byPts[p.pts] = byPts[p.pts] || []).push(p));
    Object.values(byPts).forEach((tied) => {
      if (tied.length < 2) return;
      const ids = tied.map((t) => t.id);
      tied.forEach((t) => t.list.forEach((v) => { if (ids.includes(v.opp)) { if (v.win) t.hw++; t.hs += v.w - v.l; } }));
      const differ = tied.some((t) => t.hw !== tied[0].hw || t.hs !== tied[0].hs);
      if (differ && tied[0].pts > 0) tied.forEach((t) => (t.h2h = true));
    });

    list.sort((a, b) =>
      b.pts - a.pts || b.hw - a.hw || b.hs - a.hs ||
      (b.sw - b.sl) - (a.sw - a.sl) || (b.rf - b.ra) - (a.rf - a.ra) ||
      a.name.localeCompare(b.name, 'pl'));
    list.forEach((p, i) => (p.rank = i + 1));
    return list;
  }

  const tables = {};
  GROUPS.forEach((g) => (tables[g] = standings(g)));
  return { byId, ms, tables };
}

// ===== Rysowanie =====
function renderTabs() {
  $('tabs').innerHTML = GROUPS.map((g) =>
    `<button type="button" class="tab" role="tab" aria-selected="${g === state.group}" data-group="${g}">Grupa ${g}</button>`).join('');
}

function render() {
  const { byId, ms, tables } = compute(state.data);
  const g = state.group;
  const players = tables[g];
  const n = players.length;
  if (!players.some((p) => p.id === state.sel)) state.sel = players[0] ? players[0].id : null;
  const sel = players.find((p) => p.id === state.sel);

  const [y, mo] = state.month.split('-').map(Number);
  $('monthLabel').textContent = MONTHS[mo - 1].replace(/^./, (c) => c.toUpperCase()) + ' ' + y;
  $('season').textContent = mo >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
  $('statPlayers').textContent = state.data.players.length;
  $('statMatches').textContent = state.data.matches.length;
  const upd = new Date(state.data.updated);
  $('updated').textContent = 'Ostatnia zmiana danych: ' + upd.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Warsaw' });
  renderTabs();

  const canUp = g !== GROUPS[0], canDown = g !== GROUPS[GROUPS.length - 1];
  const gMatches = ms.filter((m) => byId[m.a].grupa === g || byId[m.b].grupa === g);
  const pairs = new Set(gMatches.map((m) => Math.min(m.a, m.b) + '-' + Math.max(m.a, m.b))).size;
  const most = players.slice().sort((a, b) => b.m - a.m)[0];
  const r = Math.round;
  const scoring = `5:0 → ${g + 10} · 4:1 → ${r(g * .8)} · 3:2 → ${r(g * .6)} · 2:3 → ${r(g * .4)} · 1:4 → ${r(g * .2)} · 0:5 → 5`;

  // Karty
  let html = `<div class="kpis">
    <div class="kpi"><span class="lab">Lider grupy</span><span class="val">${players[0] ? esc(players[0].name) : '–'}</span><span class="small">${players[0] ? players[0].pts : 0} pkt</span></div>
    <div class="kpi"><span class="lab">Postęp rozgrywek</span><span class="val">${pairs}/${n * (n - 1) / 2} par</span><span class="small">${gMatches.length} meczów rozegranych</span></div>
    <div class="kpi"><span class="lab">Najwięcej meczów</span><span class="val">${most ? esc(most.name) : '–'}</span><span class="small">${most ? most.m : 0} meczów</span></div>
    <div class="kpi"><span class="lab">Punktacja grupy ${g}</span><span class="small" style="color:var(--ink)">${scoring}</span></div>
  </div>`;

  // Tabela
  html += `<section class="card" style="padding:22px 0 10px" aria-labelledby="t1">
    <div class="sec-head"><h2 id="t1">Tabela – grupa ${g}</h2>
      <div class="legend">
        ${canUp ? `<span><i class="sq" style="background:var(--green)"></i>awans do grupy ${g + 10}</span>` : ''}
        ${canDown ? `<span><i class="sq" style="background:var(--down)"></i>spadek do grupy ${g - 10}</span>` : ''}
        <span>Kliknij nazwisko, aby zobaczyć profil</span>
      </div></div>
    <div class="scroll"><div class="table">
      <div class="trow head"><span>#</span><span>Zawodnik</span><span class="c hm">M</span><span class="c">Z</span><span class="c">P</span><span class="c">Sety</span><span class="c hm">Małe pkt</span><span class="hm">Forma</span><span class="r">Pkt</span></div>
      ${players.map((p) => {
        const up = canUp && p.rank <= ZONE;
        const down = !up && canDown && p.rank > n - ZONE;
        const form = p.list.slice(0, 5).map((v) =>
          `<span class="fb ${v.win ? 'w' : 'l'}" title="${esc(fmtDate(v.date) + ' vs ' + byId[v.opp].name + ' ' + v.w + ':' + v.l)}">${v.win ? 'Z' : 'P'}</span>`).join('');
        return `<div class="trow${p.id === state.sel ? ' sel' : ''}">
          <span><span class="rank${up ? ' up' : down ? ' down' : ''}">${p.rank}</span></span>
          <span class="namecell"><button type="button" class="name" data-player="${p.id}">${esc(p.name)}</button>
            ${p.injured ? '<span class="pill inj">kontuzja</span>' : ''}
            ${p.h2h ? '<span class="pill h2h" title="Równa liczba punktów – o kolejności zdecydował mecz bezpośredni">mecz bezp.</span>' : ''}</span>
          <span class="c hm">${p.m}</span><span class="c">${p.w}</span><span class="c">${p.l}</span>
          <span class="c">${p.sw}:${p.sl}</span>
          <span class="c hm" style="color:var(--muted)">${p.m ? signed(p.rf - p.ra) : '–'}</span>
          <span class="form hm">${form || '<span class="none">brak meczów</span>'}</span>
          <span class="r pts">${p.pts}</span></div>`;
      }).join('')}
    </div></div>
    <p class="note">M – mecze, Z – zwycięstwa, P – porażki, Sety – wygrane:przegrane, Małe pkt – różnica punktów w setach. Przy równej liczbie punktów decyduje mecz bezpośredni (przy 3+ osobach: mała tabela ich meczów między sobą), potem bilans setów i małych punktów.</p>
  </section>`;

  // Mecze bezpośrednie
  const cols = `grid-template-columns:32px 190px repeat(${n},56px)`;
  html += `<section class="card" style="padding:22px 0 18px" aria-labelledby="t2">
    <div class="sec-head" style="flex-direction:column;align-items:flex-start;gap:4px"><h2 id="t2">Mecze bezpośrednie</h2>
      <span class="sub">Wynik w setach z perspektywy zawodnika w wierszu. Numery kolumn = miejsca w tabeli. Najedź na wynik, aby zobaczyć sety.</span></div>
    <div class="scroll"><div class="matrix">
      <div class="mrow" style="${cols};align-items:end"><span></span><span class="mh" style="text-align:left">ZAWODNIK</span>
        ${players.map((p) => `<span class="mh" title="${esc(p.name)}">${p.rank}</span>`).join('')}</div>
      ${players.map((p) => `<div class="mrow${p.id === state.sel ? ' sel' : ''}" style="${cols}">
        <span class="mrank">${p.rank}</span>
        <button type="button" class="mname" data-player="${p.id}">${esc(p.name)}</button>
        ${players.map((q) => {
          if (q.id === p.id) return '<span class="cell"><span class="self" aria-hidden="true"></span></span>';
          const v = p.list.find((x) => x.opp === q.id);
          if (!v) return '<span class="cell"><span class="empty">–</span></span>';
          const t = `${p.name} – ${q.name} ${v.w}:${v.l} (${v.sets}), ${fmtDate(v.date)}`;
          return `<span class="cell"><span class="${v.win ? 'w' : 'l'}" title="${esc(t)}"><strong>${v.w}:${v.l}</strong><small>${v.pts} pkt</small></span></span>`;
        }).join('')}</div>`).join('')}
    </div></div>
  </section>`;

  // Przeniesienia
  html += `<section class="card pad" style="display:flex;flex-direction:column;gap:16px" aria-labelledby="t3">
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px">
      <h2 id="t3">Przeniesienia po zakończeniu miesiąca</h2>
      <span class="sub">Stan na dziś · miejsca 1–${ZONE} awansują, ostatnie ${ZONE} spadają</span></div>
    <div class="moves">
      ${GROUPS.slice(0, -1).map((hi, i) => {
        const lo = GROUPS[i + 1];
        const item = (p) => `<div class="mv"><b>${esc(p.name)}${p.h2h ? ' <span class="pill h2h" title="Remis punktowy rozstrzygnięty meczem bezpośrednim">mecz bezp.</span>' : ''}</b><span>${p.rank}. miejsce · ${p.pts} pkt</span></div>`;
        const ups = tables[lo].slice(0, ZONE), downs = tables[hi].slice(Math.max(0, tables[hi].length - ZONE));
        return `<div class="move"><h3>Grupa ${hi} ⇄ ${lo}</h3>
          <div style="display:flex;flex-direction:column;gap:6px"><span class="lab up">W górę do ${hi}</span>${ups.map(item).join('')}</div>
          <div style="display:flex;flex-direction:column;gap:6px"><span class="lab down">W dół do ${lo}</span>${downs.map(item).join('')}</div></div>`;
      }).join('')}
    </div>
  </section>`;

  // Profil + ostatnie mecze
  const recent = gMatches.slice(0, 8);
  html += `<div class="split">
    <section class="card pad" aria-labelledby="t4">
      ${sel ? `<div><div class="profile-kick">Profil zawodnika · grupa ${g} · ${sel.rank}. miejsce</div><h2 id="t4" class="profile-name">${esc(sel.name)}</h2></div>
      <div class="boxes">
        <div class="box"><b>${sel.pts}</b><span>punktów</span></div>
        <div class="box"><b>${sel.w}–${sel.l}</b><span>bilans Z–P</span></div>
        <div class="box"><b>${sel.sw}:${sel.sl}</b><span>sety</span></div>
        <div class="box"><b>${sel.m ? (sel.pts / sel.m).toFixed(1) : '–'}</b><span>pkt / mecz</span></div>
      </div>
      <div class="list">${sel.list.length ? sel.list.map((v) => `<div class="pm">
          <span class="date">${fmtDate(v.date)}</span>
          <span class="opp"><b>${esc(byId[v.opp].name)}</b><span class="sets">${v.sets}</span></span>
          <span><span class="score ${v.win ? 'w' : 'l'}">${v.w}:${v.l}</span></span>
          <span class="r" style="font-weight:600;font-size:14px">+${v.pts} pkt</span></div>`).join('')
        : '<div class="sub">Brak rozegranych meczów w tym miesiącu.</div>'}</div>` : '<h2 id="t4">Brak zawodników</h2>'}
    </section>
    <section class="card pad" aria-labelledby="t5">
      <h2 id="t5">Ostatnie mecze grupy</h2>
      <div class="list">${recent.length ? recent.map((m) => `<div class="rm">
          <span class="date">${fmtDate(m.data)}</span>
          <span class="pa${m.wa > m.wb ? ' win' : ''}">${esc(byId[m.a].name)}</span>
          <span class="res">${m.wa}:${m.wb}</span>
          <span class="pb${m.wb > m.wa ? ' win' : ''}">${esc(byId[m.b].name)}</span>
          <span></span><span class="sets">${m.sa.map((v, k) => v + ':' + m.sb[k]).join('   ')}</span></div>`).join('')
        : '<div class="sub">Brak meczów.</div>'}</div>
    </section>
  </div>`;

  $('main').innerHTML = html;
  writeHash();
}

// ===== Adres strony (link do konkretnej grupy/miesiąca) =====
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const g = Number(h.get('g'));
  if (GROUPS.includes(g)) state.group = g;
  if (h.get('m')) state.month = h.get('m');
}
function writeHash() {
  const h = new URLSearchParams({ g: state.group });
  if (state.month !== state.months[0]) h.set('m', state.month);
  history.replaceState(null, '', '#' + h.toString());
}

// ===== Dane =====
async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
  return res.json();
}
async function loadMonth(month) {
  state.data = await getJson(`data/${month}.json`);
  state.month = month;
  $('monthSelect').value = month;
  render();
}

async function init() {
  readHash();
  try {
    const idx = await getJson('data/months.json');
    state.months = idx.months;
    $('monthSelect').innerHTML = idx.months.map((m) => {
      const [y, mo] = m.split('-').map(Number);
      return `<option value="${m}">${MONTHS[mo - 1]} ${y}</option>`;
    }).join('');
    await loadMonth(state.months.includes(state.month) ? state.month : idx.latest);
  } catch (e) {
    $('main').innerHTML = `<p class="error">Nie udało się wczytać danych ligi (${esc(e.message)}). Spróbuj odświeżyć stronę za chwilę.</p>`;
  }
}

// ===== Zdarzenia =====
document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-group]');
  if (tab) { state.group = Number(tab.dataset.group); state.sel = null; render(); return; }
  const pl = e.target.closest('[data-player]');
  if (pl) { state.sel = Number(pl.dataset.player); render(); }
});
$('monthSelect').addEventListener('change', (e) => { state.sel = null; loadMonth(e.target.value); });

// Odświeżanie danych co 5 minut, gdy strona jest otwarta
setInterval(async () => {
  if (document.hidden || !state.months.length || state.month !== state.months[0]) return;
  try {
    const d = await getJson(`data/${state.month}.json`);
    if (d.updated !== state.data.updated) { state.data = d; render(); }
  } catch (_) { /* spróbujemy następnym razem */ }
}, 5 * 60 * 1000);

init();
