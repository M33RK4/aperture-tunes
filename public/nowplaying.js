// now playing: album art (with the hidden record), the oscilloscope, the opening aperture and the cassette.
// which one shows is picked in options (NOW PLAYING DISPLAY)
const NP = { mode: 'art', raf: 0, last: 0, disc: 0, reelL: 0, reelR: 0, vuL: 0, vuR: 0, blades: null, bladeLv: new Array(8).fill(0) };

function ago(ms) {
  if (!ms) return 'NEVER';
  const days = Math.floor((Date.now() - ms) / 86400000);
  const sameDay = new Date(ms).toDateString() === new Date().toDateString();
  if (sameDay) return 'TODAY';
  if (days <= 1) return 'YESTERDAY';
  if (days < 30) return `${days} DAYS AGO`;
  return new Date(ms).toLocaleDateString();
}

function npInfo(s) {
  const o = order();
  const pos = o.indexOf(P.cur) + 1;
  const pi = playInfo(s.path);
  const quality = [s.bitrate && `${s.bitrate} KBPS`, s.sampleRate && `${+(s.sampleRate / 1000).toFixed(1)} KHZ`].filter(Boolean).join(' // ') || '--';
  return `<div class="k">NOW PLAYING${pos ? ` // TRACK ${pos} OF ${o.length}` : ''}${P.shuffle ? ' // SHUFFLE' : ''}</div>
    <div class="big" title="${esc(songTitle(s))}">${esc(songTitle(s))}</div><div class="mid">${esc(s.artist || 'Unknown Artist')}</div>
    <div class="dim">${[s.album || 'Unknown Album', s.year, s.genre].filter(Boolean).map(esc).join(' // ')}</div>
    <div class="spec"><div><span>FORMAT</span>${esc(s.ext || '--')}${s.lossless ? ' // LOSSLESS' : ''}</div><div><span>QUALITY</span>${quality}</div>
      <div><span>PLAYED</span>${plural(pi.n, 'TIME').toUpperCase()}</div><div><span>LAST PLAYED</span>${ago(pi.last)}</div></div>`;
}
function npUpNext(n) {
  const next = upNext(n);
  const o = order();
  const at = o.indexOf(P.cur);
  return `<div class="upnext"><div class="k">UP NEXT</div>${next.map((it, i) => {
    const s = libSong(it.path) || fallbackSong(it.path);
    return `<div class="row" data-u="${it.u}" title="Double-click to play"><span class="n">${at + i + 2}</span><span class="t">${esc(songTitle(s))}</span><span class="dim">${fmtTime(s.duration)}</span></div>`;
  }).join('') || `<div class="row dim">${P.repeat === 'all' ? 'Back to the start of the queue.' : 'Nothing after this one.'}</div>`}</div>`;
}
const wideMode = () => NP.mode === 'scope' || NP.mode === 'cassette';

function renderNp() {
  const s = currentSong();
  const body = $('#npBody');
  if (!s) {
    body.innerHTML = '<div class="empty big">&gt; Nothing playing. Pick something in the <button class="cmd hot" id="npGoLib">[ LIBRARY ]</button></div>';
    $('#npGoLib').addEventListener('click', () => showView('lib'));
    stopVis();
    return;
  }
  if (NP.mode === 'scope') {
    body.innerHTML = `<div class="np wide"><div class="stage scope"><canvas id="visCanvas"></canvas></div>
      <div class="below"><div class="npinfo">${npInfo(s)}</div>${npUpNext(6)}</div></div>`;
  } else if (NP.mode === 'cassette') {
    body.innerHTML = `<div class="np wide"><div class="stage casrow">${vuSvg('L')}${cassetteSvg(s)}${vuSvg('R')}</div>
      <div class="below"><div class="npinfo">${npInfo(s)}</div>${npUpNext(6)}</div></div>`;
  } else if (NP.mode === 'aperture') {
    body.innerHTML = `<div class="np"><div class="stage blades">${bladesSvg()}</div><div class="npinfo">${npInfo(s)}${npUpNext(8)}</div></div>`;
  } else {
    // album art. one click on the cover slides the record out, another puts it back
    body.innerHTML = `<div class="np"><div class="vinylbox ${profile.vinyl ? 'out' : ''}" id="vinyl">
      <div class="disc"><div class="platter" id="platter"><div class="label"><div class="logo"></div></div></div><div class="shine"></div></div>
      ${artImg(s, 'cover')}</div><div class="npinfo">${npInfo(s)}${npUpNext(8)}</div></div>`;
  }
  startVis();
}

$('#npBody').addEventListener('click', (e) => {
  if (!e.target.closest('#vinyl .art')) return;
  saveProfile({ vinyl: !profile.vinyl });
  $('#vinyl').classList.toggle('out', !!profile.vinyl);
});
$('#npBody').addEventListener('dblclick', (e) => {
  const row = e.target.closest('.upnext .row[data-u]');
  if (row) jumpTo(+row.dataset.u);
});

// ---- one animation loop for whichever display is showing ----
// everything turns by the time that passed while playing, so pausing freezes it where it is
function stopVis() {
  cancelAnimationFrame(NP.raf);
  NP.raf = 0;
}
function startVis() {
  stopVis();
  if (view !== 'np' || !currentSong()) return;
  NP.last = performance.now();
  const frame = (now) => {
    NP.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - NP.last) / 1000);
    NP.last = now;
    if (NP.mode === 'scope') drawScope();
    else if (NP.mode === 'aperture') drawBlades(dt);
    else if (NP.mode === 'cassette') drawCassette(dt);
    else drawDisc(dt);
  };
  NP.raf = requestAnimationFrame(frame);
}

// the record: about 25 turns a minute, a bit faster than a real 33 so it reads as spinning
function drawDisc(dt) {
  if (P.playing) NP.disc = (NP.disc + dt * 150) % 360;
  const p = $('#platter');
  if (p) p.style.transform = `rotate(${NP.disc}deg)`;
}

// ---- oscilloscope ----
let visBuf = null, visFreq = null, scopeGain = 1;
function drawScope() {
  const cv = $('#visCanvas');
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (!w || !h) return;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const an = getAnalyser();
  const x = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  x.clearRect(0, 0, W, H);
  const step = 40 * dpr;
  x.lineWidth = 1;
  x.strokeStyle = 'rgba(245,163,26,0.10)';
  x.beginPath();
  for (let gx = step; gx < W; gx += step) { x.moveTo(gx, 0); x.lineTo(gx, H); }
  for (let gy = H / 2 % step; gy < H; gy += step) { x.moveTo(0, gy); x.lineTo(W, gy); }
  x.stroke();
  x.strokeStyle = 'rgba(245,163,26,0.32)';
  x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke();

  if (an) {
    if (!visBuf || visBuf.length !== an.fftSize) visBuf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(visBuf);
  }
  // auto-scale like a real scope, so quiet songs still fill the screen (silence stays flat)
  let peak = 0;
  if (visBuf) for (let i = 0; i < visBuf.length; i++) peak = Math.max(peak, Math.abs(visBuf[i]));
  const want = peak > 0.01 ? 0.85 / Math.max(peak, 0.12) : 1;
  scopeGain += (want - scopeGain) * 0.08;
  x.save();
  x.shadowColor = 'rgba(255,170,40,0.9)';
  x.shadowBlur = 10 * dpr;
  x.strokeStyle = '#ffc93c';
  x.lineWidth = 2 * dpr;
  x.beginPath();
  const n = visBuf ? visBuf.length : 2;
  for (let i = 0; i < n; i++) {
    const v = visBuf ? clamp(visBuf[i] * scopeGain, -1, 1) : 0;
    const px = (i / (n - 1)) * W, py = H / 2 - v * H * 0.45;
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.stroke();
  x.restore();
  x.fillStyle = 'rgba(245,163,26,0.55)';
  x.font = `${12 * dpr}px Consolas, monospace`;
  x.fillText('CH1  0.5V/DIV', 10 * dpr, 18 * dpr);
  const rate = ac ? `${(ac.sampleRate / 1000).toFixed(1)}kHz` : '';
  x.fillText(rate, W - x.measureText(rate).width - 10 * dpr, H - 10 * dpr);
  x.fillText(P.playing ? 'RUN' : 'HOLD', W - 44 * dpr, 18 * dpr);
}

// ---- opening aperture: each of the 8 blades slides outward with its own part of the music ----
// the blades come straight from aperture-science.svg, they're only moved, never redrawn
const LOGO_SIZE = 1272.877;
async function loadBlades() {
  if (NP.blades) return;
  const txt = await (await fetch('aperture-science.svg')).text();
  const d = txt.match(/ d="([^"]+)"/)[1];
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
  document.body.appendChild(probe);
  NP.blades = d.split(/(?=M)/).filter(Boolean).map((p) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', p);
    probe.appendChild(el);
    const b = el.getBBox();
    const dx = b.x + b.width / 2 - LOGO_SIZE / 2, dy = b.y + b.height / 2 - LOGO_SIZE / 2;
    const len = Math.hypot(dx, dy) || 1;
    // going round the circle, so neighbouring blades get neighbouring frequencies
    return { d: p, ux: dx / len, uy: dy / len, ang: Math.atan2(dy, dx) };
  }).sort((a, b) => a.ang - b.ang);
  probe.remove();
  if (NP.mode === 'aperture' && view === 'np') renderNp();
}
function bladesSvg() {
  if (!NP.blades) { loadBlades(); return ''; }
  const pad = 170;
  return `<svg class="bladesvg" viewBox="${-pad} ${-pad} ${LOGO_SIZE + pad * 2} ${LOGO_SIZE + pad * 2}">
    <defs><radialGradient id="bladeGrad" gradientUnits="userSpaceOnUse" cx="${LOGO_SIZE / 2}" cy="${LOGO_SIZE / 2}" r="${LOGO_SIZE / 2}">
      <stop offset="0.2" stop-color="#ffc93c"/><stop offset="0.75" stop-color="#f5a31a"/></radialGradient></defs>
    <circle cx="${LOGO_SIZE / 2}" cy="${LOGO_SIZE / 2}" r="${LOGO_SIZE * 0.62}" fill="none" stroke="rgba(245,163,26,0.14)" stroke-width="5"/>
    <circle cx="${LOGO_SIZE / 2}" cy="${LOGO_SIZE / 2}" r="${LOGO_SIZE * 0.68}" fill="none" stroke="rgba(245,163,26,0.1)" stroke-width="5"/>
    <g id="bladeGroup" fill="url(#bladeGrad)">${NP.blades.map((b, i) => `<path id="blade${i}" d="${b.d}"/>`).join('')}</g></svg>`;
}
function drawBlades() {
  if (!NP.blades) return;
  const an = getAnalyser();
  const lv = new Array(8).fill(0);
  let bass = 0;
  if (an) {
    if (!visFreq || visFreq.length !== an.frequencyBinCount) visFreq = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(visFreq);
    const bins = visFreq.length;
    // 8 log-spaced bands, from the bass up to the highs
    for (let i = 0; i < 8; i++) {
      const a = Math.floor(2 * (bins / 4) ** (i / 8)), b = Math.max(a + 1, Math.floor(2 * (bins / 4) ** ((i + 1) / 8)));
      let sum = 0;
      for (let k = a; k < b; k++) sum += visFreq[k];
      lv[i] = sum / ((b - a) * 255);
    }
    bass = lv[0];
  }
  const push = LOGO_SIZE * 0.1;
  NP.blades.forEach((b, i) => {
    // quick to open, slower to close, so it breathes instead of flickering
    const target = Math.min(1, lv[i] * 1.35);
    NP.bladeLv[i] += (target - NP.bladeLv[i]) * (target > NP.bladeLv[i] ? 0.45 : 0.12);
    const el = document.getElementById('blade' + i);
    if (el) el.setAttribute('transform', `translate(${(b.ux * NP.bladeLv[i] * push).toFixed(1)} ${(b.uy * NP.bladeLv[i] * push).toFixed(1)})`);
  });
  const g = $('#bladeGroup');
  if (g) {
    const glow = 6 + bass * 22;
    g.style.filter = `drop-shadow(0 0 ${glow}px rgba(255,168,30,${0.45 + bass * 0.45}))`;
  }
}

// ---- cassette between two VU meters ----
const CAS_ESC = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
function cassetteSvg(s) {
  const amber = '#f5a31a', dim = '#8c5c14', word = '#ffd52a';
  const reel = (side, cx) => {
    let teeth = '';
    for (let i = 0; i < 6; i++) teeth += `<rect x="-2" y="-11.5" width="4" height="4" fill="${amber}" transform="rotate(${i * 60})"/>`;
    let spokes = '';
    for (let i = 0; i < 3; i++) spokes += `<rect x="-1.5" y="-36" width="3" height="22" fill="rgba(245,163,26,.25)" transform="rotate(${i * 120 + 30})"/>`;
    return `<g transform="translate(${cx} 127)"><circle id="pack${side}" r="27" fill="#3a2a10" stroke="rgba(245,163,26,.35)" stroke-width="1"/>
      <g id="reel${side}">${spokes}<circle r="13" fill="#1b1408" stroke="${amber}" stroke-width="1.5"/>${teeth}<circle r="5" fill="#0e0a04" stroke="${dim}" stroke-width="1"/></g></g>`;
  };
  const screw = (x, y) => `<g transform="translate(${x} ${y})"><circle r="5.5" fill="#241a09" stroke="${dim}"/><path d="M-3 0H3M0 -3V3" stroke="${dim}" stroke-width="1.2" transform="rotate(25)"/></g>`;
  return `<svg class="cassette" viewBox="0 0 440 280">
  <defs><clipPath id="casWin"><rect x="112" y="98" width="216" height="58" rx="29"/></clipPath></defs>
  <rect x="2" y="2" width="436" height="276" rx="14" fill="#1b1408" stroke="${amber}" stroke-width="2"/>
  <rect x="12" y="12" width="416" height="256" rx="9" fill="none" stroke="rgba(245,163,26,.2)"/>
  ${screw(22, 22)}${screw(418, 22)}${screw(22, 258)}${screw(418, 258)}${screw(220, 252)}
  <rect x="30" y="24" width="380" height="156" rx="6" fill="#241a09" stroke="${dim}"/>
  <rect x="30" y="24" width="380" height="24" rx="6" fill="${amber}"/><rect x="30" y="38" width="380" height="10" fill="${amber}"/>
  <text x="44" y="41" font-family="Consolas, monospace" font-size="12" letter-spacing="2" fill="#120c03">APERTURE TUNES // SIDE A</text>
  <text x="396" y="41" text-anchor="end" font-family="Consolas, monospace" font-size="12" letter-spacing="1" fill="#120c03">C-60</text>
  <rect x="42" y="58" width="26" height="30" fill="none" stroke="${amber}" stroke-width="1.5"/>
  <text x="55" y="80" text-anchor="middle" font-family="Archivo, sans-serif" font-style="italic" font-weight="800" font-size="20" fill="${word}">A</text>
  <text x="80" y="76" font-family="Archivo, sans-serif" font-style="italic" font-weight="800" font-size="19" fill="${word}">${CAS_ESC(cut(songTitle(s), 26))}</text>
  <text x="80" y="92" font-family="Consolas, monospace" font-size="11" fill="${amber}">${CAS_ESC(cut([s.artist, s.album].filter(Boolean).join(' // '), 48))}</text>
  <text x="44" y="172" font-family="Consolas, monospace" font-size="9" fill="${dim}" letter-spacing="1">TYPE I // NORMAL BIAS</text>
  <text x="396" y="172" text-anchor="end" font-family="Consolas, monospace" font-size="9" fill="${dim}" letter-spacing="1">NR [X] OFF</text>
  <rect x="110" y="96" width="220" height="62" rx="31" fill="#0e0a04" stroke="${dim}" stroke-width="1.5"/>
  <g clip-path="url(#casWin)">${reel('L', 160)}${reel('R', 280)}<path id="tapeLine" d="M160 154 L280 154" stroke="#3a2a10" stroke-width="2"/></g>
  <rect x="110" y="96" width="220" height="62" rx="31" fill="none" stroke="${amber}" stroke-width="1" opacity=".5"/>
  <path d="M96 276 L116 214 H324 L344 276" fill="#160f05" stroke="${dim}" stroke-width="1.5"/>
  <path d="M124 226 H316" stroke="#3a2a10" stroke-width="3"/>
  <rect x="198" y="230" width="44" height="12" rx="2" fill="#0e0a04" stroke="${dim}"/>
  <circle cx="148" cy="248" r="6" fill="#0e0a04" stroke="${dim}"/><circle cx="292" cy="248" r="6" fill="#0e0a04" stroke="${dim}"/>
  <rect x="172" y="250" width="10" height="10" fill="#0e0a04" stroke="${dim}"/><rect x="258" y="250" width="10" height="10" fill="#0e0a04" stroke="${dim}"/>
</svg>`;
}
function vuSvg(side) {
  const amber = '#f5a31a', dim = '#8c5c14', red = '#ff5a3c';
  const cx = 75, cy = 92, R = 62, a0 = -140, a1 = -40;
  const pt = (deg, r) => [cx + Math.cos((deg * Math.PI) / 180) * r, cy + Math.sin((deg * Math.PI) / 180) * r];
  let ticks = '';
  for (let i = 0; i <= 10; i++) {
    const d = a0 + ((a1 - a0) * i) / 10;
    const [x1, y1] = pt(d, R), [x2, y2] = pt(d, R - (i % 5 ? 6 : 10));
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${i >= 8 ? red : amber}" stroke-width="1.5"/>`;
  }
  const [s1x, s1y] = pt(a0, R + 4), [s2x, s2y] = pt(a1 - 20, R + 4), [r2x, r2y] = pt(a1, R + 4);
  // the needle is drawn pointing straight up and turned between -50 and +50 degrees
  return `<svg class="vu" viewBox="0 0 150 110">
    <rect x="1" y="1" width="148" height="108" rx="6" fill="#1b1408" stroke="${dim}"/>
    <path d="M${s1x} ${s1y} A${R + 4} ${R + 4} 0 0 1 ${s2x} ${s2y}" fill="none" stroke="${amber}" stroke-width="2"/>
    <path d="M${s2x} ${s2y} A${R + 4} ${R + 4} 0 0 1 ${r2x} ${r2y}" fill="none" stroke="${red}" stroke-width="2"/>
    ${ticks}
    <text x="${cx}" y="76" text-anchor="middle" font-family="Consolas, monospace" font-size="12" letter-spacing="2" fill="${dim}">VU</text>
    <text x="12" y="100" font-family="Consolas, monospace" font-size="11" fill="${amber}">${side}</text>
    <line id="needle${side}" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - R + 4}" stroke="#ffc93c" stroke-width="2" transform="rotate(-50 ${cx} ${cy})" style="filter: drop-shadow(0 0 3px rgba(255,190,60,.9))"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="#241a09" stroke="${amber}"/>
  </svg>`;
}
let vuBuf = null;
function channelLevel(an) {
  if (!an) return 0;
  if (!vuBuf || vuBuf.length !== an.fftSize) vuBuf = new Float32Array(an.fftSize);
  an.getFloatTimeDomainData(vuBuf);
  let sum = 0;
  for (let i = 0; i < vuBuf.length; i++) sum += vuBuf[i] * vuBuf[i];
  const db = 20 * Math.log10(Math.sqrt(sum / vuBuf.length) + 1e-6);
  return clamp((db + 30) / 30, 0, 1); // -30 dB rests at the left, 0 dB hits the red
}
function drawCassette(dt) {
  const el = decks[A];
  const prog = el.duration ? clamp(el.currentTime / el.duration, 0, 1) : 0;
  // the tape winds from the left reel onto the right one as the song plays
  const rL = 15 + (1 - prog) * 25, rR = 15 + prog * 25;
  $('#packL')?.setAttribute('r', rL.toFixed(1));
  $('#packR')?.setAttribute('r', rR.toFixed(1));
  $('#tapeLine')?.setAttribute('d', `M160 ${(127 + rL).toFixed(1)} L280 ${(127 + rR).toFixed(1)}`);
  if (P.playing) {
    // tape moves at a steady speed, so the reel with less tape on it turns faster
    NP.reelL = (NP.reelL + (dt * 1800) / rL) % 360;
    NP.reelR = (NP.reelR + (dt * 1800) / rR) % 360;
  }
  $('#reelL')?.setAttribute('transform', `rotate(${NP.reelL.toFixed(1)})`);
  $('#reelR')?.setAttribute('transform', `rotate(${NP.reelR.toFixed(1)})`);
  const [anL, anR] = getChannelAnalysers();
  const tL = P.playing ? channelLevel(anL) : 0, tR = P.playing ? channelLevel(anR) : 0;
  // needles jump up fast and fall back slowly, like real ones
  NP.vuL += (tL - NP.vuL) * (tL > NP.vuL ? 0.35 : 0.08);
  NP.vuR += (tR - NP.vuR) * (tR > NP.vuR ? 0.35 : 0.08);
  $('#needleL')?.setAttribute('transform', `rotate(${(-50 + NP.vuL * 100).toFixed(1)} 75 92)`);
  $('#needleR')?.setAttribute('transform', `rotate(${(-50 + NP.vuR * 100).toFixed(1)} 75 92)`);
}

function initNowPlaying() {
  NP.mode = profile.npMode || 'art';
  if (NP.mode === 'aperture') loadBlades();
}
document.addEventListener('view', (e) => {
  if (e.detail === 'np') renderNp();
  else stopVis();
});
document.addEventListener('player', (e) => {
  if (view !== 'np') return;
  if (e.detail.track) return renderNp();
  // queue/shuffle/pause changes only touch the small bits, so the visualizer keeps running
  const s = currentSong();
  const up = $('#npBody .upnext');
  if (s && up) {
    up.outerHTML = npUpNext(wideMode() ? 6 : 8);
    $('#npBody .npinfo .k').outerHTML = npInfo(s).split('\n')[0];
  }
});
