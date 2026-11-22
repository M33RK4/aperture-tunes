import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseFilename, cleanTitle, stripFeat, safeFilename } from './lib/clean.js';
import { identify, unifyAlbums, fetchImage } from './lib/lookup.js';
import { readExisting, writeTags, editTags, writeLyrics, SUPPORTED } from './lib/tagger.js';
import { roots, list, scan } from './lib/files.js';
import { initLibrary, getLibrary, scanLibrary, pathForId, songForId, coverPath, readAllTags, refreshSongs } from './lib/library.js';
import { initLyrics, getLyrics, downloadedText } from './lib/lyrics.js';
import { initLoudness, allLoudness, setLoudness } from './lib/loudness.js';

const ROOT = path.join(os.tmpdir(), 'aperture-tunes');
const UPLOADS = path.join(ROOT, 'uploads');
export const OUTPUT = path.join(ROOT, 'Tagged Songs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(UPLOADS, { recursive: true });

const files = new Map();

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  defParamCharset: 'utf8',
});

// a new secret every time it starts. everything past the page's own files (the /api part) has to bring it along as a
// cookie, so other programs, other Windows accounts on this pc and websites can't use the server even though they
// can reach it. main.js puts the cookie into the app's windows before they open
export const KEY_COOKIE = 'aperture_key';
export const KEY = crypto.randomBytes(32).toString('hex');
const KEY_BUF = Buffer.from(KEY);
const hasKey = (req) => {
  const m = /(?:^|;\s*)aperture_key=([0-9a-f]{64})(?=;|$)/.exec(req.headers.cookie || '');
  return !!m && crypto.timingSafeEqual(Buffer.from(m[1]), KEY_BUF);
};
// `node server.js` on its own (for testing in a browser): there's no app to hand over the cookie, so the page
// gets it when it loads
let handOutKey = false;

