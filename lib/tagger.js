import NodeID3 from 'node-id3';
import { parseFile } from 'music-metadata';
import { readFlacTags, writeFlacTags } from 'flac-tagger';
import { writeMp4Tags } from './mp4tags.js';

export const SUPPORTED = ['.mp3', '.flac', '.m4a'];

export async function readExisting(filePath) {
  try {
    const { common, format } = await parseFile(filePath, { skipCovers: true, duration: true });
    return {
      title: common.title || null,
      artist: common.artist || null,
      album: common.album || null,
      durationMs: format.duration ? Math.round(format.duration * 1000) : null,
    };
  } catch {
    return { title: null, artist: null, album: null, durationMs: null };
  }
}

export async function writeTags(filePath, ext, meta, cover) {
  const track = meta.trackNumber ? `${meta.trackNumber}${meta.trackCount ? '/' + meta.trackCount : ''}` : undefined;
  const disc = meta.discNumber ? `${meta.discNumber}${meta.discCount ? '/' + meta.discCount : ''}` : undefined;

  if (ext === '.mp3') {
    const tags = {
      title: meta.title,
      artist: meta.artist,
      performerInfo: meta.albumArtist || meta.artist, // TPE2 is album artist in mp3 tags
      album: meta.album,
      trackNumber: track,
      partOfSet: disc,
      year: meta.year || undefined,
      genre: meta.genre || undefined,
    };
    if (cover) {
      tags.image = { mime: cover.mime, type: { id: 3, name: 'front cover' }, description: 'Cover', imageBuffer: cover.buffer };
    }
    // this wipes the old tag completely, which also gets rid of junk like old covers and website comments
    const res = NodeID3.write(tags, filePath);
    if (res instanceof Error) throw res;
    return;
  }

  if (ext === '.flac') {
    const existing = await readFlacTags(filePath).catch(() => ({ tagMap: {} }));
    const ours = {
      TITLE: meta.title,
      ARTIST: meta.artist,
      ALBUMARTIST: meta.albumArtist || meta.artist,
      ALBUM: meta.album,
      TRACKNUMBER: meta.trackNumber ? String(meta.trackNumber) : undefined,
      TRACKTOTAL: meta.trackCount ? String(meta.trackCount) : undefined,
      DISCNUMBER: meta.discNumber ? String(meta.discNumber) : undefined,
      DISCTOTAL: meta.discCount ? String(meta.discCount) : undefined,
      DATE: meta.year || undefined,
      GENRE: meta.genre || undefined,
    };
    const replaced = new Set([...Object.keys(ours), 'TOTALTRACKS', 'TOTALDISCS', 'COMMENT', 'DESCRIPTION'].map((k) => k.toUpperCase()));
    const tagMap = {};
    for (const [k, v] of Object.entries(existing.tagMap || {})) if (!replaced.has(k.toUpperCase())) tagMap[k] = v;
    for (const [k, v] of Object.entries(ours)) if (v) tagMap[k] = v;
    await writeFlacTags({ tagMap, picture: cover ? { buffer: cover.buffer, mime: cover.mime } : undefined }, filePath);
    return;
  }

  if (ext === '.m4a') {
    // like the other two: the fields we know get replaced, old comments go, lyrics and the rest stay
    writeMp4Tags(filePath, {
      '©nam': meta.title, '©ART': meta.artist, aART: meta.albumArtist || meta.artist, '©alb': meta.album,
      trkn: meta.trackNumber ? { no: +meta.trackNumber, of: +meta.trackCount || 0 } : null,
      disk: meta.discNumber ? { no: +meta.discNumber, of: +meta.discCount || 0 } : null,
      '©day': meta.year || null, '©gen': meta.genre || null, '©cmt': null, desc: null,
      ...(cover ? { covr: { buffer: cover.buffer, mime: cover.mime } } : {}),
    });
    return;
  }

  throw new Error(`Unsupported format ${ext}`);
}

// lyrics into the song's own file, so other music apps (like the one on your phone) show them too
export async function writeLyrics(filePath, text) {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (ext === '.mp3') {
    // node-id3 saves ID3v2.3, so the year is written again in case it was in a v2.4 TDRC frame
    const { common } = await parseFile(filePath, { skipCovers: true, duration: false });
    const res = NodeID3.update({ unsynchronisedLyrics: { language: 'eng', text }, year: common.year ? String(common.year) : undefined, TDRC: undefined }, filePath);
    if (res instanceof Error) throw res;
    return;
  }
  if (ext === '.flac') {
    const { tagMap: old = {} } = await readFlacTags(filePath).catch(() => ({ tagMap: {} }));
    const tagMap = { ...old };
    for (const k of Object.keys(tagMap)) if (['LYRICS', 'UNSYNCEDLYRICS'].includes(k.toUpperCase())) delete tagMap[k];
    tagMap.LYRICS = text;
    await writeFlacTags({ tagMap }, filePath);
    return;
  }
  if (ext === '.m4a') return writeMp4Tags(filePath, { '©lyr': text });
  throw new Error('Lyrics can only be saved into MP3, FLAC and M4A files');
}

