// the sleep timer (options: SLEEP TIMER shows its button on the player bar). after the time you pick, or at the end
// of the song that's playing, the music fades out and stops. the fade has its own step in the sound chain, so your
// volume setting is never touched
const SLEEP = { mode: null, end: 0, tick: 0, fading: false };
const SLEEP_OPTS = [['off', 'OFF'], ['song', 'END OF THIS SONG'], [15, '15 MINUTES'], [30, '30 MINUTES'], [45, '45 MINUTES'], [60, '1 HOUR'], [120, '2 HOURS']];
const SLEEP_FADE = 30; // seconds the music takes to fade out
const sleepUntilSongEnds = () => SLEEP.mode === 'song';

const sleepLeft = () => Math.max(0, (SLEEP.end - Date.now()) / 1000);
const sleepFmt = (s) => { s = Math.ceil(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`; };

function sleepSet(v) {
  clearInterval(SLEEP.tick);
  sleepUnfade();
  SLEEP.mode = v === 'off' ? null : v === 'song' ? 'song' : 'time';
  SLEEP.end = SLEEP.mode === 'time' ? Date.now() + v * 60000 : 0;
  // with repeat-one on the song would loop forever and never "end", so it doesn't loop while this is set
  decks[A].loop = P.repeat === 'one' && SLEEP.mode !== 'song';
  if (SLEEP.mode) SLEEP.tick = setInterval(sleepCheck, 500);
  sleepDraw();
}
function sleepFade(sec) {
  if (SLEEP.fading || !node.fade) return;
  SLEEP.fading = true;
  const t = ac.currentTime;
  node.fade.gain.cancelScheduledValues(t);
  node.fade.gain.setValueAtTime(node.fade.gain.value, t);
  node.fade.gain.linearRampToValueAtTime(0, t + Math.max(0.5, sec));
}
function sleepUnfade() {
  SLEEP.fading = false;
  if (!node.fade) return;
  const t = ac.currentTime;
  node.fade.gain.cancelScheduledValues(t);
  node.fade.gain.setValueAtTime(1, t);
}
function sleepCheck() {
  if (SLEEP.mode === 'time') {
    const left = sleepLeft();
    if (left <= SLEEP_FADE && P.playing) sleepFade(left);
    if (left <= 0) return sleepStop();
  } else if (SLEEP.mode === 'song') {
    const el = decks[A];
    const left = el.duration ? el.duration - el.currentTime : Infinity;
    if (left <= 10 && P.playing) sleepFade(left);
  }
  sleepDraw();
}
// time's up: pause (the next song is lined up, so play carries on from there), and set the volume back for next time
function sleepStop(atSongEnd = false) {
  clearInterval(SLEEP.tick);
  SLEEP.mode = null;
  decks[A].loop = P.repeat === 'one';
  if (atSongEnd) {
    const n = nextU();
    if (n) load(n, { play: false });
    else { P.playing = false; changed(); }
  } else if (P.playing) togglePlay();
  setTimeout(sleepUnfade, 300);
  sleepDraw();
  toast('> SLEEP TIMER // GOOD NIGHT.');
}

const SLEEP_ICON = '<svg viewBox="0 0 14 14"><path d="M9.5 1.8a5.4 5.4 0 1 0 2.7 9.4A5 5 0 0 1 9.5 1.8z"/></svg>';
function sleepDraw() {
  const b = $('#pbSleep');
  if (!b) return;
  b.hidden = !profile.sleepBtn && !SLEEP.mode;
  b.classList.toggle('on', !!SLEEP.mode);
  b.querySelector('span').textContent = SLEEP.mode === 'time' ? sleepFmt(sleepLeft()) : SLEEP.mode === 'song' ? 'END' : '';
  b.title = SLEEP.mode ? 'Sleep timer is on' : 'Sleep timer';
  const m = $('.sleepmenu');
  if (m) m.querySelectorAll('.ci').forEach((ci) => {
    const v = ci.dataset.v, on = (v === 'off' && !SLEEP.mode) || (v === 'song' && SLEEP.mode === 'song') || (SLEEP.mode === 'time' && +v === SLEEP.minutes);
    ci.classList.toggle('on', on);
    ci.querySelector('small').textContent = on && SLEEP.mode === 'time' ? `${sleepFmt(sleepLeft())} LEFT` : on && SLEEP.mode === 'song' ? 'ON' : '';
  });
}
$('#pbSleep').innerHTML = `${SLEEP_ICON}<span></span>`;
// clicking the button opens the menu (or closes it if it's open)
$('#pbSleep').addEventListener('mousedown', (e) => e.stopPropagation());
$('#pbSleep').addEventListener('click', () => {
  if ($('.sleepmenu')) return closeMenus();
  closeMenus();
  const r = $('#pbSleep').getBoundingClientRect();
  const m = document.createElement('div');
  m.className = 'ctx sleepmenu';
  m.innerHTML = `<div class="st">SLEEP TIMER</div>${SLEEP_OPTS.map(([v, l]) => `<div class="ci" data-v="${v}"><span>${l}</span><small></small></div>`).join('')}
    <div class="nt">The music fades out over the last ${SLEEP_FADE} seconds (the last 10 for "end of this song"), then stops.</div>`;
  document.body.appendChild(m);
  m.style.left = `${Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))}px`;
  m.style.top = `${r.top - m.offsetHeight - 6}px`;
  sleepDraw();
  m.addEventListener('click', (e) => {
    const ci = e.target.closest('.ci[data-v]');
    if (!ci) return;
    const v = ci.dataset.v === 'off' || ci.dataset.v === 'song' ? ci.dataset.v : +ci.dataset.v;
    SLEEP.minutes = typeof v === 'number' ? v : null;
    sleepSet(v);
    closeMenus();
  });
});
