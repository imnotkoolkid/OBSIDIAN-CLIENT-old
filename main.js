const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const { promises: fs } = require('fs');
const path = require('path');
const { get: fetch } = require('https');

const userData = app.getPath('userData');
const documentsPath = app.getPath('documents');
const clientSettingsPath = path.join(documentsPath, 'ObsidianClient', 'clientsettings');
const scriptsPath = path.join(documentsPath, 'ObsidianClient', 'scripts');
const paths = {
  settings: path.join(clientSettingsPath, 'settings.dat'),
  defaultSettings: path.join(__dirname, 'default_settings.json'),
};

let mainWindow, clientMenu, cssKeys = {}, settingsCache, settingsWriteTimer;
let menuToggleKey = 'ShiftRight', devToolsEnabled = false, preloadedScripts = [], startupBehaviour = 'windowed';

const ensureFolders = () => fs.mkdir(clientSettingsPath, { recursive: true })
  .then(() => fs.mkdir(scriptsPath, { recursive: true }))
  .catch(err => console.error('Error creating folders:', err));

const loadSettings = async () => {
  if (settingsCache) return settingsCache;
  try {
    const settingsExist = await fs.access(paths.settings).then(() => true).catch(() => false);
    if (!settingsExist) {
      settingsCache = JSON.parse(await fs.readFile(paths.defaultSettings, 'utf8'));
      await fs.writeFile(paths.settings, JSON.stringify(settingsCache));
    } else {
      settingsCache = JSON.parse(await fs.readFile(paths.settings, 'utf8')) || {};
    }
    ({ devToolsEnabled = false, menuToggleKey = 'ShiftRight', preloadedScripts =[], startupBehaviour = 'windowed', disabledScripts =[] } = settingsCache);
    return settingsCache;
  } catch (err) {
    console.error('Error loading settings:', err);
    return settingsCache = { devToolsEnabled: false, disabledScripts: [], preloadedScripts: [], startupBehaviour: 'windowed' };
  }
};

const saveSettings = settings => {
  settingsCache = { ...settingsCache, ...settings };
  Object.assign({ devToolsEnabled, menuToggleKey, preloadedScripts, startupBehaviour }, settings);
  clearTimeout(settingsWriteTimer);
  settingsWriteTimer = setTimeout(() => fs.writeFile(paths.settings, JSON.stringify(settingsCache))
    .catch(err => console.error('Error saving settings:', err)), 500);
};
function applySwitches() {
  app.commandLine.appendSwitch("disable-frame-rate-limit");
  app.allowRendererProcessReuse = true;
}

