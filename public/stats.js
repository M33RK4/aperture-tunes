// listening statistics: what you played, for how long, and when. saved to stats.json next to the profile
// shape: { since, total, plays, longest: { sec, start }, session: { start, last, sec },
//          songs: { path: { n, sec, first, last, skips, log: [timestamps] } },
//          days: { 'YYYY-MM-DD': { sec, n, songs: { path: sec } } } }
const ST = { data: null, dirty: false, days: 0 };
const SESSION_GAP = 15 * 60 * 1000; // a 15 minute break starts a new listening session
const LOG_MAX = 200;

const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const keyOf = (p) => p.toLowerCase();
const fmtHours = (sec) => {
  if (sec > 0 && sec < 59.5) return `${Math.round(sec)}S`;
  const m = Math.round((sec || 0) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, '0')}M` : `${m}M`;
};
const fmtDay = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

const statsStore = {
  async get() {
    if (desktop) return window.aperture.getStats();
    try { return JSON.parse(localStorage.getItem('stats') || 'null'); } catch { return null; }
  },
  set(data) {
    if (desktop) return window.aperture.setStats(data);
    try { localStorage.setItem('stats', JSON.stringify(data)); } catch {}
  },
};
function statsSave() {
  if (!ST.dirty || !ST.data) return;
  ST.dirty = false;
  statsStore.set(ST.data);
}
setInterval(statsSave, 15000);
window.addEventListener('beforeunload', statsSave);

async function initStats() {
  ST.data = (await statsStore.get()) || { since: Date.now(), total: 0, plays: 0, longest: { sec: 0, start: 0 }, session: { start: 0, last: 0, sec: 0 }, songs: {}, days: {} };
  // play counts from before the statistics existed carry over (without listening time, that wasn't tracked)
  if (profile.plays) {
    for (const [k, v] of Object.entries(profile.plays)) {
      if (ST.data.songs[k]) continue;
      ST.data.songs[k] = { n: v.n, sec: 0, first: v.last, last: v.last, skips: 0, log: [] };
      ST.data.plays += v.n;
      ST.data.since = Math.min(ST.data.since, v.last || Date.now());
    }
    ST.dirty = true;
    statsSave();
    saveProfile({ plays: undefined });
  }
  ST.days = profile.statDays ?? 0;
  drawHud();
}

const songRec = (p) => (ST.data.songs[keyOf(p)] ||= { n: 0, sec: 0, first: 0, last: 0, skips: 0, log: [] });
const dayRec = () => (ST.data.days[dayKey()] ||= { sec: 0, n: 0, songs: {} });

// called by the player for every bit of a song that actually got listened to
function statsListen(p, sec) {
  if (!ST.data) return;
  const now = Date.now();
  const k = keyOf(p);
  ST.data.total += sec;
  songRec(p).sec += sec;
  const d = dayRec();
  d.sec += sec;
  d.songs[k] = (d.songs[k] || 0) + sec;
  const s = ST.data.session;
  if (now - s.last > SESSION_GAP) Object.assign(s, { start: now, sec: 0 });
  s.sec += sec;
  s.last = now;
  if (s.sec > ST.data.longest.sec) ST.data.longest = { sec: s.sec, start: s.start };
  ST.dirty = true;
  drawHudSoon();
}
function statsPlay(p) {
  if (!ST.data) return;
  const now = Date.now();
  const r = songRec(p);
  r.n++;
  r.first ||= now;
  r.last = now;
  r.log.push(now);
  if (r.log.length > LOG_MAX) r.log.splice(0, r.log.length - LOG_MAX);
  dayRec().n++;
  ST.data.plays++;
  ST.dirty = true;
  drawHud();
}
function statsSkip(p) {
  if (!ST.data) return;
  songRec(p).skips++;
  ST.dirty = true;
}
const statsSong = (p) => (ST.data && ST.data.songs[keyOf(p)]) || { n: 0, sec: 0, first: 0, last: 0, skips: 0, log: [] };
// the tagger renamed files: move their history to the new names
function statsMove(fix) {
  if (!ST.data) return;
  const songs = {};
  for (const [k, v] of Object.entries(ST.data.songs)) songs[keyOf(fix(k))] = v;
  ST.data.songs = songs;
  for (const d of Object.values(ST.data.days)) {
    const m = {};
    for (const [k, v] of Object.entries(d.songs)) m[keyOf(fix(k))] = v;
    d.songs = m;
  }
  ST.dirty = true;
  statsSave();
}

// ---- the three numbers in the top right: today, songs today, all-time ----
let hudTimer = null;
function drawHudSoon() { if (!hudTimer) hudTimer = setTimeout(() => { hudTimer = null; drawHud(); }, 2000); }
function drawHud() {
  if (!ST.data) return;
  const today = ST.data.days[dayKey()] || { sec: 0, n: 0 };
  const m = Math.floor(today.sec / 60);
  $('#st1').textContent = m >= 60 ? `${(m / 60).toFixed(1)}H` : `${m}M`;
  $('#st2').textContent = today.n;
  const h = ST.data.total / 3600;
  $('#st3').textContent = h >= 1 ? `${Math.floor(h)}H` : `${Math.floor(ST.data.total / 60)}M`;
  // keeps the statistics screen live while you're looking at it
  if (view === 'stats') renderStatsSoon();
}

// ---- statistics screen ----
// seconds and plays per song within the chosen period (0 = all time)
function periodSongs(days) {
  const out = new Map();
  if (!days) {
    for (const [k, r] of Object.entries(ST.data.songs)) if (r.n || r.sec) out.set(k, { sec: r.sec, n: r.n });
    return out;
  }
  const cutoff = Date.now() - days * 86400000;
  for (let i = 0; i < days; i++) {
    const d = ST.data.days[dayKey(Date.now() - i * 86400000)];
    if (d) for (const [k, sec] of Object.entries(d.songs)) out.set(k, { sec: (out.get(k)?.sec || 0) + sec, n: 0 });
  }
  for (const [k, r] of Object.entries(ST.data.songs)) {
    const n = r.log.filter((t) => t >= cutoff).length;
    if (n) out.set(k, { sec: out.get(k)?.sec || 0, n });
  }
  return out;
}
function topList(per, groupKey, label, extra) {
  const m = new Map();
  for (const [k, v] of per) {
    const s = LIB.byPath.get(k);
    if (!s) continue;
    const g = groupKey(s);
    const e = m.get(g) || { label: label(s), sec: 0, n: 0, s };
    e.sec += v.sec;
    e.n += v.n;
    if (!e.s.cover && s.cover) e.s = s;
    m.set(g, e);
  }
  const list = [...m.values()].sort((a, b) => b.sec - a.sec || b.n - a.n).slice(0, 5);
  if (!list.length) return '<div class="empty">&gt; Nothing yet.</div>';
  const max = list[0].sec || list[0].n || 1;
  return list.map((e, i) => `<div class="srow"><span class="rk">${i + 1}</span>${extra ? extra(e) : ''}<div class="sname"><div class="t" title="${esc(e.label)}">${esc(e.label)}</div>
    <div class="sbar"><i style="width:${((e.sec || e.n) / max) * 100}%"></i></div></div><span class="sv">${e.sec ? fmtHours(e.sec) : '--'}<small>${plural(e.n, 'PLAY').toUpperCase()}</small></span></div>`).join('');
}
let statsTimer = null;
function renderStatsSoon() { clearTimeout(statsTimer); statsTimer = setTimeout(renderStats, 300); }
function renderStats() {
  $$('#statTabs [data-days]').forEach((b) => b.classList.toggle('on', +b.dataset.days === ST.days));
  const D = ST.data;
  if (!D.plays && !D.total) {
    $('#statsBody').innerHTML = '<div class="empty big">&gt; No listening history yet. Play some music and come back.</div>';
    return;
  }
  const per = periodSongs(ST.days);
  let sec = 0, n = 0;
  for (const v of per.values()) { sec += v.sec; n += v.n; }
  const today = D.days[dayKey()] || { sec: 0, n: 0 };
  const chart = Array.from({ length: 30 }, (_, i) => {
    const t = Date.now() - (29 - i) * 86400000;
    return { t, min: Math.round((D.days[dayKey(t)]?.sec || 0) / 60) };
  });
  const maxMin = Math.max(1, ...chart.map((c) => c.min));
  const period = ST.days ? `LAST ${ST.days} DAYS` : `SINCE ${fmtDay(D.since)}`;
  $('#statsBody').innerHTML = `
    <div class="tiles">
      <div class="tile2"><span>TIME LISTENED</span><b>${fmtHours(sec)}</b><small>${period}</small></div>
      <div class="tile2"><span>SONGS PLAYED</span><b>${n.toLocaleString()}</b><small>${plural(per.size, 'DIFFERENT SONG').toUpperCase()}</small></div>
      <div class="tile2"><span>TODAY</span><b>${fmtHours(today.sec)}</b><small>${plural(today.n, 'SONG').toUpperCase()}</small></div>
      <div class="tile2"><span>LONGEST SESSION</span><b>${fmtHours(D.longest.sec)}</b><small>${D.longest.start ? fmtDay(D.longest.start) : '--'}</small></div>
    </div>
    <div class="chart"><div class="ch">MINUTES PER DAY // LAST 30 DAYS</div>
      <div class="bars">${chart.map((c, i) => `<i style="height:${Math.max(c.min ? 3 : 0, (c.min / maxMin) * 100)}%" class="${i === 29 ? 'today' : ''}" title="${fmtDay(c.t)}: ${c.min} min"></i>`).join('')}</div></div>
    <div class="cols">
      <div class="col"><div class="ch">TOP ARTISTS</div>${topList(per, (s) => artistOf(s).toLowerCase(), artistOf)}</div>
      <div class="col"><div class="ch">TOP ALBUMS</div>${topList(per, albumKey, (s) => s.album || 'Unknown Album', (e) => artImg(e.s, 'mini'))}</div>
      <div class="col"><div class="ch">TOP GENRES</div>${topList(per, (s) => (s.genre || 'Unknown').toLowerCase(), (s) => s.genre || 'Unknown Genre')}</div>
    </div>`;
}
$$('#statTabs [data-days]').forEach((b) => b.addEventListener('click', () => {
  ST.days = +b.dataset.days;
  saveProfile({ statDays: ST.days });
  renderStats();
}));
document.addEventListener('view', (e) => { if (e.detail === 'stats') renderStats(); });

// ---- popups for one song or one album ----
function weekBars(logs) {
  const weeks = Array(8).fill(0);
  const now = Date.now();
  for (const t of logs) {
    const w = Math.floor((now - t) / (7 * 86400000));
    if (w < 8) weeks[7 - w]++;
  }
  const max = Math.max(1, ...weeks);
  return `<div class="bars small">${weeks.map((w, i) => `<i style="height:${Math.max(w ? 4 : 0, (w / max) * 100)}%" title="${i === 7 ? 'This week' : `${7 - i} week${7 - i === 1 ? '' : 's'} ago`}: ${w}"></i>`).join('')}</div>`;
}
function statPopup(cover, title, sub, cells, logs, tagPaths) {
  $('#statDlg')?.remove();
  screen.insertAdjacentHTML('beforeend', `<div class="dlg" id="statDlg"><div class="dlgbox wide">
    <div class="t">APERTURE TUNES // SPECIMEN STATISTICS</div>
    <div class="b"><div class="sshead">${artImg(cover, 'big')}<div style="min-width:0">
      <div class="sst" title="${esc(title)}">${esc(title)}</div><div class="dim">${esc(sub)}</div>
      <div class="sgrid">${cells.map(([k, v]) => `<div><span>${k}</span>${v}</div>`).join('')}</div></div></div>
      <div class="ch">PLAYS PER WEEK // LAST 8 WEEKS</div>${weekBars(logs)}
      <div class="act"><button class="cmd" id="statTags">[ EDIT TAGS ]</button><button class="cmd hot" id="statClose">[ CLOSE ]</button></div></div></div></div>`);
  const close = () => $('#statDlg')?.remove();
  $('#statClose').addEventListener('click', close);
  $('#statDlg').addEventListener('click', (e) => { if (e.target.id === 'statDlg') close(); });
  $('#statTags').addEventListener('click', () => { close(); sendToTagger(tagPaths); });
}
function songRank(p) {
  const k = keyOf(p);
  const all = Object.entries(ST.data.songs).filter(([, r]) => r.n || r.sec).sort((a, b) => b[1].sec - a[1].sec || b[1].n - a[1].n);
  const i = all.findIndex(([x]) => x === k);
  return i < 0 ? '--' : `#${i + 1} OF ${all.length}`;
}
function showSongStats(s) {
  const r = statsSong(s.path);
  statPopup(s, songTitle(s), `${s.artist || 'Unknown Artist'} // ${s.album || 'Unknown Album'}`, [
    ['PLAYED', plural(r.n, 'TIME').toUpperCase()], ['TIME LISTENED', r.sec ? fmtHours(r.sec) : '--'], ['FIRST PLAYED', r.first ? fmtDay(r.first) : 'NEVER'],
    ['LAST PLAYED', ago(r.last)], ['YOUR TOP SONGS', songRank(s.path)], ['SKIPPED', plural(r.skips, 'TIME').toUpperCase()],
  ], r.log, [s.path]);
}
function showAlbumStats(key) {
  const songs = LIB.songs.filter((s) => albumKey(s) === key);
  if (!songs.length) return;
  const recs = songs.map((s) => ({ s, r: statsSong(s.path) }));
  const n = recs.reduce((a, x) => a + x.r.n, 0);
  const sec = recs.reduce((a, x) => a + x.r.sec, 0);
  const firsts = recs.map((x) => x.r.first).filter(Boolean);
  const last = Math.max(0, ...recs.map((x) => x.r.last));
  const top = recs.slice().sort((a, b) => b.r.sec - a.r.sec || b.r.n - a.r.n)[0];
  const cover = songs.find((s) => s.cover) || songs[0];
  statPopup(cover, songs[0].album || 'Unknown Album', artistOf(songs[0]), [
    ['PLAYED', plural(n, 'TIME').toUpperCase()], ['TIME LISTENED', sec ? fmtHours(sec) : '--'], ['SONGS PLAYED', `${recs.filter((x) => x.r.n).length} OF ${songs.length}`],
    ['FIRST PLAYED', firsts.length ? fmtDay(Math.min(...firsts)) : 'NEVER'], ['LAST PLAYED', ago(last)], ['MOST PLAYED', top.r.n ? esc(songTitle(top.s)) : '--'],
  ], recs.flatMap((x) => x.r.log), songs.map((s) => s.path));
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#statDlg')?.remove(); });

// the selected song's numbers, shown in the footer of the library and album page
function selInfo(state) {
  const s = picked(state)[0];
  const r = statsSong(s.path);
  return `1 SELECTED // PLAYED ${plural(r.n, 'TIME').toUpperCase()} // LAST PLAYED ${ago(r.last)}${r.sec ? ` // ${fmtHours(r.sec)} LISTENED` : ''}`;
}

// edit tags: only mp3/flac can be fixed by the tagger
function sendToTagger(paths) {
  const ok = paths.filter((p) => /\.(mp3|flac)$/i.test(p));
  if (!ok.length) return ask({ title: 'EDIT TAGS', text: 'The tagger can only fix MP3 and FLAC files.', ok: '[ OK ]' });
  addPaths(ok);
}
