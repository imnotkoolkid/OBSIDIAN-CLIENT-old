const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { get: httpsGet } = require('https');
const { get: httpGet } = require('http');

const SETTINGS_WRITE_DELAY = 500;
let settingsWriteTimer, mainWindow, clientMenu, cssKey, backgroundCssKey, splash;
let menuToggleKey = 'ShiftRight', devToolsEnabled = false;

const userData = app.getPath('userData');
const paths = {
  settings: path.join(userData, 'settings.json'),
  css: path.join(userData, 'main.css'),
  background: path.join(userData, 'background.json')
};
const scriptsPath = path.join(app.getPath('documents'), 'ObsidianClient', 'scripts');

let settingsCache, preloadedScripts = [];

async function ensureScriptsFolder() {
  try {
    await fs.mkdir(scriptsPath, { recursive: true });
  } catch (err) {
    console.error('Error creating scripts folder:', err);
  }
}

ipcMain.on('get-scripts-path', e => e.returnValue = scriptsPath);
ipcMain.on('get-loaded-scripts', async e => {
  try {
    const files = (await fs.readdir(scriptsPath)).filter(f => f.endsWith('.js'));
    e.returnValue = files;
  } catch (err) {
    console.error('Error reading scripts folder:', err);
    e.returnValue = [];
  }
});
ipcMain.on('set-preloaded-scripts', (_, scripts) => preloadedScripts = scripts);
ipcMain.on('get-preloaded-scripts', e => e.returnValue = preloadedScripts);

async function loadSettings() {
  if (settingsCache) return settingsCache;
  try {
    settingsCache = JSON.parse(await fs.readFile(paths.settings, 'utf8'));
    devToolsEnabled = settingsCache.devToolsEnabled ?? false;
    menuToggleKey = settingsCache.menuToggleKey ?? 'ShiftRight';
    return settingsCache;
  } catch (err) {
    console.error('Error loading settings:', err);
    return {};
  }
}

async function saveSettings(settings) {
  try {
    settingsCache = { ...settingsCache, ...settings };
    clearTimeout(settingsWriteTimer);
    settingsWriteTimer = setTimeout(() => fs.writeFile(paths.settings, JSON.stringify(settingsCache), 'utf8'), SETTINGS_WRITE_DELAY);
  } catch (err) {
    console.error('Error saving settings:', err);
  }
}

function applySwitches() {
  app.commandLine.appendSwitch("disable-frame-rate-limit");
  app.allowRendererProcessReuse = true;
}

applySwitches();

function createWindow() {
  splash = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    transparent: false,
    resizable: false,
    show: true,
    fullscreen: true,
    backgroundColor: '#121212',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splash.loadFile(path.join(__dirname, 'assets', 'splash.html'));

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: "Obsidian Client",
    icon: path.join(__dirname, 'assets', 'Obsidian Client.ico'),
    show: false,
    fullscreen: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'scriptsPreload.js'),
      devTools: true
    }
  });

  mainWindow.webContents.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.116 Safari/537.36 Electron/10.4.7 OBSIDIANClient/${app.getVersion()}"
  );

  mainWindow.loadURL("https://kirka.io");

  mainWindow.webContents.on('did-finish-load', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    try {
      mainWindow.show();
      if (splash && !splash.isDestroyed()) splash.close();
    } catch (e) {
      console.error("Error showing main window or closing splash:", e);
    }

    try {
      await applyCSS();
      await applyBackground();
    } catch (err) {
      console.error("Error applying styles:", err);
    }
  });

  mainWindow.setTitle("Obsidian Client");
  Menu.setApplicationMenu(null);

  mainWindow.on('page-title-updated', e => e.preventDefault());

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (clientMenu && !clientMenu.isDestroyed()) clientMenu.close();
  });

  let lastInputTime = 0;
  mainWindow.webContents.on('before-input-event', (e, input) => {
    const now = Date.now();
    if (now - lastInputTime < 50) return;
    lastInputTime = now;

    if (input.key === 'F11') {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      }
      e.preventDefault();
    } else if (input.code === menuToggleKey && input.type === 'keyDown') {
      toggleClientMenu();
      e.preventDefault();
    } else if (devToolsEnabled && (input.key === 'F12' || (input.control && input.shift && input.key === 'I'))) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.openDevTools();
      }
      e.preventDefault();
    } else if (input.key === 'F5') {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reload();
      }
      e.preventDefault();
    }
  });
}

app.whenReady().then(async () => {
  await Promise.all([loadSettings(), ensureScriptsFolder()]);
  createWindow();
});

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
app.on('activate', () => !BrowserWindow.getAllWindows().length && createWindow());

function toggleClientMenu() {
  if (clientMenu?.isDestroyed() === false) return clientMenu.close();

  const { x, y, width, height } = mainWindow.getBounds();
  clientMenu = new BrowserWindow({
    width: 700,
    height: 500,
    parent: mainWindow,
    modal: false,
    frame: false,
    transparent: true,
    resizable: false,
    x: Math.round(x + (width - 700) / 2),
    y: Math.round(y + (height - 500) / 2),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      javascript: true,
      images: false
    }
  });

  clientMenu.loadFile('menu.html');

  const updateMenuPosition = () => {
    if (clientMenu?.isDestroyed() === false) {
      requestAnimationFrame(() => {
        const { x: nx, y: ny, width: nw, height: nh } = mainWindow.getBounds();
        clientMenu.setPosition(Math.round(nx + (nw - 700) / 2), Math.round(ny + (nh - 500) / 2));
      });
    }
  };
  mainWindow.on('move', updateMenuPosition);
  clientMenu.on('closed', () => mainWindow.removeListener('move', updateMenuPosition));
}

