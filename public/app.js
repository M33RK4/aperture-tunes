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

// the colours canvases and drawn svgs use. the css has the same two sets (see html.blue in style.css)
const THEMES = {
  amber: {
    main: '#f5a31a', hi: '#ffc93c', dim: '#8c5c14', word: '#ffd52a', lit: '#fff1b8', on: '#120c03', red: '#ff5a3c',
    panel: '#1b1408', mid: '#241a09', deep: '#120c04', deeper: '#0e0a04', deepest: '#0b0803', dark2: '#150e05', dark3: '#160f05', dark4: '#170f05', tape: '#3d2c11',
    rgb: '245,163,26', glow: '255,168,30', lamp: '255,170,40', hi2: '255,190,60', hi3: '255,200,60', hi4: '255,201,60',
  },
  // Portal's blue portal: 64,160,255
  blue: {
    main: '#40a0ff', hi: '#9ad4ff', dim: '#3a74b0', word: '#b5e2ff', lit: '#e6f5ff', on: '#030913', red: '#ff5a3c',
    panel: '#08131f', mid: '#0b1828', deep: '#040a12', deeper: '#040910', deepest: '#03070d', dark2: '#050d17', dark3: '#050e18', dark4: '#061019', tape: '#12304f',
    rgb: '64,160,255', glow: '80,170,255', lamp: '90,175,255', hi2: '140,205,255', hi3: '150,210,255', hi4: '154,212,255',
  },
};
let C = THEMES.amber;
const rgba = (k, a) => `rgba(${C[k]},${a})`;

// song changes: the old text gets backspaced away and the new one typed in, like a terminal.
// el.dataset.txt is where the text is heading, so calling this again with the same text does nothing
const typingNow = new WeakMap();
function typeText(el, to, animate = true) {
  if (!el) return;
  to = to ?? '';
  if (el.dataset.txt === to) return;
  const first = el.dataset.txt === undefined;
  const from = el.textContent;
  el.dataset.txt = to;
  const token = {};
  typingNow.set(el, token);
  if (!animate || first || from === to || document.hidden) {
    el.textContent = to;
    el.classList.remove('typing');
    return;
  }
  const t0 = performance.now(), del = from.length, add = to.length;
  const tDel = Math.min(320, del * 18), tAdd = Math.min(720, add * 38);
  el.classList.add('typing');
  const step = (now) => {
    if (typingNow.get(el) !== token) return;
    const t = now - t0;
    if (t < tDel) el.textContent = from.slice(0, Math.ceil(del * (1 - t / tDel)));
    else if (t < tDel + tAdd) el.textContent = to.slice(0, Math.floor((add * (t - tDel)) / tAdd));
    else {
      el.textContent = to;
      el.classList.remove('typing');
      typingNow.delete(el);
      return;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

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
const hist = []; // the screens you came from, so Esc can go back
function showView(name, back = false) {
  if (!back && name !== view) {
    hist.push(view);
    if (hist.length > 30) hist.shift();
  }
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
// back to the screen you were on before. with nothing to go back to, that is now playing
function goBack() {
  let prev = hist.pop();
  while (prev && prev === view) prev = hist.pop();
  if (!prev && view !== 'np') prev = 'np';
  if (prev) showView(prev, true);
}
// Esc closes whatever is on top first (menu, popup, file browser). with nothing open it goes back a screen
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  if ($('.ctx')) return closeMenus();
  if ($('.dlg.pop')) return $('.dlg.pop').remove();
  if (!$('#askDlg').hidden) return askDone?.(null);
  if (!$('#login').hidden) {
    if (profile.username) $('#login').hidden = true; // the very first time you do need a name
    return;
  }
  if (!$('#saveDlg').hidden) return closeSave();
  if (!$('#fb').hidden) return closeBrowser();
  if (e.target.closest?.('input, select, textarea')) return e.target.blur();
  goBack();
});

// Ctrl+F: straight to the library's search box, from anywhere
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'f' || e.altKey) return;
  if ($('.dlg.pop') || !$('#askDlg').hidden || !$('#login').hidden || !$('#fb').hidden) return;
  e.preventDefault();
  if (view !== 'lib' && view !== 'needs') showView('lib');
  $('#libSearch').focus();
  $('#libSearch').select();
});

