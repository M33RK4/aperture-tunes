// the shell: profile, side menu, popups, options and the HUD. the player, library, now playing,
// equalizer and tagger each live in their own file and get started from boot() at the bottom
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const desktop = !!window.aperture;
const screen = $('#screen');
let profile = {};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const store = {
  async get() {
    if (desktop) return window.aperture.getProfile();
    try { return JSON.parse(localStorage.getItem('profile') || '{}'); } catch { return {}; }
  },
  async set(patch) {
    if (desktop) return window.aperture.setProfile(patch);
    const next = { ...(await store.get()), ...patch };
    try { localStorage.setItem('profile', JSON.stringify(next)); } catch {}
    return next;
  },
};

// changes go into `profile` straight away and get written to disk a moment later in one go
let pending = {};
let saveTimer = null;
function saveProfile(patch) {
  Object.assign(profile, patch);
  Object.assign(pending, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushProfile, 400);
}
function flushProfile() {
  clearTimeout(saveTimer);
  if (!Object.keys(pending).length) return;
  const p = pending;
  pending = {};
  store.set(p);
}
window.addEventListener('beforeunload', flushProfile);

// ---- side menu / views ----
let view = 'lib';
function showView(name) {
  view = name;
  $$('.main > .view').forEach((v) => (v.hidden = v.dataset.view !== (name === 'needs' ? 'lib' : name)));
  $$('#side .nav').forEach((n) => n.classList.toggle('on', n.dataset.view === name || (name === 'album' && n.dataset.view === 'lib')));
  if (name !== 'pl') $$('#navPl .nav').forEach((n) => n.classList.remove('on'));
  $('#btnOpts').classList.toggle('on', name === 'opts');
  document.dispatchEvent(new CustomEvent('view', { detail: name }));
  if (['np', 'lib', 'queue', 'pl', 'eq', 'tag'].includes(name)) saveProfile({ view: name });
}
$('#side').addEventListener('click', (e) => {
  const n = e.target.closest('.nav[data-view]');
  if (n) showView(n.dataset.view);
});

// ---- popups: ask({ title, text, input, value, ok }) resolves to the typed text / true, or null when cancelled ----
let askDone = null;
function ask({ title, text = '', input = false, value = '', ok = '[ OK ]' }) {
  $('#askTitle').textContent = `APERTURE TUNES // ${title}`;
  $('#askText').textContent = text;
  $('#askText').hidden = !text;
  $('#askInput').hidden = !input;
  $('#askInput').value = value;
  $('#askYes').textContent = ok;
  $('#askDlg').hidden = false;
  setTimeout(() => (input ? $('#askInput').select() : $('#askYes').focus()), 30);
  return new Promise((resolve) => {
    askDone = (v) => {
      $('#askDlg').hidden = true;
      askDone = null;
      resolve(v);
    };
  });
}
$('#askForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const typed = $('#askInput').value.trim();
  if (!$('#askInput').hidden && !typed) return;
  askDone?.($('#askInput').hidden ? true : typed);
});
$('#askNo').addEventListener('click', () => askDone?.(null));

// ---- sliders: drag or click anywhere on the track. onChange(value 0..1, finished) ----
function makeSlider(track, onChange) {
  const set = (v) => {
    track.querySelector('.fill').style.width = `${v * 100}%`;
    track.querySelector('.knob').style.left = `${v * 100}%`;
  };
  const at = (e) => clamp((e.clientX - track.getBoundingClientRect().left) / track.offsetWidth, 0, 1);
  track.addEventListener('mousedown', (e) => {
    if (track.classList.contains('off')) return;
    e.preventDefault();
    track.classList.add('drag');
    onChange(at(e), false);
    const move = (ev) => onChange(at(ev), false);
    const up = (ev) => {
      track.classList.remove('drag');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      onChange(at(ev), true);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
  return { set };
}

// ---- username ----
function showUser() {
  $('#username').textContent = profile.username || '—';
}
function askName() {
  $('#login').hidden = false;
  $('#loginName').value = profile.username || '';
  setTimeout(() => $('#loginName').focus(), 50);
}
$('#loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#loginName').value.trim();
  if (!name) return;
  saveProfile({ username: name });
  showUser();
  $('#login').hidden = true;
});
$('#user').addEventListener('click', askName);

if (desktop) {
  $('#winctl').hidden = false;
  $$('[data-win]').forEach((b) => b.addEventListener('click', () => window.aperture.win(b.dataset.win)));
}

// ---- options ----
function applyLayout() {
  const right = profile.controls === 'right';
  screen.classList.toggle('swap', right);
  $$('[data-side]').forEach((b) => b.classList.toggle('on', (b.dataset.side === 'right') === right));
  // covers are amber-tinted unless you picked original colours
  document.body.classList.toggle('truecolor', profile.tint === false);
  $$('#optTint [data-tint]').forEach((b) => b.classList.toggle('on', (b.dataset.tint === '1') === (profile.tint !== false)));
  $$('#optClosing [data-close]').forEach((b) => b.classList.toggle('on', b.dataset.close === (profile.closeMode || 'quit')));
  $$('#optNp [data-np]').forEach((b) => b.classList.toggle('on', b.dataset.np === (profile.npMode || 'art')));
  if (profile.sideWidth) $('.fb-side').style.width = `${profile.sideWidth}px`;
  const fade = profile.crossfade || 0;
  fadeSlider.set(fade / 12);
  $('#optFadeNum').textContent = fade ? `${fade} SEC` : 'OFF';
}
let lastView = 'lib';
$('#btnOpts').addEventListener('click', () => {
  if (view === 'opts') return showView(lastView);
  lastView = view;
  renderFolders();
  showView('opts');
});
$('#optClose').addEventListener('click', () => showView(lastView));
$$('[data-side]').forEach((b) => b.addEventListener('click', () => {
  saveProfile({ controls: b.dataset.side });
  applyLayout();
}));
$$('#optTint [data-tint]').forEach((b) => b.addEventListener('click', () => {
  saveProfile({ tint: b.dataset.tint === '1' });
  applyLayout();
}));
$$('#optNp [data-np]').forEach((b) => b.addEventListener('click', () => {
  saveProfile({ npMode: b.dataset.np });
  NP.mode = b.dataset.np;
  applyLayout();
}));
$$('#optClosing [data-close]').forEach((b) => b.addEventListener('click', () => {
  saveProfile({ closeMode: b.dataset.close });
  applyLayout();
}));
const fadeSlider = makeSlider($('#optFade'), (v, done) => {
  const sec = Math.round(v * 12);
  profile.crossfade = sec;
  fadeSlider.set(sec / 12);
  $('#optFadeNum').textContent = sec ? `${sec} SEC` : 'OFF';
  if (done) saveProfile({ crossfade: sec });
});

function renderFolders() {
  const list = profile.folders || [];
  $('#optFolders').innerHTML = list.map((f, i) => `<div class="f"><span title="${esc(f)}">${esc(f)}</span><button class="cmd x" data-i="${i}">[ REMOVE ]</button></div>`).join('')
    || '<div class="f dim">No folders yet. Add the folder your music is in.</div>';
}
$('#optFolders').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  const f = profile.folders[b.dataset.i];
  if (!(await ask({ title: 'REMOVE FOLDER', text: `Stop showing songs from ${f}? Nothing gets deleted from your PC.`, ok: '[ REMOVE ]' }))) return;
  saveProfile({ folders: profile.folders.filter((x) => x !== f) });
  renderFolders();
  rescanLibrary();
});
$('#optAddFolder').addEventListener('click', () => openBrowser(true, {
  title: 'SELECT MUSIC FOLDER',
  button: '[ USE THIS FOLDER ]',
  info: (cwd) => `ADDS: ${cwd}`,
  onPick: (dir) => {
    const list = profile.folders || [];
    if (!list.some((f) => f.toLowerCase() === dir.toLowerCase())) saveProfile({ folders: [...list, dir] });
    renderFolders();
    rescanLibrary();
  },
}));
$('#optRescan').addEventListener('click', () => rescanLibrary());

