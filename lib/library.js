import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';

// everything the player can actually play. the tagger only does mp3/flac, the player does more
export const PLAYABLE = ['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav'];

const SKIP = new Set(['$recycle.bin', 'system volume information', 'node_modules']);
const hidden = (name) => name.startsWith('.') || name.startsWith('$') || SKIP.has(name.toLowerCase());

export const songId = (p) => crypto.createHash('sha1').update(p.toLowerCase()).digest('hex').slice(0, 16);

let dataDir = null;
let index = { files: {} }; // path -> song
const byId = new Map();
const status = { scanning: false, done: 0, total: 0, version: 0 };

const indexFile = () => path.join(dataDir, 'library.json');
const coverDir = () => path.join(dataDir, 'covers');

// the index is kept in %APPDATA% so the library opens instantly next time
export function initLibrary(dir) {
  dataDir = dir;
  fs.mkdirSync(coverDir(), { recursive: true });
  try {
    index = JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
  } catch {
    index = { files: {} };
  }
  rebuildIds();
}

function rebuildIds() {
  byId.clear();
  for (const s of Object.values(index.files)) byId.set(s.id, s);
}

function save() {
  fs.writeFileSync(indexFile(), JSON.stringify(index));
}

export const pathForId = (id) => byId.get(id)?.path || null;
export const songForId = (id) => byId.get(id) || null;
export const coverPath = (hash) => {
  if (!/^[0-9a-f]{16}\.(jpg|png|webp|gif)$/.test(hash)) return null;
  const p = path.join(coverDir(), hash);
  return fs.existsSync(p) ? p : null;
};

export function getLibrary() {
  return { status, songs: Object.values(index.files) };
}

function walk(dir, out, depth = 0) {
  let items;
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const it of items) {
    if (hidden(it.name)) continue;
    const p = path.join(dir, it.name);
    if (it.isDirectory()) {
      if (depth < 15) walk(p, out, depth + 1);
    } else if (it.isFile() && PLAYABLE.includes(path.extname(it.name).toLowerCase())) {
      out.push(p);
    }
  }
}

const num = (v) => (v && Number.isFinite(v) ? v : null);

// bump this when a song in the index gets new fields, so every file is read again once
const INDEX_V = 2;

async function readSong(p, st) {
  const ext = path.extname(p).toLowerCase();
  // added: when the file landed on this PC (its creation date), for RECENTLY ADDED
  const base = { v: INDEX_V, id: songId(p), path: p, mtime: st.mtimeMs, size: st.size, added: Math.round(st.birthtimeMs || st.mtimeMs), ext: ext.slice(1).toUpperCase() };
  try {
    let { common, format } = await parseFile(p, { duration: false });
    // some mp3s don't say how long they are in the header, those get measured properly (slower)
    if (!format.duration) ({ format } = await parseFile(p, { duration: true, skipCovers: true }));
    let cover = null;
    const pic = common.picture?.[0];
    if (pic?.data?.length) {
      // songs from the same album share one cover file
      const type = /png/.test(pic.format) ? 'png' : /webp/.test(pic.format) ? 'webp' : /gif/.test(pic.format) ? 'gif' : 'jpg';
      cover = `${crypto.createHash('sha1').update(pic.data).digest('hex').slice(0, 16)}.${type}`;
      const cp = path.join(coverDir(), cover);
      if (!fs.existsSync(cp)) fs.writeFileSync(cp, pic.data);
    }
    return {
      ...base,
      title: common.title || '',
      artist: common.artist || '',
      albumArtist: common.albumartist || '',
      album: common.album || '',
      genre: common.genre?.[0] || '',
      year: common.year || null,
      track: num(common.track?.no),
      trackOf: num(common.track?.of),
      disc: num(common.disk?.no),
      discOf: num(common.disk?.of),
      duration: format.duration || null,
      bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
      sampleRate: format.sampleRate || null,
      lossless: !!format.lossless,
      cover,
    };
  } catch {
    // unreadable tags, still playable
    return { ...base, title: '', artist: '', albumArtist: '', album: '', genre: '', year: null, track: null, disc: null, duration: null, bitrate: null, sampleRate: null, cover: null };
  }
}

