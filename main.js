const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const { promises: fs } = require('fs');
const path = require('path');
const { get: fetch } = require('https');
const { initDiscordRPC, updateDiscordPresence, cleanupDiscordRPC } = require('./rpc');

const paths = {
  userData: app.getPath('userData'),
  documents: app.getPath('documents'),
  settings: path.join(app.getPath('documents'), 'ObsidianClient', 'clientSettings', 'settings.dat'),
  defaultSettings: path.join(__dirname, 'default_settings.json'),
  scripts: path.join(app.getPath('documents'), 'ObsidianClient', 'scripts'),
};

app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-high-performance-gpu');
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
app.commandLine.appendSwitch('enable-quic');
app.commandLine.appendSwitch('num-raster-threads', '4');
app.commandLine.appendSwitch('max-old-space-size', '4096');
app.commandLine.appendSwitch('max-gum-fps', '120');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('enable-begin-frame-scheduling');
app.commandLine.appendSwitch('disable-partial-raster');

let mainWindow, clientMenu, splashWindow, cssKeys = {}, settingsCache, settingsWriteTimer;
let menuToggleKey = 'ShiftRight', devToolsEnabled = false, preloadedScripts = [], startupBehaviour = 'windowed';

const ensureFolders = async () => {
  try {
    await fs.mkdir(path.dirname(paths.settings), { recursive: true });
    await fs.mkdir(paths.scripts, { recursive: true });
  } catch (err) {
    console.error('Error creating folders:', err);
  }
};

const loadSettings = async () => {
  if (settingsCache) return settingsCache;
  try {
    const settingsExist = await fs.access(paths.settings).then(() => true).catch(() => false);
    settingsCache = settingsExist
      ? JSON.parse(await fs.readFile(paths.settings, 'utf8')) || {}
      : JSON.parse(await fs.readFile(paths.defaultSettings, 'utf8'));
    if (!settingsExist) await fs.writeFile(paths.settings, JSON.stringify(settingsCache));
    ({ devToolsEnabled = false, menuToggleKey = 'ShiftRight', preloadedScripts =[], startupBehaviour = 'windowed', disabledScripts =[], opacity = '100', scale = '100', chatMode = 'default', cssList =[], kchCSS = '', kchCSSTitle = '' } = settingsCache);
    return settingsCache;
  } catch (err) {
    console.error('Error loading settings:', err);
    return settingsCache = { devToolsEnabled: false, disabledScripts: [], preloadedScripts: [], startupBehaviour: 'windowed', opacity: '100', scale: '100', chatMode: 'default', cssList: [], kchCSS: '', kchCSSTitle: '' };
  }
};

const saveSettings = settings => {
  settingsCache = { ...settingsCache, ...settings };
  Object.assign({ devToolsEnabled, menuToggleKey, preloadedScripts, startupBehaviour }, settings);
  clearTimeout(settingsWriteTimer);
  settingsWriteTimer = setTimeout(() => fs.writeFile(paths.settings, JSON.stringify(settingsCache)).catch(err => console.error('Error saving settings:', err)), 500);
};

