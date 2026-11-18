// writing tags into .m4a files (the MP4 container, iTunes-style tags). the tags live in moov > udta > meta > ilst.
// the whole moov box gets rebuilt with the new tags. if moov comes before the audio (mdat), the audio moves by
// however much moov grew or shrank, so every chunk offset (stco/co64) in it gets shifted by the same amount
import fs from 'node:fs';

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'edts', 'dinf']);

function boxes(buf, start, end) {
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p), hs = 8;
    const type = buf.toString('latin1', p + 4, p + 8);
    if (size === 1) { size = Number(buf.readBigUInt64BE(p + 8)); hs = 16; }
    else if (size === 0) size = end - p;
    if (size < hs || p + size > end) throw new Error(`Broken file (box ${JSON.stringify(type)})`);
    out.push({ type, start: p, size, hs, end: p + size });
    p += size;
  }
  return out;
}
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
function box(type, ...parts) {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(body.length + 8), Buffer.from(type, 'latin1'), body]);
}
// some files have meta as a plain box, most (iTunes) as a "full box" with 4 bytes of version/flags first
function metaKids(buf, m) {
  const full = buf.readUInt32BE(m.start + m.hs) === 0;
  return { full, kids: boxes(buf, m.start + m.hs + (full ? 4 : 0), m.end) };
}

const TEXT = 1, JPEG = 13, PNG = 14, BINARY = 0;
const data = (kind, payload) => box('data', u32(kind), u32(0), payload);
function item(name, value) {
  if (name === 'trkn') return box(name, data(BINARY, Buffer.from([0, 0, value.no >> 8, value.no & 255, (value.of || 0) >> 8, (value.of || 0) & 255, 0, 0])));
  if (name === 'disk') return box(name, data(BINARY, Buffer.from([0, 0, value.no >> 8, value.no & 255, (value.of || 0) >> 8, (value.of || 0) & 255])));
  if (name === 'covr') return box(name, data(/png/i.test(value.mime) ? PNG : JPEG, value.buffer));
  return box(name, data(TEXT, Buffer.from(String(value), 'utf8')));
}

// adds `delta` to every chunk offset at or after `from`, inside a moov box we built
function shiftOffsets(buf, start, end, from, delta) {
  for (const b of boxes(buf, start, end)) {
    if (CONTAINERS.has(b.type)) shiftOffsets(buf, b.start + b.hs, b.end, from, delta);
    else if (b.type === 'stco' || b.type === 'co64') {
      const n = buf.readUInt32BE(b.start + b.hs + 4);
      for (let i = 0; i < n; i++) {
        if (b.type === 'stco') {
          const at = b.start + b.hs + 8 + i * 4, v = buf.readUInt32BE(at);
          if (v < from) continue;
          if (v + delta > 0xffffffff) throw new Error('File too big to tag');
          buf.writeUInt32BE(v + delta, at);
        } else {
          const at = b.start + b.hs + 8 + i * 8, v = buf.readBigUInt64BE(at);
          if (v >= BigInt(from)) buf.writeBigUInt64BE(v + BigInt(delta), at);
        }
      }
    }
  }
}

// set: { '©nam': 'Title', trkn: { no, of }, covr: { buffer, mime }, '©cmt': null (null takes it out) }
export function writeMp4Tags(filePath, set) {
  const buf = fs.readFileSync(filePath);
  const top = boxes(buf, 0, buf.length);
  if (top.some((b) => b.type === 'moof')) throw new Error("This kind of .m4a (fragmented) can't be tagged");
  const moov = top.find((b) => b.type === 'moov');
  if (!moov) throw new Error('Not an MP4/M4A file');
  const kids = boxes(buf, moov.start + moov.hs, moov.end);
  const raw = (b) => buf.subarray(b.start, b.end);

  // the existing tags, minus the ones being changed
  const udta = kids.find((b) => b.type === 'udta');
  const udtaKids = udta ? boxes(buf, udta.start + udta.hs, udta.end) : [];
  const meta = udtaKids.find((b) => b.type === 'meta');
  const mk = meta ? metaKids(buf, meta) : { full: true, kids: [] };
  const ilst = mk.kids.find((b) => b.type === 'ilst');
  const keep = (ilst ? boxes(buf, ilst.start + ilst.hs, ilst.end) : []).filter((b) => !(b.type in set) && !(b.type === 'gnre' && '©gen' in set));
  const fresh = Object.entries(set).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(typeof v === 'object' && !v.buffer && !v.no)).map(([k, v]) => item(k, v));
  const newIlst = box('ilst', ...keep.map(raw), ...fresh);

  // meta: the handler says these are iTunes-style tags
  const hdlr = mk.kids.find((b) => b.type === 'hdlr');
  const hdlrBuf = hdlr ? raw(hdlr) : box('hdlr', u32(0), u32(0), Buffer.from('mdirappl', 'latin1'), u32(0), u32(0), Buffer.from([0]));
  const metaRest = mk.kids.filter((b) => b.type !== 'ilst' && b.type !== 'hdlr' && b.type !== 'free').map(raw);
  const newMeta = box('meta', ...(mk.full ? [u32(0)] : []), hdlrBuf, newIlst, ...metaRest);
  const newUdta = box('udta', ...(meta ? udtaKids.map((b) => (b === meta ? newMeta : raw(b))) : [...udtaKids.map(raw), newMeta]));
  const newMoov = box('moov', ...(udta ? kids.map((b) => (b === udta ? newUdta : raw(b))) : [...kids.map(raw), newUdta]));

  // audio stored after moov moves by the size difference
  const delta = newMoov.length - moov.size;
  if (delta) shiftOffsets(newMoov, 8, newMoov.length, moov.end, delta);
  const out = Buffer.concat(top.map((b) => (b === moov ? newMoov : raw(b))));
  // written next to it first and then swapped in, so a crash halfway can't leave a broken song
  const tmp = `${filePath}.aperture-tmp`;
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, filePath);
}
