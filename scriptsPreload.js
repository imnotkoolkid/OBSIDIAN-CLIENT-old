const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

const scriptsPath = ipcRenderer.sendSync('get-scripts-path');
const loadedScripts = [];

try {
  const disabledScripts = ipcRenderer.sendSync('get-disabled-scripts') || [];
  fs.readdirSync(scriptsPath).filter(f => f.endsWith('.js')).forEach(file => {
    if (!disabledScripts.includes(file)) {
      try {
        require(path.join(scriptsPath, file));
        loadedScripts.push(file);
      } catch (err) {
        console.error(`Error loading script ${file}:`, err);
      }
    }
  });
} catch (err) {
  console.error('Error reading scripts folder:', err);
}

ipcRenderer.send('set-preloaded-scripts', loadedScripts);
