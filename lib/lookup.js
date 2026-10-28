import { similarity, stripFeat, primaryFromCredit, normalize } from './clean.js';

const UA = 'ApertureTunes/1.0 (personal music tagger)';

// spaces requests out so we don't get blocked (itunes allows ~20 a minute, musicbrainz 1 a second)
const gates = new Map();
async function throttle(host, minGapMs) {
  const prev = gates.get(host) || Promise.resolve(0);
  const next = prev.then(async (last) => {
    const wait = last + minGapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return Date.now();
  });
  gates.set(host, next);
  await next;
}

async function getJson(url, host, gapMs) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle(host, gapMs);
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.status === 403 || res.status === 429 || res.status === 503) {
      await new Promise((r) => setTimeout(r, 10000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`${host} returned ${res.status}`);
    return res.json();
  }
  throw new Error(`${host} is rate limiting us, try again in a minute`);
}

export async function fetchImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!res.ok) return null;
    return { buffer: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') || 'image/jpeg' };
  } catch {
    return null;
  }
}

const artistNameCache = new Map();
async function itunesArtistName(artistId) {
  if (!artistId) return null;
  if (artistNameCache.has(artistId)) return artistNameCache.get(artistId);
  const data = await getJson(`https://itunes.apple.com/lookup?id=${artistId}`, 'itunes', 2500);
  const name = data.results?.[0]?.artistName || null;
  artistNameCache.set(artistId, name);
  return name;
}

const MULTI_ARTIST = /,|&|\b(feat\.?|ft\.?|featuring|with|x|vs\.?)\b/i;

async function searchItunes(query) {
  const url = `https://itunes.apple.com/search?entity=song&limit=25&term=${encodeURIComponent(query)}`;
  const data = await getJson(url, 'itunes', 2500);
  return (data.results || []).filter((r) => r.kind === 'song').map((r) => ({
    source: 'iTunes',
    sourceId: r.trackId,
    artistId: r.artistId,
    title: r.trackName,
    artistCredit: r.artistName,
    artist: null,
    album: r.collectionName,
    albumArtist: r.collectionArtistName || null,
    trackNumber: r.trackNumber,
    trackCount: r.trackCount,
    discNumber: r.discNumber,
    discCount: r.discCount,
    year: r.releaseDate ? r.releaseDate.slice(0, 4) : '',
    genre: r.primaryGenreName || '',
    durationMs: r.trackTimeMillis || null,
    coverUrl: r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '1000x1000bb') : null,
    thumbUrl: r.artworkUrl100 || null,
    explicit: r.trackExplicitness === 'explicit',
  }));
}

// itunes puts features in the artist name ("Calvin Harris, Dua Lipa") but the artistId
// is always just the main artist, so we look that up instead
async function resolveItunesArtist(c) {
  if (c.artist) return;
  if (!MULTI_ARTIST.test(c.artistCredit)) {
    c.artist = c.artistCredit;
  } else {
    try {
      c.artist = (await itunesArtistName(c.artistId)) || primaryFromCredit(c.artistCredit);
    } catch {
      c.artist = primaryFromCredit(c.artistCredit);
    }
  }
}

function mbQuote(s) {
  return `"${s.replace(/["\\]/g, ' ')}"`;
}

async function searchMusicBrainz(title, artist) {
  let q = `recording:${mbQuote(title)}`;
  if (artist) q += ` AND artist:${mbQuote(artist)}`;
  const url = `https://musicbrainz.org/ws/2/recording?fmt=json&limit=15&query=${encodeURIComponent(q)}`;
  const data = await getJson(url, 'musicbrainz', 1100);
  const out = [];
  for (const rec of data.recordings || []) {
    const credit = rec['artist-credit'] || [];
    const creditStr = credit.map((a) => (a.name || a.artist?.name) + (a.joinphrase || '')).join('');
    for (const rel of (rec.releases || []).slice(0, 4)) {
      const medium = rel.media?.[0];
      const track = medium?.track?.[0];
      const rg = rel['release-group'] || {};
      const relArtist = rel['artist-credit']?.[0]?.name;
      out.push({
        source: 'MusicBrainz',
        sourceId: rel.id,
        title: rec.title,
        artistCredit: creditStr,
        artist: credit[0]?.name || credit[0]?.artist?.name || creditStr,
        album: rel.title,
        albumArtist: relArtist === 'Various Artists' ? 'Various Artists' : null,
        trackNumber: track ? parseInt(track.number, 10) || null : null,
        trackCount: medium?.['track-count'] || rel['track-count'] || null,
        discNumber: medium?.position || 1,
        discCount: null,
        year: (rel.date || rec['first-release-date'] || '').slice(0, 4),
        genre: '',
        durationMs: rec.length || null,
        coverUrl: `https://coverartarchive.org/release/${rel.id}/front-500`,
        thumbUrl: `https://coverartarchive.org/release/${rel.id}/front-250`,
        explicit: false,
        mbType: rg['primary-type'] || '',
        mbSecondary: rg['secondary-types'] || [],
      });
    }
  }
  return out;
}

