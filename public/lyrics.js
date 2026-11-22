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
  // in a narrow panel the "DOWNLOADED FROM" part gets left out, so the label and its button still fit
  const from = d?.source === 'file' ? 'FROM THE FILE' : '<span class="long">DOWNLOADED FROM </span>LRCLIB';
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
  // synced ones can be moved a little when this song's timing is off
  const nudge = d?.synced?.length ? `<span class="lnudge" title="Lyrics too early or too late? Move them for this song"><button class="cmd" data-nudge="-0.1" title="Show the lines sooner">[ ◄ ]</button><b id="lyNudge">${lyrNudgeTxt()}</b><button class="cmd" data-nudge="0.1" title="Show the lines later">[ ► ]</button></span>` : '';
  return `<div class="lyr"><div class="sk"><span>LYRICS</span>${nudge}<span class="src">${src}</span></div>${body}</div>`;
}
// how much this song's lyrics are moved: + is later, − is sooner. kept per song
const lyrNudge = () => (profile.lyrNudge || {})[LY.id] || 0;
const lyrNudgeTxt = () => { const n = lyrNudge(); return n ? `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(1)} S` : 'ON TIME'; };
$('#npBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-nudge]');
  if (!b || !LY.id) return;
  const n = Math.round((lyrNudge() + +b.dataset.nudge) * 10) / 10;
  const all = { ...(profile.lyrNudge || {}) };
  if (Math.abs(n) < 0.05) delete all[LY.id]; else all[LY.id] = Math.max(-10, Math.min(10, n));
  saveProfile({ lyrNudge: all });
  const lbl = $('#lyNudge');
  if (lbl) lbl.textContent = lyrNudgeTxt();
  LY.idx = -2;
});
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
  // the player's clock runs ahead of what you actually hear by the sound card's delay, so that gets taken off (the
  // lines used to switch a little before the words came). then this song's own nudge
  const lag = ac ? (ac.outputLatency || 0) + (ac.baseLatency || 0) : 0;
  const t = (decks[A].currentTime || 0) - lag - lyrNudge();
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
