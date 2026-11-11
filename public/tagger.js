// the tagger: finds tags online and fixes your files. used to be the whole app, now it is a tool tab
const items = [];
let busy = false;

const QUIPS = {
  loaded: (n) => `${n} specimen${n === 1 ? '' : 's'} received. Run [ SCAN ] when ready.`,
  scanning: (i, n) => `Analyzing specimen ${i} of ${n}. Please remain calm.`,
  scanned: (ok, review, bad) => `Analysis complete. ${ok} confirmed, ${review} need verification, ${bad} failed. Review, then [ APPLY ].`,
  applying: 'Applying metadata. Do not touch the specimens.',
  done: (n) => `${n} specimen${n === 1 ? '' : 's'} successfully enriched. [ SAVE ] to keep them.`,
};

function say(msg) { $('#status').textContent = msg; }
function setStep(n) { $('#chamber').textContent = String(n).padStart(2, '0'); }


// same rules as the server so the preview name matches the real one
function stripFeat(t) {
  return (t || '')
    .replace(/\s*[([{]\s*(?:feat\.?|ft\.?|featuring|with)\s+[^)\]}]*[)\]}]/gi, '')
    .replace(/\s+\b(?:feat\.?|ft\.?|featuring)\s+.*$/i, '')
    .trim();
}
function safeFilename(s) {
  return (s || 'Unknown').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s{2,}/g, ' ').replace(/[. ]+$/, '').trim() || 'Unknown';
}
function previewName(it) {
  if (!it.meta) return it.name;
  let base = safeFilename(stripFeat(it.meta.title));
  if ($('#optPrefix').checked && it.meta.trackNumber) base = `${String(it.meta.trackNumber).padStart(2, '0')} - ${base}`;
  return base + it.ext;
}

function showWork(on) {
  $('#tagEmpty').hidden = on;
  $('#work').hidden = !on;
}

// dropped files get uploaded, files from the file browser are just sent as paths
function addFiles(fileList) {
  const list = [...fileList].filter((f) => /\.\w+$/.test(f.name));
  ingest(list, 8, (chunk) => {
    const fd = new FormData();
    chunk.forEach((f) => fd.append('files', f, f.name));
    return fetch('/api/upload', { method: 'POST', body: fd });
  });
}
function addPaths(paths) {
  ingest(paths, 200, (chunk) => fetch('/api/add-paths', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: chunk }),
  }));
}

async function ingest(list, chunkSize, send) {
  if (busy || !list.length) return;
  busy = true;
  showView('tag');
  showWork(true);
  showExtract(false);
  updateButtons();
  showProgress(0);
  say(`Receiving ${list.length} specimen(s)...`);
  for (let i = 0; i < list.length; i += chunkSize) {
    const added = await (await send(list.slice(i, i + chunkSize))).json();
    for (const a of added) {
      const it = { ...a, state: a.supported ? 'pending' : 'unsupported', candidates: [], sel: -1, meta: null, coverUrl: null, include: a.supported };
      items.push(it);
      renderRow(it);
    }
    showProgress(Math.min(1, (i + chunkSize) / list.length));
  }
  busy = false;
  hideProgress();
  setStep(1);
  say(QUIPS.loaded(items.length));
  updateCounts();
}

const fb = {
  cwd: null,
  entries: [],
  selected: new Map(), // remembers what you ticked even when you change folder
  anchor: -1, // last clicked row, for shift-click
  roots: null,
  pick: false, // true when it's choosing where to save instead of picking songs
};

