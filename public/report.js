// the monthly report (STATISTICS // MONTHLY REPORTS): a month of listening written up like an Aperture test
// review. everything comes from the statistics that are already kept: minutes per day, and each song's plays
const RP = { month: null };
const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const monthKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthName = (mk) => { const [y, m] = mk.split('-').map(Number); return `${MONTH_NAMES[m - 1]} ${y}`; };
const lastMonthKey = () => { const d = new Date(); return monthKey(new Date(d.getFullYear(), d.getMonth(), 0).getTime()); };
// months that have any listening in them, newest first
const reportMonths = () => [...new Set(Object.keys(ST.data.days).filter((k) => ST.data.days[k].sec > 0).map((k) => k.slice(0, 7)))].sort().reverse();

function monthData(mk) {
  const [y, m] = mk.split('-').map(Number);
  const start = new Date(y, m - 1, 1).getTime(), end = new Date(y, m, 1).getTime(), days = new Date(y, m, 0).getDate();
  let sec = 0, plays = 0;
  const perSong = new Map(), perDay = [];
  for (let d = 1; d <= days; d++) {
    const r = ST.data.days[`${mk}-${String(d).padStart(2, '0')}`];
    perDay.push(r ? r.sec : 0);
    if (!r) continue;
    sec += r.sec;
    plays += r.n;
    for (const [k, s] of Object.entries(r.songs)) perSong.set(k, (perSong.get(k) || 0) + s);
  }
  // plays and the time of day they happened, from each song's play log. new finds: first ever played this month
  const playsOf = new Map(), hours = Array(24).fill(0);
  let finds = 0;
  for (const [k, r] of Object.entries(ST.data.songs)) {
    let n = 0;
    for (const t of r.log || []) if (t >= start && t < end) { n++; hours[new Date(t).getHours()]++; }
    if (n) playsOf.set(k, n);
    if (r.first >= start && r.first < end) finds++;
  }
  return { mk, y, m, start, sec, plays, different: perSong.size, perSong, perDay, playsOf, hours, finds };
}

// the biggest share of the month's listening time, by artist / album / genre
function topBy(D, key, label) {
  const g = new Map();
  for (const [k, sec] of D.perSong) {
    const s = LIB.byPath.get(k);
    if (!s) continue;
    const id = key(s), e = g.get(id) || { sec: 0, s, label: label(s) };
    e.sec += sec;
    g.set(id, e);
  }
  return [...g.values()].sort((a, b) => b.sec - a.sec)[0] || null;
}

// three dry remarks about the month, from whatever stood out the most
function observations(D, prev, top) {
  const out = [];
  const q = (s) => `"${esc(songTitle(s))}"`;
  const pct = (a, b) => Math.round((a / Math.max(1, b)) * 100);
  if (top[0] && top[0].n >= 10) out.push(`${q(top[0].s)} was played ${top[0].n} times. At this point it isn't a song, it's a habit.`);
  else if (top[0] && top[0].n >= 3) out.push(`${q(top[0].s)} got the most plays this month: ${top[0].n}.`);
  const total = D.hours.reduce((a, b) => a + b, 0);
  if (total >= 10) {
    const night = D.hours.slice(0, 5).reduce((a, b) => a + b, 0), evening = D.hours.slice(18).reduce((a, b) => a + b, 0), morning = D.hours.slice(5, 12).reduce((a, b) => a + b, 0);
    if (pct(night, total) >= 20) out.push(`${pct(night, total)}% of your listening happened between midnight and 5. Sleep is also a valid test.`);
    else if (pct(evening, total) >= 50) out.push(`${pct(evening, total)}% of your listening happened after 18:00. The music gets better after dark, apparently.`);
    else if (pct(morning, total) >= 40) out.push(`${pct(morning, total)}% of your listening happened before noon. An early test subject. Noted.`);
  }
  if (prev && prev.sec > 600) {
    const ch = Math.round(((D.sec - prev.sec) / prev.sec) * 100), pm = MONTH_NAMES[prev.m - 1].toLowerCase();
    const Pm = pm[0].toUpperCase() + pm.slice(1);
    if (ch >= 15) out.push(`${ch}% more listening than ${Pm}. The trend is being monitored.`);
    else if (ch <= -15) out.push(`${-ch}% less listening than ${Pm}. Is everything all right?`);
  }
  const art = topBy(D, (s) => artistOf(s).toLowerCase(), artistOf);
  if (art && D.sec && art.sec / D.sec >= 0.3) out.push(`${esc(art.label)} took up ${pct(art.sec, D.sec)}% of the month. Loyalty like that is rare.`);
  if (D.finds >= 10) out.push(`${D.finds} songs got played for the very first time. Curiosity has been noted.`);
  const big = Math.max(...D.perDay);
  if (big >= 3 * 3600) out.push(`${fmtDay(D.start + (D.perDay.indexOf(big) + 0.5) * 86400000)} was the biggest day: ${fmtHours(big)}. Please remember to blink.`);
  if (!out.length) out.push('Not much testing this month. The equipment is ready whenever you are.');
  return out.slice(0, 3);
}

