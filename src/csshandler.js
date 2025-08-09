const { get: fetch } = require('https');

class CSSHandler {
  constructor(mainWindow, loadSettings, saveSettings) {
    this.mainWindow = mainWindow;
    this.loadSettings = loadSettings;
    this.saveSettings = saveSettings;
    this.cssKeys = {};
  }

  async applyConfig() {
    try {
      const { cssList = [], backgroundEnabled, background, brightness = '100', contrast = '1', saturation = '1', grayscale = '0', hue = '0', invert = false, sepia = '0', kchCSS, kchCSSTitle, opacity = '100', scale = '100', chatMode = 'default', openingAnimations = false, hurtCamMode = 'default', killicon = '', hitmark = '' } = await this.loadSettings();
      await this.injectGeneralCSS(`body, html { filter: brightness(${brightness}%) contrast(${contrast}) saturate(${saturation}) grayscale(${grayscale}) hue-rotate(${hue}deg) invert(${invert ? 1 : 0}) sepia(${sepia}); }`);
      await this.injectUICSS({ opacity, scale, chatMode, openingAnimations, hurtCamMode });
      await this.injectHurtCamCSS(hurtCamMode);
      await this.injectKillIconAndHitmarkCSS({ killicon, hitmark });
      if (backgroundEnabled && background) await this.injectBackgroundCSS(background);
      else await this.removeCSS('background');
      if (kchCSS && kchCSSTitle) {
        await this.injectKCHCSS(kchCSS, kchCSSTitle);
      } else {
        await this.removeKCHCSS();
        for (const cssEntry of cssList.filter(entry => entry.enabled)) {
          await this.injectCustomCSS(cssEntry);
        }
      }
    } catch (err) {
      console.error('Error applying config:', err);
    }
  }

  async applyConfigWithProgress({ cssList = [], backgroundEnabled, background, brightness = '100', contrast = '1', saturation = '1', grayscale = '0', hue = '0', invert = false, sepia = '0', opacity = '100', scale = '100', chatMode = 'default', openingAnimations = false, hurtCamMode = 'default', killicon = '', hitmark = '' }) {
    await this.injectGeneralCSS(`body { filter: brightness(${brightness}%) contrast(${contrast}) saturate(${saturation}) grayscale(${grayscale}) hue-rotate(${hue}deg) invert(${invert ? 1 : 0}) sepia(${sepia}); }`);
    await this.injectUICSS({ opacity, scale, chatMode, openingAnimations, hurtCamMode });
    await this.injectHurtCamCSS(hurtCamMode);
    await this.injectKillIconAndHitmarkCSS({ killicon, hitmark });
    this.mainWindow.webContents.send('update-progress', 83);
    if (backgroundEnabled && background) await this.injectBackgroundCSS(background);
    else await this.removeCSS('background');
  }

  async injectCustomCSS(cssEntry) {
    let css = cssEntry.code;
    if (cssEntry.url) {
      try {
        css = await new Promise((resolve, reject) => {
          fetch(cssEntry.url, { headers: { 'Cache-Control': 'no-cache' } })
            .on('response', res => {
              if (res.statusCode !== 200) return resolve('');
              let data = '';
              res.setEncoding('utf8').on('data', chunk => data += chunk).on('end', () => resolve(data));
            })
            .on('error', reject)
            .end();
        });
        if (!css) return console.error(`Failed to load CSS from ${cssEntry.url}`);
      } catch (err) {
        return console.error('Error fetching CSS:', err);
      }
    }
    const key = cssEntry.id || `custom-${Date.now()}`;
    if (this.cssKeys[key]) await this.mainWindow.webContents.removeInsertedCSS(this.cssKeys[key]).catch(() => { });
    this.cssKeys[key] = await this.mainWindow.webContents.insertCSS(css);
  }

  async removeCustomCSS(id) {
    if (this.cssKeys[id]) {
      await this.mainWindow.webContents.removeInsertedCSS(this.cssKeys[id]).catch(() => { });
      delete this.cssKeys[id];
    }
  }

