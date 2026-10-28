import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseFilename, cleanTitle, stripFeat, safeFilename } from './lib/clean.js';
import { identify, unifyAlbums, fetchImage } from './lib/lookup.js';
import { readExisting, writeTags, SUPPORTED } from './lib/tagger.js';
import { roots, list, scan } from './lib/files.js';

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

const app = express();
// only answer requests from this pc, so random websites cant poke at the file browser
app.use((req, res, next) => (/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '') ? next() : res.status(403).end()));
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/fs/roots', (req, res) => res.json(roots()));

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
      let name = base + f.ext;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})${f.ext}`;
      used.add(name.toLowerCase());

      const dest = path.join(OUTPUT, name);
      fs.copyFileSync(f.path, dest);

      let cover = null;
      if (item.coverUrl) {
        if (!coverCache.has(item.coverUrl)) coverCache.set(item.coverUrl, await fetchImage(item.coverUrl));
        cover = coverCache.get(item.coverUrl);
      }
      await writeTags(dest, f.ext, m, cover);
      results.push({ id: item.id, ok: true, filename: name, cover: !!cover });
    } catch (e) {
      results.push({ id: item.id, ok: false, error: e.message });
    }
  }
  res.json({ outputDir: OUTPUT, results });
});

app.post('/api/reset', (req, res) => {
  files.clear();
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(UPLOADS, { recursive: true });
  res.json({ ok: true });
});

// port 0 = any free port, the window just loads whichever one we get
export function startServer(port = 0) {
  return new Promise((resolve) => {
    const srv = app.listen(port, '127.0.0.1', () => resolve(srv.address().port));
  });
}

// running `node server.js` starts just the server, handy for testing in a browser
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer(Number(process.env.PORT) || 4517).then((p) => console.log(`Aperture Tunes server on http://localhost:${p}`));
}