async function applyCSS() {
  try {
    const cssConfig = JSON.parse(await fs.readFile(paths.css, 'utf8'));
    if (cssConfig.enabled) cssConfig.url ? await fetchAndInjectCSS(cssConfig.url) : cssConfig.css && await injectCSS(cssConfig.css);
  } catch (err) {
    console.error('Error applying CSS:', err);
    await fs.writeFile(paths.css, JSON.stringify({ enabled: false, css: '', url: '' }), 'utf8');
  }
}

async function applyBackground() {
  try {
    const { enabled, url } = JSON.parse(await fs.readFile(paths.background, 'utf8'));
    if (enabled && url) injectBackgroundCSS(url);
  } catch (err) {
    console.error('Error applying background:', err);
    await fs.writeFile(paths.background, JSON.stringify({ enabled: false, url: '' }), 'utf8');
  }
}

async function fetchAndInjectCSS(url) {
  if (mainWindow?.isDestroyed()) return;
  const client = url.startsWith('https') ? httpsGet : httpGet;

  return new Promise((resolve, reject) => {
    client(url, { headers: { 'Cache-Control': 'no-cache' } }, res => {
      if (res.statusCode !== 200) {
        console.error(`Failed to load CSS: ${res.statusCode}`);
        return resolve();
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => injectCSS(data).then(() => saveCSS(data, true, url)).then(resolve));
    }).on('error', err => {
      console.error('Error fetching CSS:', err);
      reject(err);
    }).end();
  });
}

async function saveCSS(css, enabled = true, url = null) {
  try {
    await fs.writeFile(paths.css, JSON.stringify({ css, enabled, url }), 'utf8');
  } catch (err) {
    console.error('Error saving CSS:', err);
  }
}

async function saveBackground(url, enabled = true) {
  try {
    await fs.writeFile(paths.background, JSON.stringify({ url, enabled }), 'utf8');
  } catch (err) {
    console.error('Error saving background:', err);
  }
}

async function injectCSS(css) {
  if (mainWindow?.isDestroyed()) return;
  if (cssKey) await mainWindow.webContents.removeInsertedCSS(cssKey).catch(() => {});
  try {
    cssKey = await mainWindow.webContents.insertCSS(css);
    await saveCSS(css, true);
  } catch (err) {
    console.error('Error injecting CSS:', err);
  }
}

function injectBackgroundCSS(url) {
  if (mainWindow?.isDestroyed()) return;
  const css = `#app > div.interface.text-2 > div.background {
    background: url(${url}) no-repeat 50% 50% / cover !important;
    animation: none !important;
  }
  #app > div.interface.text-2 > div.background > div.pattern-bg,
  #app > div.interface.text-2 > div.background > div.bg-radial {
    display: none !important;
  }`;
  backgroundCssKey && mainWindow.webContents.removeInsertedCSS(backgroundCssKey).catch(() => {});
  mainWindow.webContents.insertCSS(css, { cssOrigin: 'author' })
    .then(key => {
      backgroundCssKey = key;
      saveBackground(url, true);
    })
    .catch(err => console.error('Error injecting background:', err));
}

async function removeCSS() {
  if (mainWindow?.isDestroyed() || !cssKey) return;
  try {
    await mainWindow.webContents.removeInsertedCSS(cssKey);
    cssKey = null;
    await saveCSS('', false);
  } catch (err) {
    console.error('Error removing CSS:', err);
  }
}

async function removeBackgroundCSS() {
  if (mainWindow?.isDestroyed() || !backgroundCssKey) return;
  try {
    await mainWindow.webContents.removeInsertedCSS(backgroundCssKey);
    backgroundCssKey = null;
    await saveBackground('', false);
  } catch (err) {
    console.error('Error removing background:', err);
  }
}

ipcMain.on('close-menu', () => clientMenu?.isDestroyed() === false && clientMenu.close());
ipcMain.on('inject-css', (_, css) => injectCSS(css));
ipcMain.on('inject-css-from-url', (_, url) => fetchAndInjectCSS(url));
ipcMain.on('remove-css', removeCSS);
ipcMain.on('inject-background', (_, url) => injectBackgroundCSS(url));
ipcMain.on('remove-background', removeBackgroundCSS);
ipcMain.on('set-dev-tools', async (_, enabled) => {
  if (mainWindow?.isDestroyed()) return;
  devToolsEnabled = enabled;
  await saveSettings({ devToolsEnabled });
});
ipcMain.on('set-menu-toggle-key', async (_, key) => {
  if (mainWindow?.isDestroyed()) return;
  menuToggleKey = key;
  await saveSettings({ menuToggleKey: key });
});
ipcMain.on('open-scripts-folder', async () => {
  try {
    await ensureScriptsFolder();
    await shell.openPath(scriptsPath);
  } catch (err) {
    console.error('Error opening scripts folder:', err);
  }
});

setInterval(() => global.gc && global.gc(), 60000);
