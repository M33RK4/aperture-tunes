import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, OUTPUT } from './server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(__dirname, 'build', 'icon.png');

if (!app.requestSingleInstanceLock()) app.quit();

let win, mini, tray, port;
let quitting = false;
let lastState = null; // what's playing, so the mini player and tray can show it

// your username, settings, playlists and queue get saved in %APPDATA%\Aperture Tunes\profile.json
const profileFile = () => path.join(app.getPath('userData'), 'profile.json');
let profile = null;
function readProfile() {
  if (!profile) {
    try {
      profile = JSON.parse(fs.readFileSync(profileFile(), 'utf8'));
    } catch {
      profile = {};
    }
  }
  return profile;
}
function writeProfile(patch) {
  profile = { ...readProfile(), ...patch };
  fs.mkdirSync(path.dirname(profileFile()), { recursive: true });
  fs.writeFileSync(profileFile(), JSON.stringify(profile));
  return profile;
}

// listening statistics live in their own file next to it, it gets big over time
const statsFile = () => path.join(app.getPath('userData'), 'stats.json');
function readStats() {
  try {
    return JSON.parse(fs.readFileSync(statsFile(), 'utf8'));
  } catch {
    return null;
  }
}
function writeStats(data) {
  fs.mkdirSync(path.dirname(statsFile()), { recursive: true });
  // written to a temp file first so a crash mid-write can't wipe the history
  fs.writeFileSync(statsFile() + '.tmp', JSON.stringify(data));
  fs.renameSync(statsFile() + '.tmp', statsFile());
}

const keepInside = (b) => (b && screen.getAllDisplays().some((d) => b.x >= d.bounds.x - 50 && b.y >= d.bounds.y - 50 && b.x < d.bounds.x + d.bounds.width && b.y < d.bounds.y + d.bounds.height) ? b : null);

async function createWindow() {
  process.env.APERTURE_DATA = app.getPath('userData');
  process.env.APERTURE_MUSIC = app.getPath('music');
  port = await startServer(0);
  win = new BrowserWindow({
    width: 1200,
    height: 740,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: '#140f06',
    title: 'Aperture Tunes',
    icon: ICON,
    show: false,
    // keeps the music and crossfades going when the window is hidden in the tray
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: false },
  });
  win.once('ready-to-show', () => win.show());
  // keep everything in this window, any web links open in your normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // closing can mean quit, hide to the tray, or swap to the mini player (set in options)
  win.on('close', (e) => {
    if (quitting) return;
    const mode = readProfile().closeMode || 'quit';
    if (mode === 'quit') return;
    e.preventDefault();
    win.hide();
    if (mode === 'mini') openMini();
    else showTray();
  });
  win.loadURL(`http://127.0.0.1:${port}/`);
}

function showMain() {
  if (!win) return;
  win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
  if (mini) mini.close();
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function quit() {
  quitting = true;
  app.quit();
}

const media = (cmd) => win?.webContents.send('media', cmd);

function trayMenu() {
  const playing = lastState?.playing;
  return Menu.buildFromTemplate([
    { label: lastState?.title ? `${lastState.title} - ${lastState.artist || ''}` : 'Nothing playing', enabled: false },
    { type: 'separator' },
    { label: playing ? 'Pause' : 'Play', click: () => media('toggle') },
    { label: 'Next', click: () => media('next') },
    { label: 'Previous', click: () => media('prev') },
    { type: 'separator' },
    { label: 'Open Aperture Tunes', click: showMain },
    { label: 'Mini player', click: () => { win.hide(); openMini(); } },
    { label: 'Quit', click: quit },
  ]);
}

function showTray() {
  if (tray) return;
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Aperture Tunes');
  tray.setContextMenu(trayMenu());
  tray.on('click', showMain);
}

function openMini() {
  if (mini) return mini.show();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  const p = readProfile();
  const pos = keepInside(p.miniPos);
  const area = screen.getPrimaryDisplay().workArea;
  mini = new BrowserWindow({
    width: 360,
    height: 96,
    x: pos ? pos.x : area.x + area.width - 380,
    y: pos ? pos.y : area.y + area.height - 116,
    frame: false,
    resizable: false,
    maximizable: false,
    skipTaskbar: false,
    alwaysOnTop: p.miniPin !== false,
    backgroundColor: '#140f06',
    title: 'Aperture Tunes',
    icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });
  mini.webContents.on('will-navigate', (e) => e.preventDefault());
  mini.loadURL(`http://127.0.0.1:${port}/mini.html`);
  mini.webContents.on('did-finish-load', () => lastState && mini?.webContents.send('np-state', lastState));
  mini.on('moved', () => {
    const [x, y] = mini.getPosition();
    writeProfile({ miniPos: { x, y } });
  });
  mini.on('closed', () => {
    mini = null;
    // closing the mini player while the big window is hidden would leave nothing on screen
    if (!quitting && win && !win.isVisible()) quit();
  });
}

ipcMain.handle('profile-get', () => readProfile());
ipcMain.handle('profile-set', (e, patch) => writeProfile(patch));
ipcMain.handle('stats-get', () => readStats());
ipcMain.on('stats-set', (e, data) => writeStats(data));

ipcMain.on('win', (e, action) => {
  if (action === 'min') win.minimize();
  else if (action === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.close();
});

// the player window tells us what's playing, we pass it on to the mini player and tray
ipcMain.on('np-state', (e, state) => {
  lastState = state;
  mini?.webContents.send('np-state', state);
  if (tray) {
    tray.setToolTip(state.title ? `${state.title} - ${state.artist || ''}` : 'Aperture Tunes');
    tray.setContextMenu(trayMenu());
  }
});
ipcMain.on('media', (e, cmd) => media(cmd));
ipcMain.handle('mini', (e, action) => {
  if (action === 'open') showMain();
  else if (action === 'close') quit();
  else if (action === 'pin' && mini) {
    const on = !mini.isAlwaysOnTop();
    mini.setAlwaysOnTop(on);
    writeProfile({ miniPin: on });
    return on;
  } else if (action === 'pinned') return readProfile().miniPin !== false;
  return null;
});

ipcMain.handle('open-path', (e, p) => (p && fs.existsSync(p) ? shell.openPath(p) : 'Not found'));

ipcMain.handle('open-output', () => (fs.existsSync(OUTPUT) ? shell.openPath(OUTPUT) : 'Nothing processed yet'));

app.on('second-instance', showMain);
app.on('before-quit', () => { quitting = true; });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
