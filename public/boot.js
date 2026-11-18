// the boot screen: the old terminal powers up, the aperture's blades swing in and close into the logo, then the
// logo does what it does in Portal's opening: it spins up, shoots off into the distance, comes flying back at the
// end of the word and rolls left across it, showing each letter as it goes by (letters under it show through in
// reverse). just before it lands, the one blade the A's slant takes the place of fades out, and the gap it leaves
// turns into place around the A as the logo stops. TUNES slides in underneath.
// then a boot log runs through the real start-up (folders, library, queue, EQ), it says welcome back and fades
// into the app. any key or click skips it, and it can be turned off in options (BOOT SCREEN)
const BOOT = { el: null, raf: 0, t0: 0, last: 0, wait: 0, data: null, blades: null, shapes: null, geo: null, lines: null, resolve: null };
const B = {
  POWER: 420, BLADES: 330, BLADE_GAP: 62, BLADE_DUR: 560, RING: 820, RING_DUR: 560,
  SPIN: 1460, FLY: 1640, ROLL: 2080, ROLL_DUR: 620, STOP: 2620, STOP_DUR: 290, TUNES: 2820, TUNES_DUR: 320,
  SUB: 3120, LOG: 2650, LINE: 180, HOLD: 600, EXIT: 480,
};
B.HAND = B.TUNES + B.TUNES_DUR + 20;
// it keeps all 8 blades until it has nearly reached its place (2667 ms), then the blade that would sit on the A
// fades out quickly and the A fits into the gap as the logo turns the last bit
B.DROP = B.ROLL + B.ROLL_DUR - 33;
B.DROP_DUR = 120;
const LOGO = 1272.877, PAD = 300, FILL = LOGO / (LOGO + PAD * 2);
// where aperture-science.svg sits exactly on top of the wordmark's own logo, in wordmark.svg units (measured)
const WM_LOGO = { x: 261.25, y: 262.75, d: 471 };
const SHUTTER = 28; // ms of motion blur on the spinning logo, like a camera would see it

const ease = (p) => 1 - Math.pow(1 - p, 3);
const prog = (t, a, d) => Math.min(1, Math.max(0, (t - a) / d));

// the 8 blades straight from aperture-science.svg (only ever moved, never redrawn)
async function bootBlades() {
  const txt = await (await fetch('aperture-science.svg')).text();
  const d = txt.match(/ d="([^"]+)"/)[1];
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
  document.body.appendChild(probe);
  const out = d.split(/(?=M)/).filter(Boolean).map((p) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', p);
    probe.appendChild(el);
    const b = el.getBBox();
    const dx = b.x + b.width / 2 - LOGO / 2, dy = b.y + b.height / 2 - LOGO / 2, len = Math.hypot(dx, dy) || 1;
    return { d: p, ux: dx / len, uy: dy / len };
  });
  probe.remove();
  return out;
}
// the wordmark in the pieces the boot screen moves, read straight from wordmark.svg (never changed): its letters
// one by one, and TUNES. the A is part of the logo's own shape in that file (the logo's right blade plus one
// upright stroke), so it's the piece of the logo that sticks out past the circle
async function bootShapes() {
  const txt = await (await fetch('wordmark.svg')).text();
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:1920px;height:520px;visibility:hidden;pointer-events:none';
  host.innerHTML = txt;
  document.body.appendChild(host);
  try {
    const svg = host.querySelector('svg');
    svg.setAttribute('width', 1920);
    svg.setAttribute('height', 520);
    const paths = [...svg.querySelectorAll('path')];
    const box = (d) => {
      const e = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      e.setAttribute('d', d);
      svg.appendChild(e);
      const b = e.getBBox();
      e.remove();
      return { x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height, area: b.width * b.height };
    };
    const inside = (a, b) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
    // a path's pieces grouped into letters: a piece sitting inside another one is its hole
    const letters = (d) => {
      const parts = d.split(/(?=M)/).filter((s) => s.trim()).map((s) => ({ d: s, b: box(s) })).sort((p, q) => q.b.area - p.b.area);
      const out = [];
      for (const p of parts) {
        const o = out.find((l) => inside(p.b, l.b));
        if (o) o.d += p.d;
        else out.push({ d: p.d, b: p.b });
      }
      return out;
    };
    const a = letters(paths[0].getAttribute('d')).reduce((m, l) => (l.b.x1 > m.b.x1 ? l : m));
    const word = [a, ...letters(paths[1].getAttribute('d'))].sort((p, q) => p.b.x0 - q.b.x0)
      .map((l) => ({ path: new Path2D(l.d), x0: l.b.x0, x1: l.b.x1 }));
    const tunes = paths.slice(2).map((p) => {
      const m = p.getCTM(), out = new Path2D();
      out.addPath(new Path2D(p.getAttribute('d')), new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]));
      return out;
    });
    if (word.length < 8 || tunes.length < 5) throw new Error('wordmark not as expected');
    return { word, tunes };
  } finally {
    host.remove();
  }
}

