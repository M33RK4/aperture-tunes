// lyrics for NOW PLAYING. lyrics saved in the song's file always come first. if there are none (and downloading
// is on) they're looked up on LRCLIB, a free lyrics site that needs no account, and kept next to the library
// so they show up offline next time. synced lyrics (with a time on every line) light up line by line
import fs from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';

const UA = 'ApertureTunes/2.1 (personal music player)';
let dir = null;
export function initLyrics(dataDir) {
  dir = path.join(dataDir, 'lyrics');
  fs.mkdirSync(dir, { recursive: true });
}
const cacheFile = (id) => path.join(dir, `${id}.json`);

// "[01:23.45] some words" lines -> [{ t: seconds, text }]
export function parseLrc(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!stamps.length) continue;
    const words = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) out.push({ t: +m[1] * 60 + parseFloat(m[2].replace(':', '.')), text: words });
  }
  return out.sort((a, b) => a.t - b.t);
}

async function fromFile(p) {
  try {
    const { common } = await parseFile(p, { skipCovers: true, duration: false });
    for (const l of common.lyrics || []) {
      if (l.syncText?.length && l.syncText.some((x) => x.timestamp != null)) {
        return { source: 'file', synced: l.syncText.filter((x) => x.timestamp != null).map((x) => ({ t: x.timestamp / 1000, text: (x.text || '').trim() })) };
      }
    }
    for (const l of common.lyrics || []) {
      const text = typeof l === 'string' ? l : l.text;
      if (!text || !text.trim()) continue;
      // some files have synced lyrics pasted in as plain text
      const lrc = parseLrc(text);
      if (lrc.length > 3) return { source: 'file', synced: lrc };
      return { source: 'file', plain: text.trim() };
    }
  } catch {}
  return null;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Lrclib-Client': UA }, signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`lrclib ${res.status}`);
  return res.json();
}
const shape = (r) => {
  if (!r) return null;
  if (r.instrumental) return { source: 'lrclib', instrumental: true };
  if (r.syncedLyrics) return { source: 'lrclib', synced: parseLrc(r.syncedLyrics) };
  if (r.plainLyrics) return { source: 'lrclib', plain: r.plainLyrics.trim() };
  return null;
};
async function fromLrclib(song) {
  const title = song.title, artist = song.artist;
  if (!title || !artist) return null;
  const q = new URLSearchParams({ track_name: title, artist_name: artist });
  if (song.album) q.set('album_name', song.album);
  if (song.duration) q.set('duration', String(Math.round(song.duration)));
  const exact = shape(await getJson(`https://lrclib.net/api/get?${q}`));
  if (exact) return exact;
  // no exact match: search, and take the closest length (synced ones first)
  const list = (await getJson(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`)) || [];
  const near = list
    .filter((r) => !song.duration || !r.duration || Math.abs(r.duration - song.duration) <= 4)
    .sort((a, b) => (b.syncedLyrics ? 1 : 0) - (a.syncedLyrics ? 1 : 0) || Math.abs((a.duration || 0) - (song.duration || 0)) - Math.abs((b.duration || 0) - (song.duration || 0)));
  return shape(near[0]);
}

// downloaded lyrics as text to save into the song's file: synced ones as LRC ("[01:23.45] words"), so apps that
// understand timings can still sync them
export function downloadedText(id) {
  let c = null;
  try { c = JSON.parse(fs.readFileSync(cacheFile(id), 'utf8')); } catch {}
  if (!c || c.source !== 'lrclib') return null;
  if (c.synced?.length) {
    const stamp = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
    return c.synced.map((l) => `[${stamp(l.t)}]${l.text}`).join('\n');
  }
  return c.plain || null;
}

// -> { source: 'file' | 'lrclib' | 'none', synced?: [{ t, text }], plain?, instrumental?, offline? }
export async function getLyrics(song, download) {
  const own = await fromFile(song.path);
  if (own) return own;
  if (!dir) return { source: 'none' };
  let cached = null;
  try { cached = JSON.parse(fs.readFileSync(cacheFile(song.id), 'utf8')); } catch {}
  // found before: use it. not found before: look again after a week, lyrics sites keep growing
  if (cached && (cached.source !== 'none' || Date.now() - cached.at < 7 * 86400000)) return cached;
  if (!download) return { source: 'none', off: true };
  try {
    const got = (await fromLrclib(song)) || { source: 'none' };
    fs.writeFileSync(cacheFile(song.id), JSON.stringify({ ...got, at: Date.now() }));
    return got;
  } catch {
    return { source: 'none', offline: true };
  }
}
