// the audio engine and the player bar.
// two <audio> "decks" so one song can fade into the next. both go through one web audio chain:
// deck gains -> preamp -> eq bands -> bass boost -> stereo matrix (surround/mono) -> balance -> analyser -> volume
const P = {
  queue: [], // [{ u, path }] in the order you see in the queue
  shuffled: [], // play order (u's) while shuffle is on
  cur: null, // u of the song that's loaded
  playing: false,
  shuffle: false,
  repeat: 'off', // off | all | one
  volume: 0.8,
  muted: false,
};
let uidN = 0;
const newItem = (path) => ({ u: ++uidN, path });

const decks = [new Audio(), new Audio()];
let A = 0; // which deck is the current one
let fading = null;
let ac = null;
const node = {};
const deckGain = [];
let eqFilters = [];

function buildGraph() {
  ac = new AudioContext();
  decks.forEach((el, i) => {
    el.preload = 'auto';
    const src = ac.createMediaElementSource(el);
    const g = ac.createGain();
    g.gain.value = i === A ? 1 : 0;
    src.connect(g);
    deckGain[i] = g;
  });
  node.pre = ac.createGain();
  // forces mono files up to 2 channels so the stereo tricks further down work on them
  Object.assign(node.pre, { channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
  deckGain.forEach((g) => g.connect(node.pre));
  node.bass = ac.createBiquadFilter();
  node.bass.type = 'lowshelf';
  node.bass.frequency.value = 110;
  node.split = ac.createChannelSplitter(2);
  node.merge = ac.createChannelMerger(2);
  for (const k of ['ll', 'lr', 'rl', 'rr']) node[k] = ac.createGain();
  node.bass.connect(node.split);
  node.split.connect(node.ll, 0); node.ll.connect(node.merge, 0, 0);
  node.split.connect(node.lr, 0); node.lr.connect(node.merge, 0, 1);
  node.split.connect(node.rl, 1); node.rl.connect(node.merge, 0, 0);
  node.split.connect(node.rr, 1); node.rr.connect(node.merge, 0, 1);
  node.pan = ac.createStereoPanner();
  node.merge.connect(node.pan);
  node.analyser = ac.createAnalyser();
  node.analyser.fftSize = 2048;
  node.analyser.smoothingTimeConstant = 0.75;
  node.pan.connect(node.analyser);
  // left and right on their own, for the cassette's VU meters
  node.chSplit = ac.createChannelSplitter(2);
  node.pan.connect(node.chSplit);
  node.anL = ac.createAnalyser();
  node.anR = ac.createAnalyser();
  node.anL.fftSize = node.anR.fftSize = 1024;
  node.chSplit.connect(node.anL, 0);
  node.chSplit.connect(node.anR, 1);
  node.vol = ac.createGain();
  node.analyser.connect(node.vol);
  node.vol.connect(ac.destination);
  rewireEq();
  applyFx();
  applyVolume();
}
const getAnalyser = () => node.analyser || null;
const getChannelAnalysers = () => [node.anL || null, node.anR || null];
const smooth = (param, v) => param.setTargetAtTime(v, ac.currentTime, 0.03);

// ---- equalizer + effects (the settings live in eq.js, this just applies them) ----
function rewireEq() {
  if (!ac) return;
  node.pre.disconnect();
  eqFilters.forEach((f) => f.disconnect());
  eqFilters = [];
  const eq = EQ.state;
  if (eq.on) {
    const freqs = EQ_FREQS[eq.n];
    eqFilters = freqs.map((f, i) => {
      const b = ac.createBiquadFilter();
      b.type = 'peaking';
      b.frequency.value = f;
      // each band is as wide as the gap to its neighbour, so the bands blend without holes
      const ratio = freqs[i + 1] ? freqs[i + 1] / f : f / freqs[i - 1];
      const bw = Math.log2(ratio);
      b.Q.value = Math.sqrt(2 ** bw) / (2 ** bw - 1);
      b.gain.value = eq.gains[i] || 0;
      return b;
    });
  }
  let last = node.pre;
  for (const f of eqFilters) { last.connect(f); last = f; }
  last.connect(node.bass);
}
function setEqGain(i, db) {
  if (eqFilters[i]) smooth(eqFilters[i].gain, db);
}
function applyFx() {
  if (!ac) return;
  const fx = EQ.state;
  smooth(node.bass.gain, (fx.bass || 0) * 12);
  // mid/side matrix: k = 1 is normal stereo, above 1 widens it (surround), 0 is mono
  const k = fx.mono ? 0 : 1 + (fx.surround || 0);
  smooth(node.ll.gain, 0.5 + 0.5 * k); smooth(node.rr.gain, 0.5 + 0.5 * k);
  smooth(node.lr.gain, 0.5 - 0.5 * k); smooth(node.rl.gain, 0.5 - 0.5 * k);
  smooth(node.pan.pan, fx.balance || 0);
  smooth(node.pre.gain, 10 ** (preampDb() / 20));
}
function applyVolume() {
  // squared so the slider feels even, the ear hears volume on a curve
  const v = P.muted ? 0 : P.volume * P.volume;
  if (ac) smooth(node.vol.gain, v);
  else decks.forEach((d) => (d.volume = v));
}

// ---- queue helpers ----
const itemOf = (u) => P.queue.find((q) => q.u === u) || null;
const order = () => (P.shuffle ? P.shuffled : P.queue.map((q) => q.u));
function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function reshuffle() {
  const rest = P.queue.map((q) => q.u).filter((u) => u !== P.cur);
  P.shuffled = P.cur ? [P.cur, ...shuffleArr(rest)] : shuffleArr(rest);
}
function nextU(wrap = P.repeat === 'all') {
  const o = order();
  if (!o.length) return null;
  const i = o.indexOf(P.cur);
  if (i < 0) return o[0];
  if (i + 1 < o.length) return o[i + 1];
  return wrap ? o[0] : null;
}
function prevU() {
  const o = order();
  const i = o.indexOf(P.cur);
  if (i > 0) return o[i - 1];
  return P.repeat === 'all' && o.length ? o[o.length - 1] : null;
}
// what's coming up, in play order
function upNext(n) {
  const o = order();
  const i = o.indexOf(P.cur);
  return o.slice(i + 1, i + 1 + n).map(itemOf).filter(Boolean);
}
const currentItem = () => itemOf(P.cur);
const currentSong = () => {
  const it = currentItem();
  return it ? libSong(it.path) || fallbackSong(it.path) : null;
};
const fallbackSong = (p) => ({ path: p, title: p.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''), artist: '', album: '', missing: true });

// ---- loading and playing ----
function deckSrc(path) {
  const s = libSong(path);
  return s ? `/api/audio/${s.id}` : null;
}
function stopFade() {
  if (!fading) return;
  clearTimeout(fading.timer);
  const old = decks[fading.old];
  old.pause();
  if (ac) { deckGain[fading.old].gain.cancelScheduledValues(ac.currentTime); deckGain[fading.old].gain.value = 0; deckGain[A].gain.cancelScheduledValues(ac.currentTime); deckGain[A].gain.value = 1; }
  fading = null;
}

let skipGuard = 0;
let errorStreak = 0;
function load(u, { play = true, at = 0 } = {}) {
  stopFade();
  const it = itemOf(u);
  P.cur = it ? u : null;
  const el = decks[A];
  decks[1 - A].pause();
  if (!it) {
    el.pause();
    el.removeAttribute('src');
    P.playing = false;
    changed(true);
    return;
  }
  const src = deckSrc(it.path);
  if (!src) {
    // the file isn't in the library anymore (moved or deleted), skip it
    if (++skipGuard > P.queue.length) { skipGuard = 0; P.playing = false; changed(true); return; }
    return load(nextU(true) === u ? null : nextU(true), { play, at: 0 });
  }
  skipGuard = 0;
  el.src = src;
  el.loop = P.repeat === 'one';
  if (at) el.addEventListener('loadedmetadata', () => { el.currentTime = Math.min(at, (el.duration || at) - 1); }, { once: true });
  played.u = u; played.t = 0; played.counted = false; played.last = at;
  if (play) start(el);
  else P.playing = false;
  changed(true);
}
function start(el = decks[A]) {
  ac?.resume();
  el.play().then(() => { P.playing = true; changed(); }).catch(() => { P.playing = false; changed(); });
}
function togglePlay() {
  const el = decks[A];
  if (!P.cur) {
    if (P.queue.length) load(order()[0]);
    return;
  }
  if (P.playing) {
    stopFade();
    el.pause();
    P.playing = false;
    changed();
  } else {
    if (!el.src) return load(P.cur);
    if (el.ended) el.currentTime = 0;
    start(el);
  }
}
// skipping a song before it's halfway counts as a skip in the statistics
function noteSkip() {
  const el = decks[A];
  const it = currentItem();
  if (P.playing && it && el.duration && el.currentTime < el.duration * 0.5) statsSkip(it.path);
}
function playNext() { const n = nextU(true); if (n) { noteSkip(); load(n, { play: P.playing || !!P.cur }); } }
function playPrev() {
  // like most players: past 3 seconds, previous restarts the song
  if (decks[A].currentTime > 3 || !prevU()) { decks[A].currentTime = 0; return; }
  load(prevU(), { play: P.playing || !!P.cur });
}
function seekTo(frac) {
  const el = decks[A];
  if (el.duration) { stopFade(); el.currentTime = frac * el.duration; }
}

// crossfade: when the current song is nearly done, start the next one on the other deck and swap volumes
function maybeFade(el) {
  const sec = profile.crossfade || 0;
  if (!sec || fading || P.repeat === 'one' || !P.playing || !el.duration || el.duration < sec * 3) return;
  if (el.duration - el.currentTime > sec) return;
  const n = nextU();
  const it = itemOf(n);
  const src = it && deckSrc(it.path);
  if (!src || !ac) return;
  const old = A;
  A = 1 - A;
  const nel = decks[A];
  nel.src = src;
  nel.loop = false;
  const t = ac.currentTime;
  deckGain[A].gain.cancelScheduledValues(t);
  deckGain[A].gain.setValueAtTime(0, t);
  deckGain[A].gain.linearRampToValueAtTime(1, t + sec);
  deckGain[old].gain.cancelScheduledValues(t);
  deckGain[old].gain.setValueAtTime(deckGain[old].gain.value, t);
  deckGain[old].gain.linearRampToValueAtTime(0, t + sec);
  fading = { old, timer: setTimeout(() => { decks[old].pause(); fading = null; }, sec * 1000 + 200) };
  P.cur = n;
  played.u = n; played.t = 0; played.counted = false; played.last = 0;
  nel.play().catch(() => {});
  changed(true);
}

// every second of listening goes to the statistics. a play counts once you've heard 10 seconds (or half of a short song)
const played = { u: null, t: 0, counted: false, last: 0 };
function countPlay(el) {
  const now = el.currentTime;
  const d = now - played.last;
  // repeat-one jumping back to the start is a new play
  if (P.repeat === 'one' && now < 1 && played.last > 5) { played.t = 0; played.counted = false; }
  played.last = now;
  if (played.u !== P.cur || d <= 0 || d > 2) return;
  const it = currentItem();
  if (!it) return;
  statsListen(it.path, d);
  played.t += d;
  if (!played.counted && played.t >= Math.min(10, (el.duration || 20) / 2)) {
    played.counted = true;
    statsPlay(it.path);
  }
}
const playInfo = (path) => statsSong(path);

decks.forEach((el, i) => {
  el.addEventListener('timeupdate', () => {
    if (i !== A) return;
    countPlay(el);
    maybeFade(el);
    drawSeek();
  });
  el.addEventListener('ended', () => {
    if (i !== A || fading) return;
    const n = nextU();
    if (n) load(n);
    else { P.playing = false; changed(); }
  });
  el.addEventListener('error', () => {
    if (i !== A || !el.getAttribute('src')) return;
    // a file the engine can't decode (ALAC, WMA...) or that's gone, go on to the next one.
    // stops after one full lap so a queue of broken files doesn't spin forever
    if (++errorStreak >= P.queue.length) { errorStreak = 0; P.playing = false; changed(); return; }
    setTimeout(playNext, 400);
  });
  el.addEventListener('playing', () => { if (i === A) errorStreak = 0; });
  el.addEventListener('loadedmetadata', () => i === A && drawSeek());
});

// ---- things the rest of the app calls ----
// replaces the queue and starts playing (playlists, play album, play now)
function playPaths(paths, { shuffle = false } = {}) {
  if (!paths.length) return;
  P.queue = paths.map(newItem);
  P.shuffle = shuffle || P.shuffle;
  const first = P.shuffle ? P.queue[(Math.random() * P.queue.length) | 0].u : P.queue[0].u;
  P.cur = first;
  if (P.shuffle) reshuffle();
  load(first);
}
function enqueue(paths) {
  const add = paths.map(newItem);
  P.queue.push(...add);
  if (P.shuffle) {
    // new songs get mixed in somewhere after the current one
    for (const it of add) {
      const i = P.shuffled.indexOf(P.cur);
      const at = i + 1 + Math.floor(Math.random() * (P.shuffled.length - i));
      P.shuffled.splice(at, 0, it.u);
    }
  }
  changed();
  return add;
}
// double-click: plays it if nothing is playing, otherwise it goes to the bottom of the queue
function playOrQueue(path) {
  const [it] = enqueue([path]);
  if (!P.playing) load(it.u);
}
function jumpTo(u) { if (u !== P.cur) noteSkip(); load(u); }
function removeFromQueue(u) {
  const wasCur = u === P.cur;
  const n = wasCur ? nextU(true) : null;
  P.queue = P.queue.filter((q) => q.u !== u);
  P.shuffled = P.shuffled.filter((x) => x !== u);
  if (wasCur) load(n !== u ? n : null, { play: P.playing });
  else changed();
}
function moveInQueue(from, to) {
  const [it] = P.queue.splice(from, 1);
  P.queue.splice(to, 0, it);
  changed();
}
function clearQueue() {
  P.queue = [];
  P.shuffled = [];
  load(null);
}
function toggleShuffle() {
  P.shuffle = !P.shuffle;
  if (P.shuffle) reshuffle();
  changed();
}
function cycleRepeat() {
  P.repeat = P.repeat === 'off' ? 'all' : P.repeat === 'all' ? 'one' : 'off';
  decks[A].loop = P.repeat === 'one';
  changed();
}
function setVolume(v) {
  P.volume = clamp(v, 0, 1);
  P.muted = false;
  applyVolume();
  drawVolume();
  saveProfile({ volume: P.volume, muted: false });
}
// the tagger renamed some files: point the queue, playlists and play counts at the new names
function followMoves(moves) {
  if (!moves.length) return;
  const map = new Map(moves.map((m) => [m.from.toLowerCase(), m.to]));
  const fix = (p) => map.get(p.toLowerCase()) || p;
  P.queue.forEach((q) => (q.path = fix(q.path)));
  const playlists = (profile.playlists || []).map((pl) => ({ ...pl, paths: pl.paths.map(fix) }));
  saveProfile({ playlists });
  statsMove(fix);
  changed();
}

// ---- everything that shows player state reacts to this ----
let saveQueueTimer = null;
function changed(track = false) {
  drawBar();
  document.dispatchEvent(new CustomEvent('player', { detail: { track } }));
  sendMini();
  if (track) updateMediaSession();
  clearTimeout(saveQueueTimer);
  saveQueueTimer = setTimeout(saveQueue, 500);
}
function saveQueue() {
  const idx = (u) => P.queue.findIndex((q) => q.u === u);
  saveProfile({
    queue: P.queue.map((q) => q.path),
    queueCur: idx(P.cur),
    queueShuffled: P.shuffle ? P.shuffled.map(idx) : null,
    queuePos: decks[A].currentTime || 0,
    shuffle: P.shuffle,
    repeat: P.repeat,
  });
}
setInterval(() => { if (P.playing) saveProfile({ queuePos: decks[A].currentTime || 0 }); }, 5000);

function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const s = currentSong();
  navigator.mediaSession.metadata = s ? new MediaMetadata({
    title: s.title || fallbackSong(s.path).title,
    artist: s.artist || '',
    album: s.album || '',
    artwork: s.cover ? [{ src: `${location.origin}/api/cover/${s.cover}` }] : [],
  }) : null;
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => !P.playing && togglePlay());
  ms.setActionHandler('pause', () => P.playing && togglePlay());
  ms.setActionHandler('previoustrack', playPrev);
  ms.setActionHandler('nexttrack', playNext);
  ms.setActionHandler('seekto', (d) => { const el = decks[A]; if (el.duration) el.currentTime = d.seekTime; });
}

