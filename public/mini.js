// the mini player window. it doesn't play anything itself, the main window does and sends us its state
const $ = (s) => document.querySelector(s);
const api = window.aperture;
const PLAY = '<svg viewBox="0 0 14 14"><path d="M3 1.5l9.5 5.5L3 12.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 14 14"><path d="M4 2v10M10 2v10"/></svg>';
const fmt = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
let state = { playing: false, cur: 0, dur: 0 };
let stamp = Date.now();

function draw() {
  $('#mTitle').textContent = state.title || 'Nothing playing';
  $('#mArtist').textContent = state.artist || '';
  const img = $('#mArt img');
  if (state.cover) { if (img.getAttribute('src') !== state.cover) img.src = state.cover; } else img.removeAttribute('src');
  document.body.classList.toggle('truecolor', state.tint === false);
  $('#mPlay').innerHTML = state.playing ? PAUSE : PLAY;
  drawTime();
}
// the time moves on between updates so the bar doesn't jump once a second
function drawTime() {
  const t = Math.min(state.dur || 0, state.cur + (state.playing ? (Date.now() - stamp) / 1000 : 0));
  $('#mCur').textContent = fmt(t);
  $('#mDur').textContent = fmt(state.dur);
  const f = state.dur ? (t / state.dur) * 100 : 0;
  $('#mSeek .fill').style.width = `${f}%`;
  $('#mSeek .knob').style.left = `${f}%`;
}
setInterval(drawTime, 250);

api.onState((s) => {
  state = s;
  stamp = Date.now();
  draw();
});
$('#mPlay').addEventListener('click', () => api.media('toggle'));
$('#mNext').addEventListener('click', () => api.media('next'));
$('#mPrev').addEventListener('click', () => api.media('prev'));
$('#mSeek').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  api.media({ seek: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) });
});
$('#mOpen').addEventListener('click', () => api.mini('open'));
$('#mClose').addEventListener('click', () => api.mini('close'));
$('#mPin').addEventListener('click', async () => $('#mPin').classList.toggle('on', await api.mini('pin')));
api.mini('pinned').then((on) => $('#mPin').classList.toggle('on', on));
draw();