const createSplashWindow = () => {
  splashWindow = new BrowserWindow({
    width: 1400, height: 400, transparent: true, frame: false, alwaysOnTop: true,
    icon: path.join(__dirname, 'assets', 'Obsidian Client.ico'),
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  splashWindow.loadFile('splash.html');
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1180, height: 680, minWidth: 860, minHeight: 560,
    title: 'Obsidian Client (pre release)', icon: path.join(__dirname, 'assets', 'Obsidian Client.ico'),
    webPreferences: { nodeIntegration: true, contextIsolation: false, preload: path.join(__dirname, 'scriptsPreload.js'), devTools: true },
    fullscreen: startupBehaviour === 'fullscreen', show: false,
  });

mainWindow.webContents.setUserAgent(
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.116 Safari/537.36 Electron/10.4.7 ObsidianClient`
);
  mainWindow.loadURL('https://kirka.io/');
  Menu.setApplicationMenu(null);



  mainWindow.on('page-title-updated', e => e.preventDefault());
  mainWindow.on('closed', () => {
    mainWindow = null;
    clientMenu?.isDestroyed() || clientMenu?.close();
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL() && !url.startsWith('https://kirka.io')) {
      event.preventDefault();
      openInPopup(url);
    }
  });

  mainWindow.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    openInPopup(url);
  });

  mainWindow.webContents.on('did-navigate-in-page', (event, url) => updateDiscordPresence(url));

  function openInPopup(url) {
    const popup = new BrowserWindow({
      width: 900, height: 600, parent: mainWindow, modal: false, show: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, session: mainWindow.webContents.session },
    });
    popup.loadURL(url);

    popup.webContents.on('did-navigate', (_, navigatedUrl) => {
      if (navigatedUrl.startsWith('https://kirka.io')) {
        const urlObj = new URL(navigatedUrl);
        if (urlObj.searchParams.has('code') || urlObj.searchParams.has('token')) {
          setTimeout(() => {
            if (!popup.isDestroyed()) popup.close();
            if (!mainWindow.isDestroyed()) mainWindow.loadURL('https://kirka.io/');
          }, 3000);
        }
      }
      if (navigatedUrl.includes('error_code=010-015') || navigatedUrl.includes('error_description=rate+limited')) {
        dialog.showMessageBox(mainWindow, {
          type: 'warning', title: 'Login Rate Limit', message: 'You have made too many login attempts. Please wait a while before trying again.',
        });
      }
    });

    popup.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      if (validatedURL.startsWith('http://localhost:8080')) {
        dialog.showMessageBox(mainWindow, {
          type: 'error', title: 'Login Error', message: 'Login failed due to server error or rate limiting. Please try again later.',
        });
      }
    });
  }

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
  await ensureFolders();
  await loadSettings();
  initDiscordRPC(mainWindow);
  createSplashWindow();
  await new Promise(resolve => splashWindow.webContents.once('did-finish-load', resolve));
  splashWindow.webContents.send('update-progress', 0);
  createWindow();
  splashWindow.webContents.send('update-progress', 16);

  ipcMain.once('set-preloaded-scripts', async () => {
    splashWindow.webContents.send('update-progress', 33);
    mainWindow.webContents.once('did-finish-load', async () => {
      splashWindow.webContents.send('update-progress', 50);
      await applyConfigWithProgress(await loadSettings());
      splashWindow.webContents.send('update-progress', 100);
      await new Promise(resolve => setTimeout(resolve, 300));
      mainWindow.show();
      splashWindow.close();
      splashWindow = null;
      await mainWindow.webContents.insertCSS(`
      html, body {
        height: 100% !important;
      }
    `);
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    cleanupDiscordRPC();
    app.quit();
  }
});

app.on('activate', () => {
  if (!BrowserWindow.getAllWindows().length) {
    createWindow();
    initDiscordRPC(mainWindow);
  }
});

const toggleClientMenu = () => {
  if (clientMenu?.isDestroyed() === false) return clientMenu.close();
  const { x, y, width, height } = mainWindow.getBounds();
  clientMenu = new BrowserWindow({
    width: 700, height: 500, parent: mainWindow, modal: false, frame: false, transparent: true, resizable: false,
    x: Math.round(x + (width - 700) / 2), y: Math.round(y + (height - 500) / 2),
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js'), javascript: true, images: false },
  });
  clientMenu.loadFile('menu.html');
  const updatePosition = () => clientMenu?.isDestroyed() || clientMenu.setPosition(Math.round(x + (width - 700) / 2), Math.round(y + (height - 500) / 2));
  mainWindow.on('move', updatePosition);
  clientMenu.on('closed', () => mainWindow.removeListener('move', updatePosition));
  clientMenu.on('blur', () => clientMenu?.close());
};

const applyConfig = async () => {
  try {
    const { cssList = [], backgroundEnabled, background, brightness = '100', contrast = '1', saturation = '1', grayscale = '0', hue = '0', invert = false, sepia = '0', kchCSS, kchCSSTitle, opacity = '100', scale = '100', chatMode = 'default' } = await loadSettings();
    await injectGeneralCSS(`body, html { filter: brightness(${brightness}%) contrast(${contrast}) saturate(${saturation}) grayscale(${grayscale}) hue-rotate(${hue}deg) invert(${invert ? 1 : 0}) sepia(${sepia}); }`);
    await injectUICSS({ opacity, scale, chatMode });
    if (backgroundEnabled && background) await injectBackgroundCSS(background);
    else await removeCSS('background');
    if (kchCSS && kchCSSTitle) await injectKCHCSS(kchCSS, kchCSSTitle);
    else {
      await removeKCHCSS();
      for (const cssEntry of cssList.filter(entry => entry.enabled)) await injectCustomCSS(cssEntry);
    }
  } catch (err) {
    console.error('Error applying config:', err);
  }
};

const applyConfigWithProgress = async ({ cssList = [], backgroundEnabled, background, brightness = '100', contrast = '1', saturation = '1', grayscale = '0', hue = '0', invert = false, sepia = '0', kchCSS, kchCSSTitle, opacity = '100', scale = '100', chatMode = 'default' }) => {
  await injectGeneralCSS(`body, html { filter: brightness(${brightness}%) contrast(${contrast}) saturate(${saturation}) grayscale(${grayscale}) hue-rotate(${hue}deg) invert(${invert ? 1 : 0}) sepia(${sepia}); }`);
  await injectUICSS({ opacity, scale, chatMode });
  if (kchCSS && kchCSSTitle) await injectKCHCSS(kchCSS, kchCSSTitle);
  else for (const cssEntry of cssList.filter(entry => entry.enabled)) await injectCustomCSS(cssEntry);
  splashWindow.webContents.send('update-progress', 83);
  if (backgroundEnabled && background) await injectBackgroundCSS(background);
  else await removeCSS('background');
};

const injectCustomCSS = async (cssEntry) => {
  let css = cssEntry.code;
  if (cssEntry.url) {
    try {
      css = await new Promise((resolve, reject) => {
        fetch(cssEntry.url, { headers: { 'Cache-Control': 'no-cache' } })
          .on('response', res => {
            if (res.statusCode !== 200) return resolve('');
            let data = '';
            res.setEncoding('utf8').on('data', chunk => data += chunk).on('end', () => resolve(data));
          })
          .on('error', reject)
          .end();
      });
      if (!css) return console.error(`Failed to load CSS from ${cssEntry.url}`);
    } catch (err) {
      return console.error('Error fetching CSS:', err);
    }
  }
  const key = cssEntry.id || `custom-${Date.now()}`;
  cssKeys[key] && await mainWindow.webContents.removeInsertedCSS(cssKeys[key]).catch(() => { });
  cssKeys[key] = await mainWindow.webContents.insertCSS(css);
};

const removeCustomCSS = async (id) => {
  if (cssKeys[id]) {
    await mainWindow.webContents.removeInsertedCSS(cssKeys[id]).catch(() => { });
    delete cssKeys[id];
  }
};

const injectKCHCSS = async (url, title) => {
  try {
    const css = await new Promise((resolve, reject) => {
      fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
        .on('response', res => {
          if (res.statusCode !== 200) return resolve('');
          let data = '';
          res.setEncoding('utf8').on('data', chunk => data += chunk).on('end', () => resolve(data));
        })
        .on('error', reject)
        .end();
    });
    if (!css) return console.error(`Failed to load KCH CSS from ${url}`);
    const { cssList = [] } = await loadSettings();
    for (const cssEntry of cssList) await removeCustomCSS(cssEntry.id);
    cssList.forEach(entry => entry.enabled = false);
    await saveSettings({ cssList, kchCSS: url, kchCSSTitle: title });
    cssKeys.kchCSS && await mainWindow.webContents.removeInsertedCSS(cssKeys.kchCSS).catch(() => { });
    cssKeys.kchCSS = await mainWindow.webContents.insertCSS(css);
    const { backgroundEnabled, background } = await loadSettings();
    if (backgroundEnabled && background) await injectBackgroundCSS(background);
  } catch (err) {
    console.error('Error injecting KCH CSS:', err);
  }
};

const injectGeneralCSS = async css => {
  cssKeys.general && await mainWindow.webContents.removeInsertedCSS(cssKeys.general).catch(() => { });
  cssKeys.general = await mainWindow.webContents.insertCSS(css);
};

const injectUICSS = async ({ opacity, scale, chatMode }) => {
  let css = `.team-score, .desktop-game-interface { opacity: ${opacity}% !important; transform: scale(${scale / 100}) !important; }`;
  if (chatMode === 'simplified') {
    css += `#bottom-left .chat .input-wrapper input { opacity: 0 !important; margin: 0 !important; }
      #bottom-left .chat .input-wrapper input:focus { opacity: 1 !important; }
      #bottom-left .chat .messages.messages-cont { background-color: #fff0 !important; overflow: hidden !important; word-break: break-word !important; }
      .desktop-game-interface .chat>.info, .desktop-game-interface .chat .info-key-cont.enter { display: none !important; }`;
  } else if (chatMode === 'hidden') {
    css += `#bottom-left .chat .input-wrapper input, #bottom-left .chat .messages.messages-cont, .desktop-game-interface .chat>.info, .desktop-game-interface .chat .info-key-cont.enter { display: none !important; }`;
  }
  cssKeys.ui && await mainWindow.webContents.removeInsertedCSS(cssKeys.ui).catch(() => { });
  cssKeys.ui = await mainWindow.webContents.insertCSS(css);
  await saveSettings({ opacity, scale, chatMode });
};

