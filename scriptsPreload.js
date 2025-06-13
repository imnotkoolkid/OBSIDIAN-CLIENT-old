const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

const scriptsPath = ipcRenderer.sendSync('get-scripts-path');
const loadedScripts = [];

try {
  if (fs.existsSync(scriptsPath)) {
    fs.readdirSync(scriptsPath)
      .filter(file => file.endsWith('.js'))
      .forEach(file => {
        try {
          require(path.join(scriptsPath, file));
          loadedScripts.push(file);
          console.log(`Loaded script: ${file}`);
        } catch (error) {
          console.error(`Error loading script ${file}:`, error);
        }
      });
  } else {
    console.warn('Scripts folder does not exist:', scriptsPath);
  }
} catch (error) {
  console.error('Error reading scripts folder:', error);
}

ipcRenderer.send('set-preloaded-scripts', loadedScripts);
ipcRenderer.on('get-preloaded-scripts', e => e.returnValue = loadedScripts);