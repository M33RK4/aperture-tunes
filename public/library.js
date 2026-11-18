// the music library, album page, queue and playlists
const LIB = { songs: [], byPath: new Map(), musicDir: '', scanning: false };
const libSong = (p) => (p ? LIB.byPath.get(p.toLowerCase()) || null : null);
const coverSrc = (s) => (s?.cover ? `/api/cover/${s.cover}` : '');
function setCover(img, s) {
  const src = coverSrc(s);
  if (!src) return img.removeAttribute('src');
  if (img.getAttribute('src') !== src) img.src = src;
}
const artImg = (s, cls = '') => `<div class="art ${cls}">${s?.cover ? `<img src="${coverSrc(s)}" loading="lazy" alt="">` : ''}</div>`;
const songTitle = (s) => s.title || fallbackSong(s.path).title;
const artistOf = (s) => s.albumArtist || s.artist || 'Unknown Artist';
const albumKey = (s) => `${(s.album || '').toLowerCase()}|${artistOf(s).toLowerCase()}`;
// songs the tagger should look at: no title/artist/album, or the "Unknown Album" kind.
// only mp3/flac/m4a, because those are the ones the tagger can fix
const TAGGABLE = /^(mp3|flac|m4a)$/i;
const needsTag = (s) => TAGGABLE.test(s.ext) && (!s.title || !s.artist || !s.album || /^unknown/i.test(s.album) || /^unknown/i.test(s.artist));
const totalTime = (list) => fmtTime(list.reduce((a, s) => a + (s?.duration || 0), 0));
const cmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
const bySongOrder = (a, b) => cmp(artistOf(a), artistOf(b)) || cmp(a.album, b.album) || (a.disc || 1) - (b.disc || 1) || (a.track || 999) - (b.track || 999) || cmp(songTitle(a), songTitle(b));

function setLibrary(songs) {
  LIB.songs = songs.sort(bySongOrder);
  LIB.byPath = new Map(songs.map((s) => [s.path.toLowerCase(), s]));
  const needs = songs.filter(needsTag);
  $('#nLib').textContent = songs.length.toLocaleString();
  $('#nNeeds').textContent = needs.length;
  $('#navNeeds').hidden = !needs.length;
  $('#tagNeedsHint').hidden = !needs.length;
  $('#tagNeedsHint').innerHTML = `${plural(needs.length, 'song')} in your library ${needs.length === 1 ? 'is' : 'are'} missing tags: <button class="cmd" id="tagLoadNeeds">[ LOAD THEM ]</button>`;
  $('#tagLoadNeeds')?.addEventListener('click', () => addPaths(LIB.songs.filter(needsTag).map((s) => s.path)));
  renderCurrent();
  drawBar();
}

async function initLibrary() {
  try {
    const data = await (await fetch('/api/lib')).json();
    LIB.musicDir = data.musicDir;
    if (!profile.folders) saveProfile({ folders: [data.musicDir] });
    setLibrary(data.songs);
  } catch {
    setLibrary([]);
  }
  LV.tab = profile.libTab || 'albums';
  LV.mode = profile.libMode || 'grid';
  restoreQueue();
  renderPlNav();
  rescanLibrary();
}

// rescans run on the server; we just poll how far it got
let scanTimer = null;
async function rescanLibrary() {
  clearTimeout(scanTimer);
  LIB.scanning = true;
  drawLibCount();
  try {
    await fetch('/api/lib/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folders: profile.folders || [] }) });
  } catch {}
  const poll = async () => {
    try {
      const st = await (await fetch('/api/lib/status')).json();
      LIB.progress = st;
      if (st.scanning) {
        drawLibCount();
        scanTimer = setTimeout(poll, 600);
        return;
      }
      const data = await (await fetch('/api/lib')).json();
      LIB.scanning = false;
      setLibrary(data.songs);
    } catch {
      LIB.scanning = false;
      drawLibCount();
    }
  };
  scanTimer = setTimeout(poll, 300);
}

// ---- a song table used by the library, album page and needs-tagging list ----
// sel is a Set of paths. returns html
function songTable(list, sel, { album = true } = {}) {
  const cur = currentItem()?.path.toLowerCase();
  const head = `<div class="trow head ${album ? '' : 'noalb'}"><span></span><span class="r">#</span><span>TITLE</span><span>ARTIST</span>${album ? '<span>ALBUM</span>' : ''}<span class="r">TIME</span></div>`;
  return head + list.map((s, i) => {
    const playing = s.path.toLowerCase() === cur;
    return `<div class="trow ${album ? '' : 'noalb'} ${sel.has(s.path) ? 'sel' : ''} ${playing ? 'playing' : ''}" data-i="${i}">
      <span class="box"></span><span class="r d num">${playing ? '&#9654;' : s.track || i + 1}</span><span class="t" title="${esc(songTitle(s))}">${esc(songTitle(s))}</span>
      <span class="d">${esc(s.artist || 'Unknown Artist')}</span>${album ? `<span class="d">${esc(s.album || 'Unknown Album')}</span>` : ''}<span class="r d">${fmtTime(s.duration)}</span></div>`;
  }).join('');
}
// click selects a song, ctrl-click adds more, shift-click a range, double-click plays it (or queues it if something's playing)
function wireTable(container, state, onChange) {
  container.addEventListener('click', (e) => {
    const row = e.target.closest('.trow[data-i]');
    if (!row) return;
    const i = +row.dataset.i;
    const s = state.list[i];
    const multi = e.ctrlKey || e.metaKey;
    if (e.shiftKey && state.anchor >= 0) {
      // everything between the song you clicked first and this one
      if (!multi) state.sel.clear();
      const [a, b] = [Math.min(state.anchor, i), Math.max(state.anchor, i)];
      for (const x of state.list.slice(a, b + 1)) state.sel.add(x.path);
      return onChange();
    }
    if (multi || e.target.closest('.box')) {
      // ctrl-click or the tick box adds/removes this song and keeps the rest
      state.sel.has(s.path) ? state.sel.delete(s.path) : state.sel.add(s.path);
    } else {
      if (e.detail > 1) return; // second click of a double-click, the song is about to play
      // a plain click selects only this song. clicking the selected song again unselects it
      const only = state.sel.size === 1 && state.sel.has(s.path);
      state.sel.clear();
      if (!only) state.sel.add(s.path);
    }
    state.anchor = i;
    onChange();
  });
  container.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.trow[data-i]');
    if (row) playOrQueue(state.list[+row.dataset.i].path);
  });
}
// ticks update in place: redrawing the table between the two clicks of a double-click would swallow it
function markSel(container, state) {
  for (const row of container.querySelectorAll('.trow[data-i]')) row.classList.toggle('sel', state.sel.has(state.list[+row.dataset.i]?.path));
}
const picked = (state) => (state.sel.size ? state.list.filter((s) => state.sel.has(s.path)) : state.list);

