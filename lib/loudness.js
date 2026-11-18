// how loud every song is, once measured (for SAME LOUDNESS), kept in loudness.json next to the library
import fs from 'node:fs';
import path from 'node:path';

let file = null;
let data = {};
let timer = null;

export function initLoudness(dir) {
  file = path.join(dir, 'loudness.json');
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    data = {};
  }
}
export const allLoudness = () => data;
// written a moment later in one go, songs often get measured one after another
export function setLoudness(id, lufs, peak) {
  data[id] = { lufs, peak };
  clearTimeout(timer);
  timer = setTimeout(() => fs.writeFile(file, JSON.stringify(data), () => {}), 1500);
}
