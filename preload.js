const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('obsidianClient', {
  closeMenu: () => ipcRenderer.send('close-menu'),
  injectCSS: css => ipcRenderer.send('inject-css', css),
  injectCSSFromURL: url => ipcRenderer.send('inject-css-from-url', url),
  removeCSS: () => ipcRenderer.send('remove-css'),
  injectBackground: url => ipcRenderer.send('inject-background', url),
  removeBackground: () => ipcRenderer.send('remove-background'),
  setDevTools: enabled => ipcRenderer.send('set-dev-tools', enabled),
  setMenuToggleKey: key => ipcRenderer.send('set-menu-toggle-key', key),
  getScriptsPath: () => ipcRenderer.sendSync('get-scripts-path'),
  openScriptsFolder: () => ipcRenderer.send('open-scripts-folder'),
  getPreloadedScripts: () => ipcRenderer.sendSync('get-preloaded-scripts'),
  getAllScripts: () => ipcRenderer.sendSync('get-all-scripts'),
  toggleScript: (script, enabled) => ipcRenderer.send('toggle-script', script, enabled),
  reloadMainWindow: () => ipcRenderer.send('reload-main-window'),
  getSettings: () => ipcRenderer.sendSync('get-settings'),
  saveSettings: settings => ipcRenderer.send('save-settings', settings),
  injectGeneralCSS: css => ipcRenderer.send('inject-general-css', css),
  resetGeneralSettings: settings => ipcRenderer.send('reset-general-settings', settings),
});