  async injectKCHCSS(url, title) {
    try {
      const css = await new Promise((resolve, reject) => {
        fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
          .on('response', res => {
            if (res.statusCode !== 200) return resolve('');
            let data = '';
            res.setEncoding('utf8').on('data', chunk => data += chunk).on('end', () => resolve(data));
          })
          .on('error', reject)
          .end();
      });
      if (!css) return console.error(`Failed to load KCH CSS from ${url}`);
      const { cssList = [] } = await this.loadSettings();
      for (const cssEntry of cssList) await this.removeCustomCSS(cssEntry.id);
      cssList.forEach(entry => entry.enabled = false);
      await this.saveSettings({ cssList, kchCSS: url, kchCSSTitle: title });
      if (this.cssKeys.kchCSS) await this.mainWindow.webContents.removeInsertedCSS(this.cssKeys.kchCSS).catch(() => { });
      this.cssKeys.kchCSS = await this.mainWindow.webContents.insertCSS(css);
      const { backgroundEnabled, background } = await this.loadSettings();
      if (backgroundEnabled && background) await this.injectBackgroundCSS(background);
    } catch (err) {
      console.error('Error injecting KCH CSS:', err);
    }
  }

  async injectGeneralCSS(css) {
    if (this.cssKeys.general) await this.mainWindow.webContents.removeInsertedCSS(this.cssKeys.general).catch(() => { });
    this.cssKeys.general = await this.mainWindow.webContents.insertCSS(css);
  }

  async injectUICSS({ opacity, scale, chatMode, openingAnimations, hurtCamMode }) {
    let css = `.team-score, .desktop-game-interface { opacity: ${opacity}% !important; transform: scale(${scale / 100}) !important; }`;
    if (chatMode === 'simplified') {
      css += `#bottom-left .chat .input-wrapper input { opacity: 0 !important; margin: 0 !important; }
        #bottom-left .chat .input-wrapper input:focus { opacity: 1 !important; }
        #bottom-left .chat .messages.messages-cont { background-color: #fff0 !important; overflow: hidden !important; word-break: break-word !important; }
        .desktop-game-interface .chat>.info, .desktop-game-interface .chat .info-key-cont.enter { display: none !important; }`;
    } else if (chatMode === 'hidden') {
      css += `#bottom-left .chat .input-wrapper input, #bottom-left .chat .messages.messages-cont, .desktop-game-interface .chat>.info, .desktop-game-interface .chat .info-key-cont.enter { display: none !important; }`;
    }
    if (openingAnimations) {
      css += `
        #canvas,
        .ach-cont .text,
        .view,
        .subj-img,
        .player-canvas {
          display: inline-block;
          animation: Stretch 0.5s ease-in-out;
          z-index: 0;
        }
        @keyframes Stretch {
          0%   { transform: scale(1, 1); }
          4%  { transform: scale(0, 0.1); }
        }
        .hp-progress,
        .tab-info,
        .player-lobby,
        .all-items,
        .background,
        .play-content,
        .container-card,
        .close,
        .buttons,
        .maps,
        .card,
        .Friend.is-online,
        .Friend,
        .interface,
        .server,
        .alert-default {
         animation: Stretch 0.5s ease-in-out;
          z-index: 0;
        }
      `;
    }
    if (this.cssKeys.ui) await this.mainWindow.webContents.removeInsertedCSS(this.cssKeys.ui).catch(() => { });
    this.cssKeys.ui = await this.mainWindow.webContents.insertCSS(css);
    await this.saveSettings({ opacity, scale, chatMode, openingAnimations, hurtCamMode });
  }

  async injectHurtCamCSS(mode) {
    let css = '';
    if (mode === 'none') {
      css = `
        img[src="https://kirka.io/assets/img/__hitme__.12854a28.webp"],
        img[src$="img/__hitme__.12854a28.webp"] {
          display: none !important;
          visibility: hidden !important;
        }
      `;
    } else if (mode === 'simplified') {
      css = `
        img[src="https://kirka.io/assets/img/__hitme__.12854a28.webp"],
        img[src$="img/__hitme__.12854a28.webp"] {
          content: url('https://raw.githubusercontent.com/imnotkoolkid/OBSIDIAN-CLIENT/refs/heads/main/assets/smallerhitme.webp') !important;
        }
      `;
    }
    if (this.cssKeys.hurtCam) {
      await this.mainWindow.webContents.removeInsertedCSS(this.cssKeys.hurtCam).catch(() => { });
      delete this.cssKeys.hurtCam;
    }
    if (css) {
      this.cssKeys.hurtCam = await this.mainWindow.webContents.insertCSS(css);
    }
    await this.saveSettings({ hurtCamMode: mode });
  }

