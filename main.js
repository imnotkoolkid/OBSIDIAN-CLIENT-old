const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  shell,
  dialog,
  protocol,
  net,
  nativeImage,
} = require("electron");
const { promises: fs } = require("fs");
const path = require("path");
const { get: fetch } = require("https");
const {
  initDiscordRPC,
  updateDiscordPresence,
  cleanupDiscordRPC,
} = require("./rpc");
const CSSHandler = require("./src/csshandler");
const ScriptHandler = require("./src/scripthandler");
const Analytics = require("./src/analytics");
const Shortcuts = require("./src/shortcuts");

const paths = {
  userData: app.getPath("userData"),
  documents: app.getPath("documents"),
  clientData: path.join(
    app.getPath("documents"),
    "ObsidianClient",
    "clientdata"
  ),
  settings: path.join(
    app.getPath("documents"),
    "ObsidianClient",
    "clientdata",
    "data.json"
  ),
  analytics: path.join(
    app.getPath("documents"),
    "ObsidianClient",
    "clientdata",
    "analytics.json"
  ),
  defaultSettings: path.join(__dirname, "default_settings.json"),
  scripts: path.join(app.getPath("documents"), "ObsidianClient", "scripts"),
  captured: path.join(app.getPath("documents"), "ObsidianClient", "captured"),
};

app.commandLine.appendSwitch("disable-gpu-vsync");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("high-dpi-support", "1");
app.commandLine.appendSwitch("force-high-performance-gpu");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
app.commandLine.appendSwitch("enable-accelerated-2d-canvas");
app.commandLine.appendSwitch("enable-quic");
app.commandLine.appendSwitch("enable-begin-frame-scheduling");
app.commandLine.appendSwitch("disable-partial-raster");

let mainWindow,
  clientMenu,
  splashWindow,
  joinLinkModal,
  settingsCache,
  settingsWriteTimer,
  menuToggleKey = "ShiftRight",
  joinLinkKey = "J",
  devToolsEnabled = false,
  preloadedScripts = [],
  startupBehaviour = "windowed",
  analytics;
let cssHandler;



const ensureFolders = async () => {
  try {
    await fs.mkdir(paths.clientData, { recursive: true });
    await fs.mkdir(paths.scripts, { recursive: true });
    await fs.mkdir(paths.captured, { recursive: true });
  } catch (err) {
    console.error("Error creating folders:", err);
  }
};

const loadSettings = async () => {
  if (settingsCache) return settingsCache;
  try {
    const settingsExist = await fs
      .access(paths.settings)
      .then(() => true)
      .catch(() => false);
    settingsCache = settingsExist
      ? JSON.parse(await fs.readFile(paths.settings, "utf8")) || {}
      : JSON.parse(await fs.readFile(paths.defaultSettings, "utf8"));
    if (!settingsExist)
      await fs.writeFile(paths.settings, JSON.stringify(settingsCache));
    startupBehaviour = settingsCache.startupBehaviour || "windowed";
    return settingsCache;
  } catch (err) {
    console.error("Error loading settings:", err);
    settingsCache = JSON.parse(
      await fs.readFile(paths.defaultSettings, "utf8")
    );
    await fs.writeFile(paths.settings, JSON.stringify(settingsCache));
    startupBehaviour = settingsCache.startupBehaviour || "windowed";
    return settingsCache;
  }
};