const BAD_ALBUM = /karaoke|tribute|made famous|in the style of|originally performed|cover version|lullaby|8-bit|piano version|workout|kidz bop|tribute to|as made famous/i;

function scoreCandidate(c, q) {
  const cTitle = stripFeat(c.title);
  let titleSim = similarity(cTitle, q.title);
  // remixes, live versions etc lose points unless the file asked for that version
  const versionWords = /\b(remix|live|acoustic|instrumental|karaoke|demo|edit|mix|version|remaster(ed)?|sped up|slowed)\b/i;
  const cVer = (c.title.match(versionWords) || [])[0]?.toLowerCase();
  const qVer = (q.rawTitle.match(versionWords) || [])[0]?.toLowerCase();
  if (cVer && cVer !== qVer && !/remaster/.test(cVer)) titleSim -= 0.25;

  let score = titleSim * 0.6;
  if (q.artist) {
    const a = Math.max(similarity(c.artistCredit, q.artist), similarity(c.artist || primaryFromCredit(c.artistCredit), q.artist));
    score += a * 0.3;
  } else {
    score += 0.18;
  }
  // super short files are usually broken, so don't trust their length
  if (q.durationMs > 20000 && c.durationMs) {
    const diff = Math.abs(q.durationMs - c.durationMs) / 1000;
    score += diff <= 3 ? 0.1 : diff <= 8 ? 0.05 : diff > 30 ? -0.15 : 0;
  } else {
    score += 0.04;
  }
  // go for the real album over singles, best-ofs and karaoke knock-offs
  if (BAD_ALBUM.test(c.album) || BAD_ALBUM.test(c.artistCredit)) score -= 0.4;
  if (c.albumArtist && /various/i.test(c.albumArtist)) score -= 0.08;
  if (/ - single$/i.test(c.album) || c.mbType === 'Single') score -= 0.03;
  if (/ - ep$/i.test(c.album) || c.mbType === 'EP') score -= 0.02;
  if (c.mbSecondary?.includes('Compilation') || /greatest hits|best of|collection|anthology|essentials|hits\b/i.test(c.album)) score -= 0.05;
  if (c.explicit) score += 0.005;
  return Math.max(0, Math.min(1, score));
}

function dedupe(cands) {
  const seen = new Set();
  return cands.filter((c) => {
    const k = normalize(`${c.title}|${c.artistCredit}|${c.album}`);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function identify(q) {
  let cands = [];
  const queries = [];
  if (q.artist) queries.push(`${q.artist} ${q.title}`);
  queries.push(q.title);

  for (const term of queries) {
    try {
      cands = cands.concat(await searchItunes(term));
    } catch (e) {
      if (/rate limiting/.test(e.message)) throw e;
    }
    cands.forEach((c) => (c.score ??= scoreCandidate(c, q)));
    if (cands.some((c) => c.score >= 0.75)) break;
  }

  if (!cands.some((c) => c.score >= 0.6)) {
    try {
      const mb = await searchMusicBrainz(q.title, q.artist);
      mb.forEach((c) => (c.score = scoreCandidate(c, q)));
      cands = cands.concat(mb);
    } catch {
      // musicbrainz is just a backup, fine if it fails
    }
  }

  cands = dedupe(cands).sort((a, b) => b.score - a.score).slice(0, 8);
  // only look up the main artist for the top few, saves requests
  for (const c of cands.slice(0, 3)) if (c.source === 'iTunes') await resolveItunesArtist(c);
  for (const c of cands) if (!c.artist) c.artist = primaryFromCredit(c.artistCredit);
  return cands;
}
