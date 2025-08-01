const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("obsidianClient", {
  openCSSGallery: () => ipcRenderer.send("open-css-gallery"),
  getScriptsPath: () => ipcRenderer.sendSync("get-scripts-path"),
  getLoadedScripts: () => ipcRenderer.sendSync("get-loaded-scripts"),
  setPreloadedScripts: (scripts) =>
    ipcRenderer.send("set-preloaded-scripts", scripts),
  getPreloadedScripts: () => ipcRenderer.sendSync("get-preloaded-scripts"),
  closeMenu: () => ipcRenderer.send("close-menu"),
  injectBackground: (url) => ipcRenderer.send("inject-background", url),
  removeBackground: () => ipcRenderer.send("remove-background"),
  setDevTools: (enabled) => ipcRenderer.send("set-dev-tools", enabled),
  setMenuToggleKey: (key) => ipcRenderer.send("set-menu-toggle-key", key),
  openScriptsFolder: () => ipcRenderer.send("open-scripts-folder"),
  getAllScripts: () => ipcRenderer.sendSync("get-all-scripts"),
  toggleScript: (script, enabled) =>
    ipcRenderer.send("toggle-script", script, enabled),
  reloadMainWindow: () => ipcRenderer.send("reload-main-window"),
  getUserDataPath: () => ipcRenderer.sendSync("get-user-data-path"),
  saveSettings: (settings) => ipcRenderer.send("save-settings", settings),
  getSettings: () => ipcRenderer.sendSync("get-settings"),
  injectGeneralCSS: (css) => ipcRenderer.send("inject-general-css", css),
  resetGeneralSettings: (settings) =>
    ipcRenderer.send("reset-general-settings", settings),
  getDisabledScripts: () => ipcRenderer.sendSync("get-disabled-scripts"),
  injectKCHCSS: (url, title) => ipcRenderer.send("inject-kch-css", url, title),
  removeKCHCSS: () => ipcRenderer.invoke("remove-kch-css"),
  injectUICSS: (settings) => ipcRenderer.send("inject-ui-css", settings),
  addCustomCSS: (cssEntry) => ipcRenderer.send("add-custom-css", cssEntry),
  toggleCustomCSS: (id, enabled) => ipcRenderer.send("toggle-custom-css", id, enabled),
  removeCustomCSS: (id) => ipcRenderer.send("remove-custom-css", id),
  updateCustomCSS: (cssEntry) =>
    ipcRenderer.send("update-custom-css", cssEntry),
  joinGame: (url) => ipcRenderer.send("join-game", url),
  toggleJoinLinkModal: () => ipcRenderer.send("toggle-join-link-modal"),
  setJoinLinkKey: (key) => ipcRenderer.send("set-join-link-key", key),
  onUpdateKCHCSSState: (callback) =>
    ipcRenderer.on("update-kch-css-state", (event, state) => callback(state)),
  getAnalytics: () => ipcRenderer.sendSync("get-analytics"),
  getAnalyticsForDisplay: () => ipcRenderer.sendSync("get-analytics-for-display"),
  openScriptsGallery: () => ipcRenderer.send("open-scripts-gallery"),
  downloadScript: (scriptData) => ipcRenderer.send("download-script", scriptData),
  openAssetsGallery: () => ipcRenderer.send("open-assets-gallery"),
  openTexturesGallery: () => ipcRenderer.send("open-textures-gallery"),
  openCrosshairsGallery: () => ipcRenderer.send("open-crosshairs-gallery"),
  openSwapperFolder: () => ipcRenderer.send("open-swapper-folder"),
  blockHurtCamImage: (enabled) => ipcRenderer.send("block-hurt-cam-image", enabled)
});
