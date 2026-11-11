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

async function readSong(p, st) {
  const ext = path.extname(p).toLowerCase();
  const base = { id: songId(p), path: p, mtime: st.mtimeMs, size: st.size, ext: ext.slice(1).toUpperCase() };
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
      disc: num(common.disk?.no),
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
      if (old && old.mtime === st.mtimeMs && old.size === st.size) {
        next[p] = old;
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