// ---- library ----
const LV = { tab: 'albums', mode: 'grid', group: {}, search: '', needs: false, list: [], sel: new Set(), anchor: -1 };
function filtered() {
  const q = LV.search.trim().toLowerCase();
  let list = LIB.songs;
  if (LV.needs) list = list.filter(needsTag);
  if (q) list = list.filter((s) => `${songTitle(s)}\n${s.artist}\n${s.albumArtist}\n${s.album}`.toLowerCase().includes(q));
  return list;
}
const GROUPS = {
  albums: { key: albumKey, label: (s) => s.album || 'Unknown Album' },
  artists: { key: (s) => artistOf(s).toLowerCase(), label: artistOf },
  genres: { key: (s) => (s.genre || '').toLowerCase(), label: (s) => s.genre || 'Unknown Genre' },
};
function groupsOf(list, tab) {
  const g = GROUPS[tab];
  const map = new Map();
  for (const s of list) {
    const k = g.key(s);
    if (!map.has(k)) map.set(k, { key: k, label: g.label(s), songs: [] });
    map.get(k).songs.push(s);
  }
  return [...map.values()].sort((a, b) => cmp(a.label, b.label));
}

function drawLibCount() {
  const el = $('#libCount');
  if (LIB.scanning) {
    const p = LIB.progress;
    el.textContent = p?.total ? `SCANNING LIBRARY... ${p.done}/${p.total}` : 'SCANNING LIBRARY...';
    return;
  }
  const s = LIB.songs;
  if (LV.needs) {
    el.textContent = `${s.filter(needsTag).length} OF ${s.length.toLocaleString()} SONGS ARE MISSING TAGS`;
    return;
  }
  el.textContent = `${s.length.toLocaleString()} SONGS // ${new Set(s.map(albumKey)).size} ALBUMS // ${new Set(s.map((x) => artistOf(x).toLowerCase())).size} ARTISTS`;
}