// how far the logo has turned by t ms (degrees, counter-clockwise like a wheel rolling left). it spins up, keeps
// going through the flight and the roll, and winds down once it's home. the whole turn is a whole number of
// blade steps (45°) so it comes to rest lined up exactly with the wordmark's logo
const TURN = (() => {
  const from = B.SPIN, to = B.STOP + B.STOP_DUR, top = 1.25;
  const w = (t) => {
    const up = prog(t, from, 380), s = up * up * (3 - 2 * up);
    return top * s * (1 - 0.45 * prog(t, B.ROLL, B.ROLL_DUR)) * Math.pow(1 - prog(t, B.STOP, B.STOP_DUR), 2);
  };
  const cum = new Float64Array(to - from + 1);
  for (let i = 1; i < cum.length; i++) cum[i] = cum[i - 1] + (w(from + i - 1) + w(from + i)) / 2;
  const total = cum[cum.length - 1], k = (Math.max(1, Math.round(total / 45)) * 45) / total;
  return {
    angle(t) {
      if (t <= from) return 0;
      if (t >= to) return -cum[cum.length - 1] * k;
      const i = Math.floor(t - from), f = t - from - i;
      return -(cum[i] + (cum[i + 1] - cum[i]) * f) * k;
    },
  };
})();

// where the logo is at t ms (centre and size in px inside the wordmark's box) and how bright
function bootPose(t, G) {
  const { from, start, end } = G;
  if (t < B.FLY) return { x: from.x, y: from.y, d: from.d, a: 1 };
  if (t < B.ROLL) {
    // it shoots off into the distance (small and dim), then comes flying back at the end of the word
    const p = prog(t, B.FLY, B.ROLL - B.FLY), far = start.d * 0.16;
    let q, d, a;
    if (p < 0.55) { const r = ease(p / 0.55); q = r * 0.9; d = from.d + (far - from.d) * r; a = 1 - 0.45 * r; }
    else { const r = (p - 0.55) / 0.45; q = 0.9 + 0.1 * ease(r); d = far + (start.d - far) * r * r; a = 0.55 + 0.45 * r; }
    // on a curve: out to the right first, then down onto the line of the word
    const cx = start.x + (start.x - from.x) * 0.15, cy = from.y, u = 1 - q;
    return { x: u * u * from.x + 2 * u * q * cx + q * q * start.x, y: u * u * from.y + 2 * u * q * cy + q * q * start.y, d, a };
  }
  // the roll: still carrying its speed from the flight, slowing right down as it reaches its place
  const e = 1 - Math.pow(1 - prog(t, B.ROLL, B.ROLL_DUR), 2.3);
  return { x: start.x + (end.x - start.x) * e, y: end.y, d: end.d, a: 1 };
}

// what the log says, from the real start-up
function bootLines(d) {
  return [
    [`APERTURE TUNES ${d.version} // COLD BOOT`, null, null],
    ['MOUNTING MUSIC FOLDERS', `${d.folders} FOUND`, 'OK'],
    ['INDEXING LIBRARY', typeof d.songs === 'number' ? `${d.songs} SONGS` : d.songs, 'OK'],
    ['RESTORING QUEUE', d.queue ? `${d.queue} SONGS` : 'EMPTY', 'OK'],
    ['CALIBRATING VU METERS', '', 'OK'],
    ['EQUALIZER', d.eq, 'OK'],
    ['TEST SUBJECT', d.user ? d.user.toUpperCase() : 'UNKNOWN', d.user ? 'OK' : 'PENDING'],
    ['CAKE', '', 'NOT FOUND'],
  ];
}

