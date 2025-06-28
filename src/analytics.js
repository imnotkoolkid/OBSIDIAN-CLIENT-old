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

      console.log(`Analytics saved for game: ${analyticsData.gameCode}`);
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
        console.log(`Left game: ${this.currentGameCode}. Duration: ${duration}ms`);

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

  async getAnalyticsForDisplay() {
    const data = await this.getAnalytics();
    const last7Days = this.getLast7Days();
    const playtimeMap = {};
    let totalPlaytime = 0;
    let totalGames = 0;
    let activeDays = 0;

    last7Days.forEach((date) => {
      playtimeMap[date] = 0;
    });

    if (data.playtime && Array.isArray(data.playtime)) {
      data.playtime.forEach((entry) => {
        if (last7Days.includes(entry.date)) {
          playtimeMap[entry.date] = entry.playtime || 0;
          totalPlaytime += entry.playtime || 0;
          if (entry.games && Array.isArray(entry.games)) {
            totalGames += entry.games.length;
          }
          if (entry.playtime > 0) {
            activeDays++;
          }
        }
      });
    }

    return {
      last7Days,
      playtimeMap,
      totalPlaytime,
      totalGames,
      activeDays,
    };
  }

  getLast7Days() {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split("T")[0]);
    }
    return days;
  }
}

module.exports = Analytics;