function renderLib() {
  const needs = LV.needs;
  $('#libTitle').textContent = needs ? 'APERTURE TUNES // NEEDS TAGGING' : 'APERTURE TUNES // MUSIC LIBRARY';
  $$('#libTabs [data-tab]').forEach((b) => { b.hidden = needs; b.classList.toggle('on', b.dataset.tab === LV.tab); });
  const albums = LV.tab === 'albums' && !needs;
  [$('#libModeSep'), $('#libList'), $('#libGridBtn')].forEach((b) => (b.hidden = !albums));
  $('#libList').classList.toggle('on', LV.mode === 'list');
  $('#libGridBtn').classList.toggle('on', LV.mode === 'grid');
  $('#libToTagger').hidden = !needs;
  drawLibCount();

  const list = filtered();
  const grid = albums && LV.mode === 'grid';
  const useGroups = !needs && !grid && LV.tab !== 'songs';
  $('#libGrid').hidden = !grid;
  $('#libSongs').hidden = grid;
  $('#libGroups').hidden = !useGroups;
  $('.view[data-view="lib"] .pfoot').hidden = grid;
  const tagsOn = profile.showTags !== false && !grid && LIB.songs.length > 0;
  $('#libTagsOn').checked = profile.showTags !== false;
  $('#libTags').hidden = !tagsOn;
  $('#libSongs').parentElement.classList.toggle('tagson', tagsOn);

  if (!LIB.songs.length) {
    $('#libGrid').hidden = true;
    $('#libGroups').hidden = true;
    $('#libSongs').hidden = false;
    $('#libSongs').innerHTML = LIB.scanning ? '<div class="empty">&gt; Scanning your music folders...</div>'
      : '<div class="empty">&gt; No songs found in your music folders.<br><br><button class="cmd hot" id="libGoOpts">[ ADD A MUSIC FOLDER ]</button></div>';
    $('#libGoOpts')?.addEventListener('click', () => $('#btnOpts').click());
    LV.list = [];
    drawLibFoot();
    return;
  }

  if (grid) {
    const albumsList = groupsOf(list, 'albums');
    $('#libGrid').innerHTML = albumsList.map((g) => {
      const s = g.songs.find((x) => x.cover) || g.songs[0];
      return `<div class="tile" data-key="${esc(g.key)}" title="${esc(g.label)} // ${esc(artistOf(s))}">${artImg(s)}<div class="a">${esc(g.label)}</div><div class="b">${esc(artistOf(s))}</div></div>`;
    }).join('') || '<div class="empty">&gt; Nothing matches your search.</div>';
    return;
  }

  let songs = list;
  if (useGroups) {
    const groups = groupsOf(list, LV.tab);
    let key = LV.group[LV.tab];
    if (!groups.some((g) => g.key === key)) key = groups[0]?.key;
    LV.group[LV.tab] = key;
    $('#libGroups').innerHTML = groups.map((g) => `<div class="g ${g.key === key ? 'on' : ''}" data-key="${esc(g.key)}"><span title="${esc(g.label)}">${esc(g.label)}</span><span class="n">${g.songs.length}</span></div>`).join('');
    songs = groups.find((g) => g.key === key)?.songs || [];
  }
  if (LV.list !== songs) { LV.anchor = -1; }
  LV.list = songs;
  for (const p of LV.sel) if (!songs.some((s) => s.path === p)) LV.sel.delete(p);
  $('#libSongs').innerHTML = songs.length ? songTable(songs, LV.sel, { album: LV.tab !== 'albums' || needs }) : '<div class="empty">&gt; Nothing matches your search.</div>';
  drawLibFoot();
}
function drawLibFoot() {
  const n = LV.sel.size;
  const any = LV.list.length > 0;
  $('#libInfo').textContent = n === 1 ? selInfo(LV) : n ? `${n} SELECTED // ${totalTime(picked(LV))}` : any ? `${plural(LV.list.length, 'SONG').toUpperCase()} // ${totalTime(LV.list)}` : '';
  $('#libPlay').textContent = n ? '[ PLAY NOW ]' : '[ PLAY ALL ]';
  $('#libQueue').textContent = n ? '[ ADD TO QUEUE ]' : '[ QUEUE ALL ]';
  $('#libToTagger').textContent = n ? '[ SEND TO TAGGER ]' : '[ SEND ALL TO TAGGER ]';
  $('#libSelAll').textContent = n && n === LV.list.length ? '[ SELECT NONE ]' : '[ SELECT ALL ]';
  ['#libPlay', '#libQueue', '#libSelAll', '#libToTagger'].forEach((s) => ($(s).disabled = !any));
  tagSide($('#libTags'), LV);
}
wireTable($('#libSongs'), LV, () => { markSel($('#libSongs'), LV); drawLibFoot(); });
$('#libGroups').addEventListener('click', (e) => {
  const g = e.target.closest('.g');
  if (!g) return;
  LV.group[LV.tab] = g.dataset.key;
  LV.sel.clear();
  renderLib();
  $('#libSongs').scrollTop = 0;
});
$$('#libTabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
  LV.tab = b.dataset.tab;
  LV.sel.clear();
  saveProfile({ libTab: LV.tab });
  renderLib();
}));
$$('#libTabs [data-mode]').forEach((b) => b.addEventListener('click', () => {
  LV.mode = b.dataset.mode;
  saveProfile({ libMode: LV.mode });
  renderLib();
}));
$('#libSearch').addEventListener('input', (e) => { LV.search = e.target.value; renderLib(); });
$('#libGrid').addEventListener('click', (e) => {
  const t = e.target.closest('.tile');
  if (t) openAlbum(t.dataset.key);
});
$('#libSelAll').addEventListener('click', () => {
  if (LV.sel.size === LV.list.length) LV.sel.clear();
  else LV.list.forEach((s) => LV.sel.add(s.path));
  markSel($('#libSongs'), LV);
  drawLibFoot();
});
function flashInfo(sel, msg) {
  $(sel).textContent = msg;
  clearTimeout(flashInfo.t);
  flashInfo.t = setTimeout(() => { drawLibFoot(); drawAlbumFoot(); }, 1800);
}
$('#libPlay').addEventListener('click', () => { playPaths(picked(LV).map((s) => s.path)); LV.sel.clear(); renderLib(); });
$('#libQueue').addEventListener('click', () => {
  const add = picked(LV);
  enqueue(add.map((s) => s.path));
  LV.sel.clear();
  renderLib();
  flashInfo('#libInfo', `ADDED ${plural(add.length, 'SONG').toUpperCase()} TO THE QUEUE`);
});
$('#libToTagger').addEventListener('click', () => { sendToTagger(picked(LV).map((s) => s.path)); LV.sel.clear(); });

