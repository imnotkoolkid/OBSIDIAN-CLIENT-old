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
  getScriptsList: () => ipcRenderer.sendSync('get-loaded-scripts'),
  getPreloadedScripts: () => ipcRenderer.sendSync('get-preloaded-scripts')
});