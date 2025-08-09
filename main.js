const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const { promises: fs } = require("fs");
const path = require("path");
const { get: fetch } = require("https");
const { initDiscordRPC, updateDiscordPresence, cleanupDiscordRPC } = require("./rpc");
const CSSHandler = require("./src/csshandler");
const ScriptHandler = require("./src/scripthandler");
const Analytics = require("./src/analytics");
const Shortcuts = require("./src/shortcuts");
const KCHWindowHandler = require("./src/kchwindowhandler");

const paths = {
  userData: app.getPath("userData"),
  documents: app.getPath("documents"),
  clientData: path.join(app.getPath("documents"), "ObsidianClient", "clientdata"),
  settings: path.join(app.getPath("documents"), "ObsidianClient", "clientdata", "data.json"),
  analytics: path.join(app.getPath("documents"), "ObsidianClient", "clientdata", "analytics.json"),
  defaultSettings: path.join(__dirname, "default_settings.json"),
  scripts: path.join(app.getPath("documents"), "ObsidianClient", "scripts"),
  captured: path.join(app.getPath("documents"), "ObsidianClient", "captured"),
};

let mainWindow, clientMenu, splashWindow, joinLinkModal, settingsCache, settingsWriteTimer,
  menuToggleKey = "ShiftRight", joinLinkKey = "J", devToolsEnabled = false,
  preloadedScripts = [], startupBehaviour = "windowed", analytics;
let cssHandler;

const createWindowWithDefaults = (options) => {
  const defaultOptions = {
    parent: mainWindow,
    modal: false,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      javascript: true,
      images: false,
    },
  };
  return new BrowserWindow({ ...defaultOptions, ...options });
};

const ensureFolders = async () => {
  try {
    await fs.mkdir(paths.clientData, { recursive: true });
    await fs.mkdir(paths.scripts, { recursive: true });
    await fs.mkdir(paths.captured, { recursive: true });
    await fs.mkdir(path.join(paths.documents, "ObsidianClient", "swapper"), { recursive: true });
  } catch (err) {
    console.error("Error creating folders:", err);
  }
};

const loadSettings = async () => {
  if (settingsCache) return settingsCache;
  try {
    const settingsExist = await fs.access(paths.settings).then(() => true).catch(() => false);
    settingsCache = settingsExist
      ? JSON.parse(await fs.readFile(paths.settings, "utf8")) || {}
      : JSON.parse(await fs.readFile(paths.defaultSettings, "utf8"));
    if (!settingsExist) await fs.writeFile(paths.settings, JSON.stringify(settingsCache));
    if (settingsCache.noHurtCam !== undefined) {
      settingsCache.hurtCamMode = settingsCache.noHurtCam ? 'none' : 'default';
      delete settingsCache.noHurtCam;
      await fs.writeFile(paths.settings, JSON.stringify(settingsCache));
    }
    startupBehaviour = settingsCache.startupBehaviour || "windowed";
    return settingsCache;
  } catch (err) {
    console.error("Error loading settings:", err);
    settingsCache = JSON.parse(await fs.readFile(paths.defaultSettings, "utf8"));
    await fs.writeFile(paths.settings, JSON.stringify(settingsCache));
    if (settingsCache.noHurtCam !== undefined) {
      settingsCache.hurtCamMode = settingsCache.noHurtCam ? 'none' : 'default';
      delete settingsCache.noHurtCam;
      await fs.writeFile(paths.settings, JSON.stringify(settingsCache));
    }
    startupBehaviour = settingsCache.startupBehaviour || "windowed";
    return settingsCache;
  }
};

const saveSettings = (settings) => {
  settingsCache = { ...settingsCache, ...settings };
  clearTimeout(settingsWriteTimer);
  settingsWriteTimer = setTimeout(() =>
    fs.writeFile(paths.settings, JSON.stringify(settingsCache))
      .catch(err => console.error("Error saving settings:", err)), 500);
};