// ---- album page ----
const AV = { key: null, list: [], sel: new Set(), anchor: -1 };
function openAlbum(key) {
  AV.key = key;
  AV.sel.clear();
  showView('album');
}
function renderAlbum() {
  const songs = LIB.songs.filter((s) => albumKey(s) === AV.key).sort((a, b) => (a.disc || 1) - (b.disc || 1) || (a.track || 999) - (b.track || 999) || cmp(songTitle(a), songTitle(b)));
  AV.list = songs;
  if (!songs.length) return showView('lib');
  const s = songs.find((x) => x.cover) || songs[0];
  setCover($('#albArt img'), s);
  $('#albTitle').textContent = s.album || 'Unknown Album';
  $('#albArtist').textContent = artistOf(s);
  const year = songs.map((x) => x.year).filter(Boolean).sort()[0];
  $('#albInfo').textContent = [year, s.genre?.toUpperCase(), plural(songs.length, 'SONG').toUpperCase(), totalTime(songs)].filter(Boolean).join(' // ');
  $('#albSongs').innerHTML = songTable(songs, AV.sel, { album: false });
  drawAlbumFoot();
}
function drawAlbumFoot() {
  const n = AV.sel.size;
  $('#albSel').textContent = n === 1 ? selInfo(AV) : n ? `${n} SELECTED // ${totalTime(picked(AV))}` : 'DOUBLE-CLICK A SONG TO PLAY IT';
  $('#albSelPlay').hidden = !n;
  $('#albSelQueue').hidden = !n;
  const tagsOn = profile.showTags !== false;
  $('#albTags').hidden = !tagsOn;
  $('#albTags').parentElement.classList.toggle('tagson', tagsOn);
  tagSide($('#albTags'), AV);
}
wireTable($('#albSongs'), AV, () => { markSel($('#albSongs'), AV); drawAlbumFoot(); });
$('#albBack').addEventListener('click', () => showView('lib'));
$('#albPlay').addEventListener('click', () => playPaths(AV.list.map((s) => s.path)));
$('#albShuffle').addEventListener('click', () => playPaths(AV.list.map((s) => s.path), { shuffle: true }));
$('#albQueue').addEventListener('click', () => { enqueue(AV.list.map((s) => s.path)); flashInfo('#albSel', `ADDED ${plural(AV.list.length, 'SONG').toUpperCase()} TO THE QUEUE`); });
$('#albSelPlay').addEventListener('click', () => { playPaths(picked(AV).map((s) => s.path)); AV.sel.clear(); renderAlbum(); });
$('#albSelQueue').addEventListener('click', () => {
  const add = picked(AV);
  enqueue(add.map((s) => s.path));
  AV.sel.clear();
  renderAlbum();
  flashInfo('#albSel', `ADDED ${plural(add.length, 'SONG').toUpperCase()} TO THE QUEUE`);
});

// ---- queue ----
function qRow(it, i, { now = false, done = false, drag = true } = {}) {
  const s = libSong(it.path) || fallbackSong(it.path);
  return `<div class="qrow ${now ? 'now' : ''} ${done ? 'done' : ''} ${s.missing ? 'missing' : ''}" data-i="${i}" data-u="${it.u ?? ''}" ${drag ? 'draggable="true"' : ''}>
    <span class="grip" title="Drag to reorder">&#8801;</span><span class="num">${now ? '&#9654;' : i + 1}</span>${artImg(s)}
    <span class="t" title="${esc(songTitle(s))}">${esc(songTitle(s))}${s.missing ? ' <em>(missing)</em>' : ''}</span><span class="d">${esc(s.artist || '')}</span>
    <span class="d r">${fmtTime(s.duration)}</span><button class="x" title="Remove">&#x2715;</button></div>`;
}
function renderQueue() {
  const curIdx = P.queue.findIndex((q) => q.u === P.cur);
  $('#nQueue').textContent = P.queue.length || '';
  if (view !== 'queue') return;
  const songs = P.queue.map((q) => libSong(q.path));
  $('#queueCount').textContent = P.queue.length ? `${plural(P.queue.length, 'SONG').toUpperCase()} // ${totalTime(songs)}${P.shuffle ? ' // SHUFFLE ON' : ''}` : '';
  $('#queueList').innerHTML = P.queue.map((q, i) => qRow(q, i, { now: q.u === P.cur, done: !P.shuffle && curIdx >= 0 && i < curIdx })).join('')
    || '<div class="empty">&gt; The queue is empty. Double-click songs in the LIBRARY, or use [ ADD TO QUEUE ].</div>';
  $('#queueSave').disabled = !P.queue.length;
  $('#queueClear').disabled = !P.queue.length;
}
// drag a row onto another to move it there. used by the queue and playlists
function wireDragList(container, onMove) {
  let from = -1;
  container.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.qrow[draggable]');
    if (!row) return;
    from = +row.dataset.i;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(from));
    row.classList.add('lifted');
  });
  container.addEventListener('dragover', (e) => {
    const row = e.target.closest('.qrow');
    if (from < 0 || !row) return;
    e.preventDefault();
    e.stopPropagation();
    $$('.qrow.drag', container).forEach((r) => r !== row && r.classList.remove('drag'));
    row.classList.add('drag');
  });
  container.addEventListener('drop', (e) => {
    const row = e.target.closest('.qrow');
    if (from < 0 || !row) return;
    e.preventDefault();
    e.stopPropagation();
    const to = +row.dataset.i;
    if (to !== from) onMove(from, to);
    from = -1;
  });
  container.addEventListener('dragend', () => {
    from = -1;
    $$('.qrow.drag, .qrow.lifted', container).forEach((r) => r.classList.remove('drag', 'lifted'));
  });
}
wireDragList($('#queueList'), (from, to) => moveInQueue(from, to));
$('#queueList').addEventListener('click', (e) => {
  const x = e.target.closest('.x');
  if (x) removeFromQueue(+x.closest('.qrow').dataset.u);
});
$('#queueList').addEventListener('dblclick', (e) => {
  const row = e.target.closest('.qrow');
  if (row && !e.target.closest('.x')) jumpTo(+row.dataset.u);
});
$('#queueClear').addEventListener('click', async () => {
  if (await ask({ title: 'CLEAR QUEUE', text: `Remove all ${P.queue.length} songs from the queue? Your files and playlists stay.`, ok: '[ CLEAR ]' })) clearQueue();
});
$('#queueSave').addEventListener('click', async () => {
  const name = await ask({ title: 'SAVE AS PLAYLIST', text: `Name for a playlist with these ${P.queue.length} songs:`, input: true, value: '', ok: '[ SAVE ]' });
  if (!name) return;
  const pl = { id: Date.now().toString(36), name, paths: P.queue.map((q) => q.path) };
  saveProfile({ playlists: [...(profile.playlists || []), pl] });
  PLV.id = pl.id;
  renderPlNav();
  $('#queueCount').textContent = `SAVED AS "${name.toUpperCase()}"`;
});

