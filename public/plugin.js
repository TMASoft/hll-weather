(() => {
if (!document.querySelector('link[data-plugin-style="hll-weather"]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/plugins/hll-weather/styles.css';
  link.dataset.pluginStyle = 'hll-weather';
  document.head.appendChild(link);
}

const hllWeatherCodes = { 0: ['Clear', '☀️', '🌙'], 1: ['Mostly clear', '🌤️', '🌙'], 2: ['Partly cloudy', '⛅', '☁️'], 3: ['Overcast', '☁️', '☁️'], 45: ['Fog', '🌫️', '🌫️'], 48: ['Freezing fog', '🌫️', '🌫️'], 51: ['Light drizzle', '🌦️', '🌧️'], 53: ['Drizzle', '🌦️', '🌧️'], 55: ['Heavy drizzle', '🌧️', '🌧️'], 56: ['Freezing drizzle', '🌧️', '🌧️'], 57: ['Heavy freezing drizzle', '🌧️', '🌧️'], 61: ['Light rain', '🌦️', '🌧️'], 63: ['Rain', '🌧️', '🌧️'], 65: ['Heavy rain', '⛈️', '⛈️'], 66: ['Freezing rain', '🌧️', '🌧️'], 67: ['Heavy freezing rain', '🌧️', '🌧️'], 71: ['Light snow', '🌨️', '🌨️'], 73: ['Snow', '❄️', '❄️'], 75: ['Heavy snow', '❄️', '❄️'], 77: ['Snow grains', '❄️', '❄️'], 80: ['Rain showers', '🌦️', '🌧️'], 81: ['Rain showers', '🌧️', '🌧️'], 82: ['Heavy showers', '⛈️', '⛈️'], 85: ['Snow showers', '🌨️', '🌨️'], 86: ['Heavy snow showers', '❄️', '❄️'], 95: ['Thunderstorm', '⛈️', '⛈️'], 96: ['Thunderstorm with hail', '⛈️', '⛈️'], 99: ['Heavy thunderstorm with hail', '⛈️', '⛈️'] };
const hllWeatherDayFormatter = new Intl.DateTimeFormat([], { weekday: 'short' });
const hllWeatherHourFormatter = new Intl.DateTimeFormat([], { hour: 'numeric' });

window.HomeLabLauncher.registerPluginSection({
  id: 'weather',
  title: 'Weather',
  render: async ({ container, api, user }) => {
    const canEdit = ['admin', 'editor'].includes(user?.role);
    let autoRefreshTimer = null;
    let lastConfig = { uiAutoRefresh: false, uiAutoRefreshInterval: 300 };

    async function render() {
      container.innerHTML = '<p class="hll-weather-loading">Loading weather...</p>';
      try {
        const data = await api('/api/plugins/hll-weather/weather');
        lastConfig = { uiAutoRefresh: data.uiAutoRefresh, uiAutoRefreshInterval: data.uiAutoRefreshInterval };
        if (!data.configured) {
          container.innerHTML = `<div class="hll-weather-empty"><h3>Weather is not configured</h3><p>Set a location in <strong>Admin -> Plugins -> HLL Weather</strong>.</p>${canEdit ? '<p>Use Open-Meteo geocoding or enter latitude and longitude directly in plugin config.</p>' : ''}</div>`;
          setupAutoRefresh();
          return;
        }

        const current = data.weather?.current || {};
        const daily = data.weather?.daily || {};
        const code = hllWeatherCodes[current.weather_code] || ['Conditions unavailable', '🌤️', '🌙'];
        const unit = data.location.units === 'celsius' ? 'C' : 'F';
        const temp = Number(current.temperature_2m);
        const feelsLike = Number(current.apparent_temperature);
        const high = Number((daily.temperature_2m_max || [])[0]);
        const low = Number((daily.temperature_2m_min || [])[0]);
        const sourceText = data.source === 'stale_cache' ? 'Stale data' : 'Updated';
        const errorText = data.lastError ? `<small class="hll-weather-error-note">Last refresh error: ${escapeHtml(data.lastError)}</small>` : '';

        container.innerHTML = `
          <section class="hll-weather-card ${data.source === 'stale_cache' ? 'is-warning' : ''}" aria-label="Weather">
            <div class="hll-weather-current">
              <div>
                <span class="hll-weather-kicker">${escapeHtml(data.location.label || data.title || 'Weather')}</span>
                <strong>${Number.isFinite(temp) ? `${Math.round(temp)}°` : '-°'}</strong>
                <p>${escapeHtml(code[0])} · Feels like ${Number.isFinite(feelsLike) ? Math.round(feelsLike) : '-'}°${unit}</p>
                <small>H ${Number.isFinite(high) ? Math.round(high) : '-'}° · L ${Number.isFinite(low) ? Math.round(low) : '-'}° · ${sourceText} ${data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'never'}</small>
                ${errorText}
              </div>
              <span class="hll-weather-icon">${Number(current.is_day) === 1 ? code[1] : code[2]}</span>
            </div>
            <div class="hll-weather-forecast" aria-label="Hourly forecast">${hourlyHtml(data.weather || {})}</div>
            <div class="hll-weather-forecast hll-weather-daily" aria-label="7 day forecast">${dailyHtml(data.weather || {})}</div>
            ${canEdit ? '<div class="hll-weather-actions"><button class="ghost" id="hll-weather-refresh" type="button">Refresh weather</button></div>' : ''}
          </section>
        `;
        bind();
        setupAutoRefresh();
      } catch (error) {
        container.innerHTML = `<p class="hll-weather-error">Weather unavailable: ${escapeHtml(error.message)}</p>`;
        setupAutoRefresh();
      }
    }

    function hourlyHtml(weather) {
      const hourly = weather.hourly || {};
      const now = Date.now();
      return (hourly.time || [])
        .map((time, index) => ({
          time: new Date(time).getTime(),
          label: hllWeatherHourFormatter.format(new Date(time)),
          temp: Number((hourly.temperature_2m || [])[index]),
          code: (hourly.weather_code || [])[index],
          precip: Number((hourly.precipitation_probability || [])[index]),
          isDay: Number((hourly.is_day || [])[index])
        }))
        .filter((item) => item.time >= now - 60 * 60 * 1000)
        .slice(0, 8)
        .map((item) => {
          const code = hllWeatherCodes[item.code] || ['Forecast', '🌤️', '🌙'];
          const icon = item.isDay === 0 ? code[2] : code[1];
          const temp = Number.isFinite(item.temp) ? `${Math.round(item.temp)}°` : '-°';
          const precip = Number.isFinite(item.precip) ? `${Math.round(item.precip)}%` : '-';
          return `<article class="hll-weather-chip" title="${escapeHtml(code[0])}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(icon)} ${escapeHtml(temp)}</strong><small>${escapeHtml(precip)}</small></article>`;
        }).join('');
    }

    function dailyHtml(weather) {
      const daily = weather.daily || {};
      return (daily.time || []).slice(0, 7).map((time, index) => {
        const code = hllWeatherCodes[(daily.weather_code || [])[index]] || ['Forecast', '🌤️', '🌙'];
        const high = Number((daily.temperature_2m_max || [])[index]);
        const low = Number((daily.temperature_2m_min || [])[index]);
        const precip = Number((daily.precipitation_probability_max || [])[index]);
        return `<article class="hll-weather-chip hll-weather-day-chip" title="${escapeHtml(code[0])}"><span>${escapeHtml(index === 0 ? 'Today' : hllWeatherDayFormatter.format(new Date(`${time}T12:00:00`)))}</span><strong>${escapeHtml(code[1])} ${Number.isFinite(high) ? Math.round(high) : '-'}°/${Number.isFinite(low) ? Math.round(low) : '-'}°</strong><small>${Number.isFinite(precip) ? Math.round(precip) : '-'}%</small></article>`;
      }).join('');
    }

    function bind() {
      const button = container.querySelector('#hll-weather-refresh');
      if (!button) return;
      button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = 'Refreshing...';
        try { await api('/api/plugins/hll-weather/refresh', { method: 'POST' }); }
        catch (error) { console.error(error); }
        await render();
      });
    }

    function setupAutoRefresh() {
      if (autoRefreshTimer) clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
      if (!lastConfig.uiAutoRefresh) return;
      autoRefreshTimer = setInterval(async () => {
        if (!document.body.contains(container)) {
          clearInterval(autoRefreshTimer);
          autoRefreshTimer = null;
          return;
        }
        await render();
      }, Math.max(60, Number(lastConfig.uiAutoRefreshInterval || 300)) * 1000);
    }

    function escapeHtml(v) {
      return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    await render();
  }
});
})();
