const fs = require('fs').promises;
const path = require('path');

class ScriptHandler {
  constructor(scriptsPath) {
    this.scriptsPath = scriptsPath;
  }

  getScriptsPath() {
    return this.scriptsPath;
  }

  async getAllScripts() {
    try {
      return (await fs.readdir(this.scriptsPath)).filter(f => f.endsWith('.js'));
    } catch (err) {
      console.error('Error reading scripts folder:', err);
      return [];
    }
  }

  getDisabledScripts(settings) {
    return settings.disabledScripts || [];
  }

  getNewDisabledScripts(settings, script, enabled) {
    let disabledScripts = settings.disabledScripts || [];
    if (enabled) {
      return disabledScripts.filter(s => s !== script);
    } else {
      if (!disabledScripts.includes(script)) {
        return [...disabledScripts, script];
      }
      return disabledScripts;
    }
  }
}

module.exports = ScriptHandler;