// ---- playlists ----
const PLV = { id: null };
const playlists = () => profile.playlists || [];
// auto playlists (options: AUTO PLAYLISTS): they work their songs out again every time they're shown
const AUTO_PL = [
  { id: 'auto:top', name: 'MOST PLAYED', note: "Your 50 most played songs. It keeps itself up to date, so there's nothing to edit here.", empty: 'Nothing played yet.' },
  { id: 'auto:recent', name: 'RECENTLY ADDED', note: 'Songs that landed in your music folders in the last 30 days, newest first.', empty: 'No new songs in the last 30 days.' },
  { id: 'auto:stale', name: 'NOT PLAYED LATELY', note: "Songs you've played before but not in the last 6 weeks, the ones you played most first.", empty: "Nothing yet. Songs you used to play show up here once you haven't played them for 6 weeks." },
];
function autoPaths(id) {
  const withStats = () => LIB.songs.map((s) => ({ s, r: statsSong(s.path) })).filter((x) => x.r.n > 0);
  if (id === 'auto:top') return withStats().sort((a, b) => b.r.n - a.r.n || b.r.sec - a.r.sec).slice(0, 50).map((x) => x.s.path);
  if (id === 'auto:recent') {
    const since = Date.now() - 30 * 86400000;
    return LIB.songs.filter((s) => (s.added || 0) >= since).sort((a, b) => b.added - a.added || bySongOrder(a, b)).slice(0, 100).map((s) => s.path);
  }
  if (id === 'auto:stale') {
    const before = Date.now() - 42 * 86400000;
    return withStats().filter((x) => x.r.last && x.r.last < before).sort((a, b) => b.r.n - a.r.n).slice(0, 50).map((x) => x.s.path);
  }
  return [];
}
const autoOf = (id) => {
  const a = profile.autoPl && AUTO_PL.find((x) => x.id === id);
  return a ? { ...a, paths: autoPaths(a.id), auto: true } : null;
};
const curPl = () => autoOf(PLV.id) || playlists().find((p) => p.id === PLV.id) || playlists()[0] || null;
function updatePl(id, patch) {
  saveProfile({ playlists: playlists().map((p) => (p.id === id ? { ...p, ...patch } : p)) });
}
function renderPlNav() {
  const list = playlists();
  $('#nPl').textContent = list.length || '';
  $('#navPl').innerHTML = list.map((p) => `<div class="nav sub ${view === 'pl' && curPl()?.id === p.id ? 'on' : ''}" data-pl="${p.id}" title="${esc(p.name)}">${esc(p.name)}</div>`).join('')
    + (profile.autoPl ? AUTO_PL.map((a) => `<div class="nav sub autop ${view === 'pl' && PLV.id === a.id ? 'on' : ''}" data-pl="${a.id}" title="${esc(a.note)}">${a.name}</div>`).join('') : '');
  if (view === 'pl') renderPl();
}
$('#navPl').addEventListener('click', (e) => {
  const n = e.target.closest('[data-pl]');
  if (!n) return;
  PLV.id = n.dataset.pl;
  showView('pl');
});
function renderPl() {
  const list = playlists();
  const pl = curPl();
  PLV.id = pl?.id || null;
  $$('#navPl .nav').forEach((n) => n.classList.toggle('on', n.dataset.pl === PLV.id));
  $('#plList').innerHTML = list.map((p) => `<div class="g ${p.id === PLV.id ? 'on' : ''}" data-id="${p.id}"><span title="${esc(p.name)}">${esc(p.name)}</span><span class="n">${p.paths.length}</span></div>`).join('')
    + (profile.autoPl ? AUTO_PL.map((a) => `<div class="g autop ${a.id === PLV.id ? 'on' : ''}" data-id="${a.id}" title="${esc(a.note)}"><span>${a.name}</span><span class="n">${autoPaths(a.id).length}</span></div>`).join('') : '');
  $('[data-view="pl"] .ptitle span').textContent = pl?.auto ? `APERTURE TUNES // AUTO PLAYLIST // ${pl.name}` : 'APERTURE TUNES // PLAYLISTS';
  ['#plRename', '#plDelete', '#plPlay'].forEach((s) => ($(s).disabled = !pl));
  $('#plRename').hidden = $('#plDelete').hidden = !!pl?.auto;
  $('#plSaveAuto').hidden = !pl?.auto;
  $('#plSongs').classList.toggle('auto', !!pl?.auto);
  if (!pl) {
    $('#plSongs').innerHTML = '<div class="empty">&gt; No playlists yet. Fill the QUEUE, then use [ SAVE AS PLAYLIST ].</div>';
    $('#plInfo').textContent = '';
    return;
  }
  // auto playlists can't be edited by hand: no dragging, no removing
  $('#plSongs').innerHTML = (pl.auto ? `<div class="autonote">${esc(pl.note)}</div>` : '')
    + (pl.paths.map((p, i) => qRow({ path: p }, i, { drag: !pl.auto })).join('') || `<div class="empty">&gt; ${pl.auto ? esc(pl.empty) : 'This playlist is empty.'}</div>`);
  $('#plInfo').textContent = `${pl.name.toUpperCase()} // ${plural(pl.paths.length, 'SONG').toUpperCase()} // ${totalTime(pl.paths.map(libSong))}${pl.auto ? ' // UPDATES BY ITSELF' : ''}`;
  $('#plPlay').disabled = !pl.paths.length;
  $('#plSaveAuto').disabled = !pl.paths.length;
}
$('#plList').addEventListener('click', (e) => {
  const g = e.target.closest('.g');
  if (!g) return;
  PLV.id = g.dataset.id;
  renderPlNav();
});
wireDragList($('#plSongs'), (from, to) => {
  const pl = curPl();
  if (pl.auto) return renderPl();
  const paths = [...pl.paths];
  const [p] = paths.splice(from, 1);
  paths.splice(to, 0, p);
  updatePl(pl.id, { paths });
  renderPl();
});
$('#plSongs').addEventListener('click', (e) => {
  const x = e.target.closest('.x');
  if (!x) return;
  const pl = curPl();
  if (pl.auto) return;
  updatePl(pl.id, { paths: pl.paths.filter((_, i) => i !== +x.closest('.qrow').dataset.i) });
  renderPlNav();
});
// an auto playlist can be kept as a normal one, as it is right now
$('#plSaveAuto').addEventListener('click', async () => {
  const pl = curPl();
  if (!pl?.auto || !pl.paths.length) return;
  const name = await ask({ title: 'SAVE AS PLAYLIST', text: `Name for a playlist with these ${pl.paths.length} songs (it won't change by itself after this):`, input: true, value: `${pl.name[0]}${pl.name.slice(1).toLowerCase()} ${fmtDay(Date.now())}`, ok: '[ SAVE ]' });
  if (!name) return;
  const np = { id: Date.now().toString(36), name, paths: [...pl.paths] };
  saveProfile({ playlists: [...playlists(), np] });
  PLV.id = np.id;
  renderPlNav();
});
// double-click a song: the playlist replaces the queue and starts from that song
$('#plSongs').addEventListener('dblclick', (e) => {
  const row = e.target.closest('.qrow');
  if (!row || e.target.closest('.x')) return;
  playPaths(curPl().paths);
  jumpTo(P.queue[+row.dataset.i].u);
});
$('#plPlay').addEventListener('click', () => {
  const pl = curPl();
  if (pl?.paths.length) playPaths(pl.paths);
});
$('#plRename').addEventListener('click', async () => {
  const pl = curPl();
  const name = await ask({ title: 'RENAME PLAYLIST', text: 'New name:', input: true, value: pl.name, ok: '[ RENAME ]' });
  if (!name) return;
  updatePl(pl.id, { name });
  renderPlNav();
});
$('#plDelete').addEventListener('click', async () => {
  const pl = curPl();
  if (!(await ask({ title: 'DELETE PLAYLIST', text: `Delete "${pl.name}"? Only the playlist goes, your songs stay on your PC.`, ok: '[ DELETE ]' }))) return;
  saveProfile({ playlists: playlists().filter((p) => p.id !== pl.id) });
  PLV.id = null;
  renderPlNav();
});