// pick mode chooses a folder instead of songs (saving the tagged songs, adding a music folder)
// opts: { title, button, info(cwd), onPick(cwd) }
async function openBrowser(pick = false, opts = {}) {
  if (busy) return;
  fb.pick = pick;
  fb.opts = opts;
  $('#fb').classList.toggle('pick', pick);
  $('#fbTitle').textContent = `APERTURE TUNES // ${pick ? opts.title || 'SELECT LOCATION' : 'FILE ACCESS TERMINAL'}`;
  $('#fbSaveHere').textContent = opts.button || '[ SAVE HERE ]';
  $('#fb').hidden = false;
  if (!fb.roots) {
    fb.roots = await (await fetch('/api/fs/roots')).json();
    const side = (list) => list.map((l) => `<div class="loc" data-path="${esc(l.path)}" title="${esc(l.path)}">${esc(l.name)}</div>`).join('');
    $('#fbLocs').innerHTML = side(fb.roots.locations);
    $('#fbDrives').innerHTML = side(fb.roots.drives);
    document.querySelectorAll('.fb-side .loc').forEach((el) => el.addEventListener('click', () => fbGo(el.dataset.path)));
  }
  const start = profile.lastDir || fb.roots.locations[0]?.path || fb.roots.drives[0]?.path;
  await fbGo(fb.cwd || start);
}
function closeBrowser() {
  $('#fb').hidden = true;
}

async function fbGo(dir) {
  const res = await fetch(`/api/fs/list?path=${encodeURIComponent(dir)}${$('#fbAll').checked ? '&all=1' : ''}`);
  const data = await res.json();
  if (!res.ok) {
    $('#fbRows').innerHTML = `<div class="fb-msg">&gt; ${esc(data.error)}. Try another folder.</div>`;
    $('#fbPath').value = dir;
    return;
  }
  fb.cwd = data.path;
  fb.parent = data.parent;
  fb.entries = data.entries;
  fb.anchor = -1;
  $('#fbPath').value = data.path;
  $('#fbUp').disabled = !data.parent;
  document.querySelectorAll('.fb-side .loc').forEach((el) => el.classList.toggle('on', el.dataset.path.toLowerCase() === data.path.toLowerCase()));
  fbRender();
  $('#fbRows').scrollTop = 0;
  saveProfile({ lastDir: data.path });
}

const fmtSize = (b) => (b == null ? '--' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtDate = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };

function fbRender() {
  const rows = fb.entries.map((e, i) => {
    const cls = e.dir ? 'dir' : e.audio ? `file${fb.selected.has(e.path) ? ' sel' : ''}` : 'other';
    const mark = e.dir ? '&lt;D&gt;' : e.audio ? '<span class="box"></span>' : '';
    return `<div class="fb-row ${cls}" data-i="${i}"><span>${mark}</span><span title="${esc(e.name)}">${esc(e.name)}</span><span class="r">${e.dir ? '--' : fmtSize(e.size)}</span><span class="r">${fmtDate(e.mtime)}</span></div>`;
  });
  $('#fbRows').innerHTML = rows.join('') || '<div class="fb-msg">&gt; No folders or audio files here.</div>';
  fbFooter();
}

function fbFooter() {
  if (fb.pick) {
    $('#fbInfo').textContent = fb.opts.info ? fb.opts.info(fb.cwd) : fb.cwd;
    $('#fbInfo').title = fb.cwd;
    return;
  }
  $('#fbInfo').title = '';
  const n = fb.selected.size;
  const bytes = [...fb.selected.values()].reduce((a, b) => a + b, 0);
  $('#fbInfo').textContent = n ? `${n} SELECTED // ${fmtSize(bytes)}` : 'NOTHING SELECTED';
  $('#fbLoad').textContent = n ? `[ LOAD ${n} SPECIMEN${n === 1 ? '' : 'S'} ]` : '[ LOAD ]';
  $('#fbLoad').disabled = !n;
  const audio = fb.entries.filter((e) => e.audio);
  const allOn = audio.length && audio.every((e) => fb.selected.has(e.path));
  $('#fbSelAll').textContent = allOn ? '[ SELECT NONE ]' : '[ SELECT ALL ]';
  $('#fbSelAll').disabled = !audio.length;
}