function renderReport() {
  const months = reportMonths();
  if (!months.length) {
    $('#statsBody').innerHTML = '<div class="empty big">&gt; No listening history yet. Your first report shows up after you\'ve played some music.</div>';
    return;
  }
  if (!RP.month || !months.includes(RP.month)) {
    // the month that just ended, unless this one is already well under way or there's nothing from last month
    const now = monthKey(), last = lastMonthKey();
    RP.month = months.includes(last) && (new Date().getDate() <= 7 || !months.includes(now)) ? last : months[0];
  }
  const D = monthData(RP.month), i = months.indexOf(RP.month);
  const prevKey = months[i + 1], nextKey = months[i - 1];
  const prev = prevKey ? monthData(prevKey) : null;
  const current = RP.month === monthKey();
  const top = [...D.playsOf].map(([k, n]) => ({ s: LIB.byPath.get(k), n, sec: D.perSong.get(k) || 0 })).filter((x) => x.s).sort((a, b) => b.n - a.n || b.sec - a.sec).slice(0, 5);
  const art = topBy(D, (s) => artistOf(s).toLowerCase(), artistOf);
  const alb = topBy(D, albumKey, (s) => s.album || 'Unknown Album');
  const gen = topBy(D, (s) => (s.genre || 'Unknown').toLowerCase(), (s) => s.genre || 'Unknown Genre');
  const big = Math.max(...D.perDay), bigDay = D.perDay.indexOf(big);
  const change = prev && prev.sec > 600 ? Math.round(((D.sec - prev.sec) / prev.sec) * 100) : null;
  const maxD = Math.max(1, ...D.perDay), maxH = Math.max(1, ...D.hours);
  const filed = current ? 'IN PROGRESS' : `FILED ${fmtDay(new Date(D.y, D.m, 1).getTime())}`;
  const share = (sec) => (D.sec ? ` // ${Math.round((sec / D.sec) * 100)}% OF THE MONTH` : '');
  const fav = (k, e, art) => (e ? `<div class="f">${art || '<div class="art gl">♪</div>'}<div style="min-width:0"><div class="k">${k}</div><div class="v" title="${esc(e.label)}">${esc(e.label)}</div><div class="w">${fmtHours(e.sec)}${k === 'ARTIST' ? share(e.sec) : k === 'ALBUM' ? ` // ${esc(artistOf(e.s).toUpperCase())}` : ''}</div></div></div>` : '');
  $('#statsBody').innerHTML = `
    <div class="rep-head"><div style="min-width:0"><div class="rt">TEST SUBJECT PERFORMANCE REVIEW // ${monthName(RP.month)}${current ? ' (SO FAR)' : ''}</div>
      <div class="rs">SUBJECT: ${esc((profile.username || 'UNKNOWN').toUpperCase())} // ${filed} // REVIEWED BY: APERTURE TUNES</div></div>
      <div class="nav2"><button class="cmd" data-rm="${prevKey || ''}" ${prevKey ? '' : 'disabled'}>[ &lt; ${prevKey ? MONTH_NAMES[+prevKey.slice(5) - 1] : 'EARLIER'} ]</button><button class="cmd" data-rm="${nextKey || ''}" ${nextKey ? '' : 'disabled'}>[ ${nextKey ? MONTH_NAMES[+nextKey.slice(5) - 1] : 'LATER'} &gt; ]</button></div></div>
    <div class="tiles">
      <div class="tile2"><span>TIME IN TESTING</span><b>${fmtHours(D.sec)}</b><small>${change === null ? 'THIS MONTH' : `<span class="up">${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}%</span> ON ${MONTH_NAMES[prev.m - 1]}`}</small></div>
      <div class="tile2"><span>SONGS PLAYED</span><b>${D.plays.toLocaleString()}</b><small>${plural(D.different, 'DIFFERENT SONG').toUpperCase()}</small></div>
      <div class="tile2"><span>NEW FINDS</span><b>${D.finds}</b><small>SONGS PLAYED FOR THE FIRST TIME</small></div>
      <div class="tile2"><span>BIGGEST DAY</span><b>${fmtHours(big)}</b><small>${big ? fmtDay(D.start + (bigDay + 0.5) * 86400000) : '--'}</small></div>
    </div>
    <div class="rep-grid">
      <div class="rep-box rep-songs"><div class="ch">MOST PLAYED SONGS</div>${top.map((x, n) => `<div class="s" data-p="${esc(x.s.path)}" title="Double-click to play"><span class="i">${n + 1}</span><span class="t">${esc(songTitle(x.s))} <small>// ${esc(x.s.artist || 'Unknown Artist')}</small></span><span class="n">${plural(x.n, 'PLAY').toUpperCase()}</span></div>`).join('') || '<div class="dim">No plays logged.</div>'}</div>
      <div class="rep-box rep-fav"><div class="ch">FAVOURITES</div>${fav('ARTIST', art, art && artImg(art.s, 'mini'))}${fav('ALBUM', alb, alb && artImg(alb.s, 'mini'))}${fav('GENRE', gen)}</div>
      <div class="rep-box rep-obs"><div class="ch">OBSERVATIONS</div>${observations(D, prev, top).map((o) => `<p>${o}</p>`).join('')}</div>
    </div>
    <div class="rep-charts">
      <div class="chart"><div class="ch">MINUTES PER DAY // ${MONTH_NAMES[D.m - 1]}</div><div class="bars">${D.perDay.map((s, d) => `<i style="height:${Math.max(s ? 3 : 0, (s / maxD) * 100)}%" title="${d + 1} ${MONTH_NAMES[D.m - 1].slice(0, 3)}: ${Math.round(s / 60)} min"></i>`).join('')}</div></div>
      <div class="chart"><div class="ch">WHEN YOU LISTEN</div><div class="hours">${D.hours.map((h, i) => `<i class="${h === maxH && h ? 'hi' : ''}" style="height:${Math.max(h ? 3 : 0, (h / maxH) * 100)}%" title="${String(i).padStart(2, '0')}:00 // ${plural(h, 'play')}"></i>`).join('')}</div><div class="hlab"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div></div>
    </div>`;
}
$('#statsBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rm]');
  if (!b || !b.dataset.rm) return;
  RP.month = b.dataset.rm;
  renderReport();
});
$('#statsBody').addEventListener('dblclick', (e) => {
  const r = e.target.closest('.rep-songs .s[data-p]');
  if (r) playOrQueue(r.dataset.p);
});

// a new month: a little note that last month's report is ready (once)
function reportReadyNote() {
  if (!ST.data) return;
  const last = lastMonthKey();
  if (profile.reportSeen === last || !reportMonths().includes(last)) return;
  saveProfile({ reportSeen: last });
  setTimeout(() => toast(`> YOUR ${MONTH_NAMES[+last.slice(5) - 1]} REPORT IS READY // STATISTICS > MONTHLY REPORTS`), 1200);
}