const saveSettings = (settings) => {
  settingsCache = { ...settingsCache, ...settings };
  clearTimeout(settingsWriteTimer);
  settingsWriteTimer = setTimeout(
    () =>
      fs
        .writeFile(paths.settings, JSON.stringify(settingsCache))
        .catch((err) => console.error("Error saving settings:", err)),
    500
  );
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
mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`
      html, body {
        height: 100% !important;
      }
    `);
  });
  cssHandler = new CSSHandler(mainWindow, loadSettings, saveSettings);
  analytics = new Analytics(mainWindow, paths);
  analytics.init();


  const shortcuts = new Shortcuts(mainWindow, () => settingsCache, paths);
  shortcuts.toggleClientMenu = toggleClientMenu.bind(this);
  shortcuts.toggleJoinLinkModal = toggleJoinLinkModal.bind(this);

  mainWindow.webContents.setUserAgent(
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.116 Safari/537.36 Electron/10.4.7 ObsidianClient`
  );
  mainWindow.loadURL("https://kirka.io/");
  Menu.setApplicationMenu(null);

  mainWindow.on("page-title-updated", (e) => e.preventDefault());
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

  mainWindow.webContents.on("did-navigate-in-page", (event, url) => {
    updateDiscordPresence(url);
  });

  mainWindow.webContents.on("did-navigate", (event, url) => {
    updateDiscordPresence(url);
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


  mainWindow.webContents.on("did-finish-load", () => cssHandler.applyConfig());
};

const toggleJoinLinkModal = () => {
  if (joinLinkModal?.isDestroyed() === false) return joinLinkModal.close();
  const { x, y, width, height } = mainWindow.getBounds();
  joinLinkModal = new BrowserWindow({
    width: 400,
    height: 120,
    parent: mainWindow,
    modal: false,
    frame: false,
    transparent: true,
    resizable: false,
    x: Math.round(x + (width - 400) / 2),
    y: Math.round(y + (height - 90) / 2),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      javascript: true,
      images: false,
    },
  });
  joinLinkModal.loadFile("joinlink.html");
  const updatePosition = () =>
    joinLinkModal?.isDestroyed() ||
    joinLinkModal.setPosition(
      Math.round(x + (width - 400) / 2),
      Math.round(y + (height - 90) / 2)
    );
  mainWindow.on("move", updatePosition);
  joinLinkModal.on("closed", () =>
    mainWindow.removeListener("move", updatePosition)
  );
  joinLinkModal.on("blur", () => joinLinkModal?.close());
};

app.whenReady().then(async () => {
  app.setAsDefaultProtocolClient("obsidian");

  await ensureFolders();
  await loadSettings();
  const scriptHandler = new ScriptHandler(paths.scripts);
  initDiscordRPC(mainWindow);
  createSplashWindow();
  await new Promise((resolve) =>
    splashWindow.webContents.once("did-finish-load", resolve)
  );
  splashWindow.webContents.send("update-progress", 0);
  createWindow();
  splashWindow.webContents.send("update-progress", 16);

  const deeplink = process.argv.find((arg) => arg.startsWith("obsidian:"));
  if (deeplink) {
    const { searchParams, hash } = new URL(deeplink);
    const queryPath = searchParams.get("url");
    const cleanPath = queryPath
      ? queryPath.replace(/^\/+/, "").replace(/\/+$/, "")
      : "";
    const finalURL = `https://kirka.io/${cleanPath}${hash}`;
    if (queryPath) mainWindow.loadURL(finalURL);
  }

  ipcMain.once("set-preloaded-scripts", async () => {
    splashWindow.webContents.send("update-progress", 33);
    mainWindow.webContents.once("did-finish-load", async () => {
      splashWindow.webContents.send("update-progress", 50);
      await cssHandler.applyConfigWithProgress(await loadSettings());
      splashWindow.webContents.send("update-progress", 100);
      await new Promise((resolve) => setTimeout(resolve, 3600));
      if (startupBehaviour === "maximized") {
        mainWindow.maximize();
      }
      mainWindow.show();
      splashWindow.close();
      splashWindow = null;
    });
  });

  ipcMain.on("open-css-gallery", () => {
    const cssGalleryWindow = new BrowserWindow({
      width: 1050,
      height: 600,
      title: "KCH CSS Gallery",
      icon: path.join(__dirname, "kch/assets/kch.ico"),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
      },
    });
    cssGalleryWindow.loadFile("kch/css.html");
    cssGalleryWindow.setMenuBarVisibility(false);
  });

  ipcMain.on("join-game", (_, url) => {
    if (
      (url.startsWith("https://kirka.io/games/") ||
        url.startsWith("https://kirka.io/___lobby___/")) &&
      !mainWindow.isDestroyed()
    ) {
      mainWindow.loadURL(url);
      joinLinkModal?.close();
    }
  });

  ipcMain.on("toggle-join-link-modal", () => toggleJoinLinkModal());
  ipcMain.on("set-join-link-key", (_, key) =>
    saveSettings({ joinLinkKey: (joinLinkKey = key) })
  );
  ipcMain.on("set-preloaded-scripts", (_, scripts) =>
    saveSettings({ preloadedScripts: (preloadedScripts = scripts) })
  );
  ipcMain.on(
    "get-preloaded-scripts",
    (e) => (e.returnValue = preloadedScripts)
  );
  ipcMain.on("open-scripts-folder", () =>
    ensureFolders()
      .then(() => shell.openPath(paths.scripts))
      .catch((err) => console.error("Error opening scripts folder:", err))
  );
  ipcMain.on(
    "get-scripts-path",
    (e) => (e.returnValue = scriptHandler.getScriptsPath())
  );
  ipcMain.on(
    "get-all-scripts",
    async (e) => (e.returnValue = await scriptHandler.getAllScripts())
  );
  ipcMain.on(
    "get-disabled-scripts",
    (e) => (e.returnValue = scriptHandler.getDisabledScripts(settingsCache))
  );
  ipcMain.on("toggle-script", (_, script, enabled) => {
    const newDisabledScripts = scriptHandler.getNewDisabledScripts(
      settingsCache,
      script,
      enabled
    );
    saveSettings({ disabledScripts: newDisabledScripts });
  });
  ipcMain.on("close-menu", () => clientMenu?.close());
  ipcMain.on("inject-background", (_, url) =>
    cssHandler.injectBackgroundCSS(url)
  );
  ipcMain.on("remove-background", () => cssHandler.removeCSS("background"));
  ipcMain.on("set-dev-tools", (_, enabled) =>
    saveSettings({ devToolsEnabled: (devToolsEnabled = enabled) })
  );
  ipcMain.on("set-menu-toggle-key", (_, key) =>
    saveSettings({ menuToggleKey: (menuToggleKey = key) })
  );
  ipcMain.on(
    "reload-main-window",
    () => mainWindow?.isDestroyed() || mainWindow.webContents.reload()
  );
  ipcMain.on("get-user-data-path", (e) => (e.returnValue = paths.userData));
  ipcMain.on("save-settings", (_, settings) => saveSettings(settings));
  ipcMain.on("get-settings", (e) => (e.returnValue = settingsCache));
  ipcMain.on("inject-general-css", (_, css) =>
    cssHandler.injectGeneralCSS(css)
  );
  ipcMain.on("reset-general-settings", (_, settings) => saveSettings(settings));
  ipcMain.on("inject-kch-css", async (_, url, title) => {
    await cssHandler.injectKCHCSS(url, title);
    mainWindow.webContents.send("update-kch-css-state", { kchCSSTitle: title });
  });
  ipcMain.handle("remove-kch-css", async () => {
    await cssHandler.removeKCHCSS();
    const settings = await loadSettings();
    return { kchCSSTitle: settings.kchCSSTitle || '' };
  });
  ipcMain.on("inject-ui-css", (_, settings) =>
    cssHandler.injectUICSS(settings)
  );
  ipcMain.on("add-custom-css", (_, cssEntry) =>
    cssHandler.addCustomCSS(cssEntry)
  );
  ipcMain.on("toggle-custom-css", (_, id, enabled) =>
    cssHandler.toggleCustomCSS(id, enabled)
  );
  ipcMain.on("remove-custom-css", (_, id) =>
    cssHandler.removeCustomCSSFromSettings(id)
  );
  ipcMain.on("update-custom-css", (_, cssEntry) =>
    cssHandler.updateCustomCSS(cssEntry)
  );
  ipcMain.on(
    "get-analytics",
    async (e) => (e.returnValue = await analytics.getAnalytics())
  );
  ipcMain.on(
    "get-analytics-for-display",
    async (e) => (e.returnValue = await analytics.getAnalyticsForDisplay())
  );
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

const toggleClientMenu = () => {
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
      preload: path.join(__dirname, "preload.js"),
      javascript: true,
      images: false,
    },
  });
  clientMenu.loadFile("menu.html");
  const updatePosition = () =>
    clientMenu?.isDestroyed() ||
    clientMenu.setPosition(
      Math.round(x + (width - 700) / 2),
      Math.round(y + (height - 500) / 2)
    );
  mainWindow.on("move", updatePosition);
  clientMenu.on("closed", () =>
    mainWindow.removeListener("move", updatePosition)
  );
  clientMenu.on("blur", () => clientMenu?.close());
};

setInterval(() => global.gc && global.gc(), 60000);
