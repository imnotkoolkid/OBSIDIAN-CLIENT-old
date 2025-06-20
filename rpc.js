const DiscordRPC = require('discord-rpc');

let rpcClient, rpcConnected = false;
const clientId = '1385614605094621317';
const base_url = 'https://kirka.io/';

const stateMap = {
  [`${base_url}`]: "In the lobby",
  [`${base_url}hub/leaderboard`]: "Viewing the leaderboard",
  [`${base_url}hub/clans/champions-league`]: "Viewing the clan leaderboard",
  [`${base_url}hub/clans/my-clan`]: "Viewing their clan",
  [`${base_url}hub/market`]: "Viewing the market",
  [`${base_url}hub/live`]: "Viewing videos",
  [`${base_url}hub/news`]: "Viewing news",
  [`${base_url}hub/terms`]: "Viewing the terms of service",
  [`${base_url}store`]: "Viewing the store",
  [`${base_url}servers/main`]: "Viewing main servers",
  [`${base_url}servers/parkour`]: "Viewing parkour servers",
  [`${base_url}servers/custom`]: "Viewing custom servers",
  [`${base_url}quests/hourly`]: "Viewing hourly quests",
  [`${base_url}friends`]: "Viewing friends",
  [`${base_url}inventory`]: "Viewing their inventory",
};

const initDiscordRPC = (mainWindow) => {
  rpcClient = new DiscordRPC.Client({ transport: 'ipc' });

  rpcClient.on('ready', () => {
    rpcConnected = true;
    updateDiscordPresence(mainWindow?.webContents.getURL() || base_url);
  });

  rpcClient.on('error', (err) => {
    console.error('Discord RPC error:', err);
    rpcConnected = false;
    setTimeout(() => connectDiscordRPC(mainWindow), 10000);
  });

  connectDiscordRPC(mainWindow);
};

const connectDiscordRPC = (mainWindow) => {
  if (!rpcConnected) {
    rpcClient.login({ clientId }).catch(err => {
      console.error('Failed to connect to Discord RPC:', err);
      setTimeout(() => connectDiscordRPC(mainWindow), 10000);
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
    state = "In the lobby";
  }

  rpcClient.setActivity({
    details: 'Playing Obsidian Client',
    state: state,
    startTimestamp: Math.floor(Date.now() / 1000),
    largeImageKey: 'Obsidian Client',
    largeImageText: 'Obsidian Client',
    smallImageKey: 'kirka_io',
    smallImageText: 'Kirka.io',
  }).catch(err => console.error('Error setting Discord activity:', err));
};

const cleanupDiscordRPC = () => {
  if (rpcClient && rpcConnected) {
    rpcClient.destroy();
    rpcConnected = false;
  }
};

module.exports = { initDiscordRPC, updateDiscordPresence, cleanupDiscordRPC };