// the mini player and the tray menu live in other windows, they get a copy of the state
function sendMini() {
  if (!desktop) return;
  const s = currentSong();
  const el = decks[A];
  window.aperture.sendState({
    title: s ? s.title || fallbackSong(s.path).title : '',
    artist: s?.artist || '',
    cover: s?.cover ? `${location.origin}/api/cover/${s.cover}` : '',
    playing: P.playing,
    cur: el.currentTime || 0,
    dur: el.duration || s?.duration || 0,
    tint: profile.tint !== false,
  });
}
setInterval(() => { if (P.playing) sendMini(); }, 1000);
if (desktop) window.aperture.onMedia((cmd) => {
  if (cmd === 'toggle') togglePlay();
  else if (cmd === 'next') playNext();
  else if (cmd === 'prev') playPrev();
  else if (cmd?.seek != null) seekTo(cmd.seek);
});

// ---- player bar ----
const ICON_PLAY = '<svg viewBox="0 0 14 14"><path d="M3 1.5l9.5 5.5L3 12.5z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 14 14"><path d="M4 2v10M10 2v10"/></svg>';
const seekSlider = makeSlider($('#pbSeek'), (v, done) => {
  seekDrag = !done;
  seekPreview = v;
  if (done) seekTo(v);
  drawSeek();
});
let seekDrag = false, seekPreview = 0;
const volSlider = makeSlider($('#pbVol'), (v, done) => {
  P.volume = v;
  P.muted = false;
  applyVolume();
  drawVolume();
  if (done) saveProfile({ volume: P.volume, muted: false });
});
function drawVolume() {
  volSlider.set(P.muted ? 0 : P.volume);
  $('#pbMute').classList.toggle('off', P.muted || P.volume === 0);
  document.dispatchEvent(new CustomEvent('volume'));
}
function drawSeek() {
  const el = decks[A];
  const s = currentSong();
  const dur = el.duration || s?.duration || 0;
  const t = seekDrag ? seekPreview * dur : el.currentTime || 0;
  seekSlider.set(dur ? clamp(t / dur, 0, 1) : 0);
  $('#pbCur').textContent = fmtTime(t);
  $('#pbDur').textContent = fmtTime(dur);
}
function drawBar() {
  const s = currentSong();
  $('#pbTitle').textContent = s ? s.title || fallbackSong(s.path).title : 'Nothing playing';
  $('#pbSub').textContent = s ? [s.artist, s.album].filter(Boolean).join(' // ') : 'Pick something in the library';
  setCover($('#pbNow .art img'), s);
  $('#pbPlay').innerHTML = P.playing ? ICON_PAUSE : ICON_PLAY;
  $('#pbPlay').title = P.playing ? 'Pause' : 'Play';
  $('#pbShuffle').classList.toggle('on', P.shuffle);
  $('#pbShuffle').classList.toggle('off', !P.shuffle);
  $('#pbRepeat').classList.toggle('on', P.repeat !== 'off');
  $('#pbRepeat').classList.toggle('off', P.repeat === 'off');
  $('#pbRepeat').classList.toggle('one', P.repeat === 'one');
  $('#pbRepeat').title = { off: 'Repeat: off', all: 'Repeat: all', one: 'Repeat: this song' }[P.repeat];
  $('#pbEq').classList.toggle('on', EQ.state.on);
  drawSeek();
}
$('#pbPlay').addEventListener('click', togglePlay);
$('#pbNext').addEventListener('click', playNext);
$('#pbPrev').addEventListener('click', playPrev);
$('#pbShuffle').addEventListener('click', toggleShuffle);
$('#pbRepeat').addEventListener('click', cycleRepeat);
$('#pbEq').addEventListener('click', () => showView('eq'));
$('#pbNow').addEventListener('click', () => showView('np'));
$('#pbMute').addEventListener('click', () => {
  P.muted = !P.muted;
  applyVolume();
  drawVolume();
  saveProfile({ muted: P.muted });
});
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select') || !$('#fb').hidden || !$('#askDlg').hidden || !$('#login').hidden) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.ctrlKey && e.key === 'ArrowRight') playNext();
  else if (e.ctrlKey && e.key === 'ArrowLeft') playPrev();
});

// picks up where you left off last time (paused)
function restoreQueue() {
  P.volume = profile.volume ?? 0.8;
  P.muted = !!profile.muted;
  P.shuffle = !!profile.shuffle;
  P.repeat = profile.repeat || 'off';
  P.queue = (profile.queue || []).map(newItem);
  const cur = P.queue[profile.queueCur];
  if (P.shuffle) {
    const saved = (profile.queueShuffled || []).map((i) => P.queue[i]?.u).filter(Boolean);
    P.shuffled = saved.length === P.queue.length ? saved : (P.cur = cur?.u, reshuffle(), P.shuffled);
  }
  applyVolume();
  drawVolume();
  if (cur) load(cur.u, { play: false, at: profile.queuePos || 0 });
  else changed();
}

function initPlayer() {
  try {
    buildGraph();
  } catch {
    ac = null; // no web audio, plain playback still works
  }
}