function bootBuild() {
  const c = LOGO / 2, R = LOGO * 0.62, circ = 2 * Math.PI * R;
  const el = document.createElement('div');
  el.className = 'boot';
  el.innerHTML = `<div class="b-crt">
      <div class="b-top"><span>APERTURE SCIENCE // <b>AUDIO ENRICHMENT CENTER</b></span><span>TERMINAL 02 // <b id="bVer"></b></span></div>
      <div class="b-mid">
        <div class="b-lock" id="bLock"><span class="b-word"><i id="bWord"></i></span>
          <svg class="b-logo" id="bLogoSvg" viewBox="${-PAD} ${-PAD} ${LOGO + PAD * 2} ${LOGO + PAD * 2}">
            <defs><radialGradient id="bGrad" gradientUnits="userSpaceOnUse" cx="${c}" cy="${c}" r="${c}"><stop offset="0.2" stop-color="${C.hi}"/><stop offset="0.75" stop-color="${C.main}"/></radialGradient></defs>
            <g id="bDeco"><circle id="bRing" cx="${c}" cy="${c}" r="${R}" fill="none" stroke="${rgba('rgb', 0.45)}" stroke-width="9" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" transform="rotate(-90 ${c} ${c})"/>
              <g id="bTicks">${[0, 90, 180, 270].map((a) => `<path d="M${c} ${c - R - 90} V${c - R - 26}" stroke="${C.main}" stroke-width="12" transform="rotate(${a} ${c} ${c})"/>`).join('')}</g></g>
            <g id="bLogo" fill="url(#bGrad)">${BOOT.blades.map((b, i) => `<path id="bBlade${i}" d="${b.d}" opacity="0"/>`).join('')}</g>
          </svg><canvas class="b-merge" id="bMerge"></canvas></div>
        <div class="b-sub" id="bSub"></div>
      </div>
      <div class="b-low">
        <div class="b-log" id="bLog"></div>
        <div class="b-bar"><span>LOADING</span><div class="b-cells">${'<i></i>'.repeat(40)}</div><span class="b-pct" id="bPct">0%</span></div>
        <div class="b-welcome" id="bWelcome"></div>
      </div>
      <div class="b-bottom"><span id="bSkip">PRESS ANY KEY TO SKIP</span><span id="bClock"></span></div>
    </div><div class="b-flash" id="bFlash"></div>`;
  BOOT.el = el;
  BOOT.circ = circ;
  document.body.appendChild(el);
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
  $('#bClock').textContent = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} // ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

// the places the logo goes through, in px inside the wordmark's box: where the blades close (above the
// wordmark), where it lands back from the distance (over the last E) and where it ends up (on the wordmark's own
// logo). the canvas it's drawn on covers all of that, glow included. worked out again if the window changes size
function bootGeo() {
  const lock = $('#bLock'), W = lock.clientWidth, H = lock.clientHeight, k = W / 1920;
  const big = Math.min(200, window.innerHeight * 0.22);
  const from = { x: W / 2, y: -big * 0.62 - 26, d: big };
  const end = { x: WM_LOGO.x * k, y: WM_LOGO.y * k, d: WM_LOGO.d * k };
  const last = BOOT.shapes.word[BOOT.shapes.word.length - 1];
  const start = { x: ((last.x0 + last.x1) / 2) * k, y: end.y, d: end.d };
  const m = 44, left = Math.min(from.x - from.d * 0.75, end.x - end.d * 0.75) - m, right = Math.max(start.x + start.d * 0.75, W) + m;
  const top = from.y - from.d * 0.75 - m, bottom = H + m;
  // a bit finer than the screen, so it stays as sharp as the real wordmark while the camera slowly pushes in
  const dpr = (window.devicePixelRatio || 1) * 1.25, cw = Math.ceil((right - left) * dpr), ch = Math.ceil((bottom - top) * dpr);
  const cv = $('#bMerge');
  Object.assign(cv.style, { left: `${left}px`, top: `${top}px`, width: `${cw / dpr}px`, height: `${ch / dpr}px` });
  cv.width = cw;
  cv.height = ch;
  const layer = () => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c.getContext('2d'); };
  // the SVG the blades close in sits where the flight starts
  const svg = $('#bLogoSvg'), box = from.d / FILL;
  Object.assign(svg.style, { width: `${box}px`, height: `${box}px`, left: `${from.x - box / 2}px`, top: `${from.y - box / 2}px` });
  return { W, H, k, from, start, end, left, top, dpr, cw, ch, ctx: cv.getContext('2d'), letters: layer(), logo: layer(), mix: layer() };
}

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, f) => `rgb(${hexRgb(a).map((v, i) => Math.round(v + (hexRgb(b)[i] - v) * f)).join(',')})`;

