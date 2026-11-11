// right-click menus for songs and albums, plus a small message that pops up in the corner
function toast(msg) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    screen.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 1800);
}

// items: [{ label, hint, act, sub }] or '-' for a line. sub is a function returning more items
function closeMenus() { $$('.ctx').forEach((m) => m.remove()); }
function openMenu(x, y, title, items, parent = null) {
  if (!parent) closeMenus();
  const m = document.createElement('div');
  m.className = 'ctx';
  m.innerHTML = (title ? `<div class="ct">${esc(title)}</div>` : '') + items.map((it, i) => (it === '-' ? '<div class="sep"></div>'
    : `<div class="ci ${it.sub ? 'has' : ''}" data-i="${i}"><span>${esc(it.label)}</span>${it.sub ? '<small>&#9656;</small>' : it.hint ? `<small>${esc(it.hint)}</small>` : ''}</div>`)).join('');
  screen.appendChild(m);
  // keep it inside the window
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 6))}px`;
  m.style.top = `${Math.max(4, Math.min(y, innerHeight - r.height - 6))}px`;
  if (parent) parent.child = m;
  m.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.ci');
    if (!row || row.dataset.open) return;
    if (m.child) { m.child.remove(); m.child = null; $$('.ci[data-open]', m).forEach((c) => delete c.dataset.open); }
    const it = items[+row.dataset.i];
    if (it.sub) {
      row.dataset.open = '1';
      const rr = row.getBoundingClientRect();
      const sm = openMenu(rr.right + 2, rr.top - 5, '', it.sub(), m);
      if (sm.getBoundingClientRect().left < rr.right) sm.style.left = `${rr.left - sm.offsetWidth - 2}px`; // no room on the right
    }
  });
  m.addEventListener('click', (e) => {
    const row = e.target.closest('.ci');
    if (!row) return;
    const it = items[+row.dataset.i];
    if (it.sub) return;
    closeMenus();
    it.act?.();
  });
  return m;
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('.ctx')) closeMenus(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
window.addEventListener('blur', closeMenus);
document.addEventListener('scroll', closeMenus, true);

// ---- what the menu items do ----
// puts songs right after the one that's playing (in shuffle too)
function insertNext(paths) {
  const add = paths.map(newItem);
  const ci = P.queue.findIndex((q) => q.u === P.cur);
  P.queue.splice(ci + 1, 0, ...add);
  if (P.shuffle) {
    const si = P.shuffled.indexOf(P.cur);
    P.shuffled.splice(si + 1, 0, ...add.map((a) => a.u));
  }
  changed();
  return add;
}
function playNowPaths(paths) {
  const add = insertNext(paths);
  if (add.length) jumpTo(add[0].u);
}
const albumSongs = (key) => LIB.songs.filter((s) => albumKey(s) === key)
  .sort((a, b) => (a.disc || 1) - (b.disc || 1) || (a.track || 999) - (b.track || 999) || cmp(songTitle(a), songTitle(b)));
const songsWord = (n) => plural(n, 'SONG').toUpperCase();

function playlistSub(paths) {
  const add = (pl) => {
    const known = new Set(pl.paths.map((p) => p.toLowerCase()));
    const fresh = paths.filter((p) => !known.has(p.toLowerCase()));
    updatePl(pl.id, { paths: [...pl.paths, ...fresh] });
    renderPlNav();
    toast(fresh.length ? `ADDED ${songsWord(fresh.length)} TO "${pl.name.toUpperCase()}"` : `ALREADY IN "${pl.name.toUpperCase()}"`);
  };
  return () => [
    ...playlists().map((pl) => ({ label: pl.name, act: () => add(pl) })),
    ...(playlists().length ? ['-'] : []),
    { label: '+ NEW PLAYLIST...', act: async () => {
      const name = await ask({ title: 'NEW PLAYLIST', text: `Name for a playlist with ${paths.length === 1 ? 'this song' : `these ${paths.length} songs`}:`, input: true, ok: '[ SAVE ]' });
      if (!name) return;
      saveProfile({ playlists: [...playlists(), { id: Date.now().toString(36), name, paths: [...paths] }] });
      renderPlNav();
      toast(`SAVED AS "${name.toUpperCase()}"`);
    } },
  ];
}

function songMenu(songs, extra = []) {
  const paths = songs.map((s) => s.path);
  const one = songs.length === 1 ? songs[0] : null;
  const items = [
    { label: 'PLAY NOW', act: () => playNowPaths(paths) },
    { label: 'PLAY NEXT', act: () => { insertNext(paths); toast(`${songsWord(paths.length)} UP NEXT`); } },
    { label: 'ADD TO QUEUE', act: () => { enqueue(paths); toast(`ADDED ${songsWord(paths.length)} TO THE QUEUE`); } },
    { label: 'ADD TO PLAYLIST', sub: playlistSub(paths) },
  ];
  if (one && !one.missing) {
    items.push('-',
      { label: 'PLAY ALBUM', act: () => playPaths(albumSongs(albumKey(one)).map((s) => s.path)) },
      { label: 'GO TO ALBUM', act: () => openAlbum(albumKey(one)) },
      '-',
      { label: 'VIEW STATISTICS', act: () => showSongStats(one) });
  } else items.push('-');
  items.push({ label: 'EDIT TAGS', hint: one ? 'IN TAGGER' : songsWord(paths.length), act: () => sendToTagger(paths) });
  if (extra.length) items.push('-', ...extra);
  const title = one ? `${songTitle(one)} // ${one.artist || 'Unknown Artist'}` : `${songsWord(songs.length)} SELECTED`;
  return { title: title.toUpperCase(), items };
}
function albumMenu(key) {
  const songs = albumSongs(key);
  if (!songs.length) return null;
  const paths = songs.map((s) => s.path);
  return {
    title: `${songs[0].album || 'Unknown Album'} // ${artistOf(songs[0])}`.toUpperCase(),
    items: [
      { label: 'PLAY ALBUM', act: () => playPaths(paths) },
      { label: 'SHUFFLE ALBUM', act: () => playPaths(paths, { shuffle: true }) },
      { label: 'PLAY NEXT', act: () => { insertNext(paths); toast(`${songsWord(paths.length)} UP NEXT`); } },
      { label: 'ADD TO QUEUE', act: () => { enqueue(paths); toast(`ADDED ${songsWord(paths.length)} TO THE QUEUE`); } },
      { label: 'ADD TO PLAYLIST', sub: playlistSub(paths) },
      '-',
      { label: 'VIEW STATISTICS', act: () => showAlbumStats(key) },
      { label: 'EDIT TAGS', hint: songsWord(paths.length), act: () => sendToTagger(paths) },
    ],
  };
}