applySwitches();

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1180, height: 680, minWidth: 880, minHeight: 580,
    title: "Obsidian Client (pre release)",
    icon: path.join(__dirname, 'assets', 'Obsidian Client.ico'),
    webPreferences: { nodeIntegration: true, contextIsolation: false, preload: path.join(__dirname, 'scriptsPreload.js'), devTools: true },
    fullscreen: startupBehaviour === 'fullscreen',
  });

  mainWindow.loadURL('https://kirka.io/');
  Menu.setApplicationMenu(null);
  mainWindow.on('page-title-updated', e => e.preventDefault());
  mainWindow.on('closed', () => {
    mainWindow = null;
    clientMenu?.isDestroyed() || clientMenu?.close();
  });

  let lastInput = 0;
  mainWindow.webContents.on('before-input-event', (e, input) => {
    const now = Date.now();
    if (now - lastInput < 50) return;
    lastInput = now;

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

  mainWindow.webContents.on('did-finish-load', applyConfig);
};

app.whenReady().then(async () => {
  await Promise.all([ensureFolders(), loadSettings()]);
  createWindow();
});

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
app.on('activate', () => !BrowserWindow.getAllWindows().length && createWindow());

const toggleClientMenu = () => {
  if (clientMenu?.isDestroyed() === false) return clientMenu.close();

  const { x, y, width, height } = mainWindow.getBounds();
  clientMenu = new BrowserWindow({
    width: 700, height: 500, parent: mainWindow, modal: false, frame: false, transparent: true, resizable: false,
    x: Math.round(x + (width - 700) / 2), y: Math.round(y + (height - 500) / 2),
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js'), javascript: true, images: false },
  });

  clientMenu.loadFile('menu.html');
  const updatePosition = () => clientMenu?.isDestroyed() || clientMenu.setPosition(...mainWindow.getBounds().slice(0, 2).map((v, i) => Math.round(v + (mainWindow.getBounds()[i + 2] - [700, 500][i]) / 2)));
  mainWindow.on('move', updatePosition);
  clientMenu.on('closed', () => mainWindow.removeListener('move', updatePosition));
  clientMenu.on('blur', () => clientMenu?.close());
};

const applyConfig = async () => {
  try {
    const { cssEnabled, cssLink, css, backgroundEnabled, background, brightness = '100', contrast = '1', saturation = '1', grayscale = '0', hue = '0', invert = false, sepia = '0' } = await loadSettings();
    cssEnabled && (cssLink ? await injectCSS(null, cssLink) : css && await injectCSS(css));
    backgroundEnabled && background && injectBackgroundCSS(background);
    await injectGeneralCSS(`body, html { filter: brightness(${brightness}%) contrast(${contrast}) saturate(${saturation}) grayscale(${grayscale}) hue-rotate(${hue}deg) invert(${invert ? 1 : 0}) sepia(${sepia}); }`);
  } catch (err) {
    console.error('Error applying config:', err);
  }
};

const injectCSS = async (css, url) => {
  if (url) {
    try {
      css = await new Promise((resolve, reject) => {
        fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
          .on('response', res => {
            if (res.statusCode !== 200) return resolve('');
            let data = '';
            res.setEncoding('utf8').on('data', chunk => data += chunk).on('end', () => resolve(data));
          })
          .on('error', reject)
          .end();
      });
      if (!css) return console.error(`Failed to load CSS from ${url}`);
      await saveSettings({ css, cssEnabled: true, cssLink: url });
    } catch (err) {
      return console.error('Error fetching CSS:', err);
    }
  }
  cssKeys.css && await mainWindow.webContents.removeInsertedCSS(cssKeys.css).catch(() => { });
  cssKeys.css = await mainWindow.webContents.insertCSS(css);
  css && await saveSettings({ css, cssEnabled: true });
};

const injectGeneralCSS = async css => {
  cssKeys.general && await mainWindow.webContents.removeInsertedCSS(cssKeys.general).catch(() => { });
  cssKeys.general = await mainWindow.webContents.insertCSS(css);
};

const injectBackgroundCSS = url => {
  const css = `#app > div.interface.text-2 > div.background { background: url(${url}) no-repeat 50% 50% / cover !important; animation: none !important; transition: none !important; transform: none !important; }
    #app > div.interface.text-2 > div.background > div.pattern-bg, #app > div.interface.text-2 > div.background > div.bg-radial { display: none !important; }`;
  cssKeys.background && mainWindow.webContents.removeInsertedCSS(cssKeys.background).catch(() => { });
  mainWindow.webContents.insertCSS(css, { cssOrigin: 'author' })
    .then(key => {
      cssKeys.background = key;
      saveSettings({ background: url, backgroundEnabled: true });
    })
    .catch(err => console.error('Error injecting background:', err));
};

const removeCSS = async type => {
  if (cssKeys[type]) {
    await mainWindow.webContents.removeInsertedCSS(cssKeys[type]).catch(() => { });
    cssKeys[type] = null;
    await saveSettings(type === 'css' ? { css: '', cssEnabled: false, cssLink: '' } : { background: '', backgroundEnabled: false });
  }
};

ipcMain.on('open-css-gallery', () => openCSSGallery());
ipcMain.on('get-scripts-path', e => e.returnValue = scriptsPath);
ipcMain.on('get-loaded-scripts', async e => e.returnValue = await fs.readdir(scriptsPath).then(files => files.filter(f => f.endsWith('.js'))).catch(err => (console.error('Error reading scripts folder:', err), [])));
ipcMain.on('set-preloaded-scripts', (_, scripts) => saveSettings({ preloadedScripts: preloadedScripts = scripts }));
ipcMain.on('get-preloaded-scripts', e => e.returnValue = preloadedScripts);
ipcMain.on('close-menu', () => clientMenu?.close());
ipcMain.on('inject-css', (_, css) => injectCSS(css));
ipcMain.on('inject-css-from-url', (_, url) => injectCSS(null, url));
ipcMain.on('remove-css', () => removeCSS('css'));
ipcMain.on('inject-background', (_, url) => injectBackgroundCSS(url));
ipcMain.on('remove-background', () => removeCSS('background'));
ipcMain.on('set-dev-tools', (_, enabled) => saveSettings({ devToolsEnabled: devToolsEnabled = enabled }));
ipcMain.on('set-menu-toggle-key', (_, key) => saveSettings({ menuToggleKey: menuToggleKey = key }));
ipcMain.on('open-scripts-folder', () => ensureFolders().then(() => shell.openPath(scriptsPath)).catch(err => console.error('Error opening scripts folder:', err)));
ipcMain.on('get-all-scripts', async e => e.returnValue = await fs.readdir(scriptsPath).then(files => files.filter(f => f.endsWith('.js'))).catch(err => (console.error('Error reading all scripts:', err), [])));
ipcMain.on('toggle-script', async (_, script, enabled) => {
  const { disabledScripts = [] } = await loadSettings();
  saveSettings({ disabledScripts: enabled ? disabledScripts.filter(s => s !== script) : [...disabledScripts, script] });
});
ipcMain.on('reload-main-window', () => mainWindow?.isDestroyed() || mainWindow.webContents.reload());
ipcMain.on('get-user-data-path', e => e.returnValue = userData);
ipcMain.on('save-settings', (_, settings) => saveSettings(settings));
ipcMain.on('get-settings', e => e.returnValue = settingsCache);
ipcMain.on('inject-general-css', (_, css) => injectGeneralCSS(css));
ipcMain.on('reset-general-settings', (_, settings) => saveSettings(settings));
ipcMain.on('get-disabled-scripts', async e => e.returnValue = (await loadSettings()).disabledScripts || []);

const openCSSGallery = () => {
  const cssGalleryWindow = new BrowserWindow({
    width: 1050,
    height: 600,
    title: "KCH CSS Gallery",
    icon: path.join(__dirname, 'kch/assets/kch.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  cssGalleryWindow.loadFile('kch/css.html');
  cssGalleryWindow.setMenuBarVisibility(false);
};
setInterval(() => global.gc && global.gc(), 60000);