  async injectKillIconAndHitmarkCSS({ killicon, hitmark }) {
    let css = '';
    if (killicon) {
      css += `.animate-cont::before { content: ""; background: url(${killicon}); width: 9rem; height: 9rem; margin-bottom: 2rem; display: inline-block; background-position: center; background-size: contain; background-repeat: no-repeat; }
            .animate-cont svg { display: none; }`;
    }
    if (hitmark) {
      css += `.hitmark { content: url(${hitmark}) !important; }`;
    }
    if (this.cssKeys.killiconHitmark) {
      await this.mainWindow.webContents.removeInsertedCSS(this.cssKeys.killiconHitmark).catch(() => { });
      delete this.cssKeys.killiconHitmark;
    }
    if (css) {
      this.cssKeys.killiconHitmark = await this.mainWindow.webContents.insertCSS(css);
    }
    await this.saveSettings({ killicon, hitmark });
  }

  async injectBackgroundCSS(url) {
    const css = `#app>div.interface.text-2>div.background{background:url(${url}) 50% 50%/cover no-repeat!important;animation:none!important;transition:none!important;transform:none!important;-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-webkit-animation:none!important;-moz-animation:none!important;-o-animation:none!important}#app>div.interface.text-2>div.background>div.bg-radial,#app>div.interface.text-2>div.background>div.pattern-bg{display:none!important}`;
    if (this.cssKeys.background) await this.mainWindow.webContents.removeInsertedCSS(this.cssKeys.background).catch(() => { });
    this.cssKeys.background = await this.mainWindow.webContents.insertCSS(css);
    await this.saveSettings({ background: url, backgroundEnabled: true });
  }

  async removeCSS(type) {
    if (this.cssKeys[type]) {
      await this.mainWindow.webContents.removeInsertedCSS(this.cssKeys[type]).catch(() => { });
      this.cssKeys[type] = null;
      await this.saveSettings(type === 'background' ? { background: '', backgroundEnabled: false } : {});
    }
  }

  async removeKCHCSS() {
    if (this.cssKeys.kchCSS) {
      await this.mainWindow.webContents.removeInsertedCSS(this.cssKeys.kchCSS).catch(() => { });
      this.cssKeys.kchCSS = null;
      await this.saveSettings({ kchCSS: '', kchCSSTitle: '' });
      const { cssList } = await this.loadSettings();
      for (const cssEntry of cssList.filter(entry => entry.enabled)) await this.injectCustomCSS(cssEntry);
    }
  }

  async addCustomCSS(cssEntry) {
    const { cssList = [], kchCSSTitle } = await this.loadSettings();
    if (cssEntry.url === 'https://raw.githubusercontent.com/imnotkoolkid/KCH/refs/heads/main/resources/css-files/obsidian_ui.css') return;
    cssEntry.id = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    cssList.push(cssEntry);
    await this.saveSettings({ cssList });
    if (cssEntry.enabled && !kchCSSTitle) await this.injectCustomCSS(cssEntry);
  }

  async toggleCustomCSS(id, enabled) {
    const { cssList = [], kchCSSTitle } = await this.loadSettings();
    if (kchCSSTitle) return;
    const cssEntry = cssList.find(entry => entry.id === id);
    if (cssEntry) {
      cssEntry.enabled = enabled;
      await this.saveSettings({ cssList });
      if (enabled) await this.injectCustomCSS(cssEntry);
      else await this.removeCustomCSS(id);
    }
  }

  async removeCustomCSSFromSettings(id) {
    const { cssList = [] } = await this.loadSettings();
    const newCssList = cssList.filter(entry => entry.id !== id || entry.isDefault);
    await this.saveSettings({ cssList: newCssList });
    if (!cssList.find(entry => entry.id === id)?.isDefault) {
      await this.removeCustomCSS(id);
    }
  }

  async updateCustomCSS(cssEntry) {
    const { cssList = [], kchCSSTitle } = await this.loadSettings();
    if (kchCSSTitle) return;
    const cssIndex = cssList.findIndex(entry => entry.id === cssEntry.id);
    if (cssIndex !== -1 && !cssList[cssIndex].isDefault) {
      const wasEnabled = cssList[cssIndex].enabled;
      cssList[cssIndex] = { ...cssList[cssIndex], name: cssEntry.name, url: cssEntry.url, code: cssEntry.code };
      await this.saveSettings({ cssList });
      if (wasEnabled) {
        await this.removeCustomCSS(cssEntry.id);
        await this.injectCustomCSS(cssList[cssIndex]);
      }
    }
  }
}

module.exports = CSSHandler;