// a right-clicked row that's part of the ticked songs acts on all of them
function rowSongs(state, i) {
  const s = state.list[i];
  return state.sel.has(s.path) && state.sel.size > 1 ? picked(state) : [s];
}
document.addEventListener('contextmenu', (e) => {
  const t = e.target;
  let menu = null;
  const trow = t.closest('.trow[data-i]');
  const tile = t.closest('#libGrid .tile[data-key]');
  const group = t.closest('#libGroups .g[data-key]');
  const qrow = t.closest('#queueList .qrow[data-u]');
  const prow = t.closest('#plSongs .qrow[data-i]');
  const up = t.closest('.upnext .row[data-u]');
  if (trow) {
    const state = trow.closest('#albSongs') ? AV : LV;
    menu = songMenu(rowSongs(state, +trow.dataset.i));
  } else if (tile) menu = albumMenu(tile.dataset.key);
  else if (group && LV.tab === 'albums') menu = albumMenu(group.dataset.key);
  else if (qrow || up) {
    const u = +(qrow || up).dataset.u;
    const it = itemOf(u);
    if (it) menu = songMenu([libSong(it.path) || fallbackSong(it.path)], [{ label: 'REMOVE FROM QUEUE', act: () => removeFromQueue(u) }]);
  } else if (prow) {
    const pl = curPl();
    const i = +prow.dataset.i;
    const p = pl?.paths[i];
    if (p) menu = songMenu([libSong(p) || fallbackSong(p)], [{ label: 'REMOVE FROM PLAYLIST', act: () => { updatePl(pl.id, { paths: pl.paths.filter((_, j) => j !== i) }); renderPlNav(); } }]);
  }
  e.preventDefault();
  if (menu) openMenu(e.clientX, e.clientY, menu.title, menu.items);
  else closeMenus();
});