// the mouse pointer hides after a few seconds of not moving over the app
let mouseTimer = 0, mouseX = -1, mouseY = -1, mouseDown = false;
function hideMouseLater() {
  clearTimeout(mouseTimer);
  const sec = profile.hideMouse ?? 3;
  if (!sec || mouseDown) return;
  mouseTimer = setTimeout(() => document.documentElement.classList.add('nomouse'), sec * 1000);
}
function showMouse() {
  document.documentElement.classList.remove('nomouse');
  hideMouseLater();
}
// chromium sends a mousemove when the pointer style changes, so only a real move counts
document.addEventListener('mousemove', (e) => {
  if (e.clientX === mouseX && e.clientY === mouseY) return;
  mouseX = e.clientX; mouseY = e.clientY;
  showMouse();
});
document.addEventListener('mousedown', () => { mouseDown = true; showMouse(); });
document.addEventListener('mouseup', () => { mouseDown = false; showMouse(); });
document.documentElement.addEventListener('mouseleave', () => clearTimeout(mouseTimer));

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
  $('#st2').textContent = profile.taggedTotal || 0;
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
  $$('#optUnder [data-under]').forEach((b) => b.classList.toggle('on', b.dataset.under === (profile.npUnder || 'next')));
  $$('#optLyr [data-lyr]').forEach((b) => b.classList.toggle('on', (b.dataset.lyr === '1') === (profile.lyricsDl !== false)));
  $$('#optMouse [data-mouse]').forEach((b) => b.classList.toggle('on', +b.dataset.mouse === (profile.hideMouse ?? 3)));
  // on/off switches: [element, its data key, whether it's on]
  for (const [sel, key, on] of [['#optLoud', 'loud', profile.sameLoudness !== false], ['#optSleep', 'sleep', !!profile.sleepBtn], ['#optAuto', 'auto', !!profile.autoPl], ['#optBoot', 'boot', profile.bootScreen !== false], ['#optUpd', 'upd', profile.updCheck !== false]]) {
    $$(`${sel} [data-${key}]`).forEach((b) => b.classList.toggle('on', (b.dataset[key] === '1') === on));
  }
  if (profile.sideWidth) $('.fb-side').style.width = `${profile.sideWidth}px`;
  const fade = profile.crossfade || 0;
  fadeSlider.set(fade / 12);
  $('#optFadeNum').textContent = fade ? `${fade} SEC` : 'OFF';
  $('#optXfAlbum').checked = !!profile.xfAlbum;
  renderXfPairs();
  applyTheme();
}
// amber or blue. everything drawn in css follows the class on <html>, the canvases and svgs read C
function applyTheme() {
  const blue = profile.theme === 'blue';
  const was = C;
  C = blue ? THEMES.blue : THEMES.amber;
  document.documentElement.classList.toggle('blue', blue);
  $$('#optTheme [data-theme]').forEach((b) => b.classList.toggle('on', b.dataset.theme === (blue ? 'blue' : 'amber')));
  $('#optTint [data-tint="1"]').textContent = blue ? '[ BLUE TINT ]' : '[ AMBER TINT ]';
  if (was !== C) document.dispatchEvent(new CustomEvent('theme'));
}
$('#btnOpts').addEventListener('click', () => {
  if (view === 'opts') return goBack();
  renderFolders();
  renderXfPairs();
  showView('opts');
});
$('#optClose').addEventListener('click', goBack);
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
$$('#optUnder [data-under]').forEach((b) => b.addEventListener('click', () => {
  saveProfile({ npUnder: b.dataset.under });
  applyLayout();
  if (view === 'np') renderNp();
}));
$$('#optLyr [data-lyr]').forEach((b) => b.addEventListener('click', () => {
  saveProfile({ lyricsDl: b.dataset.lyr === '1' });
  applyLayout();
  LY.id = null; // look again with the new setting
  if (view === 'np') renderNp();
}));
$$('#optTheme [data-theme]').forEach((b) => b.addEventListener('click', () => {
  saveProfile({ theme: b.dataset.theme });
  applyLayout();
  sendMini();
}));
$$('#optMouse [data-mouse]').forEach((b) => b.addEventListener('click', () => {
  saveProfile({ hideMouse: +b.dataset.mouse });
  applyLayout();
  showMouse();
}));
// the on/off switches, and what each one changes right away
const SWITCHES = {
  loud: ['sameLoudness', () => loudRefresh()],
  sleep: ['sleepBtn', () => sleepDraw()],
  auto: ['autoPl', () => renderPlNav()],
  boot: ['bootScreen', () => {}],
  upd: ['updCheck', () => checkForUpdate()],
};
for (const [key, [field, after]] of Object.entries(SWITCHES)) {
  $$(`[data-${key}]`).forEach((b) => b.addEventListener('click', () => {
    saveProfile({ [field]: b.dataset[key] === '1' });
    applyLayout();
    after();
  }));
}