const createSplashWindow = () => {
  splashWindow = new BrowserWindow({
    width: 1400,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    icon: path.join(__dirname, "assets", "Obsidian Client.ico"),
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  splashWindow.loadFile("splash.html");
  splashWindow.setFocusable(false);
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 680,
    minWidth: 860,
    minHeight: 560,
    title: "Obsidian Client (pre release)",
    icon: path.join(__dirname, "assets", "Obsidian Client.ico"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, "scriptsPreload.js"),
      devTools: true,
    },
    fullscreen: startupBehaviour === "fullscreen",
    show: false,
  });
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

    popup.webContents.on("did-navigate", (_, navigatedUrl) => {
      if (navigatedUrl.startsWith("https://kirka.io")) {
        setTimeout(() => {
          if (!popup.isDestroyed()) popup.close();
          if (!mainWindow.isDestroyed()) mainWindow.webContents.reload();
        }, 6655);
      }
    });
  }
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`html, body { height: 100% !important; }`);
  });
  cssHandler = new CSSHandler(mainWindow, loadSettings, saveSettings);
  analytics = new Analytics(mainWindow, paths);
  analytics.init();

  const shortcuts = new Shortcuts(mainWindow, () => settingsCache, paths);
  shortcuts.toggleClientMenu = toggleClientMenu.bind(this);
  shortcuts.toggleJoinLinkModal = toggleJoinLinkModal.bind(this);

  mainWindow.loadURL("https://kirka.io/");
  Menu.setApplicationMenu(null);

  mainWindow.on("page-title-updated", e => e.preventDefault());
  mainWindow.on("closed", () => {
    mainWindow = null;
    clientMenu?.isDestroyed() || clientMenu?.close();
    joinLinkModal?.isDestroyed() || joinLinkModal?.close();
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (
      url !== mainWindow.webContents.getURL() &&
      !url.startsWith("https://kirka.io")
    ) {
      event.preventDefault();
      openInPopup(url);
    }
  });

  mainWindow.webContents.on("new-window", (event, url) => {
    event.preventDefault();
    openInPopup(url);
  });
  mainWindow.webContents.on("did-navigate-in-page", (event, url) => updateDiscordPresence(url));
  mainWindow.webContents.on("did-navigate", (event, url) => updateDiscordPresence(url));
  mainWindow.webContents.on("did-finish-load", () => cssHandler.applyConfig());
};

const toggleClientMenu = () => {
  if (clientMenu?.isDestroyed() === false) return clientMenu.close();
  const { x, y, width, height } = mainWindow.getBounds();
  clientMenu = createWindowWithDefaults({
    width: 700,
    height: 500,
    x: Math.round(x + (width - 700) / 2),
    y: Math.round(y + (height - 500) / 2),
  });
  clientMenu.loadFile("menu.html");
  const updatePosition = () =>
    clientMenu?.isDestroyed() ||
    clientMenu.setPosition(Math.round(x + (width - 700) / 2), Math.round(y + (height - 500) / 2));
  mainWindow.on("move", updatePosition);
  clientMenu.on("closed", () => mainWindow.removeListener("move", updatePosition));
  clientMenu.on("blur", () => clientMenu?.close());
};

const toggleJoinLinkModal = () => {
  if (joinLinkModal?.isDestroyed() === false) return joinLinkModal.close();
  const { x, y, width, height } = mainWindow.getBounds();
  joinLinkModal = createWindowWithDefaults({
    width: 400,
    height: 120,
    x: Math.round(x + (width - 400) / 2),
    y: Math.round(y + (height - 90) / 2),
  });
  joinLinkModal.loadFile("joinlink.html");
  const updatePosition = () =>
    joinLinkModal?.isDestroyed() ||
    joinLinkModal.setPosition(Math.round(x + (width - 400) / 2), Math.round(y + (height - 90) / 2));
  mainWindow.on("move", updatePosition);
  joinLinkModal.on("closed", () => mainWindow.removeListener("move", updatePosition));
  joinLinkModal.on("blur", () => joinLinkModal?.close());
};