$('#fbRows').addEventListener('click', (ev) => {
  const row = ev.target.closest('.fb-row');
  if (!row) return;
  const i = Number(row.dataset.i);
  const e = fb.entries[i];
  if (e.dir) return fbGo(e.path);
  if (!e.audio || fb.pick) return;
  if (ev.shiftKey && fb.anchor >= 0) {
    // shift-click ticks (or unticks) everything between your last click and this one
    const on = !fb.selected.has(e.path);
    const [a, b] = [Math.min(fb.anchor, i), Math.max(fb.anchor, i)];
    for (const x of fb.entries.slice(a, b + 1)) if (x.audio) on ? fb.selected.set(x.path, x.size) : fb.selected.delete(x.path);
  } else {
    fb.selected.has(e.path) ? fb.selected.delete(e.path) : fb.selected.set(e.path, e.size);
  }
  fb.anchor = i;
  fbRender();
});

$('#fbUp').addEventListener('click', () => fb.parent && fbGo(fb.parent));
$('#fbPath').addEventListener('keydown', (e) => { if (e.key === 'Enter') fbGo($('#fbPath').value.trim()); });
$('#fbAll').addEventListener('change', () => fbGo(fb.cwd));
$('#fbSelAll').addEventListener('click', () => {
  const audio = fb.entries.filter((e) => e.audio);
  const allOn = audio.every((e) => fb.selected.has(e.path));
  audio.forEach((e) => (allOn ? fb.selected.delete(e.path) : fb.selected.set(e.path, e.size)));
  fbRender();
});
$('#fbLoad').addEventListener('click', () => {
  const paths = [...fb.selected.keys()];
  fb.selected.clear();
  closeBrowser();
  addPaths(paths);
});
$('#fbFolder').addEventListener('click', async () => {
  $('#fbInfo').textContent = 'SCANNING FOLDER...';
  const paths = await (await fetch('/api/fs/scan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: fb.cwd, recursive: $('#fbRec').checked }),
  })).json();
  if (!paths.length) {
    $('#fbInfo').textContent = 'NO AUDIO FILES FOUND';
    return;
  }
  fb.selected.clear();
  closeBrowser();
  addPaths(paths);
});
['#fbClose', '#fbCancel'].forEach((s) => $(s).addEventListener('click', closeBrowser));
document.addEventListener('keydown', (e) => {
  if ($('#fb').hidden || e.target === $('#fbPath')) return;
  if (e.key === 'Escape') closeBrowser();
  else if (e.key === 'Backspace' && fb.parent) fbGo(fb.parent);
  else if (e.key === 'Enter' && fb.pick) $('#fbSaveHere').click();
  else if (e.key === 'Enter' && fb.selected.size) $('#fbLoad').click();
});
['#btnBrowse', '#btnAdd'].forEach((s) => $(s).addEventListener('click', () => openBrowser()));

$('#btnScan').addEventListener('click', async () => {
  if (busy) return;
  const todo = items.filter((it) => it.supported && ['pending', 'error', 'nomatch'].includes(it.state));
  if (!todo.length) return;
  busy = true;
  setStep(2);
  updateButtons();
  for (let i = 0; i < todo.length; i++) {
    say(QUIPS.scanning(i + 1, todo.length));
    showProgress(i / todo.length);
    await identifyItem(todo[i]);
  }
  say('Cross-referencing albums. Keeping your songs together.');
  const grouped = await unifyAlbums();
  hideProgress();
  busy = false;
  setStep(3);
  const c = (s) => items.filter((it) => it.state === s).length;
  say(QUIPS.scanned(c('done'), c('review'), c('nomatch') + c('error')) + grouped);
  updateButtons();
});

