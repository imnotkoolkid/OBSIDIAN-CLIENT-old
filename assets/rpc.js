const RPC = require('discord-rpc');

const clientId = '1384646835175686215'; // Your Discord App client ID
const rpc = new RPC.Client({ transport: 'ipc' });

const base_url = 'https://kirka.io';

const stateMap = {
  '/': 'In the lobby',
  '/friends': 'Viewing friends',
  '/inventory': 'Viewing inventory',
  '/hub/leaderboard': 'Viewing the leaderboard',
  '/hub/clans/champions-league': 'Viewing the clan leaderboard',
  '/hub/clans/my-clan': 'Viewing their clan',
  '/hub/market': 'Viewing the market',
  '/hub/live': 'Viewing videos',
  '/hub/news': 'Viewing news',
  '/hub/terms': 'Viewing terms of service',
  '/store': 'Viewing the store',
  '/servers/main': 'Viewing main servers',
  '/servers/parkour': 'Viewing parkour servers',
  '/servers/custom': 'Viewing custom servers',
  '/quests/hourly': 'Viewing hourly quests',
};

let sessionStartTimestamp = null;
let lastState = '';

function getPresenceState(url) {
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname;
    return stateMap[path] || 'In the lobby';
  } catch {
    return 'In the lobby';
  }
}

async function setActivity(state) {
  try {
    if (!sessionStartTimestamp) {
      sessionStartTimestamp = Date.now();
    }
    if (state === lastState) {
      // No need to update if state hasn't changed
      return;
    }
    lastState = state;

    await rpc.setActivity({
      details: state,
      startTimestamp: sessionStartTimestamp,
      largeImageKey: 'obsidian_logo', // Make sure this asset exists in your Discord app
      largeImageText: 'Obsidian Client',
      instance: false,
    });
    console.log('[RPC] Presence updated:', state);
  } catch (e) {
    console.error('[RPC] Error setting activity:', e);
  }
}

function initRPC(mainWindow) {
  let lastUrl = '';

  rpc.on('ready', () => {
    console.log('[RPC] Connected to Discord!');

    async function checkUrl() {
      try {
        // Check if mainWindow and its webContents are available
        if (mainWindow && mainWindow.webContents) {
          const url = await mainWindow.webContents.executeJavaScript('window.location.href');
          if (url !== lastUrl) {
            lastUrl = url;
            const state = getPresenceState(url);
            setActivity(state);
          }
        } else {
          console.error('[RPC] mainWindow or webContents not available');
        }
      } catch (e) {
        console.error('[RPC] Error fetching URL:', e);
      }
    }

    // Initial presence update
    checkUrl();

    // Poll every 2 seconds for SPA route changes
    const interval = setInterval(checkUrl, 2000);

    mainWindow.webContents.on('did-navigate', (event, url) => {
      lastUrl = url;
      const state = getPresenceState(url);
      setActivity(state);
    });

    mainWindow.webContents.on('did-finish-load', () => {
      checkUrl();
    });

    mainWindow.on('closed', () => {
      clearInterval(interval);
    });
  });

  rpc.login({ clientId }).catch(err => {
    console.error('[RPC] Login error:', err);
  });
}

module.exports = { initRPC };
