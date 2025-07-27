const analyticsUI = {
  formatDuration(milliseconds) {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  },

  formatDate(dateString) {
    const today = new Date().toISOString().split('T')[0];
    if (dateString === today) {
      return 'Today';
    }
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  },

  async loadAnalytics() {
    try {
      console.log('Attempting to fetch analytics data...');
      const data = await window.obsidianClient.getAnalyticsForDisplay();

      if (!data) {
        throw new Error('No analytics data received');
      }

      this.generateChart(data.last7Days, data.playtimeMap);
      this.updateStats(data.totalPlaytime, data.totalGames, data.activeDays);

      document.getElementById('analytics-loading').style.display = 'none';
      document.getElementById('analytics-content').style.display = 'block';
    } catch (error) {
      console.error('Error loading analytics:', error);
      document.getElementById('analytics-loading').style.display = 'none';
      document.getElementById('analytics-error').style.display = 'block';
      document.getElementById('analytics-error-message').textContent = error.message || 'Unknown error';
    }
  },

  generateChart(days, playtimeMap) {
    const chart = document.getElementById('playtime-chart');
    chart.innerHTML = '';

    const maxPlaytime = 24 * 60 * 60 * 1000;

    days.forEach(date => {
      const playtime = playtimeMap[date] || 0;
      const percentage = Math.min((playtime / maxPlaytime) * 100, 100);

      const barContainer = document.createElement('div');
      barContainer.className = 'bar-container';

      const bar = document.createElement('div');
      bar.className = 'bar';
      const actualHeight = Math.max((percentage / 100) * 180, 3);
      bar.style.height = `${actualHeight}px`;

      const barValue = document.createElement('div');
      barValue.className = 'bar-value';
      barValue.textContent = this.formatDuration(playtime);
      bar.appendChild(barValue);

      const barLabel = document.createElement('div');
      barLabel.className = 'bar-label';
      barLabel.textContent = this.formatDate(date);

      barContainer.appendChild(bar);
      barContainer.appendChild(barLabel);
      chart.appendChild(barContainer);
    });
  },

  updateStats(totalPlaytime, totalGames, activeDays) {
    document.getElementById('total-playtime').textContent = this.formatDuration(totalPlaytime);
    document.getElementById('avg-daily').textContent = this.formatDuration(Math.floor(totalPlaytime / 7));
    document.getElementById('total-games').textContent = totalGames;
    document.getElementById('active-days').textContent = activeDays;
  }
};