// moves songs by the same artist onto the one album that has most of them (see unifyAlbums in lookup.js)
async function unifyAlbums() {
  const songs = items.filter((it) => it.meta && it.candidates[it.sel]).map((it) => ({ id: it.id, best: it.candidates[it.sel] }));
  if (songs.length < 2) return '';
  try {
    const res = await fetch('/api/unify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ songs }) });
    if (!res.ok) return '';
    const { picks, summary } = await res.json();
    for (const [id, track] of Object.entries(picks)) {
      const it = items.find((x) => x.id === id);
      it.candidates = [track, ...it.candidates.filter((c) => c.sourceId !== track.sourceId)];
      choose(it, 0);
      renderRow(it);
    }
    updateCounts();
    return summary.map((s) => ` Kept ${s.count} songs together on "${s.album}".`).join('');
  } catch {
    return '';
  }
}

async function identifyItem(it, term) {
  it.state = 'scanning';
  renderRow(it);
  try {
    const res = await fetch(`/api/identify/${it.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(term ? { term } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lookup failed');
    it.candidates = data.candidates;
    it.query = data.query;
    if (data.candidates.length) {
      choose(it, 0);
    } else {
      it.state = 'nomatch';
      it.include = false;
    }
  } catch (e) {
    it.state = 'error';
    it.error = e.message;
    it.include = false;
  }
  renderRow(it);
  updateCounts();
}

function choose(it, idx) {
  const c = it.candidates[idx];
  it.sel = idx;
  it.meta = {
    title: c.title,
    artist: c.artist,
    albumArtist: c.albumArtist && /various/i.test(c.albumArtist) ? c.albumArtist : c.artist,
    album: c.album,
    trackNumber: c.trackNumber || '',
    trackCount: c.trackCount || '',
    discNumber: c.discNumber || '',
    discCount: c.discCount || '',
    year: c.year || '',
    genre: c.genre || '',
  };
  it.coverUrl = c.coverUrl;
  it.thumbUrl = c.thumbUrl;
  it.state = c.score >= 0.6 ? 'done' : 'review';
  it.include = true;
}

const STATE_TEXT = {
  pending: 'AWAITING',
  scanning: 'ANALYZING...',
  done: 'CONFIRMED',
  review: 'VERIFY',
  nomatch: 'NO MATCH',
  error: 'ERROR',
  unsupported: 'UNSUPPORTED',
};

function renderRow(it) {
  if (!it.el) {
    it.el = $('#rowTpl').content.firstElementChild.cloneNode(true);
    $('#list').appendChild(it.el);
    wireRow(it);
  }
  const el = it.el;
  el.className = `row s-${it.state}${it.include ? '' : ' excluded'}`;
  $('.include', el).checked = it.include;
  $('.include', el).disabled = !it.meta;
  $('.old', el).textContent = it.name;
  $('.new', el).textContent = it.meta ? previewName(it) : it.name;
  $('.new', el).title = it.name;
  $('.sub', el).innerHTML = it.meta
    ? `<b>${esc(it.meta.artist)}</b> // ${esc(it.meta.album)}${it.meta.trackNumber ? ` // #${esc(it.meta.trackNumber)}` : ''}${it.meta.year ? ` // ${esc(it.meta.year)}` : ''}${it.meta.genre ? ` // ${esc(it.meta.genre)}` : ''}`
    : '';
  const img = $('.cover img', el);
  if (it.thumbUrl) img.src = it.thumbUrl; else img.removeAttribute('src');

  const score = it.candidates[it.sel]?.score;
  let conf = '';
  if (score != null) {
    const n = Math.round(score * 10);
    conf = `<span class="conf">${'|'.repeat(n)}${'.'.repeat(10 - n)} ${Math.round(score * 100)}%</span>`;
  }
  $('.state', el).innerHTML = STATE_TEXT[it.state] + conf;
  $('.state', el).title = it.state === 'error' ? it.error : '';
  $('.toggle', el).hidden = !(it.supported && it.state !== 'scanning' && it.state !== 'pending');

  const sel = $('.cands', el);
  sel.innerHTML = it.candidates
    .map((c, i) => `<option value="${i}">${Math.round(c.score * 100)}% | ${esc(c.title)} - ${esc(c.artistCredit)} | ${esc(c.album)}${c.year ? ` (${c.year})` : ''} [${c.source}]</option>`)
    .join('') || '<option>No candidates</option>';
  sel.value = String(it.sel);
  sel.disabled = !it.candidates.length;
  el.querySelectorAll('.fields input').forEach((inp) => {
    inp.value = it.meta ? it.meta[inp.dataset.f] ?? '' : '';
    inp.disabled = !it.meta;
  });
  if (!$('.term', el).value && it.query) $('.term', el).value = it.query.artist ? `${it.query.artist} - ${it.query.title}` : it.query.title;
}

function wireRow(it) {
  const el = it.el;
  $('.toggle', el).addEventListener('click', () => {
    const ed = $('.editor', el);
    ed.hidden = !ed.hidden;
    $('.toggle', el).textContent = ed.hidden ? '[ EDIT ]' : '[ DONE ]';
  });
  $('.include', el).addEventListener('change', (e) => { it.include = e.target.checked; renderRow(it); updateCounts(); });
  $('.cands', el).addEventListener('change', (e) => { choose(it, Number(e.target.value)); renderRow(it); updateCounts(); });
  el.querySelectorAll('.fields input').forEach((inp) => inp.addEventListener('input', () => {
    if (!it.meta) return;
    it.meta[inp.dataset.f] = inp.value;
    if (it.state === 'review') it.state = 'done'; // you checked it, so its good
    const keep = document.activeElement;
    renderRow(it);
    keep?.focus();
  }));
  const doSearch = async () => {
    const term = $('.term', el).value.trim();
    if (!term || busy) return;
    busy = true;
    updateButtons();
    say(`Re-testing specimen with query "${term}".`);
    await identifyItem(it, term);
    busy = false;
    updateButtons();
    say(it.candidates.length ? 'New candidates acquired. Select the correct match.' : 'Still no match. Try a different spelling.');
  };
  $('.search', el).addEventListener('click', doSearch);
  $('.term', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
}

function updateCounts() {
  const sel = items.filter((it) => it.include && it.meta).length;
  const unsup = items.filter((it) => it.state === 'unsupported').length;
  $('#counts').textContent = `${items.length} SPECIMENS // ${sel} SELECTED${unsup ? ` // ${unsup} UNSUPPORTED` : ''}`;
  updateButtons();
}
function updateButtons() {
  $('#btnScan').disabled = busy || !items.some((it) => it.supported && ['pending', 'error', 'nomatch'].includes(it.state));
  $('#btnApply').disabled = busy || !items.some((it) => it.include && it.meta);
  $('#btnReset').disabled = busy;
}
function showProgress(f) { $('#bar').style.width = `${Math.round(f * 100)}%`; }
function hideProgress() { $('#bar').style.width = '100%'; setTimeout(() => { $('#bar').style.width = '0'; }, 600); }

['#optPrefix', '#optFeat'].forEach((s) => $(s).addEventListener('change', () => items.forEach(renderRow)));

$('#btnApply').addEventListener('click', async () => {
  const chosen = items.filter((it) => it.include && it.meta);
  if (!chosen.length || busy) return;
  busy = true;
  updateButtons();
  setStep(4);
  say(QUIPS.applying);
  showProgress(0.3);
  try {
    const res = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: chosen.map((it) => ({ id: it.id, meta: it.meta, coverUrl: it.coverUrl })),
        options: { keepFeatInTitle: $('#optFeat').checked, trackPrefix: $('#optPrefix').checked },
      }),
    });
    const data = await res.json();
    const ok = data.results.filter((r) => r.ok);
    const failed = data.results.filter((r) => !r.ok);
    for (const r of failed) {
      const it = items.find((x) => x.id === r.id);
      it.state = 'error';
      it.error = r.error;
      renderRow(it);
    }
    saveProfile({ taggedTotal: (profile.taggedTotal || 0) + ok.length });
    showUser();
    lastApply = ok;
    showExtract(ok.length > 0);
    say(QUIPS.done(ok.length) + (failed.length ? ` ${failed.length} failed.` : ''));
  } catch (e) {
    say(`Facility malfunction: ${e.message}`);
  }
  hideProgress();
  busy = false;
  updateButtons();
});

