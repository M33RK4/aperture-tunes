// same loudness (options: SAME LOUDNESS): every song gets measured once, the way streaming services do it
// (ITU BS.1770 loudness, in LUFS), and turned up or down so they all play at about the same volume.
// the next song in the queue gets measured while the current one plays, so it's ready when it starts.
// a song is never turned up past where its loudest peak would clip
// -12 LUFS: loud enough that turning it on doesn't make everything feel much quieter
const LOUD = { map: new Map(), busy: false, todo: [], target: -12 };

async function initLoudness() {
  try { for (const [id, v] of Object.entries(await (await fetch('/api/loudness')).json())) LOUD.map.set(id, v); } catch {}
}
const loudOn = () => profile.sameLoudness !== false;

// how much to turn a song up or down (as a volume multiplier), or null if it isn't measured yet
function loudGain(path) {
  const id = libSong(path)?.id, m = id && LOUD.map.get(id);
  if (!m || !Number.isFinite(m.lufs)) return null;
  const headroom = -20 * Math.log10(Math.max(m.peak || 1, 1e-4)) - 0.5;
  const db = clamp(Math.min(LOUD.target - m.lufs, headroom), -15, 9);
  return Math.pow(10, db / 20);
}

// sets a deck's level for the song that's on it (gently if it's already playing)
function loudApply(deck, path, ramp = 0) {
  const g = normGain[deck];
  if (!g || !ac) return;
  const want = loudOn() ? loudGain(path) ?? 1 : 1;
  const t = ac.currentTime;
  g.gain.cancelScheduledValues(t);
  if (ramp) { g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(want, t + ramp); }
  else g.gain.setValueAtTime(want, t);
  if (loudOn() && loudGain(path) === null) loudMeasure(path);
}
// options switch: everything playing gets its level now
function loudRefresh() {
  decks.forEach((el, i) => {
    const it = i === A ? currentItem() : handoff && itemOf(handoff.u);
    if (it) loudApply(i, it.path, 0.4);
  });
}

// measuring, one song at a time in the background
function loudMeasure(path) {
  const s = libSong(path);
  if (!s || LOUD.map.has(s.id) || LOUD.todo.includes(path)) return;
  LOUD.todo.push(path);
  loudNext();
}
async function loudNext() {
  if (LOUD.busy || !LOUD.todo.length) return;
  LOUD.busy = true;
  const path = LOUD.todo.shift(), s = libSong(path);
  try {
    // very long files (hour-long mixes) would need gigabytes to measure, those keep their own volume
    if (s && !LOUD.map.has(s.id) && ((s.duration || 0) > 20 * 60 || (s.size || 0) > 200 * 1048576)) LOUD.map.set(s.id, { lufs: null });
    if (s && !LOUD.map.has(s.id)) {
      const m = await loudnessOf(s.id);
      LOUD.map.set(s.id, m);
      fetch(`/api/loudness/${s.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) }).catch(() => {});
      // a song that's already playing gets eased to its level
      decks.forEach((el, i) => {
        const it = i === A ? currentItem() : handoff && itemOf(handoff.u);
        if (it && libSong(it.path)?.id === s.id) loudApply(i, it.path, 1.5);
      });
    }
  } catch {
    // a file the browser can't decode (ALAC, WMA): leave it at its own volume
    if (s) LOUD.map.set(s.id, { lufs: null });
  }
  LOUD.busy = false;
  loudNext();
}

// BS.1770: K-weighting (a high-pass and a high shelf), mean square in 400 ms blocks, then the gates
async function loudnessOf(id) {
  const buf = await (await fetch(`/api/audio/${id}`)).arrayBuffer();
  const sr = 22050;
  const audio = await new OfflineAudioContext(2, 1, sr).decodeAudioData(buf);
  const ctx = new OfflineAudioContext(audio.numberOfChannels, audio.length, sr);
  const src = ctx.createBufferSource();
  src.buffer = audio;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5;
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf'; shelf.frequency.value = 1500; shelf.gain.value = 4;
  src.connect(hp); hp.connect(shelf); shelf.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  let peak = 0;
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < d.length; i += 2) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
  }
  const block = Math.round(sr * 0.4), step = Math.round(block / 4), n = out.length;
  const chans = [...Array(out.numberOfChannels)].map((_, c) => out.getChannelData(c));
  const blocks = [];
  for (let s0 = 0; s0 + block <= n; s0 += step) {
    let sum = 0;
    for (const d of chans) { let ms = 0; for (let i = s0; i < s0 + block; i++) ms += d[i] * d[i]; sum += ms / block; }
    blocks.push(sum);
  }
  const lufs = (ms) => -0.691 + 10 * Math.log10(ms + 1e-12);
  const loud = blocks.filter((b) => lufs(b) > -70);
  if (!loud.length) return { lufs: null, peak };
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const gate = lufs(avg(loud)) - 10;
  const kept = loud.filter((b) => lufs(b) > gate);
  return { lufs: +lufs(avg(kept.length ? kept : loud)).toFixed(2), peak: +peak.toFixed(4) };
}
