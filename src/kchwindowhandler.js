const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { promises: fs } = require("fs");

class KCHWindowHandler {
    constructor(mainWindow, paths) {
        this.mainWindow = mainWindow;
        this.paths = paths;
    }

    registerHandlers() {
        ipcMain.on("open-css-gallery", () => {
            const cssGalleryWindow = new BrowserWindow({
                width: 1050,
                height: 600,
                title: "KCH CSS Gallery",
                icon: path.join(__dirname, "../kch/assets/kch.ico"),
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, "../preload.js"),
                },
            });
            cssGalleryWindow.loadFile("kch/css.html");
            cssGalleryWindow.setMenuBarVisibility(false);
        });

        ipcMain.on("open-scripts-gallery", () => {
            const scriptsGalleryWindow = new BrowserWindow({
                width: 1050,
                height: 600,
                title: "KCH Scripts Gallery",
                icon: path.join(__dirname, "../kch/assets/kch.ico"),
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, "../preload.js"),
                },
            });
            scriptsGalleryWindow.loadFile("kch/scripts.html");
            scriptsGalleryWindow.setMenuBarVisibility(false);
        });

        ipcMain.on("open-assets-gallery", () => {
            const assetsGalleryWindow = new BrowserWindow({
                width: 1050,
                height: 600,
                title: "KCH Assets Gallery",
                icon: path.join(__dirname, "../kch/assets/kch.ico"),
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, "../preload.js"),
                },
            });
            assetsGalleryWindow.loadURL("https://kirkacommunityhub.pages.dev/assets");
            assetsGalleryWindow.setMenuBarVisibility(false);
        });

        ipcMain.on("open-textures-gallery", () => {
            const texturesGalleryWindow = new BrowserWindow({
                width: 1050,
                height: 600,
                title: "KCH Textures Gallery",
                icon: path.join(__dirname, "../kch/assets/kch.ico"),
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, "../preload.js"),
                },
            });
            texturesGalleryWindow.loadURL("https://kirkacommunityhub.pages.dev/textures");
            texturesGalleryWindow.setMenuBarVisibility(false);
        });

        ipcMain.on("open-crosshairs-gallery", () => {
            const crosshairsGalleryWindow = new BrowserWindow({
                width: 1050,
                height: 600,
                title: "KCH Crosshairs Gallery",
                icon: path.join(__dirname, "../kch/assets/kch.ico"),
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, "../preload.js"),
                },
            });
            crosshairsGalleryWindow.loadURL("https://kirkacommunityhub.pages.dev/crosshairs");
            crosshairsGalleryWindow.setMenuBarVisibility(false);
        });

        ipcMain.on("download-script", async (event, { url, name, content }) => {
            try {
                const filePath = path.join(this.paths.scripts, `${name}.js`);
                await fs.writeFile(filePath, content);
                if (this.mainWindow && typeof this.mainWindow.isDestroyed === 'function' && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.reload();
                } else {
                    console.warn("Main window is not available or destroyed, skipping reload.");
                }
            } catch (error) {
                console.error(`Failed to save script ${name}:`, error);
            }
        });
    }
}

module.exports = KCHWindowHandler;