// ---- crossfade exceptions: song pairs that play straight into each other ----
$('#optXfAlbum').addEventListener('change', (e) => saveProfile({ xfAlbum: e.target.checked }));
function renderXfPairs() {
  const pairs = profile.xfPairs || [];
  const name = (p) => { const s = libSong(p) || fallbackSong(p); return songTitle(s); };
  $('#optXfList').innerHTML = pairs.map((x, i) => {
    const a = libSong(x.a), b = libSong(x.b);
    const who = [...new Set([a?.artist, b?.artist].filter(Boolean))].join(' / ');
    return `<div class="ex"><span class="a" title="${esc(x.a)}">${esc(name(x.a))}</span><span class="to">→</span><span class="a" title="${esc(x.b)}">${esc(name(x.b))}</span><span class="d">${esc(who)}</span><button class="cmd" data-x="${i}" title="Remove this exception">[ ✕ ]</button></div>`;
  }).join('') || '<div class="ex none">None yet.</div>';
}
$('#optXfList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-x]');
  if (!b) return;
  const pairs = [...(profile.xfPairs || [])];
  pairs.splice(+b.dataset.x, 1);
  saveProfile({ xfPairs: pairs });
  renderXfPairs();
});
// picking the two songs: a search box on each side, click a song to pick it
$('#optXfAdd').addEventListener('click', () => {
  $('.dlg.pop')?.remove();
  const pick = { a: null, b: null };
  screen.insertAdjacentHTML('beforeend', `<div class="dlg pop exdlg" id="xfDlg"><div class="dlgbox xwide"><div class="t">APERTURE TUNES // ADD CROSSFADE EXCEPTION</div>
    <div class="b"><div class="note">When the first song ends and the second one plays right after it, they go straight into each other with no fade. Handy for songs that are made to run together.</div>
      <div class="pairs"><div class="col"><span>WHEN THIS SONG ENDS</span><input data-side="a" spellcheck="false" placeholder="Search your library"><div class="res" data-res="a"></div></div>
        <div class="arrow">→</div>
        <div class="col"><span>AND THIS ONE IS NEXT</span><input data-side="b" spellcheck="false" placeholder="Search your library"><div class="res" data-res="b"></div></div></div>
      <div class="act"><button class="cmd" id="xfNo">[ CANCEL ]</button><button class="cmd hot" id="xfYes" disabled>[ ADD ]</button></div></div></div></div>`);
  const dlg = $('#xfDlg');
  const draw = (side) => {
    const q = dlg.querySelector(`input[data-side="${side}"]`).value.trim().toLowerCase();
    const list = (q ? LIB.songs.filter((s) => `${songTitle(s)} ${s.artist} ${s.album}`.toLowerCase().includes(q)) : pick[side] ? [libSong(pick[side])].filter(Boolean) : [])
      .slice(0, 40);
    dlg.querySelector(`[data-res="${side}"]`).innerHTML = list.map((s) => `<div class="${s.path === pick[side] ? 'on' : ''}" data-p="${esc(s.path)}">${esc(songTitle(s))} <i>// ${esc(s.artist || 'Unknown Artist')} // ${esc(s.album || 'Unknown Album')}</i></div>`).join('')
      || `<div class="none">${q ? 'Nothing found.' : 'Type to search.'}</div>`;
    $('#xfYes').disabled = !pick.a || !pick.b || pick.a === pick.b;
  };
  dlg.addEventListener('input', (e) => e.target.dataset.side && draw(e.target.dataset.side));
  dlg.addEventListener('click', (e) => {
    const r = e.target.closest('[data-p]');
    if (r) {
      const side = r.parentElement.dataset.res;
      pick[side] = r.dataset.p;
      draw(side);
    }
    if (e.target.closest('#xfNo')) dlg.remove();
  });
  $('#xfYes').addEventListener('click', () => {
    const pairs = (profile.xfPairs || []).filter((x) => !(x.a === pick.a && x.b === pick.b));
    saveProfile({ xfPairs: [...pairs, { a: pick.a, b: pick.b }] });
    renderXfPairs();
    dlg.remove();
  });
  draw('a'); draw('b');
  setTimeout(() => dlg.querySelector('input').focus(), 30);
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
const started = Date.now();
function tick() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  $('#time').textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
  $('#date').textContent = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  $('#st3').textContent = ((Date.now() - started) / 60000).toFixed(1);
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
    ctx.fillStyle = C.main;
    ctx.shadowColor = rgba('glow', 0.8);
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

// NEW VERSIONS: a note above OPTIONS when GitHub has a newer version. clicking it opens the download page in
// your normal browser. nothing ever gets downloaded by the app itself
async function checkForUpdate() {
  $('#updRow')?.remove();
  if (profile.updCheck === false) return;
  try {
    const u = await (await fetch('/api/update')).json();
    if (!u.newer || !u.url || profile.updCheck === false) return;
    $('#btnOpts').insertAdjacentHTML('beforebegin', `<div class="updrow" id="updRow" title="Opens the download page in your browser">▲ VERSION ${esc(u.latest)} IS OUT<small>CLICK TO GET IT</small></div>`);
    $('#updRow').addEventListener('click', () => window.open(u.url, '_blank'));
  } catch {}
}

let APP_VERSION = '';
async function boot() {
  profile = await store.get();
  showUser();
  applyLayout();
  sleepDraw();
  // the boot screen starts straight away and runs while everything below loads
  const booting = bootStart();
  initPlayer();
  initEq();
  initNowPlaying();
  await initStats();
  await initLoudness();
  await initLibrary();
  showView(profile.view || 'lib');
  hist.length = 0;
  hideMouseLater();
  APP_VERSION = await fetch('/api/version').then((r) => r.json()).then((v) => v.version).catch(() => '');
  bootData({
    version: APP_VERSION, folders: (profile.folders || []).length,
    songs: LIB.songs.length || (LIB.scanning ? 'SCANNING' : 0), queue: P.queue.length,
    eq: EQ.state.on ? `${EQ.state.n} BANDS` : 'BYPASSED', user: profile.username || '',
  });
  await booting;
  if (!profile.username) askName();
  checkForUpdate();
  reportReadyNote();
}
document.addEventListener('DOMContentLoaded', boot);