// open only works in the desktop app, so it stays hidden in a normal browser
function showExtract(on) {
  $('#btnSave').hidden = !on;
  $('#btnOpen').hidden = !(on && desktop);
}
let lastApply = [];
async function save(body) {
  const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Save failed');
  return data;
}
function closeSave() { $('#saveDlg').hidden = true; }
function saveStep(confirm) {
  $('#saveChoose').hidden = confirm;
  $('#saveConfirm').hidden = !confirm;
}

$('#btnSave').addEventListener('click', () => {
  if (busy || !lastApply.length) return;
  // dropped files are temp copies with nowhere to go back to, so they can't be overwritten
  const canOver = lastApply.filter((r) => r.canOverwrite).length;
  const dropped = lastApply.length - canOver;
  $('#saveHead').textContent = `> ${plural(lastApply.length, 'specimen')} enriched. Where should they go?`;
  $('#saveOverwrite').disabled = !canOver;
  $('#saveOverwrite').title = canOver ? '' : 'Only works for songs picked in the file browser';
  $('#saveWarn').textContent = `> WARNING: this replaces ${plural(canOver, 'original file')}. It can't be undone.`;
  $('#saveSkip').textContent = dropped ? `${plural(dropped, 'dropped-in song')} ${dropped === 1 ? 'has' : 'have'} no original location and will be skipped.` : '';
  $('#saveSkip').hidden = !dropped;
  saveStep(false);
  $('#saveDlg').hidden = false;
});
$('#saveCancel').addEventListener('click', closeSave);
$('#saveOverwrite').addEventListener('click', () => saveStep(true));
$('#saveBack').addEventListener('click', () => saveStep(false));
$('#saveYes').addEventListener('click', async () => {
  closeSave();
  try {
    const r = await save({ mode: 'overwrite' });
    say(`${plural(r.written, 'original')} overwritten${r.skipped ? `, ${r.skipped} skipped` : ''}. Thank you for testing with Aperture Tunes.`);
    // renamed files would break playlists and the queue, so the player follows them, then the library rescans
    followMoves(r.moves || []);
    rescanLibrary();
  } catch (e) {
    say(`Facility malfunction: ${e.message}`);
  }
});
$('#saveNew').addEventListener('click', () => {
  closeSave();
  openBrowser(true, {
    title: 'SELECT STORAGE LOCATION',
    button: '[ SAVE HERE ]',
    info: (cwd) => `ALBUM FOLDERS GO INTO: ${cwd.split(/[\\/]/).filter(Boolean).pop() || cwd}`,
    onPick: saveToFolder,
  });
});
$('#fbSaveHere').addEventListener('click', () => {
  closeBrowser();
  fb.opts.onPick?.(fb.cwd);
});
async function saveToFolder(dir) {
  try {
    const r = await save({ mode: 'folder', dir });
    say(`${plural(r.albums.length, 'album folder')} saved to ${r.path}. Thank you for testing with Aperture Tunes.`);
    window.aperture?.openPath(r.path);
  } catch (e) {
    say(`Facility malfunction: ${e.message}`);
  }
}
$('#btnOpen').addEventListener('click', () => window.aperture.openOutput());

$('#btnReset').addEventListener('click', async () => {
  if (busy) return;
  await fetch('/api/reset', { method: 'POST' });
  items.length = 0;
  lastApply = [];
  $('#list').innerHTML = '';
  showExtract(false);
  showWork(false);
  setStep(1);
});


updateButtons();