const app = express();
// only answer requests from this pc, so random websites cant poke at the file browser
app.use((req, res, next) => (/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '') ? next() : res.status(403).end()));
app.use((req, res, next) => {
  if (handOutKey) res.cookie(KEY_COOKIE, KEY, { httpOnly: true, sameSite: 'strict', path: '/' });
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
// anything that isn't one of the page's files needs the key
app.use((req, res, next) => (hasKey(req) ? next() : res.status(403).end()));
app.use(express.json({ limit: '5mb' }));

const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
app.get('/api/version', (req, res) => res.json({ version: PKG.version }));
// NEW VERSIONS: is there a newer release on GitHub? asked once per start, and only when that option is on
const newerThan = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
let updCache = null;
app.get('/api/update', async (req, res) => {
  updCache ||= fetch('https://api.github.com/repos/M33RK4/aperture-tunes/releases/latest', { headers: { 'User-Agent': 'ApertureTunes', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && j.tag_name ? { latest: String(j.tag_name).replace(/^v/i, ''), url: String(j.html_url || '') } : null))
    .catch(() => null);
  const u = await updCache;
  if (!u) updCache = null;
  const newer = !!u && /^\d+(\.\d+)*$/.test(u.latest) && newerThan(u.latest, PKG.version) && u.url.startsWith('https://github.com/');
  res.json({ current: PKG.version, latest: u?.latest || null, newer, url: newer ? u.url : null });
});

app.get('/api/fs/roots', (req, res) => res.json(roots()));

// the music library. main.js tells us where the windows music folder and the app data folder are
const musicDir = () => process.env.APERTURE_MUSIC || roots().locations.find((l) => l.name === 'MUSIC')?.path || path.join(os.homedir(), 'Music');
app.get('/api/lib', (req, res) => res.json({ ...getLibrary(), musicDir: musicDir() }));
app.get('/api/lib/status', (req, res) => res.json(getLibrary().status));
app.post('/api/lib/scan', (req, res) => {
  const folders = Array.isArray(req.body.folders) && req.body.folders.length ? req.body.folders : [musicDir()];
  scanLibrary(folders).catch(() => {});
  res.json(getLibrary().status);
});
app.get('/api/audio/:id', (req, res) => {
  const p = pathForId(req.params.id);
  if (!p || !fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p, { dotfiles: 'allow', headers: { 'Cache-Control': 'no-store' } });
});
app.get('/api/cover/:name', (req, res) => {
  const p = coverPath(req.params.name);
  if (!p) return res.status(404).end();
  res.sendFile(p, { headers: { 'Cache-Control': 'max-age=31536000' } });
});
// what's written in a song's tags right now, straight from the file
app.get('/api/tags/:id', async (req, res) => {
  const p = pathForId(req.params.id);
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: 'File not found' });
  try {
    res.json(await readAllTags(p));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// how loud songs are (measured by the player for SAME LOUDNESS)
app.get('/api/loudness', (req, res) => res.json(allLoudness()));
app.post('/api/loudness/:id', (req, res) => {
  const { lufs, peak } = req.body || {};
  if (!/^[0-9a-f]{16}$/.test(req.params.id) || !Number.isFinite(lufs) || !Number.isFinite(peak)) return res.status(400).end();
  setLoudness(req.params.id, lufs, peak);
  res.json({ ok: true });
});

// lyrics for a song: from its file, or downloaded (if ?dl=1) and kept for next time
app.get('/api/lyrics/:id', async (req, res) => {
  const s = songForId(req.params.id);
  if (!s || !fs.existsSync(s.path)) return res.status(404).json({ source: 'none' });
  res.json(await getLyrics(s, req.query.dl === '1'));
});
// [ SAVE TO FILE ]: the downloaded lyrics go into the song's own file
app.post('/api/lyrics/:id/save', async (req, res) => {
  const s = songForId(req.params.id);
  if (!s || !fs.existsSync(s.path)) return res.status(404).json({ error: 'File not found' });
  const text = downloadedText(s.id);
  if (!text) return res.status(400).json({ error: 'No downloaded lyrics for this song' });
  try {
    await writeLyrics(s.path, text);
    await refreshSongs([s.path]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// edit tags by hand: writes only what you changed straight into the songs' files, then re-reads them
// body: { ids: [library song ids], changes: { title, artist, ... } } -> { songs: [updated], failed: [{ name, error }] }
app.post('/api/edit-tags', async (req, res) => {
  const { ids = [], changes = {} } = req.body || {};
  const clean = Object.fromEntries(Object.entries(changes).filter(([, v]) => typeof v === 'string' || typeof v === 'number'));
  const done = [], failed = [];
  for (const id of ids) {
    const p = pathForId(id);
    if (!p || !fs.existsSync(p)) { failed.push({ name: id, error: 'File not found' }); continue; }
    try {
      await editTags(p, clean);
      done.push(p);
    } catch (e) {
      failed.push({ name: path.basename(p), error: e.message });
    }
  }
  res.json({ songs: await refreshSongs(done), failed });
});

app.get('/api/fs/list', (req, res) => {
  try {
    res.json(list(req.query.path || os.homedir(), req.query.all === '1'));
  } catch (e) {
    res.status(400).json({ error: e.code === 'EPERM' || e.code === 'EACCES' ? 'Access denied' : e.code === 'ENOENT' ? 'Folder not found' : e.message });
  }
});

app.post('/api/fs/scan', (req, res) => res.json(scan(req.body.path, !!req.body.recursive)));

// files picked in the browser aren't copied here. apply copies them before tagging so the originals never get touched
app.post('/api/add-paths', (req, res) => {
  const added = [];
  const known = new Set([...files.values()].map((f) => f.path.toLowerCase()));
  for (const p of req.body.paths || []) {
    if (known.has(p.toLowerCase()) || !fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
    known.add(p.toLowerCase());
    const ext = path.extname(p).toLowerCase();
    const entry = { id: crypto.randomUUID(), name: path.basename(p), ext, path: p, supported: SUPPORTED.includes(ext) };
    files.set(entry.id, entry);
    added.push({ id: entry.id, name: entry.name, ext, supported: entry.supported });
  }
  res.json(added);
});

app.post('/api/upload', upload.array('files'), (req, res) => {
  const added = req.files.map((f) => {
    const ext = path.extname(f.originalname).toLowerCase();
    const entry = { id: path.basename(f.filename, ext), name: f.originalname, ext, path: f.path, supported: SUPPORTED.includes(ext) };
    files.set(entry.id, entry);
    return { id: entry.id, name: entry.name, ext, supported: entry.supported };
  });
  res.json(added);
});

app.post('/api/identify/:id', async (req, res) => {
  const f = files.get(req.params.id);
  if (!f) return res.status(404).json({ error: 'File not found' });
  try {
    const existing = await readExisting(f.path);
    if (req.body?.term) {
      // you typed your own search, like "Artist - Title"
      const t = parseFilename(req.body.term + '.x');
      const query = { title: t.title, rawTitle: t.title, artist: t.artist, durationMs: existing.durationMs };
      const { candidates, albumIds } = await identify(query);
      Object.assign(f, { query, albumIds });
      return res.json({ query, candidates });
    }
    const fromName = parseFilename(f.name);
    // use the tags already in the file if there are any, cleaned up the same way as filenames
    const rawTitle = existing.title || fromName.title;
    const title = existing.title ? cleanTitle(existing.title) : fromName.title;
    const artist = existing.artist ? existing.artist : fromName.artist;
    const query = { title, rawTitle, artist, album: existing.album, durationMs: existing.durationMs };
    const { candidates, albumIds } = await identify(query);
    Object.assign(f, { query, albumIds });
    res.json({ query, candidates });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// runs after all songs are matched: puts songs from the same artist onto one album
// body: { songs: [{ id, best }] } where best is the match currently picked for that song
app.post('/api/unify', async (req, res) => {
  try {
    const songs = (req.body.songs || [])
      .map((s) => ({ ...s, f: files.get(s.id) }))
      .filter((s) => s.f?.query)
      .map((s) => ({ id: s.id, best: s.best, query: s.f.query, albumIds: s.f.albumIds || [] }));
    res.json(await unifyAlbums(songs));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/api/apply', async (req, res) => {
  const { items, options = {} } = req.body;
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });
  const used = new Set();
  const coverCache = new Map();
  const results = [];

  for (const item of items) {
    const f = files.get(item.id);
    if (!f) {
      results.push({ id: item.id, ok: false, error: 'File missing' });
      continue;
    }
    try {
      const m = { ...item.meta };
      const titleNoFeat = stripFeat(m.title);
      if (!options.keepFeatInTitle) m.title = titleNoFeat;

      let base = safeFilename(titleNoFeat);
      if (options.trackPrefix && m.trackNumber) base = `${String(m.trackNumber).padStart(2, '0')} - ${base}`;
      // every album gets its own subfolder
      const album = safeFilename(m.album || 'Unknown Album');
      let name = base + f.ext;
      for (let n = 2; used.has(`${album}/${name}`.toLowerCase()); n++) name = `${base} (${n})${f.ext}`;
      used.add(`${album}/${name}`.toLowerCase());

      fs.mkdirSync(path.join(OUTPUT, album), { recursive: true });
      const dest = path.join(OUTPUT, album, name);
      fs.copyFileSync(f.path, dest);
      f.out = { dest, name };

      let cover = null;
      if (item.coverUrl) {
        if (!coverCache.has(item.coverUrl)) coverCache.set(item.coverUrl, await fetchImage(item.coverUrl));
        cover = coverCache.get(item.coverUrl);
      }
      await writeTags(dest, f.ext, m, cover);
      results.push({ id: item.id, ok: true, filename: name, cover: !!cover, canOverwrite: !isUpload(f) });
    } catch (e) {
      results.push({ id: item.id, ok: false, error: e.message });
    }
  }
  res.json({ outputDir: OUTPUT, results });
});

// dropped files only exist as temp copies, so only files picked in the browser can be overwritten
const isUpload = (f) => path.resolve(f.path).toLowerCase().startsWith(path.resolve(UPLOADS).toLowerCase() + path.sep);

// mode "folder": puts a folder for each album straight into dir. if that album folder is already
// there the songs go into it, and a song that already exists gets (2) on the end instead of replacing it
// mode "overwrite": puts the tagged songs back where the originals were, renamed to the clean title
app.post('/api/save', (req, res) => {
  const { mode, dir } = req.body;
  if (!fs.existsSync(OUTPUT)) return res.status(400).json({ error: 'Nothing processed yet' });
  try {
    if (mode === 'folder') {
      if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return res.status(400).json({ error: 'That folder does not exist' });
      const albums = [];
      for (const album of fs.readdirSync(OUTPUT, { withFileTypes: true }).filter((d) => d.isDirectory())) {
        const dest = path.join(dir, album.name);
        fs.mkdirSync(dest, { recursive: true });
        for (const file of fs.readdirSync(path.join(OUTPUT, album.name))) {
          const ext = path.extname(file), base = file.slice(0, -ext.length || undefined);
          let target = path.join(dest, file);
          for (let n = 2; fs.existsSync(target); n++) target = path.join(dest, `${base} (${n})${ext}`);
          fs.copyFileSync(path.join(OUTPUT, album.name, file), target);
        }
        albums.push(album.name);
      }
      return res.json({ path: dir, albums });
    }
    if (mode === 'overwrite') {
      let written = 0, skipped = 0;
      const moves = []; // so the player can fix playlists and the queue when a file gets renamed
      for (const f of files.values()) {
        if (!f.out || !fs.existsSync(f.out.dest)) continue;
        if (isUpload(f) || !fs.existsSync(f.path)) { skipped++; continue; }
        const folder = path.dirname(f.path);
        const ext = path.extname(f.out.name);
        const base = f.out.name.slice(0, -ext.length);
        let target = path.join(folder, f.out.name);
        // don't clobber a different song that already has this name
        for (let n = 2; target.toLowerCase() !== f.path.toLowerCase() && fs.existsSync(target); n++) target = path.join(folder, `${base} (${n})${ext}`);
        fs.copyFileSync(f.out.dest, target);
        if (target.toLowerCase() !== f.path.toLowerCase()) {
          fs.unlinkSync(f.path);
          moves.push({ from: f.path, to: target });
        }
        f.path = target;
        f.name = path.basename(target);
        written++;
      }
      return res.json({ written, skipped, moves });
    }
    res.status(400).json({ error: 'Unknown save mode' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/reset', (req, res) => {
  files.clear();
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(UPLOADS, { recursive: true });
  res.json({ ok: true });
});

// port 0 = any free port, the window just loads whichever one we get
export function startServer(port = 0, { giveKeyToPage = false } = {}) {
  handOutKey = giveKeyToPage;
  const data = process.env.APERTURE_DATA || path.join(os.tmpdir(), 'aperture-tunes-data');
  initLibrary(data);
  initLyrics(data);
  initLoudness(data);
  return new Promise((resolve) => {
    const srv = app.listen(port, '127.0.0.1', () => resolve(srv.address().port));
  });
}

// running `node server.js` starts just the server, handy for testing in a browser
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer(Number(process.env.PORT) || 4517, { giveKeyToPage: true }).then((p) => console.log(`Aperture Tunes server on http://localhost:${p}`));
}
