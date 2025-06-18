const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { get: httpsGet } = require('https');
const { get: httpGet } = require('http');

const SETTINGS_WRITE_DELAY = 500;
const userData = app.getPath('userData');
const documentsPath = app.getPath('documents');
const clientSettingsPath = path.join(documentsPath, 'ObsidianClient', 'clientsettings');
const scriptsPath = path.join(documentsPath, 'ObsidianClient', 'scripts');
const paths = {
  settings: path.join(clientSettingsPath, 'settings.dat'),
  defaultSettings: path.join(__dirname, 'default_settings.json'),
};

let mainWindow, clientMenu, cssKey, backgroundCssKey, generalCssKey, settingsCache, settingsWriteTimer;
let menuToggleKey = 'ShiftRight', devToolsEnabled = false, preloadedScripts = [];

async function ensureFolders() {
  try {
    await fs.mkdir(clientSettingsPath, { recursive: true });
    await fs.mkdir(scriptsPath, { recursive: true });
  } catch (err) {
    console.error('Error creating folders:', err);
  }
}

async function loadSettings() {
  if (settingsCache) return settingsCache;
  try {
    const settingsExist = await fs.access(paths.settings).then(() => true).catch(() => false);
    if (!settingsExist) {
      const defaultSettings = await fs.readFile(paths.defaultSettings, 'utf8');
      settingsCache = JSON.parse(defaultSettings);
      await fs.writeFile(paths.settings, JSON.stringify(settingsCache), 'utf8');
    } else {
      const data = await fs.readFile(paths.settings, 'utf8');
      settingsCache = JSON.parse(data) || {};
    }
    devToolsEnabled = settingsCache.devToolsEnabled ?? false;
    menuToggleKey = settingsCache.menuToggleKey ?? 'ShiftRight';
    preloadedScripts = settingsCache.preloadedScripts ?? [];
    return settingsCache;
  } catch (err) {
    console.error('Error loading settings:', err);
    settingsCache = {};
    return settingsCache;
  }
}

async function saveSettings(settings) {
  settingsCache = { ...settingsCache, ...settings };
  clearTimeout(settingsWriteTimer);
  settingsWriteTimer = setTimeout(() => fs.writeFile(paths.settings, JSON.stringify(settingsCache), 'utf8').catch(err => console.error('Error saving settings:', err)), SETTINGS_WRITE_DELAY);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 680,
    title: "Obsidian Client (pre release)",
    icon: path.join(__dirname, 'assets', 'Obsidian Client.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'scriptsPreload.js'),
      devTools: true,
    },
  });

  mainWindow.loadURL('https://kirka.io/');
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
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      e.preventDefault();
    } else if (input.code === menuToggleKey && input.type === 'keyDown') {
      toggleClientMenu();
      e.preventDefault();
    } else if (devToolsEnabled && (input.key === 'F12' || (input.control && input.shift && input.key === 'I'))) {
      mainWindow.webContents.openDevTools();
      e.preventDefault();
    } else if (input.key === 'F5') {
      mainWindow.webContents.reload();
      e.preventDefault();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => applyConfig());
}

app.whenReady().then(async () => {
  await Promise.all([ensureFolders(), loadSettings()]);
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
      images: false,
    },
  });

  clientMenu.loadFile('menu.html');
  const updateMenuPosition = () => {
    if (clientMenu?.isDestroyed() === false) {
      const { x: nx, y: ny, width: nw, height: nh } = mainWindow.getBounds();
      clientMenu.setPosition(Math.round(nx + (nw - 700) / 2), Math.round(ny + (nh - 500) / 2));
    }
  };
  mainWindow.on('move', updateMenuPosition);
  clientMenu.on('closed', () => {
    mainWindow.removeListener('move', updateMenuPosition);
  });
  clientMenu.on('blur', () => clientMenu?.close());
}

async function applyConfig() {
  try {
    const settings = await loadSettings();
    if (settings.cssEnabled) {
      settings.cssLink ? await fetchAndInjectCSS(settings.cssLink) : settings.css && await injectCSS(settings.css);
    }
    if (settings.backgroundEnabled && settings.background) injectBackgroundCSS(settings.background);
    const brightness = settings.brightness || '100';
    const contrast = settings.contrast || '1';
    const saturation = settings.saturation || '1';
    const grayscale = settings.grayscale || '0';
    const hue = settings.hue || '0';
    const invert = settings.invert || false;
    const sepia = settings.sepia || '0';
    const generalCSS = `
      body, html {
        filter: brightness(${brightness}%) contrast(${contrast}) saturate(${saturation}) grayscale(${grayscale}) hue-rotate(${hue}deg) invert(${invert ? 1 : 0}) sepia(${sepia});
      }
    `;
    await injectGeneralCSS(generalCSS);
  } catch (err) {
    console.error('Error applying config:', err);
  }
}

