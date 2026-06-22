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
  render: async ({ container, api, user, preferences = {}, setPluginPreference }) => {
    const canEdit = ['admin', 'editor'].includes(user?.role);
    let autoRefreshTimer = null;
    let lastConfig = { uiAutoRefresh: false, uiAutoRefreshInterval: 300 };
    let currentTheme = preferences.theme === 'pixel' ? 'pixel' : 'default';

    function renderSearchForm(showBackButton) {
      if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
      }
      container.innerHTML = `
        <section class="hll-weather-search-section" aria-label="Configure Weather">
          <div class="hll-weather-search-container">
            <span class="hll-weather-kicker">Configure Weather</span>
            <h3>Search for your city</h3>
            <div class="hll-weather-search-row">
              <input type="text" id="hll-weather-search-query" class="hll-weather-search-input" placeholder="Enter city name (e.g. Paris, Chicago)..." />
              <button class="primary" id="hll-weather-search-submit" type="button">Search</button>
            </div>
            <div id="hll-weather-results-container" class="hll-weather-search-results" style="display: none;"></div>
            <div class="hll-weather-search-actions">
              ${showBackButton ? '<button class="ghost" id="hll-weather-search-cancel" type="button">Cancel</button>' : ''}
              <a class="hll-weather-admin-link" href="/admin?tab=plugins">Open plugin settings</a>
            </div>
          </div>
        </section>
      `;

      const queryInput = container.querySelector('#hll-weather-search-query');
      const searchSubmit = container.querySelector('#hll-weather-search-submit');
      const resultsContainer = container.querySelector('#hll-weather-results-container');
      const cancelBtn = container.querySelector('#hll-weather-search-cancel');

      queryInput.focus();

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          render();
        });
      }

      async function performSearch() {
        const query = queryInput.value.trim();
        if (query.length < 2) {
          resultsContainer.style.display = 'block';
          resultsContainer.innerHTML = '<p class="hll-weather-search-info">Please enter at least 2 characters.</p>';
          return;
        }
        searchSubmit.disabled = true;
        searchSubmit.textContent = 'Searching...';
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = '<div class="hll-weather-search-loader">Searching cities...</div>';
        try {
          const resData = await api(`/api/plugins/hll-weather/search?q=${encodeURIComponent(query)}`);
          const results = resData.results || [];
          if (results.length === 0) {
            resultsContainer.innerHTML = '<p class="hll-weather-search-info">No cities found. Try a different search term.</p>';
          } else {
            resultsContainer.innerHTML = `
              <ul class="hll-weather-search-list">
                ${results.map((r, index) => `
                  <li>
                    <button class="hll-weather-search-item" data-index="${index}" type="button">
                      <strong>${escapeHtml(r.label)}</strong>
                      <span class="hll-weather-search-coords">${r.latitude.toFixed(4)}°, ${r.longitude.toFixed(4)}°</span>
                    </button>
                  </li>
                `).join('')}
              </ul>
            `;
            resultsContainer.querySelectorAll('.hll-weather-search-item').forEach(btn => {
              btn.addEventListener('click', async () => {
                const idx = parseInt(btn.dataset.index);
                const city = results[idx];
                await saveCity(city, showBackButton);
              });
            });
          }
        } catch (error) {
          resultsContainer.innerHTML = `<p class="hll-weather-search-error">Failed to search: ${escapeHtml(error.message)}</p>`;
        } finally {
          searchSubmit.disabled = false;
          searchSubmit.textContent = 'Search';
        }
      }

      searchSubmit.addEventListener('click', performSearch);
      queryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          performSearch();
        }
      });
    }

    async function saveCity(city, showBackButton) {
      container.innerHTML = '<p class="hll-weather-loading">Saving location and updating forecast...</p>';
      try {
        const shortLabel = city.label.split(',').slice(0, 2).map(s => s.trim()).join(', ');
        await api('/api/plugins/hll-weather/config', {
          method: 'PUT',
          body: JSON.stringify({
            config: {
              label: shortLabel,
              latitude: city.latitude,
              longitude: city.longitude
            }
          })
        });
        try {
          await api('/api/plugins/hll-weather/refresh', { method: 'POST' });
        } catch (err) {
          console.error('Initial refresh failed after saving city:', err);
        }
        await render();
      } catch (error) {
        container.innerHTML = `
          <div class="hll-weather-empty">
            <h3 class="hll-weather-error">Failed to save city</h3>
            <p>${escapeHtml(error.message)}</p>
            <button class="primary" id="hll-weather-retry-save" type="button">Retry</button>
          </div>
        `;
        container.querySelector('#hll-weather-retry-save').addEventListener('click', () => {
          renderSearchForm(showBackButton);
        });
      }
    }

    async function render() {
      container.innerHTML = '<p class="hll-weather-loading">Loading weather...</p>';
      try {
        const data = await api('/api/plugins/hll-weather/weather');
        lastConfig = { uiAutoRefresh: data.uiAutoRefresh, uiAutoRefreshInterval: data.uiAutoRefreshInterval };
        if (!data.configured) {
          if (canEdit) {
            renderSearchForm(false);
          } else {
            container.innerHTML = `<div class="hll-weather-empty"><h3>Weather is not configured</h3><p>Set a location in <strong>Admin -> Plugins -> HLL Weather</strong>.</p></div>`;
          }
          setupAutoRefresh();
          return;
        }

        const current = data.weather?.current || {};
        const daily = data.weather?.daily || {};
        const code = hllWeatherCodes[current.weather_code] || ['Conditions unavailable', '🌤️', '🌙'];
        const isDay = Number(current.is_day) === 1;
        const unit = data.location.units === 'celsius' ? 'C' : 'F';
        const temp = Number(current.temperature_2m);
        const feelsLike = Number(current.apparent_temperature);
        const high = Number((daily.temperature_2m_max || [])[0]);
        const low = Number((daily.temperature_2m_min || [])[0]);
        const sourceText = data.source === 'stale_cache' ? 'Stale data' : 'Updated';
        const errorText = data.lastError ? `<small class="hll-weather-error-note">Last refresh error: ${escapeHtml(data.lastError)}</small>` : '';

        container.innerHTML = `
          <section class="hll-weather-card hll-weather-theme-${escapeHtml(currentTheme)} ${data.source === 'stale_cache' ? 'is-warning' : ''}" aria-label="Weather">
            <div class="hll-weather-current">
              <div>
                <span class="hll-weather-kicker">${escapeHtml(data.location.label || data.title || 'Weather')}</span>
                <strong>${Number.isFinite(temp) ? `${Math.round(temp)}°` : '-°'}</strong>
                <p>${escapeHtml(code[0])} · Feels like ${Number.isFinite(feelsLike) ? Math.round(feelsLike) : '-'}°${unit}</p>
                <small>H ${Number.isFinite(high) ? Math.round(high) : '-'}° · L ${Number.isFinite(low) ? Math.round(low) : '-'}° · ${sourceText} ${data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'never'}</small>
                ${errorText}
              </div>
              ${weatherVisualHtml(current.weather_code, isDay, 'hll-weather-icon')}
            </div>
            <div class="hll-weather-forecast" aria-label="Hourly forecast">${hourlyHtml(data.weather || {})}</div>
            <div class="hll-weather-forecast hll-weather-daily" aria-label="7 day forecast">${dailyHtml(data.weather || {})}</div>
            <div class="hll-weather-actions">
              <label class="hll-weather-theme-control">Theme <select id="hll-weather-theme" aria-label="Weather theme"><option value="default" ${currentTheme === 'default' ? 'selected' : ''}>Default</option><option value="pixel" ${currentTheme === 'pixel' ? 'selected' : ''}>Pixel</option></select></label>
              ${canEdit ? '<button class="ghost" id="hll-weather-change-city" type="button">Change city</button><button class="ghost" id="hll-weather-refresh" type="button">Refresh weather</button>' : ''}
            </div>
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
          const isDay = item.isDay !== 0;
          const temp = Number.isFinite(item.temp) ? `${Math.round(item.temp)}°` : '-°';
          const precip = Number.isFinite(item.precip) ? `${Math.round(item.precip)}%` : '-';
          return `<article class="hll-weather-chip" title="${escapeHtml(code[0])}"><span>${escapeHtml(item.label)}</span><strong>${weatherVisualHtml(item.code, isDay, 'hll-weather-chip-icon')} ${escapeHtml(temp)}</strong><small>${escapeHtml(precip)}</small></article>`;
        }).join('');
    }

    function dailyHtml(weather) {
      const daily = weather.daily || {};
      return (daily.time || []).slice(0, 7).map((time, index) => {
        const code = hllWeatherCodes[(daily.weather_code || [])[index]] || ['Forecast', '🌤️', '🌙'];
        const high = Number((daily.temperature_2m_max || [])[index]);
        const low = Number((daily.temperature_2m_min || [])[index]);
        const precip = Number((daily.precipitation_probability_max || [])[index]);
        return `<article class="hll-weather-chip hll-weather-day-chip" title="${escapeHtml(code[0])}"><span>${escapeHtml(index === 0 ? 'Today' : hllWeatherDayFormatter.format(new Date(`${time}T12:00:00`)))}</span><strong>${weatherVisualHtml((daily.weather_code || [])[index], true, 'hll-weather-chip-icon')} ${Number.isFinite(high) ? Math.round(high) : '-'}°/${Number.isFinite(low) ? Math.round(low) : '-'}°</strong><small>${Number.isFinite(precip) ? Math.round(precip) : '-'}%</small></article>`;
      }).join('');
    }

    function weatherKind(code) {
      if ([0, 1].includes(Number(code))) return 'clear';
      if (Number(code) === 2) return 'partly-cloudy';
      if (Number(code) === 3) return 'cloudy';
      if ([45, 48].includes(Number(code))) return 'fog';
      if ([51, 53, 55, 61, 63, 66, 67, 80, 81].includes(Number(code))) return 'rain';
      if ([65, 82, 95, 96, 99].includes(Number(code))) return 'storm';
      if ([71, 73, 75, 77, 85, 86].includes(Number(code))) return 'snow';
      if ([56, 57].includes(Number(code))) return 'hail';
      return 'partly-cloudy';
    }

    function pixelWeatherHtml(kind, isDay, className) {
      return `<span class="${escapeHtml(className)} hll-weather-pixel hll-weather-pixel-${escapeHtml(kind)} ${isDay ? 'is-day' : 'is-night'}" aria-hidden="true"><i></i><b></b><em></em></span>`;
    }

    function weatherVisualHtml(codeValue, isDay, className) {
      const code = hllWeatherCodes[codeValue] || ['Forecast', '🌤️', '🌙'];
      if (currentTheme === 'pixel') return pixelWeatherHtml(weatherKind(codeValue), isDay, className);
      return `<span class="${escapeHtml(className)}">${escapeHtml(isDay ? code[1] : code[2])}</span>`;
    }

    function bind() {
      const button = container.querySelector('#hll-weather-refresh');
      if (button) {
        button.addEventListener('click', async () => {
          button.disabled = true;
          button.textContent = 'Refreshing...';
          try { await api('/api/plugins/hll-weather/refresh', { method: 'POST' }); }
          catch (error) { console.error(error); }
          await render();
        });
      }
      const changeCityButton = container.querySelector('#hll-weather-change-city');
      if (changeCityButton) {
        changeCityButton.addEventListener('click', () => {
          renderSearchForm(true);
        });
      }
      const themeSelect = container.querySelector('#hll-weather-theme');
      if (themeSelect) {
        themeSelect.addEventListener('change', async () => {
          currentTheme = themeSelect.value === 'pixel' ? 'pixel' : 'default';
          if (setPluginPreference) {
            try { await setPluginPreference('theme', currentTheme); }
            catch (error) { console.error('Failed to save weather theme:', error); }
          }
          await render();
        });
      }
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