// ---- HUD ----
function tick() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  $('#time').textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
  $('#date').textContent = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
tick();
setInterval(tick, 1000);

(function matrix() {
  const cv = $('#matrix');
  const ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = 116, H = 54, CW = 7, RH = 5;
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.scale(dpr, dpr);
  const rows = Math.ceil(H / RH) + 2;
  const glyph = () => { const r = Math.random(); return r < 0.55 ? 0 : r < 0.75 ? 1 : r < 0.92 ? 2 : 3; };
  const cols = Array.from({ length: Math.floor(W / CW) }, (_, i) => ({
    cells: Array.from({ length: rows }, glyph),
    off: 0,
    speed: (0.08 + Math.random() * 0.35) * (i % 2 ? 1 : -1),
    gap: i % 6 === 5, // empty gap every few columns
  }));
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f5a31a';
    ctx.shadowColor = 'rgba(255,168,30,0.8)';
    ctx.shadowBlur = 3;
    cols.forEach((c, x) => {
      if (c.gap) return;
      c.off += c.speed;
      if (c.off >= RH) { c.off -= RH; c.cells.pop(); c.cells.unshift(glyph()); }
      if (c.off < 0) { c.off += RH; c.cells.shift(); c.cells.push(glyph()); }
      if (Math.random() < 0.01) c.cells[(Math.random() * rows) | 0] = glyph();
      c.cells.forEach((g, y) => {
        if (!g) return;
        const px = x * CW + 1, py = (y - 1) * RH + c.off;
        if (g === 1) ctx.fillRect(px + 2, py, 2, 2);
        else if (g === 2) ctx.fillRect(px, py, 4, 2);
        else ctx.fillRect(px, py, 6, 2);
      });
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

// dragging the line between locations and files in the file browser
$('#fbSplit').addEventListener('mousedown', (e) => {
  e.preventDefault();
  const side = $('.fb-side');
  const startX = e.clientX, startW = side.offsetWidth;
  $('#fbSplit').classList.add('drag');
  const move = (ev) => { side.style.width = `${clamp(startW + ev.clientX - startX, 110, 400)}px`; };
  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    $('#fbSplit').classList.remove('drag');
    saveProfile({ sideWidth: side.offsetWidth });
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
});

// songs dropped anywhere go to the tagger. the drop has to be caught or the window would just open the file
['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (ev) => {
  ev.preventDefault();
  if (ev.dataTransfer?.types?.includes('Files')) screen.classList.add('over');
}));
document.addEventListener('dragleave', (ev) => { if (!ev.relatedTarget) screen.classList.remove('over'); });
document.addEventListener('drop', (ev) => {
  ev.preventDefault();
  screen.classList.remove('over');
  if (ev.dataTransfer?.files?.length) addFiles(ev.dataTransfer.files);
});

async function boot() {
  profile = await store.get();
  showUser();
  applyLayout();
  initPlayer();
  initEq();
  initNowPlaying();
  await initStats();
  await initLibrary();
  showView(profile.view || 'lib');
  if (!profile.username) askName();
}
document.addEventListener('DOMContentLoaded', boot);