async function fetchAndInjectCSS(url) {
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
      res.on('end', () => injectCSS(data).then(() => saveSettings({ css: data, cssEnabled: true, cssLink: url })).then(resolve));
    }).on('error', err => {
      console.error('Error fetching CSS:', err);
      reject(err);
    }).end();
  });
}

async function injectCSS(css) {
  if (cssKey) await mainWindow.webContents.removeInsertedCSS(cssKey).catch(() => { });
  cssKey = await mainWindow.webContents.insertCSS(css);
  await saveSettings({ css, cssEnabled: true });
}

async function injectGeneralCSS(css) {
  if (generalCssKey) await mainWindow.webContents.removeInsertedCSS(generalCssKey).catch(() => { });
  generalCssKey = await mainWindow.webContents.insertCSS(css);
}

function injectBackgroundCSS(url) {
  const css = `#app > div.interface.text-2 > div.background {
    background: url(${url}) no-repeat 50% 50% / cover !important;
    animation: none !important;
    transition: none !important;
    transform: none !important;
}
  #app > div.interface.text-2 > div.background > div.pattern-bg,
  #app > div.interface.text-2 > div.background > div.bg-radial {
    display: none !important;
  }`;
  backgroundCssKey && mainWindow.webContents.removeInsertedCSS(backgroundCssKey).catch(() => { });
  mainWindow.webContents.insertCSS(css, { cssOrigin: 'author' })
    .then(key => {
      backgroundCssKey = key;
      saveSettings({ background: url, backgroundEnabled: true });
    })
    .catch(err => console.error('Error injecting background:', err));
}

async function removeCSS() {
  if (cssKey) {
    await mainWindow.webContents.removeInsertedCSS(cssKey).catch(() => { });
    cssKey = null;
    await saveSettings({ css: '', cssEnabled: false, cssLink: '' });
  }
}

async function removeBackgroundCSS() {
  if (backgroundCssKey) {
    await mainWindow.webContents.removeInsertedCSS(backgroundCssKey).catch(() => { });
    backgroundCssKey = null;
    await saveSettings({ background: '', backgroundEnabled: false });
  }
}

ipcMain.on('get-scripts-path', e => e.returnValue = scriptsPath);
ipcMain.on('get-loaded-scripts', async e => {
  try {
    e.returnValue = (await fs.readdir(scriptsPath)).filter(f => f.endsWith('.js'));
  } catch (err) {
    console.error('Error reading scripts folder:', err);
    e.returnValue = [];
  }
});
ipcMain.on('set-preloaded-scripts', (_, scripts) => {
  preloadedScripts = scripts;
  saveSettings({ preloadedScripts: scripts });
});
ipcMain.on('get-preloaded-scripts', e => e.returnValue = preloadedScripts);
ipcMain.on('close-menu', () => clientMenu?.close());
ipcMain.on('inject-css', (_, css) => injectCSS(css));
ipcMain.on('inject-css-from-url', (_, url) => fetchAndInjectCSS(url));
ipcMain.on('remove-css', removeCSS);
ipcMain.on('inject-background', (_, url) => injectBackgroundCSS(url));
ipcMain.on('remove-background', removeBackgroundCSS);
ipcMain.on('set-dev-tools', async (_, enabled) => {
  devToolsEnabled = enabled;
  await saveSettings({ devToolsEnabled: enabled });
});
ipcMain.on('set-menu-toggle-key', async (_, key) => {
  menuToggleKey = key;
  await saveSettings({ menuToggleKey: key });
});
ipcMain.on('open-scripts-folder', async () => {
  await ensureFolders();
  await shell.openPath(scriptsPath).catch(err => console.error('Error opening scripts folder:', err));
});
ipcMain.on('get-all-scripts', async e => {
  try {
    e.returnValue = (await fs.readdir(scriptsPath)).filter(f => f.endsWith('.js'));
  } catch (err) {
    console.error('Error reading all scripts:', err);
    e.returnValue = [];
  }
});
ipcMain.on('toggle-script', async (_, script, enabled) => {
  try {
    const settings = await loadSettings();
    if (!settings.disabledScripts) settings.disabledScripts = [];
    if (enabled) {
      settings.disabledScripts = settings.disabledScripts.filter(s => s !== script);
    } else {
      if (!settings.disabledScripts.includes(script)) settings.disabledScripts.push(script);
    }
    await saveSettings({ disabledScripts: settings.disabledScripts });
  } catch (err) {
    console.error('Error toggling script:', err);
  }
});
ipcMain.on('reload-main-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reload();
  }
});
ipcMain.on('get-user-data-path', e => e.returnValue = userData);
ipcMain.on('save-settings', async (_, settings) => {
  await saveSettings(settings);
});
ipcMain.on('get-settings', e => e.returnValue = settingsCache);
ipcMain.on('inject-general-css', (_, css) => injectGeneralCSS(css));
ipcMain.on('reset-general-settings', async (_, settings) => {
  await saveSettings(settings);
});
setInterval(() => global.gc && global.gc(), 60000);