// edit by hand: only the fields in `changes` get written, everything else in the file (cover, lyrics,
// comments...) stays. an empty value takes that tag out. a track or disc number keeps its "of" part
// unless that's changed too
const HAND_FIELDS = ['title', 'artist', 'albumArtist', 'album', 'track', 'trackOf', 'disc', 'discOf', 'year', 'genre'];
export async function editTags(filePath, changes) {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (!SUPPORTED.includes(ext)) throw new Error('Only MP3, FLAC and M4A files can be edited');
  const has = (k) => HAND_FIELDS.includes(k) && Object.prototype.hasOwnProperty.call(changes, k);
  const val = (k) => String(changes[k] ?? '').trim();
  const { common } = await parseFile(filePath, { skipCovers: true, duration: false });
  const int = (k, cur) => {
    if (!has(k)) return cur || null;
    const n = parseInt(val(k), 10);
    return n > 0 ? n : null;
  };
  const track = { no: int('track', common.track?.no), of: int('trackOf', common.track?.of) };
  const disc = { no: int('disc', common.disk?.no), of: int('discOf', common.disk?.of) };
  const trackSet = has('track') || has('trackOf'), discSet = has('disc') || has('discOf');
  const nOf = (x) => (x.no ? `${x.no}${x.of ? '/' + x.of : ''}` : undefined);

  if (ext === '.mp3') {
    const t = {};
    const frames = { title: 'title', artist: 'artist', albumArtist: 'performerInfo', album: 'album', genre: 'genre' };
    for (const [k, frame] of Object.entries(frames)) if (has(k)) t[frame] = val(k) || undefined;
    if (trackSet) t.trackNumber = nOf(track);
    if (discSet) t.partOfSet = nOf(disc);
    // the year is always written: node-id3 saves ID3v2.3, and a v2.4 file keeps its year in TDRC, which v2.3 doesn't have
    t.year = (has('year') ? val('year') : String(common.year || '')) || undefined;
    t.TDRC = undefined;
    const res = NodeID3.update(t, filePath);
    if (res instanceof Error) throw res;
    return;
  }

  if (ext === '.m4a') {
    const set = {};
    const atoms = { title: '©nam', artist: '©ART', albumArtist: 'aART', album: '©alb', year: '©day', genre: '©gen' };
    for (const [k, atom] of Object.entries(atoms)) if (has(k)) set[atom] = val(k) || null;
    if (trackSet) set.trkn = track.no ? track : null;
    if (discSet) set.disk = disc.no ? disc : null;
    writeMp4Tags(filePath, set);
    return;
  }

  const { tagMap: old = {} } = await readFlacTags(filePath).catch(() => ({ tagMap: {} }));
  const tagMap = { ...old };
  // replaces a tag whatever case it was written in, plus the other names some programs use for it
  const put = (key, v, also = []) => {
    for (const k of Object.keys(tagMap)) if ([key, ...also].includes(k.toUpperCase())) delete tagMap[k];
    if (v) tagMap[key] = v;
  };
  if (has('title')) put('TITLE', val('title'));
  if (has('artist')) put('ARTIST', val('artist'));
  if (has('albumArtist')) put('ALBUMARTIST', val('albumArtist'), ['ALBUM ARTIST']);
  if (has('album')) put('ALBUM', val('album'));
  if (has('year')) put('DATE', val('year'), ['YEAR']);
  if (has('genre')) put('GENRE', val('genre'));
  if (trackSet) {
    put('TRACKNUMBER', track.no ? String(track.no) : '');
    put('TRACKTOTAL', track.no && track.of ? String(track.of) : '', ['TOTALTRACKS']);
  }
  if (discSet) {
    put('DISCNUMBER', disc.no ? String(disc.no) : '');
    put('DISCTOTAL', disc.no && disc.of ? String(disc.of) : '', ['TOTALDISCS']);
  }
  // no picture given, so the cover stays exactly as it is
  await writeFlacTags({ tagMap }, filePath);
}