const injectBackgroundCSS = (url) => {
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
    await saveSettings(type === 'background' ? { background: '', backgroundEnabled: false } : {});
  }
};

const removeKCHCSS = async () => {
  if (cssKeys.kchCSS) {
    await mainWindow.webContents.removeInsertedCSS(cssKeys.kchCSS).catch(() => { });
    cssKeys.kchCSS = null;
    await saveSettings({ kchCSS: '', kchCSSTitle: '' });
    const { cssList } = await loadSettings();
    for (const cssEntry of cssList.filter(entry => entry.enabled)) await injectCustomCSS(cssEntry);
  }
};

ipcMain.on('open-css-gallery', () => {
  const cssGalleryWindow = new BrowserWindow({
    width: 1050, height: 600, title: 'KCH CSS Gallery', icon: path.join(__dirname, 'kch/assets/kch.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  cssGalleryWindow.loadFile('kch/css.html');
  cssGalleryWindow.setMenuBarVisibility(false);
});

ipcMain.on('get-scripts-path', e => e.returnValue = paths.scripts);
ipcMain.on('get-loaded-scripts', async e => e.returnValue = await fs.readdir(paths.scripts).then(files => files.filter(f => f.endsWith('.js'))).catch(err => (console.error('Error reading scripts folder:', err), [])));
ipcMain.on('set-preloaded-scripts', (_, scripts) => saveSettings({ preloadedScripts: preloadedScripts = scripts }));
ipcMain.on('get-preloaded-scripts', e => e.returnValue = preloadedScripts);
ipcMain.on('close-menu', () => clientMenu?.close());
ipcMain.on('inject-background', (_, url) => injectBackgroundCSS(url));
ipcMain.on('remove-background', () => removeCSS('background'));
ipcMain.on('set-dev-tools', (_, enabled) => saveSettings({ devToolsEnabled: devToolsEnabled = enabled }));
ipcMain.on('set-menu-toggle-key', (_, key) => saveSettings({ menuToggleKey: menuToggleKey = key }));
ipcMain.on('open-scripts-folder', () => ensureFolders().then(() => shell.openPath(paths.scripts)).catch(err => console.error('Error opening scripts folder:', err)));
ipcMain.on('get-all-scripts', async e => e.returnValue = await fs.readdir(paths.scripts).then(files => files.filter(f => f.endsWith('.js'))).catch(err => (console.error('Error reading all scripts:', err), [])));
ipcMain.on('toggle-script', async (_, script, enabled) => {
  const { disabledScripts = [] } = await loadSettings();
  saveSettings({ disabledScripts: enabled ? disabledScripts.filter(s => s !== script) : [...disabledScripts, script] });
});
ipcMain.on('reload-main-window', () => mainWindow?.isDestroyed() || mainWindow.webContents.reload());
ipcMain.on('get-user-data-path', e => e.returnValue = paths.userData);
ipcMain.on('save-settings', (_, settings) => saveSettings(settings));
ipcMain.on('get-settings', e => e.returnValue = settingsCache);
ipcMain.on('inject-general-css', (_, css) => injectGeneralCSS(css));
ipcMain.on('reset-general-settings', (_, settings) => saveSettings(settings));
ipcMain.on('get-disabled-scripts', async e => e.returnValue = (await loadSettings()).disabledScripts || []);
ipcMain.on('inject-kch-css', async (_, url, title) => {
  await injectKCHCSS(url, title);
  mainWindow.webContents.send('update-kch-css-state', { kchCSSTitle: title });
});
ipcMain.on('remove-kch-css', async () => {
  await removeKCHCSS();
  mainWindow.webContents.send('update-kch-css-state', { kchCSSTitle: '' });
});
ipcMain.on('inject-ui-css', (_, settings) => injectUICSS(settings));
ipcMain.on('add-custom-css', async (_, cssEntry) => {
  const { cssList = [], kchCSSTitle } = await loadSettings();
  cssEntry.id = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  cssList.push(cssEntry);
  await saveSettings({ cssList });
  if (cssEntry.enabled && !kchCSSTitle) await injectCustomCSS(cssEntry);
});
ipcMain.on('toggle-custom-css', async (_, id, enabled) => {
  const { cssList = [], kchCSSTitle } = await loadSettings();
  if (kchCSSTitle) return;
  const cssEntry = cssList.find(entry => entry.id === id);
  if (cssEntry) {
    cssEntry.enabled = enabled;
    await saveSettings({ cssList });
    if (enabled) await injectCustomCSS(cssEntry);
    else await removeCustomCSS(id);
  }
});
ipcMain.on('remove-custom-css', async (_, id) => {
  const { cssList = [] } = await loadSettings();
  await saveSettings({ cssList: cssList.filter(entry => entry.id !== id) });
  await removeCustomCSS(id);
});
ipcMain.on('update-custom-css', async (_, cssEntry) => {
  const { cssList = [], kchCSSTitle } = await loadSettings();
  if (kchCSSTitle) return;
  const cssIndex = cssList.findIndex(entry => entry.id === cssEntry.id);
  if (cssIndex !== -1) {
    const wasEnabled = cssList[cssIndex].enabled;
    cssList[cssIndex] = { ...cssList[cssIndex], name: cssEntry.name, url: cssEntry.url, code: cssEntry.code };
    await saveSettings({ cssList });
    if (wasEnabled) {
      await removeCustomCSS(cssEntry.id);
      await injectCustomCSS(cssList[cssIndex]);
    }
  }
});

setInterval(() => global.gc && global.gc(), 60000);