// everything that's written in one file's tags right now, read fresh (for "view tags")
// -> { tags: [[label, value]], file: [[label, value]] }, empty fields left out
export async function readAllTags(p) {
  const st = fs.statSync(p);
  const { common: c, format: f } = await parseFile(p, { duration: true });
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => (typeof x === 'object' ? x.text ?? '' : String(x))).filter(Boolean).join(', ');
  const nOf = (x) => (x?.no ? `${x.no}${x.of ? ` OF ${x.of}` : ''}` : '');
  const pic = c.picture?.[0];
  const tags = [
    ['TITLE', c.title], ['ARTIST', c.artist], ['ALBUM ARTIST', c.albumartist], ['ALBUM', c.album],
    ['TRACK', nOf(c.track)], ['DISC', nOf(c.disk)], ['YEAR', c.year || c.date], ['GENRE', list(c.genre)],
    ['COMPOSER', list(c.composer)], ['COMMENT', list(c.comment)], ['BPM', c.bpm], ['LABEL', list(c.label)], ['COPYRIGHT', c.copyright],
    ['ENCODED BY', c.encodedby], ['COVER ART', pic ? `${(pic.format || 'image').replace('image/', '').toUpperCase()} // ${Math.max(1, Math.round(pic.data.length / 1024))} KB` : ''],
  ].map(([k, v]) => [k, v == null ? '' : String(v)]);
  const secs = f.duration ? `${Math.floor(f.duration / 60)}:${String(Math.floor(f.duration % 60)).padStart(2, '0')}` : '';
  const file = [
    ['FORMAT', [f.container, f.codec && f.codec !== f.container ? f.codec : '', f.lossless ? 'LOSSLESS' : ''].filter(Boolean).join(' // ')],
    ['QUALITY', [f.bitrate ? `${Math.round(f.bitrate / 1000)} KBPS` : '', f.sampleRate ? `${+(f.sampleRate / 1000).toFixed(1)} KHZ` : '', f.numberOfChannels === 1 ? 'MONO' : f.numberOfChannels === 2 ? 'STEREO' : ''].filter(Boolean).join(' // ')],
    ['LENGTH', secs], ['SIZE', `${(st.size / 1048576).toFixed(1)} MB`], ['TAG TYPE', (f.tagTypes || []).join(', ')],
    ['FILE', path.basename(p)], ['FOLDER', path.dirname(p)],
  ].filter(([, v]) => v);
  return { tags, file };
}

// only new or changed files get read again, so rescans are quick after the first one
let queued = null; // a rescan asked for while one was running (like adding a folder) goes next
export async function scanLibrary(folders) {
  if (status.scanning) {
    queued = folders;
    return status;
  }
  status.scanning = true;
  status.done = 0;
  try {
    const found = [];
    for (const f of folders) if (f && fs.existsSync(f)) walk(path.resolve(f), found);
    const unique = [...new Map(found.map((p) => [p.toLowerCase(), p])).values()];
    status.total = unique.length;
    const next = {};
    const todo = [];
    for (const p of unique) {
      let st;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      const old = index.files[p];
      if (old && old.v === INDEX_V && old.mtime === st.mtimeMs && old.size === st.size) {
        next[p] = old.added ? old : { ...old, added: Math.round(st.birthtimeMs || st.mtimeMs) };
        status.done++;
      } else {
        todo.push([p, st]);
      }
    }
    const worker = async () => {
      while (todo.length) {
        const [p, st] = todo.shift();
        next[p] = await readSong(p, st);
        status.done++;
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    // songs edited by hand while this scan ran are newer than what the scan saw, keep those
    for (const [p, s] of Object.entries(index.files)) if (next[p] && s.mtime > next[p].mtime) next[p] = s;
    index = { files: next };
    rebuildIds();
    save();
  } finally {
    status.scanning = false;
    status.version++;
    if (queued) {
      const next = queued;
      queued = null;
      scanLibrary(next).catch(() => {});
    }
  }
  return status;
}

// re-reads just these songs (after their tags were edited by hand), so the library is up to date without a rescan
export async function refreshSongs(paths) {
  const out = [];
  for (const p of paths) {
    if (!index.files[p] || !fs.existsSync(p)) continue;
    const s = await readSong(p, fs.statSync(p));
    index.files[p] = s;
    byId.set(s.id, s);
    out.push(s);
  }
  if (out.length) {
    save();
    status.version++;
  }
  return out;
}
