// if something in brackets has one of these words its junk, like (Official Video) or [HQ]
const JUNK_WORDS = [
  'official', 'video', 'audio', 'lyric', 'lyrics', 'visualizer', 'visualiser', 'hd', 'hq', '4k', '1080p', '720p',
  'kbps', '320', '256', '192', '128', 'mp3', 'flac', 'free download', 'download', 'explicit', 'clean', 'dirty',
  'music video', 'mv', 'out now', 'premiere', 'full song', 'full version', 'with lyrics', 'letra', 'subtitulado',
];

export function stripFeat(text) {
  if (!text) return text;
  let out = text;
  out = out.replace(/\s*[([{]\s*(?:feat\.?|ft\.?|featuring|with)\s+[^)\]}]*[)\]}]/gi, '');
  // no brackets: "Song feat. X". skipping "with" here cause loads of real song titles have it
  out = out.replace(/\s+\b(?:feat\.?|ft\.?|featuring)\s+.*$/i, '');
  return out.trim();
}

// "A, B & C feat. D" -> "A". only used when itunes/musicbrainz cant tell us the main artist
export function primaryFromCredit(credit) {
  if (!credit) return credit;
  let s = credit.replace(/\s+\b(?:feat\.?|ft\.?|featuring|with|vs\.?|x)\s+.*$/i, '');
  s = s.split(/\s*,\s*|\s+&\s+/)[0];
  return s.trim() || credit.trim();
}

function isJunkGroup(inner) {
  const t = inner.toLowerCase();
  return JUNK_WORDS.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(t));
}

function removeJunk(text) {
  let s = text.replace(/_/g, ' ');
  s = s.replace(/\b(?:www\.)?[a-z0-9-]+\.(?:com|net|org|ru|info|me|io|to|cc|fm|co)\b/gi, ' ');
  s = s.replace(/[([{]([^)\]}]*)[)\]}]/g, (m, inner) => (isJunkGroup(inner) ? ' ' : m));
  s = s.replace(/\b\d{2,3}\s*kbps\b/gi, ' ');
  s = s.replace(/^\s*(?:track\s*\d{1,3}\s*[-.)]?\s*|\d{1,2}\s*[-.)]\s*|\d{1,2}\s+(?=\S))/i, ''); // track number at the start
  // junk at the end without brackets, like "Song HQ" or "Song lyrics"
  s = s.replace(/(?:\s+[-|]?\s*\b(?:hq|hd|4k|lyrics?|official(?: music)? video|official audio|audio|video|visualizer)\b)+\s*$/i, '');
  return s.replace(/\s{2,}/g, ' ').trim();
}

// for title tags, so it doesnt try to split an artist off
export function cleanTitle(title) {
  return stripFeat(removeJunk(title)) || title;
}

// "01. Artist - Song (Official Video) [320kbps].mp3" -> { artist, title }
export function parseFilename(name) {
  const s = removeJunk(name.replace(/\.[^.]+$/, ''));
  let artist = null;
  let title = s;
  const parts = s.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    // some files are named "01 - Artist - Song"
    if (/^\d{1,2}$/.test(parts[0])) parts.shift();
    if (parts.length >= 2) {
      artist = parts[0];
      title = parts.slice(1).join(' - ');
    }
  }
  title = stripFeat(title).replace(/^["']|["']$/g, '').trim();
  if (artist) artist = primaryFromCredit(artist);
  return { artist, title: title || s };
}

export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function similarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const lev = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  const contains = x.includes(y) || y.includes(x) ? 0.85 : 0;
  const xt = new Set(x.split(' '));
  const yt = new Set(y.split(' '));
  const shared = [...xt].filter((t) => yt.has(t)).length;
  const dice = (2 * shared) / (xt.size + yt.size);
  return Math.max(lev, contains, dice);
}

export function safeFilename(s) {
  return (s || 'Unknown')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 180) || 'Unknown';
}
