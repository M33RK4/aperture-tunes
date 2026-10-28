import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SUPPORTED } from './tagger.js';

const SKIP = new Set(['$recycle.bin', 'system volume information', 'desktop.ini', 'thumbs.db', 'ntuser.dat']);
const isAudio = (name) => SUPPORTED.includes(path.extname(name).toLowerCase());
const hidden = (name) => name.startsWith('.') || name.startsWith('$') || SKIP.has(name.toLowerCase()) || /^ntuser\./i.test(name);

// desktop/documents/music can get moved into onedrive, so use whichever one exists
export function roots() {
  const home = os.homedir();
  const pick = (...names) => names.map((n) => path.join(home, n)).find((p) => fs.existsSync(p));
  const locations = [
    ['MUSIC', pick('Music', 'OneDrive/Music')],
    ['DOWNLOADS', pick('Downloads')],
    ['DESKTOP', pick('Desktop', 'OneDrive/Desktop')],
    ['DOCUMENTS', pick('Documents', 'OneDrive/Documents')],
    ['HOME', home],
  ].filter(([, p]) => p).map(([name, p]) => ({ name, path: p }));
  const drives = [];
  if (process.platform === 'win32') {
    for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') if (fs.existsSync(`${l}:\\`)) drives.push({ name: `${l}:\\`, path: `${l}:\\` });
  } else {
    drives.push({ name: '/', path: '/' });
  }
  return { locations, drives };
}

export function list(dir, showAll = false) {
  const full = path.resolve(dir);
  const entries = [];
  for (const d of fs.readdirSync(full, { withFileTypes: true })) {
    if (hidden(d.name)) continue;
    const p = path.join(full, d.name);
    let st;
    try {
      st = fs.statSync(p); // broken or locked stuff just gets skipped
    } catch {
      continue;
    }
    const isDir = st.isDirectory();
    if (!isDir && !showAll && !isAudio(d.name)) continue;
    entries.push({ name: d.name, path: p, dir: isDir, audio: !isDir && isAudio(d.name), size: isDir ? null : st.size, mtime: st.mtimeMs });
  }
  entries.sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));
  const parent = path.dirname(full);
  return { path: full, parent: parent === full ? null : parent, entries };
}

export function scan(dir, recursive, limit = 5000) {
  const out = [];
  const walk = (d, depth) => {
    let items;
    try {
      items = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    for (const it of items) {
      if (out.length >= limit) return;
      if (hidden(it.name)) continue;
      const p = path.join(d, it.name);
      if (it.isDirectory()) {
        if (recursive && depth < 12) walk(p, depth + 1);
      } else if (isAudio(it.name)) {
        out.push(p);
      }
    }
  };
  walk(path.resolve(dir), 0);
  return out;
}
