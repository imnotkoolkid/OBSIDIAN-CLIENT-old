const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const { promises: fs } = require('fs');
const path = require('path');
const { get: httpsGet } = require('https');
const { initRPC } = require('./assets/rpc.js');

const userData = app.getPath('userData');
const documentsPath = app.getPath('documents');
const clientSettingsPath = path.join(documentsPath, 'ObsidianClient', 'clientSettings');
const scriptsPath = path.join(documentsPath, 'ObsidianClient', 'scripts');

const paths = {
  settings: path.join(clientSettingsPath, 'settings.dat'),
  defaultSettings: path.join(__dirname, 'default_settings.json'),
};

let mainWindow, splashWindow, clientMenu;
let cssKeys = {}, settingsCache, settingsWriteTimer;
let menuToggleKey = 'ShiftRight', devToolsEnabled = false, preloadedScripts = [], startupBehaviour = 'windowed';

const ensureFolders = () =>
  fs.mkdir(clientSettingsPath, { recursive: true })
    .then(() => fs.mkdir(scriptsPath, { recursive: true }))
    .catch(err => console.error('Error creating folders:', err));

const loadSettings = async () => {
  if (settingsCache) return settingsCache;
  try {
    const exists = await fs.access(paths.settings).then(() => true).catch(() => false);
    if (!exists) {
      settingsCache = JSON.parse(await fs.readFile(paths.defaultSettings, 'utf8'));
      await fs.writeFile(paths.settings, JSON.stringify(settingsCache));
    } else {
      settingsCache = JSON.parse(await fs.readFile(paths.settings, 'utf8')) || {};
    }

    ({ devToolsEnabled = false, menuToggleKey = 'ShiftRight', preloadedScripts = [], startupBehaviour = 'windowed', disabledScripts = [] } = settingsCache);
    return settingsCache;
  } catch (err) {
    console.error('Error loading settings:', err);
    return settingsCache = { devToolsEnabled: false, disabledScripts: [], preloadedScripts: [], startupBehaviour: 'windowed', kchCSSTitle: '' };
  }
};

const saveSettings = settings => {
  settingsCache = { ...settingsCache, ...settings };
  Object.assign({ devToolsEnabled, menuToggleKey, preloadedScripts, startupBehaviour }, settings);
  clearTimeout(settingsWriteTimer);
  settingsWriteTimer = setTimeout(() =>
    fs.writeFile(paths.settings, JSON.stringify(settingsCache)).catch(err => console.error('Error saving settings:', err)), 500);
};

