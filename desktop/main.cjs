/**
 * Desktop shell for Ryan's Road to the LPGA (Electron).
 *
 * Serves the built game (dist/) from a private app:// origin instead of file://, so the game's
 * IndexedDB save has a stable origin and persists in the user's app-data folder between runs
 * (Steam Cloud file sync is a later step). No network access is needed or requested.
 *
 * Keys: F11 or Alt+Enter toggles fullscreen; Ctrl/Cmd+Q quits. DevTools only with --dev.
 * Run from the repo:  npm run desktop   (builds the game first)
 */
const { app, BrowserWindow, Menu, net, protocol, screen, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const DEV = process.argv.includes('--dev');
const SHOT = (process.argv.find((a) => a.startsWith('--screenshot=')) || '').slice('--screenshot='.length);
const DIST = app.isPackaged ? path.join(process.resourcesPath, 'game') : path.join(__dirname, '..', 'dist');
const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// One game window at a time.
if (!app.requestSingleInstanceLock()) app.quit();

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')); } catch { return {}; }
}
function saveState(win) {
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...b, fullscreen: win.isFullScreen(), maximized: win.isMaximized() }));
  } catch { /* not fatal */ }
}

function createWindow() {
  const st = readState();
  const area = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: st.width || Math.min(1440, area.width),
    height: st.height || Math.min(900, area.height),
    x: st.x, y: st.y,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0d2416',
    title: "Ryan's Road to the LPGA",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: DEV,
      backgroundThrottling: false,
    },
  });
  if (st.maximized) win.maximize();
  if (st.fullscreen) win.setFullScreen(true);

  // Fullscreen toggles, and keep the game from navigating away.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', () => saveState(win));
  win.once('ready-to-show', () => win.show());
  void win.loadURL('app://game/index.html');

  if (SHOT) {
    // Smoke test: load, wait for the title screen, save a screenshot, quit.
    win.webContents.once('did-finish-load', () => {
      if (process.argv.includes('--press-enter')) {
        setTimeout(() => {
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
          win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
        }, 3000);
      }
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(SHOT, img.toPNG());
        app.quit();
      }, 6000);
    });
  }
  return win;
}

app.whenReady().then(() => {
  // app://game/<path> → dist/<path>, refusing anything outside dist.
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(fs.existsSync(file) ? file : path.join(DIST, 'index.html')).toString());
  });

  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'View', submenu: [{ role: 'togglefullscreen', accelerator: 'F11' }, ...(DEV ? [{ role: 'toggleDevTools' }, { role: 'reload' }] : [])] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.on('window-all-closed', () => app.quit());