app.whenReady().then(async () => {
  app.setAsDefaultProtocolClient("obsidian");
  await ensureFolders();
  const { initResourceSwapper } = require("./src/swapper");
  try {
    initResourceSwapper();
  } catch (err) {
    console.error("Error initializing resource swapper:", err);
  }
  await loadSettings();
  const scriptHandler = new ScriptHandler(paths.scripts);
  try {
    initDiscordRPC(mainWindow);
  } catch (err) {
    console.error("Error initializing Discord RPC:", err);
  }
  createSplashWindow();
  await new Promise(resolve => splashWindow.webContents.once("did-finish-load", resolve));
  splashWindow.webContents.send("update-progress", 0);
  createWindow();
  splashWindow.webContents.send("update-progress", 16);

  const kchWindowHandler = new KCHWindowHandler(mainWindow, paths);
  kchWindowHandler.registerHandlers();

  const deeplink = process.argv.find(arg => arg.startsWith("obsidian:"));
  if (deeplink) {
    const { searchParams, hash } = new URL(deeplink);
    const queryPath = searchParams.get("url");
    const cleanPath = queryPath ? queryPath.replace(/^\/+/, "").replace(/\/+$/, "") : "";
    const finalURL = `https://kirka.io/${cleanPath}${hash}`;
    if (queryPath) mainWindow.loadURL(finalURL);
  }

  ipcMain.on("open-swapper-folder", () => {
    try {
      shell.openPath(path.join(paths.documents, "ObsidianClient", "swapper"));
    } catch (err) {
      console.error("Error opening swapper folder:", err);
    }
  });
  ipcMain.once("set-preloaded-scripts", async () => {
    splashWindow.webContents.send("update-progress", 33);
    mainWindow.webContents.once("did-finish-load", async () => {
      splashWindow.webContents.send("update-progress", 50);
      try {
        await cssHandler.applyConfigWithProgress(await loadSettings());
      } catch (err) {
        console.error("Error applying CSS config:", err);
      }
      splashWindow.webContents.send("update-progress", 100);
      await new Promise(resolve => setTimeout(resolve, 500));
      if (startupBehaviour === "maximized") mainWindow.maximize();
      mainWindow.show();
      splashWindow.close();
      splashWindow = null;
    });
  });

  ipcMain.on("join-link-modal", () => toggleJoinLinkModal());
  ipcMain.on("join-game", (_, url) => {
    if ((url.startsWith("https://kirka.io/games/") || url.startsWith("https://kirka.io/___lobby___/")) && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(url);
      joinLinkModal?.close();
    }
  });
  ipcMain.on("set-join-link-key", (_, key) => saveSettings({ joinLinkKey: (joinLinkKey = key) }));
  ipcMain.on("set-preloaded-scripts", (_, scripts) => saveSettings({ preloadedScripts: (preloadedScripts = scripts) }));
  ipcMain.on("get-preloaded-scripts", e => (e.returnValue = preloadedScripts));
  ipcMain.on("open-scripts-folder", () => ensureFolders().then(() => shell.openPath(paths.scripts)).catch(err => console.error("Error opening scripts folder:", err)));
  ipcMain.on("get-scripts-path", e => (e.returnValue = scriptHandler.getScriptsPath()));
  ipcMain.on("get-all-scripts", async e => {
    try {
      e.returnValue = await scriptHandler.getAllScripts();
    } catch (err) {
      console.error("Error getting all scripts:", err);
      e.returnValue = [];
    }
  });
  ipcMain.on("get-disabled-scripts", e => (e.returnValue = scriptHandler.getDisabledScripts(settingsCache)));
  ipcMain.on("toggle-script", (_, script, enabled) => {
    try {
      const newDisabledScripts = scriptHandler.getNewDisabledScripts(settingsCache, script, enabled);
      saveSettings({ disabledScripts: newDisabledScripts });
    } catch (err) {
      console.error("Error toggling script:", err);
    }
  });
  ipcMain.on("close-menu", () => clientMenu?.close());
  ipcMain.on("inject-background", (_, url) => cssHandler.injectBackgroundCSS(url));
  ipcMain.on("remove-background", () => cssHandler.removeCSS("background"));
  ipcMain.on("set-dev-tools", (_, enabled) => saveSettings({ devToolsEnabled: (devToolsEnabled = enabled) }));
  ipcMain.on("set-menu-toggle-key", (_, key) => saveSettings({ menuToggleKey: (menuToggleKey = key) }));
  ipcMain.on("reload-main-window", () => mainWindow?.isDestroyed() || mainWindow.webContents.reload());
  ipcMain.on("get-user-data-path", e => (e.returnValue = paths.userData));
  ipcMain.on("save-settings", (_, settings) => saveSettings(settings));
  ipcMain.on("get-settings", e => (e.returnValue = settingsCache));
  ipcMain.on("inject-general-css", (_, css) => cssHandler.injectGeneralCSS(css));
  ipcMain.on("reset-general-settings", (_, settings) => saveSettings(settings));
  ipcMain.on("inject-kch-css", async (_, url, title) => {
    try {
      await cssHandler.injectKCHCSS(url, title);
      mainWindow.webContents.send("update-kch-css-state", { kchCSSTitle: title });
    } catch (err) {
      console.error("Error injecting KCH CSS:", err);
    }
  });
  ipcMain.handle("remove-kch-css", async () => {
    try {
      await cssHandler.removeKCHCSS();
      const settings = await loadSettings();
      return { kchCSSTitle: settings.kchCSSTitle || '' };
    } catch (err) {
      console.error("Error removing KCH CSS:", err);
      return { kchCSSTitle: '' };
    }
  });
  ipcMain.on("inject-ui-css", (_, settings) => cssHandler.injectUICSS(settings));
  ipcMain.on("add-custom-css", (_, cssEntry) => cssHandler.addCustomCSS(cssEntry));
  ipcMain.on("toggle-custom-css", (_, id, enabled) => cssHandler.toggleCustomCSS(id, enabled));
  ipcMain.on("remove-custom-css", (_, id) => cssHandler.removeCustomCSSFromSettings(id));
  ipcMain.on("inject-killicon-hitmark-css", (_, settings) => cssHandler.injectKillIconAndHitmarkCSS(settings));
  ipcMain.on("update-custom-css", (_, cssEntry) => cssHandler.updateCustomCSS(cssEntry));
  ipcMain.on("get-analytics", async e => {
    try {
      e.returnValue = await analytics.getAnalytics();
    } catch (err) {
      console.error("Error getting analytics:", err);
      e.returnValue = {};
    }
  });
  ipcMain.on("get-analytics-for-display", async e => {
    try {
      e.returnValue = await analytics.getAnalyticsForDisplay();
    } catch (err) {
      console.error("Error getting analytics for display:", err);
      e.returnValue = {};
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    cleanupDiscordRPC();
    app.quit();
  }
});

app.on("activate", () => {
  if (!BrowserWindow.getAllWindows().length) {
    createWindow();
    initDiscordRPC(mainWindow);
  }
});

setInterval(() => global.gc && global.gc(), 60000);