// ---- keeping the visible screen up to date ----
function renderCurrent() {
  if (view === 'lib' || view === 'needs') renderLib();
  else if (view === 'album') renderAlbum();
  else if (view === 'pl') renderPl();
  renderQueue();
  drawLibCount();
}
document.addEventListener('view', (e) => {
  const v = e.detail;
  if (v === 'lib' || v === 'needs') {
    if (LV.needs !== (v === 'needs')) LV.sel.clear();
    LV.needs = v === 'needs';
  }
  renderCurrent();
  if (v === 'pl') renderPlNav();
});
document.addEventListener('player', (e) => {
  renderQueue();
  // only the playing marker changes, so tables re-render only when the song changed
  if (e.detail.track) {
    if (view === 'lib' || view === 'needs') renderLib();
    else if (view === 'album') renderAlbum();
  }
});

// ---- tags of the selected song, on the side of the library and album page ----
function tagSide(el, state) {
  if (!el || el.hidden) return;
  const list = state.list.filter((s) => state.sel.has(s.path));
  const head = '<div class="ts-h">TAGS</div>';
  if (!list.length) {
    el.innerHTML = `${head}<div class="ts-body"><div class="ts-empty">&gt; Select a song to see its tags here.</div></div>`;
    return;
  }
  if (list.length > 1) {
    el.innerHTML = `${head}<div class="ts-body"><div class="tgrid"><div class="tg w"><span>SELECTED</span>${plural(list.length, 'SONG').toUpperCase()}</div>
      <div class="tg"><span>LENGTH</span>${totalTime(list)}</div><div class="tg"><span>ALBUMS</span>${new Set(list.map(albumKey)).size}</div></div>
      <div class="ts-empty">&gt; Select one song to see its tags.</div></div>`;
    return;
  }
  const s = list[0];
  const must = (x) => (x ? esc(x) : '<em class="miss">MISSING</em>'); // every song should have these
  const opt = (x) => (x ? esc(x) : '<em class="none">--</em>');
  const nOf = (n, of) => (n ? `${n}${of ? ` OF ${of}` : ''}` : '<em class="none">--</em>');
  el.innerHTML = `${head}<div class="ts-body">${artImg(s)}
    <div class="tgrid">
      <div class="tg w"><span>TITLE</span>${must(s.title)}</div>
      <div class="tg w"><span>ARTIST</span>${must(s.artist)}</div>
      <div class="tg w"><span>ALBUM ARTIST</span>${opt(s.albumArtist)}</div>
      <div class="tg w"><span>ALBUM</span>${must(s.album)}</div>
      <div class="tg"><span>TRACK</span>${nOf(s.track, s.trackOf)}</div><div class="tg"><span>DISC</span>${nOf(s.disc, s.discOf)}</div>
      <div class="tg"><span>YEAR</span>${opt(s.year)}</div><div class="tg"><span>GENRE</span>${opt(s.genre)}</div>
      <div class="tg"><span>LENGTH</span>${fmtTime(s.duration)}</div><div class="tg"><span>COVER ART</span>${s.cover ? 'YES' : '<em class="miss">MISSING</em>'}</div>
      <div class="tg w"><span>FILE</span>${esc(s.path.split(/[\\/]/).pop())}</div>
    </div></div>
    <div class="acts"><button class="cmd" data-act="all">[ ALL TAGS ]</button><button class="cmd" data-act="edit">[ EDIT TAGS ]</button></div>`;
  el.querySelector('[data-act="all"]').onclick = () => showTags(s);
  el.querySelector('[data-act="edit"]').onclick = () => handEdit([s.path]);
}
$('#libTagsOn').checked = true;
$('#libTagsOn').addEventListener('change', (e) => { saveProfile({ showTags: e.target.checked }); renderLib(); if (view === 'album') drawAlbumFoot(); });

