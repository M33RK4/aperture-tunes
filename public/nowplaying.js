// now playing: album art (with the hidden record), the oscilloscope, the aperture and the cassette. which one
// shows is picked in options (NOW PLAYING DISPLAY). under the song there's UP NEXT or the lyrics (UNDER THE SONG)
const NP = { mode: 'art', raf: 0, last: 0, disc: 0, reelL: 0, reelR: 0, vuL: 0, vuR: 0, blades: null, cone: 0, shown: null };

function ago(ms) {
  if (!ms) return 'NEVER';
  const days = Math.floor((Date.now() - ms) / 86400000);
  const sameDay = new Date(ms).toDateString() === new Date().toDateString();
  if (sameDay) return 'TODAY';
  if (days <= 1) return 'YESTERDAY';
  if (days < 30) return `${days} DAYS AGO`;
  return new Date(ms).toLocaleDateString();
}

const npLine = (s) => [s.album || 'Unknown Album', s.year, s.genre].filter(Boolean).join(' // ');
function npInfo(s) {
  const o = order();
  const pos = o.indexOf(P.cur) + 1;
  const pi = playInfo(s.path);
  const quality = [s.bitrate && `${s.bitrate} KBPS`, s.sampleRate && `${+(s.sampleRate / 1000).toFixed(1)} KHZ`].filter(Boolean).join(' // ') || '--';
  return `<div class="k">NOW PLAYING${pos ? ` // TRACK ${pos} OF ${o.length}` : ''}${P.shuffle ? ' // SHUFFLE' : ''}</div>
    <div class="big" title="${esc(songTitle(s))}">${esc(songTitle(s))}</div><div class="mid">${esc(s.artist || 'Unknown Artist')}</div>
    <div class="dim al">${esc(npLine(s))}</div>
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
// whatever sits under the song: up next or the lyrics
function npSide(n) {
  if ((profile.npUnder || 'next') === 'lyrics') return `<div class="npside lyrside">${lyricsHtml()}</div>`;
  return npUpNext(n);
}
const wideMode = () => NP.mode === 'scope' || NP.mode === 'cassette';
const sideRows = () => (wideMode() ? 6 : 8);
function renderNp(typed = false) {
  const s = currentSong();
  const body = $('#npBody');
  if (!s) {
    body.innerHTML = '<div class="empty big">&gt; Nothing playing. Pick something in the <button class="cmd hot" id="npGoLib">[ LIBRARY ]</button></div>';
    $('#npGoLib').addEventListener('click', () => showView('lib'));
    NP.shown = null;
    stopVis();
    return;
  }
  // what the title lines said before, so a new song can type itself in over them
  const before = NP.shown;
  const side = npSide(sideRows());
  if (NP.mode === 'scope') {
    body.innerHTML = `<div class="np wide"><div class="stage scope"><canvas id="visCanvas"></canvas></div>
      <div class="below"><div class="npinfo">${npInfo(s)}</div>${side}</div></div>`;
  } else if (NP.mode === 'cassette') {
    body.innerHTML = `<div class="np wide"><div class="stage casrow">${cassetteSvg(s)}</div>
      <div class="below"><div class="npinfo">${npInfo(s)}</div>${side}</div></div>`;
  } else if (NP.mode === 'aperture') {
    body.innerHTML = `<div class="np"><div class="stage blades">${bladesSvg()}</div><div class="npinfo">${npInfo(s)}${side}</div></div>`;
  } else {
    // album art. one click on the cover slides the record out, another puts it back.
    // the shine turns with the record, it's what makes the spinning visible
    body.innerHTML = `<div class="np"><div class="vinylbox ${profile.vinyl ? 'out' : ''}" id="vinyl">
      <div class="disc"><div class="platter" id="platter" style="transform:rotate(${NP.disc.toFixed(1)}deg)"><div class="shine"></div><div class="label"><div class="logo"></div></div></div></div>
      ${artImg(s, 'cover')}</div><div class="npinfo">${npInfo(s)}${side}</div></div>`;
  }
  const now = { path: s.path, big: songTitle(s), mid: s.artist || 'Unknown Artist', al: npLine(s) };
  for (const k of ['big', 'mid', 'al']) {
    const el = $(`#npBody .npinfo .${k}`);
    if (!el) continue;
    if (typed && before && before.path !== s.path) {
      el.textContent = before[k];
      el.dataset.txt = before[k];
    } else {
      el.dataset.txt = now[k];
    }
    typeText(el, now[k]);
  }
  NP.shown = now;
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
    drawLyrics();
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
  x.strokeStyle = rgba('rgb', 0.10);
  x.beginPath();
  for (let gx = step; gx < W; gx += step) { x.moveTo(gx, 0); x.lineTo(gx, H); }
  for (let gy = H / 2 % step; gy < H; gy += step) { x.moveTo(0, gy); x.lineTo(W, gy); }
  x.stroke();
  x.strokeStyle = rgba('rgb', 0.32);
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
  x.shadowColor = rgba('lamp', 0.9);
  x.shadowBlur = 10 * dpr;
  x.strokeStyle = C.hi;
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
  x.fillStyle = rgba('rgb', 0.55);
  x.font = `${12 * dpr}px Consolas, monospace`;
  x.fillText('CH1  0.5V/DIV', 10 * dpr, 18 * dpr);
  const rate = ac ? `${(ac.sampleRate / 1000).toFixed(1)}kHz` : '';
  x.fillText(rate, W - x.measureText(rate).width - 10 * dpr, H - 10 * dpr);
  x.fillText(P.playing ? 'RUN' : 'HOLD', W - 44 * dpr, 18 * dpr);
}

// ---- aperture: all 8 blades push out and back together on the bass, like a speaker cone ----
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
    return { d: p, ux: dx / len, uy: dy / len };
  });
  probe.remove();
  if (NP.mode === 'aperture' && view === 'np') renderNp();
}
// the logo is drawn at about 70% of the panel, so the blades have room to push out without leaving it
const BLADE_PAD = 280, BLADE_PUSH = LOGO_SIZE * 0.15;
function bladesSvg() {
  if (!NP.blades) { loadBlades(); return ''; }
  const pad = BLADE_PAD, c = LOGO_SIZE / 2;
  return `<svg class="bladesvg" viewBox="${-pad} ${-pad} ${LOGO_SIZE + pad * 2} ${LOGO_SIZE + pad * 2}">
    <defs><radialGradient id="bladeGrad" gradientUnits="userSpaceOnUse" cx="${c}" cy="${c}" r="${c}">
      <stop offset="0.2" stop-color="${C.hi}"/><stop offset="0.75" stop-color="${C.main}"/></radialGradient></defs>
    <circle cx="${c}" cy="${c}" r="${LOGO_SIZE * 0.55}" fill="none" stroke="${rgba('rgb', 0.14)}" stroke-width="5"/>
    <circle cx="${c}" cy="${c}" r="${LOGO_SIZE * 0.7}" fill="none" stroke="${rgba('rgb', 0.1)}" stroke-width="5"/>
    <g id="bladeGroup" fill="url(#bladeGrad)">${NP.blades.map((b, i) => `<path id="blade${i}" d="${b.d}"/>`).join('')}</g></svg>`;
}
let bassAvg = 0, bassPeak = 0.1;
function drawBlades() {
  if (!NP.blades) return;
  const an = getAnalyser();
  let lv = 0;
  if (an) {
    if (!visFreq || visFreq.length !== an.frequencyBinCount) visFreq = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(visFreq);
    // the kick and bass, about 35 to 160 Hz. the loudest bit counts
    const hz = ac.sampleRate / an.fftSize;
    const a = Math.max(1, Math.floor(35 / hz)), b = Math.max(a + 1, Math.ceil(160 / hz));
    for (let k = a; k < b; k++) lv = Math.max(lv, visFreq[k] / 255);
  }
  // measured against the song's usual bass level and its recent loudest, so a steady hum barely moves
  // the cone and every kick throws it right out
  bassAvg += (lv - bassAvg) * 0.03;
  bassPeak = Math.max(lv, bassPeak - 0.0015, bassAvg + 0.05);
  const base = bassAvg * 0.8;
  const target = clamp((lv - base) / (bassPeak - base), 0, 1) ** 1.3;
  // a speaker pushes out fast and springs back nearly as fast
  NP.cone += (target - NP.cone) * (target > NP.cone ? 0.65 : 0.3);
  const push = NP.cone * BLADE_PUSH;
  NP.blades.forEach((b, i) => {
    const el = document.getElementById('blade' + i);
    if (el) el.setAttribute('transform', `translate(${(b.ux * push).toFixed(1)} ${(b.uy * push).toFixed(1)})`);
  });
  const g = $('#bladeGroup');
  if (g) {
    const c = LOGO_SIZE / 2, k = 1 + NP.cone * 0.04;
    g.setAttribute('transform', `translate(${c} ${c}) scale(${k.toFixed(3)}) translate(${-c} ${-c})`);
    g.style.filter = `drop-shadow(0 0 ${(6 + NP.cone * 26).toFixed(0)}px ${rgba('glow', (0.45 + NP.cone * 0.45).toFixed(2))})`;
  }
}

