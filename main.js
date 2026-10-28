import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, OUTPUT } from './server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!app.requestSingleInstanceLock()) app.quit();

let win;

// your username and all-time tag count get saved in %APPDATA%\Aperture Tunes\profile.json
const profileFile = () => path.join(app.getPath('userData'), 'profile.json');
function readProfile() {
  try {
    return JSON.parse(fs.readFileSync(profileFile(), 'utf8'));
  } catch {
    return {};
  }
}
function writeProfile(patch) {
  const next = { ...readProfile(), ...patch };
  fs.mkdirSync(path.dirname(profileFile()), { recursive: true });
  fs.writeFileSync(profileFile(), JSON.stringify(next, null, 2));
  return next;
}

async function createWindow() {
  const port = await startServer(0);
  win = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 820,
    minHeight: 520,
    frame: false,
    backgroundColor: '#140f06',
    title: 'Aperture Tunes',
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });
  win.once('ready-to-show', () => win.show());
  // keep everything in this window, any web links open in your normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadURL(`http://127.0.0.1:${port}/`);
}

ipcMain.handle('profile-get', () => readProfile());
ipcMain.handle('profile-set', (e, patch) => writeProfile(patch));

ipcMain.on('win', (e, action) => {
  if (action === 'min') win.minimize();
  else if (action === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.close();
});

ipcMain.handle('save-folder', async () => {
  if (!fs.existsSync(OUTPUT)) return { error: 'Nothing processed yet' };
  const pick = await dialog.showOpenDialog(win, {
    title: 'Choose where to save "Tagged Songs"',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (pick.canceled || !pick.filePaths[0]) return { canceled: true };
  let dest = path.join(pick.filePaths[0], 'Tagged Songs');
  for (let n = 2; fs.existsSync(dest); n++) dest = path.join(pick.filePaths[0], `Tagged Songs (${n})`);
  fs.cpSync(OUTPUT, dest, { recursive: true });
  shell.openPath(dest);
  return { path: dest };
});

ipcMain.handle('open-output', () => (fs.existsSync(OUTPUT) ? shell.openPath(OUTPUT) : 'Nothing processed yet'));

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