// ---- view tags: everything that's written in the file right now, without going through the tagger ----
async function showTags(s) {
  $('.dlg.pop')?.remove();
  let data;
  try {
    const res = await fetch(`/api/tags/${s.id}`);
    data = await res.json();
    if (!res.ok) throw new Error(data.error);
  } catch (e) {
    return ask({ title: 'VIEW TAGS', text: `Couldn't read that file: ${e.message}`, ok: '[ OK ]' });
  }
  // the basics always show, even when empty, so you can see what's missing
  const MUST = ['TITLE', 'ARTIST', 'ALBUM', 'TRACK', 'YEAR', 'GENRE', 'COVER ART'];
  const tags = data.tags.filter(([k, v]) => v || MUST.includes(k))
    .map(([k, v]) => `<span>${k}</span>${v ? `<b>${esc(v)}</b>` : '<b class="miss">MISSING</b>'}`).join('');
  const file = data.file.map(([k, v]) => `<span>${k}</span><b class="file">${esc(v)}</b>`).join('');
  const folder = data.file.find(([k]) => k === 'FOLDER')?.[1];
  screen.insertAdjacentHTML('beforeend', `<div class="dlg pop" id="tagDlg"><div class="dlgbox wide">
    <div class="t">APERTURE TUNES // SPECIMEN TAGS</div>
    <div class="b"><div class="sshead">${artImg(s, 'big')}<div style="min-width:0;flex:1">
      <div class="sst" title="${esc(songTitle(s))}">${esc(songTitle(s))}</div><div class="dim">${esc(s.artist || 'Unknown Artist')} // ${esc(s.album || 'Unknown Album')}</div>
      <div class="tsec" style="margin-top:10px">WHAT'S WRITTEN IN THE FILE</div></div></div>
      <div class="tlist">${tags}</div>
      <div class="tsec">THE FILE ITSELF</div>
      <div class="tlist">${file}</div>
      <div class="act">${desktop && folder ? '<button class="cmd" id="tagFolder">[ OPEN FOLDER ]</button>' : ''}<button class="cmd" id="tagEdit">[ EDIT TAGS ]</button><button class="cmd hot" id="tagClose">[ CLOSE ]</button></div></div></div></div>`);
  const close = () => $('#tagDlg')?.remove();
  $('#tagClose').addEventListener('click', close);
  $('#tagDlg').addEventListener('click', (e) => { if (e.target.id === 'tagDlg') close(); });
  $('#tagEdit').addEventListener('click', () => { close(); handEdit([s.path]); });
  $('#tagFolder')?.addEventListener('click', () => window.aperture.openPath(folder));
}