const createSplashWindow = () => {
  splashWindow = new BrowserWindow({
    width: 1400,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  splashWindow.loadFile('splash.html');
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 680,
    minWidth: 880,
    minHeight: 580,
    title: "Obsidian Client (pre release)",
    icon: path.join(__dirname, 'assets', 'Obsidian Client.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'scriptsPreload.js'),
      devTools: true
    },
    fullscreen: startupBehaviour === 'fullscreen',
    show: false
  });

  mainWindow.webContents.setUserAgent(
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.116 Safari/537.36 Electron/10.4.7 JuiceClient/${app.getVersion()}`
  );

  Menu.setApplicationMenu(null);
  mainWindow.loadURL('https://kirka.io/');

  mainWindow.webContents.on('did-finish-load', () => {
    splashWindow?.webContents.send('update-progress', 25);
    injectRouteChangeNotifier();
    applyConfig();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  mainWindow.show();
    setTimeout(() => initRPC(mainWindow), 1000); // Ensure DOM ready before RPC
    console.log('[Window] Loaded successfully.');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!clientMenu?.isDestroyed()) clientMenu.close();
  });

  mainWindow.on('page-title-updated', e => e.preventDefault());

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (url !== current && !url.startsWith('https://kirka.io')) {
      event.preventDefault();
      openInPopup(url);
    }
  });

  mainWindow.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    openInPopup(url);
  });

  mainWindow.webContents.on('before-input-event', (e, input) => {
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
};

function injectRouteChangeNotifier() {
  mainWindow.webContents.executeJavaScript(`
    (() => {
      const { ipcRenderer } = require('electron');
      let lastURL = location.href;
      const notifyURLChange = () => {
        if (location.href !== lastURL) {
          lastURL = location.href;
          ipcRenderer.send('url-changed', lastURL);
        }
      };
      const pushState = history.pushState;
      history.pushState = function(...args) {
        pushState.apply(this, args);
        notifyURLChange();
      };
      const replaceState = history.replaceState;
      history.replaceState = function(...args) {
        replaceState.apply(this, args);
        notifyURLChange();
      };
      window.addEventListener('popstate', notifyURLChange);
    })();
  `).catch(console.error);
}

function openInPopup(url) {
  const popup = new BrowserWindow({
    width: 900,
    height: 600,
    parent: mainWindow,
    modal: false,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: mainWindow.webContents.session,
    },
  });

  popup.loadURL(url);

  popup.webContents.on('did-navigate', (_, navigatedUrl) => {
    const urlObj = new URL(navigatedUrl);
    if (urlObj.searchParams.has('code') || urlObj.searchParams.has('token')) {
      setTimeout(() => {
        if (!popup.isDestroyed()) popup.close();
        if (!mainWindow.isDestroyed()) mainWindow.loadURL('https://kirka.io/');
      }, 2000);
    }

    if (
      navigatedUrl.includes('error_code=010-015') ||
      navigatedUrl.includes('error_description=rate+limited')
    ) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Login Rate Limit',
        message: 'Too many login attempts. Please wait before trying again.',
      });
    }
  });
}

const applyConfig = async () => {
  try {
    const {
      cssEnabled, cssLink, css, backgroundEnabled, background,
      brightness = '100', contrast = '1', saturation = '1', grayscale = '0',
      hue = '0', invert = false, sepia = '0', kchCSS, kchCSSTitle
    } = await loadSettings();

    await injectGeneralCSS(`body, html { filter: brightness(${brightness}%) contrast(${contrast}) saturate(${saturation}) grayscale(${grayscale}) hue-rotate(${hue}deg) invert(${invert ? 1 : 0}) sepia(${sepia}); }`);

    if (backgroundEnabled && background) {
      await injectBackgroundCSS(background);
    } else {
      await removeCSS('background');
    }

    if (kchCSS && kchCSSTitle) {
      await injectKCHCSS(kchCSS, kchCSSTitle);
    } else {
      await removeKCHCSS();
    }

    if (cssEnabled && !kchCSS) {
      if (cssLink) await injectCSS(null, cssLink);
      else if (css) await injectCSS(css);
      else await removeCSS('css');
    } else if (!kchCSS) {
      await removeCSS('css');
    }

    await loadScripts();
  } catch (err) {
    console.error('Error applying config:', err);
  }
};

const injectCSS = async (css, url) => {
  if (url) {
    try {
      css = await new Promise((resolve, reject) => {
        httpsGet(url, res => {
          if (res.statusCode !== 200) return resolve('');
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        }).on('error', reject);
      });
      if (!css) return console.error(`Failed to fetch CSS from ${url}`);
      await saveSettings({ css, cssEnabled: true, cssLink: url });
    } catch (err) {
      return console.error('Fetch error:', err);
    }
  }
  if (cssKeys.css) await mainWindow.webContents.removeInsertedCSS(cssKeys.css).catch(() => {});
  cssKeys.css = await mainWindow.webContents.insertCSS(css);
};

const injectKCHCSS = async (url, title) => {
  try {
    const css = await new Promise((resolve, reject) => {
      httpsGet(url, res => {
        if (res.statusCode !== 200) return resolve('');
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
    if (!css) return;
    if (cssKeys.kchCSS) await mainWindow.webContents.removeInsertedCSS(cssKeys.kchCSS).catch(() => {});
    cssKeys.kchCSS = await mainWindow.webContents.insertCSS(css);
    await saveSettings({ kchCSS: url, kchCSSTitle: title, cssEnabled: false });
  } catch (err) {
    console.error('Inject KCH CSS failed:', err);
  }
};

const injectBackgroundCSS = async (url) => {
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
  if (cssKeys.background) await mainWindow.webContents.removeInsertedCSS(cssKeys.background).catch(() => {});
  cssKeys.background = await mainWindow.webContents.insertCSS(css);
  await saveSettings({ background: url, backgroundEnabled: true });
};

const injectGeneralCSS = async css => {
  if (cssKeys.general) await mainWindow.webContents.removeInsertedCSS(cssKeys.general).catch(() => {});
  cssKeys.general = await mainWindow.webContents.insertCSS(css);
};

const removeCSS = async type => {
  if (cssKeys[type]) {
    await mainWindow.webContents.removeInsertedCSS(cssKeys[type]).catch(() => {});
    cssKeys[type] = null;
    await saveSettings(type === 'css' ? { cssEnabled: false } : { background: '', backgroundEnabled: false });
  }
};

const removeKCHCSS = async () => {
  if (cssKeys.kchCSS) {
    await mainWindow.webContents.removeInsertedCSS(cssKeys.kchCSS).catch(() => {});
    cssKeys.kchCSS = null;
    await saveSettings({ kchCSS: '', kchCSSTitle: '' });
  }
};

const loadScripts = async () => {
  try {
    const disabledScripts = settingsCache.disabledScripts || [];
    const scripts = await fs.readdir(scriptsPath).then(f => f.filter(f => f.endsWith('.js')));
    for (const script of scripts) {
      if (!disabledScripts.includes(script)) {
        require(path.join(scriptsPath, script));
      }
    }
  } catch (err) {
    console.error('Script loading failed:', err);
  }
};

const toggleClientMenu = () => {
  if (!mainWindow) return;
  if (clientMenu?.isDestroyed() === false) return clientMenu.close();
  const { x, y, width, height } = mainWindow.getBounds();

  clientMenu = new BrowserWindow({
    width: 700, height: 500,
    x: Math.round(x + (width - 700) / 2),
    y: Math.round(y + (height - 500) / 2),
    parent: mainWindow,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      javascript: true,
    }
  });

  clientMenu.loadFile('menu.html');
  mainWindow.on('move', () => {
    if (!clientMenu?.isDestroyed()) {
      const { x, y, width, height } = mainWindow.getBounds();
      clientMenu.setPosition(Math.round(x + (width - 700) / 2), Math.round(y + (height - 500) / 2));
    }
  });

  clientMenu.on('closed', () => mainWindow.removeAllListeners('move'));
  clientMenu.on('blur', () => clientMenu.close());
};

ipcMain.on('splash-complete', () => {
  if (!splashWindow?.isDestroyed()) splashWindow.close();
  if (!mainWindow?.isDestroyed()) mainWindow.show();
});

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
ipcMain.on('inject-kch-css', (_, url, title) => injectKCHCSS(url, title));
ipcMain.on('remove-kch-css', () => removeKCHCSS());
ipcMain.on('splash-complete', () => {
  if (!splashWindow?.isDestroyed()) splashWindow.close();
  if (!mainWindow?.isDestroyed()) mainWindow.show();
});

app.whenReady().then(async () => {
  createSplashWindow();

  await ensureFolders();
  await loadSettings();

  splashWindow.webContents.once('did-finish-load', () => {
    splashWindow.webContents.send('update-progress', 25);
    createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
    createWindow();
  }
});

setInterval(() => global.gc && global.gc(), 60000);
