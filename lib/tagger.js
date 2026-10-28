import NodeID3 from 'node-id3';
import { parseFile } from 'music-metadata';
import { readFlacTags, writeFlacTags } from 'flac-tagger';

export const SUPPORTED = ['.mp3', '.flac'];

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

  throw new Error(`Unsupported format ${ext}`);
}