// ---- edit tags by hand. [ AUTO-TAG ] under the cover sends the songs to the tagger instead ----
// with several songs, a box shows the value when they all have the same one. otherwise it's empty
// ("KEEP") and every song keeps its own unless you type something in it
const NUM_KEYS = ['track', 'trackOf', 'disc', 'discOf'];
function handEdit(paths) {
  const all = paths.map(libSong).filter(Boolean);
  const list = all.filter((s) => TAGGABLE.test(s.ext));
  if (!list.length) return ask({ title: 'EDIT TAGS', text: 'Tags can only be edited in MP3, FLAC and M4A files.', ok: '[ OK ]' });
  $('.dlg.pop')?.remove();
  const one = list.length === 1, s = list[0];
  const same = (k) => { const v = list.map((x) => String(x[k] ?? '')); return v.every((y) => y === v[0]) ? v[0] : null; };
  const orig = {};
  const input = (k, ph) => {
    orig[k] = same(k) ?? '';
    const mixed = same(k) === null;
    return `<input data-k="${k}" value="${esc(orig[k])}" spellcheck="false"${NUM_KEYS.includes(k) || k === 'year' ? ' inputmode="numeric"' : ''}${mixed ? ` placeholder="${ph}"` : ''}>`;
  };
  const box = (k, label, cls) => `<label class="${cls}"><span>${label}</span>${input(k, 'DIFFERENT IN EACH // KEEP')}</label>`;
  const pair = (a, b, label, cls) => `<label class="${cls}"><span>${label}</span><div class="of">${input(a, 'KEEP')}<i>OF</i>${input(b, 'KEEP')}</div></label>`;
  const fields = (one ? box('title', 'TITLE', 's6') : '') + box('artist', 'ARTIST', 's3') + box('albumArtist', 'ALBUM ARTIST', 's3') + box('album', 'ALBUM', 's6')
    + (one ? pair('track', 'trackOf', 'TRACK', 's2') : `<label class="s2"><span>TRACKS ON ALBUM</span>${input('trackOf', 'KEEP')}</label>`)
    + pair('disc', 'discOf', 'DISC', 's2') + box('year', 'YEAR', 's2') + box('genre', 'GENRE', 's6');
  const covers = new Set(list.map((x) => x.cover || ''));
  const coverInfo = covers.size > 1 ? 'DIFFERENT COVERS' : !s.cover ? '<em class="miss">NO COVER</em>' : one ? '' : `SAME COVER ON ALL ${list.length}`;
  const left = all.length - list.length;
  const notes = [
    one ? 'Saves into the file itself. The file name stays the same, and the song is updated in your library right away.'
      : 'Boxes that say KEEP are different in each song, leave them empty and every song keeps its own.',
    one ? '' : 'Titles and track numbers belong to each song on its own. Edit one song to change those.',
    left ? `${plural(left, 'song')} ${left === 1 ? "isn't" : "aren't"} MP3 or FLAC and ${left === 1 ? 'is' : 'are'} left out.` : '',
  ].filter(Boolean).map((t) => `&gt; ${t}`).join('<br>');
  screen.insertAdjacentHTML('beforeend', `<div class="dlg pop" id="handDlg"><div class="dlgbox xwide">
    <div class="t">APERTURE TUNES // EDIT TAGS${one ? '' : ` // ${plural(list.length, 'SONG').toUpperCase()}`}</div>
    <div class="b"><div class="hand">
      <div class="coverbox">${artImg(s, 'big')}<div class="ci2" id="handCover">${coverInfo}</div>
        <button class="cmd" id="handAuto" title="Let the tagger look ${one ? 'it' : 'them'} up online and fill everything in">[ AUTO-TAG ]</button></div>
      <div class="grid6">${fields}</div></div>
      <div class="note">${notes}</div><div class="warn" id="handWarn" hidden></div>
      <div class="act"><button class="cmd" id="handCancel">[ CANCEL ]</button><button class="cmd hot" id="handSave" disabled>[ SAVE ]</button></div></div></div></div>`);
  const dlg = $('#handDlg');
  const close = () => dlg.remove();
  // the cover's format and size, read from the file
  if (one && s.cover) fetch(`/api/tags/${s.id}`).then((r) => r.json()).then((d) => {
    const c = d.tags?.find(([k]) => k === 'COVER ART')?.[1];
    if (c && $('#handCover')) $('#handCover').textContent = c;
  }).catch(() => {});

  const changes = () => {
    const out = {};
    for (const inp of dlg.querySelectorAll('input[data-k]')) if (inp.value.trim() !== orig[inp.dataset.k]) out[inp.dataset.k] = inp.value.trim();
    return out;
  };
  const problem = (c) => {
    const bad = Object.keys(c).find((k) => NUM_KEYS.includes(k) && !/^\d*$/.test(c[k]));
    if (bad) return `${bad.startsWith('disc') ? 'DISC' : 'TRACK'} numbers can only be numbers.`;
    if ('year' in c && !/^(\d{4})?$/.test(c.year)) return 'YEAR needs to be 4 numbers, like 2019.';
    return '';
  };
  const update = () => {
    const c = changes();
    for (const lab of dlg.querySelectorAll('.grid6 label')) lab.classList.toggle('chg', [...lab.querySelectorAll('input')].some((i) => i.dataset.k in c));
    const why = problem(c);
    $('#handWarn').textContent = why;
    $('#handWarn').hidden = !why;
    $('#handSave').disabled = !Object.keys(c).length || !!why;
  };
  const saveIt = async () => {
    const c = changes();
    if ($('#handSave').disabled) return;
    $('#handSave').disabled = true;
    $('#handSave').textContent = '[ SAVING... ]';
    let res;
    try {
      res = await (await fetch('/api/edit-tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: list.map((x) => x.id), changes: c }) })).json();
    } catch (e) {
      res = { songs: [], failed: [{ name: 'Aperture Tunes', error: e.message }] };
    }
    // swap the re-read songs into the library so every screen shows the new tags
    if (res.songs?.length) {
      const fresh = new Map(res.songs.map((x) => [x.path, x]));
      setLibrary(LIB.songs.map((x) => fresh.get(x.path) || x));
    }
    close();
    if (res.failed?.length) {
      return ask({ title: 'EDIT TAGS', text: `${res.songs.length ? `Saved ${plural(res.songs.length, 'song')}, but ` : ''}${plural(res.failed.length, 'song')} couldn't be saved: ${res.failed.slice(0, 3).map((f) => `${f.name} (${f.error})`).join(', ')}${res.failed.length > 3 ? '...' : ''}`, ok: '[ OK ]' });
    }
    toast(`TAGS SAVED TO ${songsWord(res.songs.length)}`);
  };
  dlg.addEventListener('input', update);
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) saveIt(); });
  $('#handSave').addEventListener('click', saveIt);
  $('#handCancel').addEventListener('click', close);
  $('#handAuto').addEventListener('click', () => { close(); sendToTagger(list.map((x) => x.path)); });
}
