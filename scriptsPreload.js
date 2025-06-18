const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

const scriptsPath = ipcRenderer.sendSync('get-scripts-path');
const userData = ipcRenderer.sendSync('get-user-data-path');
const settingsPath = path.join(userData, '../ObsidianClient/clientsettings/settings.dat');
const loadedScripts = [];

let disabledScripts = [];
try {
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    disabledScripts = settings.disabledScripts || [];
  }
} catch (error) {
  console.error('Error reading settings:', error);
  disabledScripts = [];
}

try {
  const scriptFiles = fs.readdirSync(scriptsPath).filter(file => file.endsWith('.js'));

  scriptFiles.forEach(file => {
    if (!disabledScripts.includes(file)) {
      try {
        require(path.join(scriptsPath, file));
        loadedScripts.push(file);
      } catch (error) {
        console.error(`Error loading script ${file}:`, error);
      }
    }
  });
} catch (error) {
  console.error('Error reading scripts folder:', error);
}

ipcRenderer.send('set-preloaded-scripts', loadedScripts);
