// the equalizer: page 1 is the bands, page 2 the effects. the sound itself is done in player.js
const EQ_FREQS = {
  3: [100, 1000, 10000],
  5: [60, 230, 910, 3600, 14000],
  10: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
  15: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000],
  31: [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000],
};
const EQ_DEFAULT = { on: false, n: 10, gains: Array(10).fill(0), bass: 0, surround: 0, balance: 0, mono: false, pre: 'off', preHeadroom: -6, preBoost: 2 };
const EQ = { state: { ...EQ_DEFAULT, gains: [...EQ_DEFAULT.gains] } };
const DB = 12;

const fLabel = (f) => (f >= 1000 ? `${+(f / 1000).toFixed(1)}K` : String(Math.round(f)));
const dbText = (g) => `${g > 0 ? '+' : ''}${g}`;
function preampDb() {
  const s = EQ.state;
  return s.pre === 'headroom' ? s.preHeadroom : s.pre === 'boost' ? s.preBoost : 0;
}
const saveEq = () => saveProfile({ eq: { ...EQ.state, gains: [...EQ.state.gains] } });

// switching band count keeps the shape of your curve instead of starting flat
function convertGains(from, to, gains) {
  const fa = EQ_FREQS[from].map(Math.log2), fb = EQ_FREQS[to].map(Math.log2);
  return fb.map((x) => {
    if (x <= fa[0]) return gains[0];
    if (x >= fa[fa.length - 1]) return gains[gains.length - 1];
    const i = fa.findIndex((v) => v >= x);
    const t = (x - fa[i - 1]) / (fa[i] - fa[i - 1]);
    return Math.round((gains[i - 1] + (gains[i] - gains[i - 1]) * t) * 2) / 2;
  });
}

// ---- page 1: bands ----
const pos = (g) => ((DB - g) / (DB * 2)) * 100;
function renderBands() {
  const s = EQ.state;
  const freqs = EQ_FREQS[s.n];
  $('#eqCount').innerHTML = Object.keys(EQ_FREQS).map((n) => `<button class="cmd ${+n === s.n ? 'on' : ''}" data-n="${n}">${n}</button>`).join('');
  $$('#eqPower [data-on]').forEach((b) => b.classList.toggle('on', (b.dataset.on === '1') === s.on));
  $('#eqBands').className = `eq ${s.n >= 15 ? 'narrow' : ''} ${s.on ? '' : 'off'}`;
  $('#eqBands').innerHTML = `
    <div class="scale"><span>+12</span><span>+6</span><span>0 dB</span><span>-6</span><span>-12</span></div>
    <div class="bands" style="--n:${s.n}">
      <div class="vals">${s.gains.map((g) => `<span>${dbText(g)}</span>`).join('')}</div>
      <div class="tracks" id="eqTracks">
        <div class="grid-lines"><i></i><i></i><i class="zero"></i><i></i><i></i></div>
        ${s.gains.map((g, i) => `<div class="fader" data-i="${i}" title="${fLabel(freqs[i])} Hz"><div class="rail"></div><div class="cap" style="top:${pos(g)}%"></div></div>`).join('')}
        <svg class="curve" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline vector-effect="non-scaling-stroke"/></svg>
      </div>
      <div class="freqs">${freqs.map((f) => `<span>${fLabel(f)}</span>`).join('')}</div>
    </div>`;
  drawCurve();
  $('#eqInfo').textContent = s.on ? `${s.n} BANDS // DRAG A SLIDER, DOUBLE-CLICK RESETS IT` : 'EQUALIZER IS OFF // TURN IT [ ON ] TO HEAR YOUR CURVE';
  $('#nEq').textContent = s.on ? 'ON' : 'OFF';
  $('#pbEq').classList.toggle('on', s.on);
}
function drawCurve() {
  const s = EQ.state;
  const pts = s.gains.map((g, i) => `${((i + 0.5) / s.n) * 100},${pos(g)}`).join(' ');
  $('#eqTracks polyline')?.setAttribute('points', pts);
}
function setBand(i, g) {
  const s = EQ.state;
  s.gains[i] = g;
  const f = $(`#eqTracks .fader[data-i="${i}"] .cap`);
  if (f) f.style.top = `${pos(g)}%`;
  const v = $$('#eqBands .vals span')[i];
  if (v) v.textContent = dbText(g);
  drawCurve();
  setEqGain(i, g);
}
$('#eqBands').addEventListener('mousedown', (e) => {
  const fader = e.target.closest('.fader');
  if (!fader) return;
  e.preventDefault();
  const i = +fader.dataset.i;
  const tracks = $('#eqTracks');
  const at = (ev) => {
    const r = tracks.getBoundingClientRect();
    const y = clamp((ev.clientY - r.top) / r.height, 0, 1);
    return Math.round((DB - y * DB * 2) * 2) / 2;
  };
  setBand(i, at(e));
  const move = (ev) => setBand(i, at(ev));
  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    saveEq();
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
});
$('#eqBands').addEventListener('dblclick', (e) => {
  const fader = e.target.closest('.fader');
  if (!fader) return;
  setBand(+fader.dataset.i, 0);
  saveEq();
});
$('#eqCount').addEventListener('click', (e) => {
  const b = e.target.closest('[data-n]');
  if (!b || +b.dataset.n === EQ.state.n) return;
  const n = +b.dataset.n;
  EQ.state.gains = convertGains(EQ.state.n, n, EQ.state.gains);
  EQ.state.n = n;
  rewireEq();
  renderBands();
  saveEq();
});
$$('#eqPower [data-on]').forEach((b) => b.addEventListener('click', () => {
  EQ.state.on = b.dataset.on === '1';
  rewireEq();
  renderBands();
  saveEq();
}));
$('#eqFlat').addEventListener('click', () => {
  EQ.state.gains = EQ.state.gains.map(() => 0);
  rewireEq();
  renderBands();
  saveEq();
});
$$('#eqTabs [data-page]').forEach((b) => b.addEventListener('click', () => showEqPage(+b.dataset.page)));
function showEqPage(n) {
  $('#eqPage1').hidden = n !== 1;
  $('#eqPage2').hidden = n !== 2;
  $$('#eqTabs [data-page]').forEach((b) => b.classList.toggle('on', +b.dataset.page === n));
  saveProfile({ eqPage: n });
}

