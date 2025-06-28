const { promises: fs } = require("fs");
const path = require("path");

class Analytics {
  constructor(mainWindow, paths) {
    this.mainWindow = mainWindow;
    this.paths = paths;
    this.currentGameCode = null;
    this.joinTime = null;
    this.analyticsWriteTimer = null;
  }

  async getAnalytics() {
    try {
      const analyticsExist = await fs
        .access(this.paths.analytics)
        .then(() => true)
        .catch(() => false);
      if (analyticsExist) {
        const data = await fs.readFile(this.paths.analytics, "utf8");
        return JSON.parse(data) || { score: [], playtime: [] };
      } else {
        const defaultAnalytics = { score: [], playtime: [] };
        await fs.writeFile(this.paths.analytics, JSON.stringify(defaultAnalytics));
        return defaultAnalytics;
      }
    } catch (err) {
      console.error("Error loading analytics:", err);
      const defaultAnalytics = { score: [], playtime: [] };
      await fs.writeFile(this.paths.analytics, JSON.stringify(defaultAnalytics));
      return defaultAnalytics;
    }
  }

  async saveAnalytics(analyticsData) {
    try {
      const analyticsCache = await this.getAnalytics();
      let date = new Date();
      const formattedDate = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      let day = analyticsCache.playtime.find((d) => d.date === formattedDate);

      if (!day) {
        day = {
          date: formattedDate,
          playtime: analyticsData.duration || 0,
          games: [analyticsData],
        };
        analyticsCache.playtime.push(day);
      } else {
        day.playtime += analyticsData.duration || 0;
        day.games.push(analyticsData);
      }

      clearTimeout(this.analyticsWriteTimer);
      this.analyticsWriteTimer = setTimeout(
        () =>
          fs
            .writeFile(this.paths.analytics, JSON.stringify(analyticsCache))
            .catch((err) => console.error("Error saving analytics:", err)),
        500
      );

    } catch (error) {
      console.error("Failed to save analytics:", error);
    }
  }

  handleNavigation(event, url) {
    if (url.includes("/games/")) {
      const parts = url.split("~");
      this.currentGameCode = parts[parts.length - 1];
      this.joinTime = Date.now();
      console.log(`Joined game: ${this.currentGameCode}`);
    } else {
      if (this.currentGameCode) {
        const duration = Date.now() - this.joinTime;

        this.saveAnalytics({
          gameCode: this.currentGameCode,
          duration: duration,
          date: new Date().toISOString(),
        });

        this.currentGameCode = null;
        this.joinTime = null;
      }
    }
  }

  init() {
    this.mainWindow.webContents.on("did-navigate-in-page", (event, url) =>
      this.handleNavigation(event, url)
    );
    this.mainWindow.webContents.on("did-navigate", (event, url) =>
      this.handleNavigation(event, url)
    );
  }
}

module.exports = Analytics;
