const { promises: fs } = require("fs");
const path = require("path");
const { BrowserWindow } = require("electron");

class Shortcuts {
  constructor(mainWindow, getSettingsCache, paths) {
    this.mainWindow = mainWindow;
    this.getSettingsCache = getSettingsCache;
    this.paths = paths;
    this.lastInput = 0;
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.mainWindow.webContents.on("before-input-event", async (e, input) => {
      const now = Date.now();
      if (now - this.lastInput < 50) return;
      this.lastInput = now;

      const settingsCache = this.getSettingsCache();

      if (input.code === "F11") {
        this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
        e.preventDefault();
      } else if (
        input.code === settingsCache.menuToggleKey &&
        input.type === "keyDown"
      ) {
        this.toggleClientMenu();
        e.preventDefault();
      } else if (
        input.code === settingsCache.joinLinkKey &&
        input.type === "keyDown"
      ) {
        this.toggleJoinLinkModal();
        e.preventDefault();
      } else if (
        settingsCache.devToolsEnabled &&
        (input.code === "F12" ||
          (input.control && input.shift && input.code === "KeyI"))
      ) {
        this.mainWindow.webContents.openDevTools();
        e.preventDefault();
      } else if (input.code === "F5") {
        this.mainWindow.webContents.reload();
        e.preventDefault();
      } else if (input.code === "F2" && input.type === "keyDown") {
        try {
          const screenshot = await this.mainWindow.webContents.capturePage();
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const screenshotPath = path.join(this.paths.captured, `screenshot-${timestamp}.png`);
          await fs.writeFile(screenshotPath, screenshot.toPNG());

          const { x, y, width } = this.mainWindow.getBounds();
          const notificationWindow = new BrowserWindow({
            width: 300,
            height: 80,
            x: Math.round(x + (width - 300) / 2),
            y: y + 20,
            frame: false,
            transparent: true,
            resizable: false,
            skipTaskbar: true,
            focusable: false,
            show: false,
            alwaysOnTop: true,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
            },
          });

          await notificationWindow.loadFile(path.join(__dirname, "notification.html"));
          notificationWindow.setAlwaysOnTop(true, "pop-up-menu");
          notificationWindow.setVisibleOnAllWorkspaces(true);
          notificationWindow.setIgnoreMouseEvents(true);
          notificationWindow.showInactive();
          this.mainWindow.focus();

          const updatePosition = () => {
            if (!notificationWindow.isDestroyed()) {
              const { x: newX, y: newY, width: newWidth } = this.mainWindow.getBounds();
              notificationWindow.setPosition(
                Math.round(newX + (newWidth - 300) / 2),
                newY + 20
              );
            }
          };

          this.mainWindow.on("move", updatePosition);
          notificationWindow.on("closed", () => {
            this.mainWindow.removeListener("move", updatePosition);
          });

        } catch (err) {
          console.error("Error capturing screenshot:", err);
        }
        e.preventDefault();
      }
    });
  }

  toggleClientMenu() {
  }

  toggleJoinLinkModal() {
  }
}

module.exports = Shortcuts;
