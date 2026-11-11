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
// only mp3/flac, because those are the ones the tagger can fix
const needsTag = (s) => (s.ext === 'MP3' || s.ext === 'FLAC') && (!s.title || !s.artist || !s.album || /^unknown/i.test(s.album) || /^unknown/i.test(s.artist));
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
// click ticks a song, shift-click ticks a range, double-click plays it (or queues it if something's playing)
function wireTable(container, state, onChange) {
  container.addEventListener('click', (e) => {
    const row = e.target.closest('.trow[data-i]');
    if (!row) return;
    const i = +row.dataset.i;
    const s = state.list[i];
    if (e.shiftKey && state.anchor >= 0) {
      const on = !state.sel.has(s.path);
      const [a, b] = [Math.min(state.anchor, i), Math.max(state.anchor, i)];
      for (const x of state.list.slice(a, b + 1)) on ? state.sel.add(x.path) : state.sel.delete(x.path);
    } else {
      state.sel.has(s.path) ? state.sel.delete(s.path) : state.sel.add(s.path);
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
const curPl = () => playlists().find((p) => p.id === PLV.id) || playlists()[0] || null;
function updatePl(id, patch) {
  saveProfile({ playlists: playlists().map((p) => (p.id === id ? { ...p, ...patch } : p)) });
}
function renderPlNav() {
  const list = playlists();
  $('#nPl').textContent = list.length || '';
  $('#navPl').innerHTML = list.map((p) => `<div class="nav sub ${view === 'pl' && curPl()?.id === p.id ? 'on' : ''}" data-pl="${p.id}" title="${esc(p.name)}">${esc(p.name)}</div>`).join('');
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
  $('#plList').innerHTML = list.map((p) => `<div class="g ${p.id === PLV.id ? 'on' : ''}" data-id="${p.id}"><span title="${esc(p.name)}">${esc(p.name)}</span><span class="n">${p.paths.length}</span></div>`).join('');
  ['#plRename', '#plDelete', '#plPlay'].forEach((s) => ($(s).disabled = !pl));
  if (!pl) {
    $('#plSongs').innerHTML = '<div class="empty">&gt; No playlists yet. Fill the QUEUE, then use [ SAVE AS PLAYLIST ].</div>';
    $('#plInfo').textContent = '';
    return;
  }
  $('#plSongs').innerHTML = pl.paths.map((p, i) => qRow({ path: p }, i)).join('') || '<div class="empty">&gt; This playlist is empty.</div>';
  $('#plInfo').textContent = `${pl.name.toUpperCase()} // ${plural(pl.paths.length, 'SONG').toUpperCase()} // ${totalTime(pl.paths.map(libSong))}`;
  $('#plPlay').disabled = !pl.paths.length;
}
$('#plList').addEventListener('click', (e) => {
  const g = e.target.closest('.g');
  if (!g) return;
  PLV.id = g.dataset.id;
  renderPlNav();
});
wireDragList($('#plSongs'), (from, to) => {
  const pl = curPl();
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
  updatePl(pl.id, { paths: pl.paths.filter((_, i) => i !== +x.closest('.qrow').dataset.i) });
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