// ---- cassette: a tape deck with a VU meter on each side, a tape counter and play/pause lamps ----
// it's all one drawing, so it always fits the panel however narrow the window gets
const CAS_ESC = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
// the meters work like real VU meters: 0 VU is a normal loud song (9 dB under the loudest a file can go),
// the scale is bunched up at the quiet end and wide at the top, and red runs from 0 to +3
const VU_REF = -9, PEAK_VU = 4;
const vuPos = (vu) => Math.min(1, Math.pow(10, (vu - 3) / 20));
const REEL_X = [170, 290], REEL_Y = 139, HUB = 16, PACK_MIN = 17, PACK_ADD = 19;
function vuMeter(side, x) {
  const A = C.main, D = C.dim, RED = C.red;
  const cx = 75, cy = 92, R = 62, a0 = -140, a1 = -40;
  const ang = (db) => a0 + (a1 - a0) * vuPos(db);
  const pt = (deg, r) => [cx + Math.cos((deg * Math.PI) / 180) * r, cy + Math.sin((deg * Math.PI) / 180) * r];
  let ticks = '';
  for (const [db, major] of [[-20, 1], [-10, 1], [-7, 0], [-5, 1], [-3, 0], [-2, 0], [-1, 0], [0, 1], [1, 0], [2, 0], [3, 1]]) {
    const [x1, y1] = pt(ang(db), R), [x2, y2] = pt(ang(db), R - (major ? 10 : 6));
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${db >= 0 ? RED : A}" stroke-width="1.5"/>`;
  }
  const nums = [-20, -10, -5, 0, 3].map((db) => {
    const [nx, ny] = pt(ang(db), R + 13);
    return `<text x="${nx}" y="${ny + 3}" text-anchor="middle" font-family="Consolas, monospace" font-size="8" fill="${db >= 0 ? RED : D}">${db > 0 ? '+' : ''}${db}</text>`;
  }).join('');
  const [s1x, s1y] = pt(ang(-20), R + 4), [s2x, s2y] = pt(ang(0), R + 4), [r2x, r2y] = pt(a1, R + 4);
  // the needle is drawn pointing straight up and turned between -50 and +50 degrees
  return `<g transform="translate(${x} 6) scale(1.36)">
    <rect x="1" y="1" width="148" height="108" rx="6" fill="${C.panel}" stroke="${D}"/>
    <path d="M${s1x} ${s1y} A${R + 4} ${R + 4} 0 0 1 ${s2x} ${s2y}" fill="none" stroke="${A}" stroke-width="2"/>
    <path d="M${s2x} ${s2y} A${R + 4} ${R + 4} 0 0 1 ${r2x} ${r2y}" fill="none" stroke="${RED}" stroke-width="2"/>
    ${ticks}${nums}
    <text x="${cx}" y="74" text-anchor="middle" font-family="Consolas, monospace" font-size="11" letter-spacing="2" fill="${D}">VU</text>
    <text x="10" y="101" font-family="Consolas, monospace" font-size="11" fill="${A}">${side === 'L' ? 'LEFT' : 'RIGHT'}</text>
    <circle id="peak${side}" class="peak" cx="134" cy="97" r="4"/><text x="126" y="100.5" text-anchor="end" font-family="Consolas, monospace" font-size="7.5" fill="${D}" letter-spacing="1">PEAK</text>
    <line id="needle${side}" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - R + 4}" stroke="${C.hi}" stroke-width="2" transform="rotate(${(-50 + NP['vu' + side] * 100).toFixed(1)} ${cx} ${cy})" style="filter: drop-shadow(0 0 3px ${rgba('hi2', 0.9)})"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="${C.mid}" stroke="${A}"/></g>`;
}
function cassetteSvg(s) {
  const A = C.main, D = C.dim, W = C.word;
  const screw = (x, y) => `<g transform="translate(${x} ${y})"><circle r="5.5" fill="${C.mid}" stroke="${D}"/><path d="M-3 0H3M0 -3V3" stroke="${D}" stroke-width="1.2" transform="rotate(25)"/></g>`;
  const reel = (side, cx) => `<g transform="translate(${cx} ${REEL_Y})"><circle id="pack${side}" r="${PACK_MIN + PACK_ADD / 2}" fill="${C.tape}" stroke="${rgba('rgb', 0.45)}" stroke-width="1"/>
    ${[0.62, 0.8].map((f) => `<circle r="${((PACK_MIN + PACK_ADD) * f).toFixed(1)}" fill="none" stroke="rgba(0,0,0,.3)"/>`).join('')}
    <g id="reel${side}" transform="rotate(${(side === 'L' ? NP.reelL : NP.reelR).toFixed(1)})"><circle r="${HUB}" fill="${C.dark2}" stroke="${A}" stroke-width="1.7"/>
      ${[0, 60, 120, 180, 240, 300].map((a) => `<rect x="-2.2" y="${-HUB + 1.4}" width="4.4" height="6" fill="${A}" transform="rotate(${a})"/>`).join('')}
      <circle r="5.5" fill="${C.deeper}" stroke="${D}"/></g></g>`;
  const box = (x, inner) => `<g transform="translate(${x} 166)"><rect x="1" y="1" width="202" height="82" rx="6" fill="${C.panel}" stroke="${D}"/>${inner}</g>`;
  const counter = box(0, `<text x="14" y="20" font-family="Consolas, monospace" font-size="10" letter-spacing="1.5" fill="${D}">TAPE COUNTER</text>
    ${[0, 1, 2, 3].map((i) => `<rect x="${30 + i * 37}" y="30" width="31" height="40" rx="3" fill="${C.deeper}" stroke="${D}"/><text id="cnt${i}" x="${45.5 + i * 37}" y="60" text-anchor="middle" font-family="Consolas, monospace" font-size="27" fill="${C.hi}" style="filter: drop-shadow(0 0 3px ${rgba('lamp', 0.7)})">0</text>`).join('')}`);
  const lamps = box(676, `<text x="14" y="20" font-family="Consolas, monospace" font-size="10" letter-spacing="1.5" fill="${D}">TRANSPORT</text>
    <circle id="lampPlay" class="lamp" cx="32" cy="50" r="7"/><text x="46" y="55" font-family="Consolas, monospace" font-size="15" letter-spacing="1" fill="${A}">PLAY</text>
    <circle id="lampPause" class="lamp" cx="112" cy="50" r="7"/><text x="126" y="55" font-family="Consolas, monospace" font-size="15" letter-spacing="1" fill="${A}">PAUSE</text>`);
  // the song's own cover goes on the label, with the same tint as everywhere else
  const cover = s.cover
    ? `<image class="casart" href="/api/cover/${s.cover}" x="38" y="50" width="46" height="46" preserveAspectRatio="xMidYMid slice"/><rect x="38" y="50" width="46" height="46" fill="none" stroke="${D}"/>`
    : `<rect x="38" y="50" width="46" height="46" fill="${C.dark4}" stroke="${D}"/><text x="61" y="81" text-anchor="middle" font-family="Archivo, sans-serif" font-style="italic" font-weight="800" font-size="24" fill="${W}">A</text>`;
  const cassette = `<g transform="translate(241 0) scale(0.862)">
    <rect x="2" y="2" width="456" height="286" rx="13" fill="${C.panel}" stroke="${A}" stroke-width="2"/>
    <rect x="11" y="11" width="438" height="268" rx="8" fill="none" stroke="${rgba('rgb', 0.2)}"/>
    ${screw(21, 21)}${screw(439, 21)}${screw(21, 269)}${screw(439, 269)}${screw(230, 262)}
    <rect x="28" y="20" width="404" height="168" rx="6" fill="${C.mid}" stroke="${D}"/>
    <path d="M28 26 a6 6 0 0 1 6 -6 h392 a6 6 0 0 1 6 6 v16 h-404 z" fill="${A}"/>
    <text x="40" y="36" font-family="Consolas, monospace" font-size="11.5" letter-spacing="2" fill="${C.on}">APERTURE TUNES</text>
    <text x="420" y="36" text-anchor="end" font-family="Consolas, monospace" font-size="11.5" letter-spacing="1" fill="${C.on}">SIDE A // C-60</text>
    ${cover}
    <text x="94" y="66" font-family="Archivo, sans-serif" font-style="italic" font-weight="800" font-size="19" fill="${W}">${CAS_ESC(cut(songTitle(s), 27))}</text>
    <text x="94" y="82" font-family="Consolas, monospace" font-size="10.5" fill="${A}">${CAS_ESC(cut(s.artist || 'Unknown Artist', 46))}</text>
    <text x="94" y="95" font-family="Consolas, monospace" font-size="10.5" fill="${D}">${CAS_ESC(cut([s.album, s.year].filter(Boolean).join(' // '), 46))}</text>
    <text x="40" y="184" font-family="Consolas, monospace" font-size="8.5" fill="${D}" letter-spacing="1">TYPE I // NORMAL POSITION</text>
    <text x="420" y="184" text-anchor="end" font-family="Consolas, monospace" font-size="8.5" fill="${D}" letter-spacing="1">NR [ ] IN  [X] OUT</text>
    <rect x="100" y="102" width="260" height="74" rx="10" fill="${C.deepest}" stroke="${D}" stroke-width="1.5"/>
    <clipPath id="deckWin"><rect x="101.5" y="103.5" width="257" height="71" rx="9"/></clipPath>
    <g clip-path="url(#deckWin)">${reel('L', REEL_X[0])}${reel('R', REEL_X[1])}
      <path id="tapeL" d="" stroke="${C.tape}" stroke-width="2.4"/><path id="tapeR" d="" stroke="${C.tape}" stroke-width="2.4"/></g>
    ${[0, 1, 2, 3, 4].map((i) => `<path d="M${214 + i * 8} 104 v${i === 2 ? 8 : 5}" stroke="${rgba('rgb', 0.45)}"/>`).join('')}
    <rect x="100" y="102" width="260" height="74" rx="10" fill="none" stroke="${A}" stroke-width="1" opacity=".55"/>
    <path d="M102 288 L122 222 H338 L358 288" fill="${C.dark3}" stroke="${D}" stroke-width="1.5"/>
    <path d="M132 233 H328" stroke="${C.tape}" stroke-width="3.5"/>
    <rect x="208" y="238" width="44" height="12" rx="2" fill="${C.deepest}" stroke="${D}"/>
    <circle cx="156" cy="258" r="7" fill="${C.deepest}" stroke="${D}"/><circle cx="304" cy="258" r="7" fill="${C.deepest}" stroke="${D}"/>
    <rect x="181" y="260" width="10" height="10" fill="${C.deepest}" stroke="${D}"/><rect x="269" y="260" width="10" height="10" fill="${C.deepest}" stroke="${D}"/>
  </g>`;
  return `<svg class="deck" viewBox="0 0 880 250" preserveAspectRatio="xMidYMid meet">${vuMeter('L', 0)}${counter}${cassette}${vuMeter('R', 676)}${lamps}</svg>`;
}
// how loud one channel is right now, in VU (0 = normal loud) and as a needle position (0..1)
let vuBuf = null;
const SILENT = { lvl: 0, vu: -99 };
function channelLevel(an) {
  if (!an) return SILENT;
  if (!vuBuf || vuBuf.length !== an.fftSize) vuBuf = new Float32Array(an.fftSize);
  an.getFloatTimeDomainData(vuBuf);
  let sum = 0;
  for (let i = 0; i < vuBuf.length; i++) sum += vuBuf[i] * vuBuf[i];
  const vu = 20 * Math.log10(Math.sqrt(sum / vuBuf.length) + 1e-6) - VU_REF;
  return { lvl: vuPos(vu), vu };
}
NP.whirl = 0; NP.peakL = 0; NP.peakR = 0; NP.lastU = null;
function drawCassette(dt) {
  const el = decks[A];
  const prog = el.duration ? clamp(el.currentTime / el.duration, 0, 1) : 0;
  // the tape winds from the left reel onto the right one as the song plays
  const rL = PACK_MIN + (1 - prog) * PACK_ADD, rR = PACK_MIN + prog * PACK_ADD;
  $('#packL')?.setAttribute('r', rL.toFixed(1));
  $('#packR')?.setAttribute('r', rR.toFixed(1));
  $('#tapeL')?.setAttribute('d', `M${(REEL_X[0] - rL * 0.35).toFixed(1)} ${(REEL_Y + rL * 0.94).toFixed(1)} L104 182`);
  $('#tapeR')?.setAttribute('d', `M${(REEL_X[1] + rR * 0.35).toFixed(1)} ${(REEL_Y + rR * 0.94).toFixed(1)} L356 182`);
  // a new song makes the reels whizz for a moment, like the deck winding on to the next track
  if (NP.lastU !== P.cur) { if (NP.lastU !== null) NP.whirl = 0.55; NP.lastU = P.cur; }
  const fast = NP.whirl > 0 ? 9 : 1;
  NP.whirl = Math.max(0, NP.whirl - dt);
  if (P.playing || fast > 1) {
    // tape moves at a steady speed, so the reel with less tape on it turns faster
    NP.reelL = (NP.reelL + (dt * 1600 * fast) / rL) % 360;
    NP.reelR = (NP.reelR + (dt * 1600 * fast) / rR) % 360;
  }
  $('#reelL')?.setAttribute('transform', `rotate(${NP.reelL.toFixed(1)})`);
  $('#reelR')?.setAttribute('transform', `rotate(${NP.reelR.toFixed(1)})`);
  const [anL, anR] = getChannelAnalysers();
  const L = P.playing ? channelLevel(anL) : SILENT, R = P.playing ? channelLevel(anR) : SILENT;
  // needles swing up quickly and settle back a little slower, at the same speed whatever the frame rate
  const swing = (n, to) => n + (to - n) * (1 - Math.exp(-Math.min(dt, 0.1) / (to > n ? 0.06 : 0.12)));
  NP.vuL = swing(NP.vuL, L.lvl);
  NP.vuR = swing(NP.vuR, R.lvl);
  $('#needleL')?.setAttribute('transform', `rotate(${(-50 + NP.vuL * 100).toFixed(1)} 75 92)`);
  $('#needleR')?.setAttribute('transform', `rotate(${(-50 + NP.vuR * 100).toFixed(1)} 75 92)`);
  // the peak light flashes on hits that go well into the red, quicker than the needle can show them
  NP.peakL = L.vu >= PEAK_VU ? 0.25 : Math.max(0, NP.peakL - dt);
  NP.peakR = R.vu >= PEAK_VU ? 0.25 : Math.max(0, NP.peakR - dt);
  $('#peakL')?.classList.toggle('on', NP.peakL > 0);
  $('#peakR')?.classList.toggle('on', NP.peakR > 0);
  // the counter runs with the song, like the rolling numbers on a real deck
  const n = String(Math.floor(el.currentTime || 0) % 10000).padStart(4, '0');
  for (let i = 0; i < 4; i++) { const d = document.getElementById('cnt' + i); if (d && d.textContent !== n[i]) d.textContent = n[i]; }
  $('#lampPlay')?.classList.toggle('on', P.playing);
  $('#lampPause')?.classList.toggle('on', !P.playing);
}

function initNowPlaying() {
  NP.mode = ['art', 'scope', 'aperture', 'cassette'].includes(profile.npMode) ? profile.npMode : 'art';
  if (NP.mode === 'aperture') loadBlades();
}
document.addEventListener('view', (e) => {
  if (e.detail === 'np') renderNp();
  else stopVis();
});
// the drawn displays use the theme's colours, so they get drawn again
document.addEventListener('theme', () => { if (view === 'np') renderNp(); });
document.addEventListener('player', (e) => {
  if (view !== 'np') return;
  if (e.detail.track) return renderNp(true);
  // queue/shuffle/pause changes only touch the small bits, so the visualizer keeps running
  const s = currentSong();
  if (!s) return renderNp();
  const up = $('#npBody .upnext');
  if (up) up.outerHTML = npUpNext(sideRows());
  const k = $('#npBody .npinfo .k');
  if (k) k.outerHTML = npInfo(s).split('\n')[0];
});