// ---- page 2: effects ----
// a 270 degree dial. value 0..1. centred dials (balance) fill from the top instead of the start
function dialSvg(value, centred) {
  const R = 46, cx = 60, cy = 60, a0 = -225, sweep = 270;
  const pt = (deg, r) => [cx + Math.cos((deg * Math.PI) / 180) * r, cy + Math.sin((deg * Math.PI) / 180) * r];
  const arc = (from, to, r) => {
    const [x1, y1] = pt(from, r), [x2, y2] = pt(to, r);
    return `M${x1} ${y1} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const at = a0 + sweep * value;
  const start = centred ? -90 : a0;
  let ticks = '';
  for (let i = 0; i <= 10; i++) {
    const d = a0 + (sweep * i) / 10;
    const [x1, y1] = pt(d, 54), [x2, y2] = pt(d, i % 5 ? 57 : 60);
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  const [px, py] = pt(at, 30), [qx, qy] = pt(at, 12);
  const val = Math.abs(at - start) > 0.5 ? `<path class="val" d="${arc(Math.min(start, at), Math.max(start, at), R)}"/>` : '';
  return `<svg class="dial" viewBox="0 0 120 120"><g class="ticks">${ticks}</g><path class="bg" d="${arc(a0, a0 + sweep, R)}"/>${val}
    <circle class="body" cx="60" cy="60" r="36"/><line class="ptr" x1="${qx}" y1="${qy}" x2="${px}" y2="${py}"/></svg>`;
}
const DIALS = {
  bass: { el: '#dBass', out: '#vBass', get: () => EQ.state.bass, set: (v) => (EQ.state.bass = v), text: (v) => `${Math.round(v * 100)}%` },
  surround: { el: '#dSurround', out: '#vSurround', get: () => EQ.state.surround, set: (v) => (EQ.state.surround = v), text: (v) => `${Math.round(v * 100)}%` },
  // balance is -1 (left) .. 1 (right), shown as 0..1 on the dial
  balance: {
    el: '#dBalance', out: '#vBalance', centred: true,
    get: () => (EQ.state.balance + 1) / 2, set: (v) => (EQ.state.balance = Math.round((v * 2 - 1) * 50) / 50),
    text: () => { const b = EQ.state.balance; return Math.abs(b) < 0.01 ? 'CENTRE' : `${b < 0 ? 'L' : 'R'} ${Math.round(Math.abs(b) * 100)}%`; },
  },
};
function drawDial(k) {
  const d = DIALS[k];
  $(d.el).innerHTML = dialSvg(d.get(), d.centred);
  $(d.out).textContent = d.text(d.get());
}
for (const [k, d] of Object.entries(DIALS)) {
  const el = $(d.el);
  // drag up/down to turn it, like most audio software
  el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const y0 = e.clientY, v0 = d.get();
    const move = (ev) => {
      let v = clamp(v0 + (y0 - ev.clientY) / 160, 0, 1);
      if (d.centred && Math.abs(v - 0.5) < 0.02) v = 0.5; // snaps to the middle
      d.set(v);
      drawDial(k);
      applyFx();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      saveEq();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    d.set(clamp(d.get() - Math.sign(e.deltaY) * 0.02, 0, 1));
    drawDial(k);
    applyFx();
    saveEq();
  }, { passive: false });
  el.addEventListener('dblclick', () => {
    d.set(d.centred ? 0.5 : 0);
    drawDial(k);
    applyFx();
    saveEq();
  });
}
$$('#eqMono [data-mono]').forEach((b) => b.addEventListener('click', () => {
  EQ.state.mono = b.dataset.mono === '1';
  drawFx();
  applyFx();
  saveEq();
}));

const fxVol = makeSlider($('#fxVol'), (v, done) => {
  P.volume = v;
  P.muted = false;
  applyVolume();
  drawVolume();
  if (done) saveProfile({ volume: P.volume, muted: false });
});
document.addEventListener('volume', () => {
  fxVol.set(P.muted ? 0 : P.volume);
  $('#fxVolNum').textContent = P.muted ? 'MUTED' : `${Math.round(P.volume * 100)}%`;
});

// headroom goes -12..0 dB, boost 0..+12 dB, off has no slider
const PRE_RANGE = { headroom: [-12, 0], boost: [0, 12] };
const fxPre = makeSlider($('#fxPre'), (v, done) => {
  const s = EQ.state;
  const r = PRE_RANGE[s.pre];
  if (!r) return;
  const db = Math.round((r[0] + v * (r[1] - r[0])) * 2) / 2;
  if (s.pre === 'headroom') s.preHeadroom = db;
  else s.preBoost = db;
  drawFx();
  applyFx();
  if (done) saveEq();
});
$$('#eqPre [data-pre]').forEach((b) => b.addEventListener('click', () => {
  EQ.state.pre = b.dataset.pre;
  drawFx();
  applyFx();
  saveEq();
}));
$('#fxReset').addEventListener('click', () => {
  Object.assign(EQ.state, { bass: 0, surround: 0, balance: 0, mono: false, pre: 'off', preHeadroom: -6, preBoost: 2 });
  drawFx();
  applyFx();
  saveEq();
});
function drawFx() {
  const s = EQ.state;
  Object.keys(DIALS).forEach(drawDial);
  $$('#eqMono [data-mono]').forEach((b) => b.classList.toggle('on', (b.dataset.mono === '1') === s.mono));
  $$('#eqPre [data-pre]').forEach((b) => b.classList.toggle('on', b.dataset.pre === s.pre));
  const r = PRE_RANGE[s.pre];
  $('#fxPre').classList.toggle('off', !r);
  fxPre.set(r ? (preampDb() - r[0]) / (r[1] - r[0]) : 0);
  $('#fxPreNum').textContent = `${dbText(preampDb())} dB`;
  $('#fxPreHint').textContent = r ? `${s.pre.toUpperCase()}: ${dbText(r[0])} TO ${dbText(r[1])} dB` : 'PREAMP IS OFF';
}

function initEq() {
  const saved = profile.eq || {};
  EQ.state = { ...EQ_DEFAULT, ...saved };
  if (!EQ_FREQS[EQ.state.n]) EQ.state.n = 10;
  if (!Array.isArray(EQ.state.gains) || EQ.state.gains.length !== EQ.state.n) EQ.state.gains = Array(EQ.state.n).fill(0);
  renderBands();
  drawFx();
  showEqPage(profile.eqPage || 1);
  rewireEq();
  applyFx();
  document.dispatchEvent(new CustomEvent('volume'));
}
