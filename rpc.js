const DiscordRPC = require('discord-rpc');

let rpcClient, rpcConnected = false;
const clientId = '1385614605094621317';
const base_url = 'https://kirka.io/';
let connectionAttempts = 0;
const MAX_ATTEMPTS = 3;

const stateMap = {
  [`${base_url}`]: "In the lobby",
  [`${base_url}hub/leaderboard`]: "Viewing player leaderboard",
  [`${base_url}hub/clans/champions-league`]: "Viewing clan leaderboard",
  [`${base_url}hub/ranked/leaderboard-point3v3`]: "Viewing ranked leaderboard of Point 3v3",
  [`${base_url}hub/ranked/leaderboard-sad`]: "Viewing ranked leaderboard of Search And Destroy",
  [`${base_url}hub/ranked/leaderboard-1v1`]: "Viewing ranked leaderboard of 1v1",
  [`${base_url}hub/clans/my-clan`]: "Viewing their clan",
  [`${base_url}hub/market`]: "Viewing market",
  [`${base_url}hub/live`]: "Viewing videos",
  [`${base_url}hub/news`]: "Viewing news",
  [`${base_url}hub/terms`]: "Viewing terms of service",
  [`${base_url}store`]: "Viewing store",
  [`${base_url}servers/main`]: "Viewing servers",
  [`${base_url}servers/parkour`]: "Viewing parkour servers",
  [`${base_url}servers/custom`]: "Viewing custom servers",
  [`${base_url}quests/hourly`]: "Viewing hourly quests",
  [`${base_url}friends`]: "Viewing their friends",
  [`${base_url}inventory`]: "Viewing their inventory",
};

const initDiscordRPC = (mainWindow) => {
  rpcClient = new DiscordRPC.Client({ transport: 'ipc' });

  rpcClient.on('ready', () => {
    rpcConnected = true;
    connectionAttempts = 0;
    updateDiscordPresence(mainWindow?.webContents.getURL() || base_url);
  });

  rpcClient.on('error', (err) => {
    rpcConnected = false;
    if (connectionAttempts < MAX_ATTEMPTS) {
      setTimeout(() => connectDiscordRPC(mainWindow), 10000);
    } else {
      setTimeout(() => connectDiscordRPC(mainWindow), 70000);
    }
  });

  connectDiscordRPC(mainWindow);
};

const connectDiscordRPC = (mainWindow) => {
  if (!rpcConnected) {
    connectionAttempts++;
    if (connectionAttempts <= MAX_ATTEMPTS) {
      console.log(`Attempting to connect to Discord RPC (Attempt ${connectionAttempts}/${MAX_ATTEMPTS})`);
    }
    rpcClient.login({ clientId }).catch(() => {
      if (connectionAttempts < MAX_ATTEMPTS) {
        setTimeout(() => connectDiscordRPC(mainWindow), 10000);
      } else {
        setTimeout(() => connectDiscordRPC(mainWindow), 70000);
      }
    });
  }
};

const updateDiscordPresence = (url) => {
  if (!rpcConnected || !rpcClient) return;

  let state;
  if (stateMap[url]) {
    state = stateMap[url];
  } else if (url.startsWith(`${base_url}games/`)) {
    state = "In a match";
  } else if (url.startsWith(`${base_url}profile/`)) {
    state = "Viewing a profile";
  } else {
    state = "Viewing main lobby";
  }

  rpcClient.setActivity({
    details: 'Playing Obsidian Client',
    state: state,
    startTimestamp: Math.floor(Date.now() / 1000),
    largeImageKey: 'Obsidian Client',
    largeImageText: 'Obsidian Client',
    smallImageKey: 'kirka_io',
    smallImageText: 'Kirka.io',
    buttons: [
      {
        label: 'Discord',
        url: 'https://discord.gg/qYuyhmEDa9'
      }
    ]
  }).catch(err => console.error('Error setting Discord activity:', err));
};

const cleanupDiscordRPC = () => {
  if (rpcClient && rpcConnected) {
    rpcClient.destroy();
    rpcConnected = false;
    connectionAttempts = 0;
  }
};

module.exports = { initDiscordRPC, updateDiscordPresence, cleanupDiscordRPC };