// the merge, drawn on the canvas: the spinning logo with motion blur, the letters it has rolled past (the ones
// under it show through in reverse, like in the Portal intro) and TUNES. when it's done the real wordmark takes over
function bootMerge(t) {
  const G = BOOT.geo || (BOOT.geo = bootGeo());
  const on = t >= B.SPIN && t < B.HAND;
  $('#bMerge').style.visibility = on ? 'visible' : 'hidden';
  $('#bLogo').style.visibility = t < B.SPIN ? 'visible' : 'hidden';
  $('#bWord').style.visibility = t >= B.HAND ? 'visible' : 'hidden';
  $('#bDeco').setAttribute('opacity', (1 - prog(t, B.SPIN, 260)).toFixed(2));
  // the camera slowly pushing in, like the intro does
  $('#bLock').style.transform = `scale(${(1 + 0.04 * ease(prog(t, B.ROLL, 2600))).toFixed(4)})`;
  if (!on) return;
  const { ctx, letters: L, logo: O, mix: X, dpr, k, left, top, cw, ch } = G;
  const word = (c) => c.setTransform(dpr * k, 0, 0, dpr * k, -left * dpr, -top * dpr);

  // its glow goes from the closed logo's (flaring as the last blade lands) to the wordmark's
  const flare = Math.max(0, 1 - Math.abs(t - 1180) / 380), g = ease(prog(t, B.SPIN, 500));
  const r1 = 8 + flare * 36 + (7 - 8 - flare * 36) * g, a1 = 0.45 + flare * 0.5 + (0.6 - 0.45 - flare * 0.5) * g;
  $('#bMerge').style.filter = `drop-shadow(0 0 ${r1.toFixed(1)}px rgba(var(--rgb-glow), ${a1.toFixed(2)})) drop-shadow(0 0 ${(18 * g).toFixed(1)}px rgba(var(--rgb-glow2), ${(0.3 * g).toFixed(2)}))`;

  // 1. the letters: each one appears as the logo rolls over it, the last E just as the logo lands on it
  L.setTransform(1, 0, 0, 1, 0, 0);
  L.clearRect(0, 0, cw, ch);
  word(L);
  L.globalCompositeOperation = 'source-over';
  L.fillStyle = C.word;
  const ws = BOOT.shapes.word, X0 = bootPose(t, G).x / k;
  ws.forEach((l, i) => {
    const a = t < B.ROLL ? (i === ws.length - 1 ? prog(t, B.ROLL - 100, 100) : 0) : Math.min(1, Math.max(0, (l.x1 - X0) / ((l.x1 - l.x0) / 2)));
    if (a <= 0) return;
    L.globalAlpha = a;
    L.fill(l.path, 'evenodd');
  });
  // TUNES slides in from the right underneath, blurred while it moves
  const tp = prog(t, B.TUNES, B.TUNES_DUR);
  if (tp > 0) {
    const slide = (p) => (1 - ease(p)) * 160, now = slide(tp), was = slide(prog(t - SHUTTER, B.TUNES, B.TUNES_DUR));
    const n = Math.max(1, Math.min(12, Math.ceil(((was - now) * k * dpr) / 1.5)));
    L.globalCompositeOperation = 'lighter';
    for (let j = 0; j < n; j++) {
      const dx = n === 1 ? now : now + (was - now) * (j / (n - 1));
      L.globalAlpha = ease(tp) / n;
      L.setTransform(dpr * k, 0, 0, dpr * k, (dx * k - left) * dpr, -top * dpr);
      BOOT.shapes.tunes.forEach((p) => L.fill(p));
    }
  }

  // 2. the logo, spinning: a few copies along the turn it made in the last instant, added up into the blur
  O.setTransform(1, 0, 0, 1, 0, 0);
  O.clearRect(0, 0, cw, ch);
  O.globalCompositeOperation = 'lighter';
  const p1 = bootPose(t, G), p0 = bootPose(Math.max(B.SPIN, t - SHUTTER), G);
  const turn1 = TURN.angle(t), turn0 = TURN.angle(Math.max(B.SPIN, t - SHUTTER));
  const sweep = Math.max(Math.abs(turn1 - turn0) * (Math.PI / 180) * (p1.d / 2) * 0.9, Math.hypot(p1.x - p0.x, p1.y - p0.y), Math.abs(p1.d - p0.d) / 2) * dpr;
  const n = Math.max(1, Math.min(36, Math.ceil(sweep / 1.5)));
  // the colour goes from the closed logo's glowing gradient to the wordmark's flat colour as it spins up
  const c = LOGO / 2, f = prog(t, B.SPIN, 420), grad = O.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0.2, mixHex(C.hi, C.word, f));
  grad.addColorStop(0.75, mixHex(C.main, C.word, f));
  O.fillStyle = grad;
  for (let j = 0; j < n; j++) {
    const tt = n === 1 ? t : Math.max(B.SPIN, t - SHUTTER * (1 - j / (n - 1)));
    const p = n === 1 ? p1 : bootPose(tt, G), s = p.d / LOGO;
    O.globalAlpha = p.a / n;
    O.setTransform(dpr, 0, 0, dpr, (p.x - left) * dpr, (p.y - top) * dpr);
    O.rotate((TURN.angle(tt) * Math.PI) / 180);
    O.scale(s, s);
    O.translate(-c, -c);
    // the blade the A takes the place of fades out
    const drop = prog(tt, B.DROP, B.DROP_DUR), keep = 1 - drop * drop * (3 - 2 * drop);
    BOOT.blades.forEach((b, k) => {
      if (k !== BOOT.gone) return O.fill(b.path);
      if (keep <= 0) return;
      O.globalAlpha = (p.a / n) * keep;
      O.fill(b.path);
      O.globalAlpha = p.a / n;
    });
  }

  // 3. together: where the logo covers a letter the letter shows through in reverse. right at the very end (it
  // has stopped by then and nothing overlaps any more) it switches to plain on top, so no hairline is left over
  const u = ease(prog(t, B.STOP + B.STOP_DUR - 90, 90));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(L.canvas, 0, 0);
  ctx.globalCompositeOperation = u >= 1 ? 'source-over' : 'xor';
  ctx.drawImage(O.canvas, 0, 0);
  if (u > 0 && u < 1) {
    X.setTransform(1, 0, 0, 1, 0, 0);
    X.globalCompositeOperation = 'copy';
    X.drawImage(L.canvas, 0, 0);
    X.globalCompositeOperation = 'source-over';
    X.drawImage(O.canvas, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.globalAlpha = 1 - u;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = u;
    ctx.drawImage(X.canvas, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function bootLog() {
  BOOT.lines = bootLines(BOOT.data);
  $('#bVer').textContent = `v${BOOT.data.version}`;
  $('#bLog').innerHTML = BOOT.lines.map(([label, val, st]) => `<div class="l" style="visibility:hidden"><span class="lb"></span>${st === null ? '' : `<span class="dots">${' .'.repeat(60)}</span><span class="v">${esc(val)}</span><span class="st${st === 'NOT FOUND' ? ' bad' : ''}">[ ${st} ]</span>`}</div>`).join('');
}

// draws the boot screen as it is t ms in. tl is the same clock minus any wait for the start-up (the log runs
// on that one). everything is worked out from the time, so it can't drift or stutter its way out of sync
function bootFrame(t, tl = t) {
  const el = BOOT.el;
  if (!el) return;
  // 1. power on: a bright dot stretches into a line, then the line opens up into the screen
  const crt = el.querySelector('.b-crt'), flash = $('#bFlash');
  if (t < 150) { const p = ease(t / 150); crt.style.transform = `scale(${0.02 + p * 0.98}, 0.004)`; flash.style.opacity = 1; flash.style.transform = 'scale(1, 0.02)'; }
  else if (t < B.POWER) { const p = ease((t - 150) / (B.POWER - 150)); crt.style.transform = `scale(1, ${0.004 + p * 0.996})`; flash.style.opacity = 1 - p; flash.style.transform = `scale(1, ${0.02 + p})`; }
  else { crt.style.transform = 'none'; flash.style.opacity = 0; }
  // the tube settling: a few quick flickers
  crt.style.opacity = t > B.POWER && t < B.POWER + 210 ? [1, 0.75, 1, 0.88, 1, 0.94][Math.floor((t - B.POWER) / 35)] ?? 1 : 1;
  const chrome = prog(t, 480, 420);
  el.querySelector('.b-top').style.opacity = chrome;
  el.querySelector('.b-bottom').style.opacity = chrome * (t > 2600 ? 0.55 + 0.45 * (Math.floor(t / 530) % 2) : 1);

  // 2. the aperture closes: every blade swings in from outside and settles exactly where it is in the logo
  const c = LOGO / 2;
  BOOT.blades.forEach((b, i) => {
    const p = ease(prog(t, B.BLADES + i * B.BLADE_GAP, B.BLADE_DUR)), far = (1 - p) * 780;
    const bl = document.getElementById('bBlade' + i);
    bl.setAttribute('opacity', Math.min(1, p * 1.7).toFixed(3));
    bl.setAttribute('transform', p >= 1 ? '' : `translate(${(b.ux * far).toFixed(1)} ${(b.uy * far).toFixed(1)}) rotate(${(-(1 - p) * 75).toFixed(2)} ${c} ${c})`);
  });
  $('#bRing').setAttribute('stroke-dashoffset', (BOOT.circ * (1 - ease(prog(t, B.RING, B.RING_DUR)))).toFixed(1));
  $('#bTicks').setAttribute('opacity', prog(t, B.RING + 250, 350).toFixed(2));
  $('#bTicks').setAttribute('transform', `rotate(${((t / 30) % 360).toFixed(1)} ${c} ${c})`);
  // it flares up as the last blade lands
  const flare = Math.max(0, 1 - Math.abs(t - 1180) / 380);
  $('#bLogo').style.filter = `drop-shadow(0 0 ${(8 + flare * 36).toFixed(0)}px ${rgba('glow', (0.45 + flare * 0.5).toFixed(2))})`;

  // 3. the logo spins up, flies off and rolls back in across the word into its place, then TUNES slides in
  bootMerge(t);
  const sub = 'AUDIO ENRICHMENT CENTER';
  $('#bSub').textContent = sub.slice(0, Math.floor(prog(t, B.SUB, sub.length * 22) * sub.length));

  // 4. the boot log, one line at a time
  if (!BOOT.data) return;
  if (!BOOT.lines) bootLog();
  const rows = $('#bLog').children, n = BOOT.lines.length;
  let done = 0;
  for (let k = 0; k < n; k++) {
    const lt = tl - (B.LOG + k * B.LINE), row = rows[k];
    row.style.visibility = lt >= 0 ? 'visible' : 'hidden';
    if (lt < 0) continue;
    const label = `> ${BOOT.lines[k][0]}`;
    row.firstChild.textContent = label.slice(0, Math.max(2, Math.ceil(label.length * Math.min(1, lt / 80))));
    const dots = row.querySelector('.dots'), v = row.querySelector('.v'), st = row.querySelector('.st');
    if (dots) dots.style.clipPath = `inset(0 ${(100 - prog(lt, 80, 60) * 100).toFixed(0)}% 0 0)`;
    if (v) v.style.opacity = lt >= 135 ? 1 : 0;
    if (st) st.style.opacity = lt >= 160 ? 1 : 0;
    if (lt >= 160 || st === null) done++;
  }
  const frac = done / n;
  el.querySelectorAll('.b-cells i').forEach((cell, i) => cell.classList.toggle('on', i < Math.round(frac * 40)));
  $('#bPct').textContent = `${Math.round(frac * 100)}%`;
  // 5. welcome back
  const wt = B.LOG + n * B.LINE + 140;
  const msg = BOOT.data.user ? `WELCOME BACK, ${BOOT.data.user.toUpperCase()}.` : 'PLEASE IDENTIFY YOURSELF, TEST SUBJECT.';
  const typed = Math.floor(prog(tl, wt, msg.length * 30) * msg.length);
  $('#bWelcome').innerHTML = tl >= wt ? `${esc(msg.slice(0, typed))}<span class="cur">_</span>` : '';
  BOOT.end = wt + msg.length * 30 + B.HOLD;
}

// the way out: everything fades while the wordmark drifts closer, like the screen switching over
function bootExit(t) {
  const p = ease(prog(t, BOOT.exitAt, BOOT.exitDur));
  BOOT.el.style.opacity = (1 - p).toFixed(3);
  const mid = BOOT.el.querySelector('.b-mid');
  mid.style.transform = `scale(${(1 + p * 0.1).toFixed(3)})`;
  mid.style.filter = `blur(${(p * 3).toFixed(1)}px)`;
  return p >= 1;
}

// starts the boot screen, resolves once it's gone. bootData() hands it what the start-up found
// the app stays hidden behind it (body.booting) until it starts fading out
const bootReveal = () => document.body.classList.remove('booting');
function bootStart() {
  return new Promise(async (resolve) => {
    if (profile.bootScreen === false) { bootReveal(); return resolve(); }
    try {
      [BOOT.blades, BOOT.shapes] = await Promise.all([bootBlades(), bootShapes()]);
      BOOT.blades.forEach((b) => { b.path = new Path2D(b.d); });
      // which blade ends up where the A's slant is once the logo has finished turning: that's the one it drops
      const a = (TURN.angle(Infinity) * Math.PI) / 180;
      BOOT.gone = BOOT.blades.reduce((best, b, k, all) => {
        const x = (v) => v.ux * Math.cos(a) - v.uy * Math.sin(a);
        return x(b) > x(all[best]) ? k : best;
      }, 0);
    } catch { bootReveal(); return resolve(); }
    bootBuild();
    BOOT.resolve = resolve;
    BOOT.onResize = () => { BOOT.geo = null; };
    window.addEventListener('resize', BOOT.onResize);
    const leave = (dur) => { if (!BOOT.exitAt) { BOOT.exitAt = BOOT.t; BOOT.exitDur = dur; bootReveal(); } };
    BOOT.el.addEventListener('mousedown', () => leave(260));
    BOOT.onKey = (e) => { e.preventDefault(); e.stopImmediatePropagation(); leave(260); };
    document.addEventListener('keydown', BOOT.onKey, true);
    // just in case something hangs, it never stays up longer than this
    BOOT.guard = setTimeout(bootDone, 15000);
    BOOT.t0 = BOOT.last = performance.now();
    const tick = (now) => {
      // the log waits for the start-up to finish, so its clock stops while it waits
      if (!BOOT.data && now - BOOT.t0 - BOOT.wait > B.LOG) BOOT.wait += now - BOOT.last;
      BOOT.last = now;
      const t = now - BOOT.t0, tl = t - BOOT.wait;
      BOOT.t = t;
      bootFrame(t, tl);
      if (!BOOT.exitAt && BOOT.end && tl >= BOOT.end) leave(B.EXIT);
      if (BOOT.exitAt && bootExit(t)) return bootDone();
      BOOT.raf = requestAnimationFrame(tick);
    };
    BOOT.raf = requestAnimationFrame(tick);
  });
}
function bootData(d) { BOOT.data = d; }
function bootDone() {
  cancelAnimationFrame(BOOT.raf);
  clearTimeout(BOOT.guard);
  document.removeEventListener('keydown', BOOT.onKey, true);
  window.removeEventListener('resize', BOOT.onResize);
  BOOT.el?.remove();
  BOOT.el = null;
  BOOT.geo = null;
  bootReveal();
  const r = BOOT.resolve;
  BOOT.resolve = null;
  r?.();
}
