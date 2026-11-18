// lyrics under the song on NOW PLAYING (options: UNDER THE SONG // LYRICS). synced lyrics light up the line
// being sung and scroll along, click a line to jump there. plain lyrics are just text you can scroll
const LY = { id: null, data: null, idx: -1 };

function lyricsFor(s) {
  const id = s && libSong(s.path)?.id;
  if (!id) { LY.id = null; LY.data = { source: 'none' }; return; }
  if (LY.id === id) return;
  LY.id = id;
  LY.data = null;
  LY.idx = -1;
  fetch(`/api/lyrics/${id}?dl=${profile.lyricsDl !== false ? 1 : 0}`)
    .then((r) => r.json())
    .catch(() => ({ source: 'none', offline: true }))
    .then((d) => {
      if (LY.id !== id) return;
      LY.data = d;
      const el = $('#npBody .lyrside');
      if (el) { el.innerHTML = lyricsHtml(); LY.idx = -1; }
    });
}

function lyricsHtml() {
  lyricsFor(currentSong());
  const d = LY.data;
  const from = d?.source === 'file' ? 'FROM THE FILE' : 'DOWNLOADED FROM LRCLIB';
  let src = '', body;
  if (!d) body = '<div class="msg">&gt; LOOKING FOR LYRICS<span class="cursor">_</span></div>';
  else if (d.instrumental) body = '<div class="msg">&gt; INSTRUMENTAL. NO WORDS IN THIS ONE.</div>';
  else if (d.synced?.length) {
    src = `SYNCED // ${from}`;
    body = `<div class="lview"><div class="lines synced">${d.synced.map((l, i) => `<div class="l${l.text ? '' : ' gap'}" data-li="${i}" title="Jump here">${l.text ? esc(l.text) : '~ ~ ~'}</div>`).join('')}</div></div>`;
  } else if (d.plain) {
    src = `NOT SYNCED // ${from}`;
    body = `<div class="lview plain"><div class="lines">${d.plain.split(/\r?\n/).map((l) => `<div class="l${l.trim() ? '' : ' gap'}">${l.trim() ? esc(l) : '&nbsp;'}</div>`).join('')}</div></div>`;
  } else {
    body = `<div class="msg">&gt; ${d.offline ? 'NO LYRICS IN THE FILE, AND NO INTERNET TO LOOK THEM UP.' : d.off ? 'NO LYRICS IN THE FILE. DOWNLOADING THEM IS OFF IN OPTIONS.' : 'NO LYRICS FOUND FOR THIS SONG.'}</div>`;
  }
  // downloaded ones can be saved into the song's own file, so other apps (like the one on your phone) show them too
  const s = currentSong();
  if (src && d.source === 'lrclib' && s && TAGGABLE.test(libSong(s.path)?.ext || '')) {
    src += LY.saved === LY.id ? '<span class="saved">SAVED IN THE FILE</span>'
      : `<button class="cmd savel" id="lySave" title="Writes them into the song's file, so other music apps (like the one on your phone) show them too">[ SAVE TO FILE ]</button>`;
  }
  return `<div class="lyr"><div class="sk"><span>LYRICS</span><span class="src">${src}</span></div>${body}</div>`;
}
$('#npBody').addEventListener('click', async (e) => {
  const b = e.target.closest('#lySave');
  if (!b || !LY.id) return;
  b.disabled = true;
  b.textContent = '[ SAVING... ]';
  const id = LY.id;
  try {
    const r = await (await fetch(`/api/lyrics/${id}/save`, { method: 'POST' })).json();
    if (!r.ok) throw new Error(r.error || 'failed');
    LY.saved = id;
    if (LY.id === id) b.outerHTML = '<span class="saved">SAVED IN THE FILE</span>';
    toast('> LYRICS SAVED INTO THE SONG FILE');
  } catch (err) {
    b.disabled = false;
    b.textContent = '[ SAVE TO FILE ]';
    ask({ title: 'SAVE LYRICS', text: `Couldn't save the lyrics into the file: ${err.message}`, ok: '[ OK ]' });
  }
});

// runs every frame with the visualizer: moves the light to the line being sung
function drawLyrics() {
  const lines = LY.data?.synced;
  if (!lines?.length) return;
  const box = $('#npBody .lyr .lview'), list = $('#npBody .lyr .lines.synced');
  if (!box || !list) return;
  // a hair early, so the line lights up as the singer comes in
  const t = (decks[A].currentTime || 0) + 0.2;
  let lo = 0, hi = lines.length - 1, i = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (lines[m].t <= t) { i = m; lo = m + 1; } else hi = m - 1; }
  const h = box.clientHeight;
  if (i === LY.idx && +list.dataset.h === h) return;
  LY.idx = i;
  list.dataset.h = h;
  [...list.children].forEach((el, j) => {
    el.classList.toggle('past', j < i);
    el.classList.toggle('now', j === i);
  });
  const cur = list.children[Math.max(0, i)];
  const y = i < 0 ? 0 : Math.max(0, cur.offsetTop - h * 0.35);
  list.style.transform = `translateY(${-y}px)`;
}

$('#npBody').addEventListener('click', (e) => {
  const l = e.target.closest('.lyr .lines.synced .l[data-li]');
  const line = l && LY.data?.synced?.[+l.dataset.li];
  const el = decks[A];
  if (!line || !el.duration) return;
  seekTo(clamp(line.t / el.duration, 0, 0.999));
  LY.idx = -2;
});
