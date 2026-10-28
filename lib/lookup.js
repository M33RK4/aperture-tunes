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
  return (data.results || []).filter((r) => r.kind === 'song').map(fromItunes);
}

function fromItunes(r) {
  return {
    source: 'iTunes',
    sourceId: r.trackId,
    collectionId: r.collectionId,
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
  };
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

  // every album this song showed up on, so unifyAlbums can find the one the whole folder came from
  const albumIds = [...new Set(cands.filter((c) => c.collectionId && c.score >= 0.55).map((c) => c.collectionId))];

  cands = dedupe(cands).sort((a, b) => b.score - a.score).slice(0, 8);
  // only look up the main artist for the top few, saves requests
  for (const c of cands.slice(0, 3)) if (c.source === 'iTunes') await resolveItunesArtist(c);
  for (const c of cands) if (!c.artist) c.artist = primaryFromCredit(c.artistCredit);
  return { candidates: cands, albumIds };
}

const albumCache = new Map();
async function albumTracks(collectionId) {
  if (!albumCache.has(collectionId)) {
    const data = await getJson(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=200`, 'itunes', 2500);
    const tracks = (data.results || []).filter((r) => r.wrapperType === 'track' && r.kind === 'song').map(fromItunes);
    // itunes dates each track on its own, so reissues mix years. some music apps split an album
    // by year, so every track gets the oldest year and the same cover
    const year = tracks.map((t) => t.year).filter(Boolean).sort()[0] || '';
    const art = data.results?.find((r) => r.wrapperType === 'collection')?.artworkUrl100;
    for (const t of tracks) {
      t.year = year;
      if (art) Object.assign(t, { thumbUrl: art, coverUrl: art.replace('100x100bb', '1000x1000bb') });
    }
    albumCache.set(collectionId, tracks);
  }
  return albumCache.get(collectionId);
}

// best-ofs and soundtracks contain loads of songs, but they're not where your songs "belong"
const NOT_A_HOME = /greatest hits|best of|the collection|anthology|essentials|\bhits\b|soundtrack|motion picture|original score|live at|in concert/i;

// songs get matched one by one, so an album can end up split over the normal, deluxe and
// re-release versions. this finds the one album that has the most of an artist's songs and
// moves them all onto it.
// songs: [{ id, query, best, albumIds }] -> { picks: { id: candidate }, summary: [{ album, count }] }
export async function unifyAlbums(songs) {
  const picks = {};
  const summary = [];
  const groups = new Map();
  for (const s of songs) {
    if (!s.best) continue;
    const key = normalize(s.best.artist || s.best.artistCredit);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const counts = new Map();
    for (const s of group) for (const id of s.albumIds) counts.set(id, (counts.get(id) || 0) + 1);
    const top = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);

    const options = [];
    for (const id of top) {
      let tracks;
      try {
        tracks = await albumTracks(id);
      } catch {
        continue;
      }
      if (!tracks.length || NOT_A_HOME.test(tracks[0].album) || /various/i.test(tracks[0].albumArtist || '')) continue;
      const matches = new Map();
      for (const s of group) {
        let bestTrack = null;
        for (const t of tracks) {
          const score = scoreCandidate(t, s.query);
          if (score >= 0.65 && (!bestTrack || score > bestTrack.score)) bestTrack = { ...t, score };
        }
        if (bestTrack) matches.set(s.id, bestTrack);
      }
      options.push({ album: tracks[0].album, trackCount: tracks.length, year: tracks[0].year, matches });
    }
    // most of your songs wins, then the edition closest in size to what you have, then the oldest
    options.sort((a, b) => b.matches.size - a.matches.size
      || Math.abs(a.trackCount - group.length) - Math.abs(b.trackCount - group.length)
      || String(a.year).localeCompare(String(b.year)));
    const pick = options[0];
    if (!pick || pick.matches.size < 2) continue;
    for (const [id, track] of pick.matches) {
      await resolveItunesArtist(track);
      picks[id] = track;
    }
    summary.push({ album: pick.album, count: pick.matches.size });
  }
  return { picks, summary };
}
