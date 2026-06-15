const CACHE_KEY = 'weather';
const SEARCH_USER_AGENT = 'home-lab-launcher-plugin-hll-weather/0.2.0';

function pluginConfig(context) {
  const cfg = context.getConfig();
  const latitude = Number(cfg.latitude);
  const longitude = Number(cfg.longitude);
  const coordinatePrecision = Math.min(4, Math.max(0, Math.trunc(Number(cfg.coordinatePrecision ?? 2))));
  return {
    sectionTitle: String(cfg.sectionTitle || 'Weather').trim() || 'Weather',
    enabled: cfg.enabled !== false,
    label: String(cfg.label || '').trim(),
    latitude,
    longitude,
    hasLocation: Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180,
    units: cfg.units === 'celsius' ? 'celsius' : 'fahrenheit',
    refreshMinutes: Math.max(5, Number(cfg.refreshMinutes || 5)),
    uiAutoRefresh: Boolean(cfg.uiAutoRefresh),
    uiAutoRefreshInterval: Math.max(60, Number(cfg.uiAutoRefreshInterval || 300)),
    coordinatePrecision
  };
}

function roundedCoordinate(value, precision) {
  return Number(value).toFixed(precision);
}

function cacheTtlMs(context) {
  return pluginConfig(context).refreshMinutes * 60 * 1000;
}

async function fetchOpenMeteoWeather(context, cfg) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', roundedCoordinate(cfg.latitude, cfg.coordinatePrecision));
  url.searchParams.set('longitude', roundedCoordinate(cfg.longitude, cfg.coordinatePrecision));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m');
  url.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability,is_day');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  url.searchParams.set('temperature_unit', cfg.units);
  url.searchParams.set('wind_speed_unit', cfg.units === 'fahrenheit' ? 'mph' : 'kmh');
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('timezone', 'auto');

  const response = await context.fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': SEARCH_USER_AGENT }
  });
  if (!response.ok) throw new Error(`Open-Meteo forecast failed: HTTP ${response.status}`);
  return response.json();
}

async function refreshWeather(context) {
  const cfg = pluginConfig(context);
  if (!cfg.enabled) return { refreshed: false, reason: 'Weather is disabled' };
  if (!cfg.hasLocation) return { refreshed: false, reason: 'Weather location is not configured' };

  try {
    const payload = await fetchOpenMeteoWeather(context, cfg);
    context.db.prepare(`
      INSERT INTO plugin_hll_weather_cache (key, value, fetched_at, last_error)
      VALUES (?, ?, CURRENT_TIMESTAMP, NULL)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, fetched_at=CURRENT_TIMESTAMP, last_error=NULL
    `).run(CACHE_KEY, JSON.stringify(payload));
    return { refreshed: true };
  } catch (error) {
    const existing = context.db.prepare('SELECT value FROM plugin_hll_weather_cache WHERE key = ?').get(CACHE_KEY);
    context.db.prepare(`
      INSERT INTO plugin_hll_weather_cache (key, value, fetched_at, last_error)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(key) DO UPDATE SET last_error=excluded.last_error
    `).run(CACHE_KEY, existing?.value || '{}', error.message);
    context.log?.('warn', 'refresh_failed', { error: error.message });
    throw error;
  }
}

function parseCacheValue(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function requireEditor(req, res, next) {
  if (!['admin', 'editor'].includes(req.session?.user?.role)) return res.status(403).json({ error: 'Editor access required' });
  next();
}

function canRead(req, context) {
  if (req.session?.user) return true;
  const row = context.db.prepare('SELECT value FROM settings WHERE key = ?').get('public_read_enabled');
  try { return JSON.parse(row?.value || 'false') === true; } catch { return false; }
}

exports.register = async function register(context) {
  context.db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_hll_weather_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_error TEXT
    );
  `);

  const router = context.createRouter();

  router.get('/weather', async (req, res) => {
    if (!canRead(req, context)) return res.status(401).json({ error: 'Authentication required' });
    const cfg = pluginConfig(context);
    if (!cfg.enabled) return res.status(404).json({ error: 'Weather is disabled' });
    if (!cfg.hasLocation) {
      return res.json({
        title: cfg.sectionTitle,
        configured: false,
        enabled: cfg.enabled,
        location: { label: cfg.label, units: cfg.units },
        uiAutoRefresh: cfg.uiAutoRefresh,
        uiAutoRefreshInterval: cfg.uiAutoRefreshInterval
      });
    }

    let row = context.db.prepare('SELECT value, fetched_at AS fetchedAt, last_error AS lastError FROM plugin_hll_weather_cache WHERE key = ?').get(CACHE_KEY);
    const fetchedAt = row?.fetchedAt ? new Date(row.fetchedAt).getTime() : 0;
    let source = row && Date.now() - fetchedAt < cacheTtlMs(context) ? 'cache' : 'network';

    if (!row || source === 'network') {
      try {
        await refreshWeather(context);
        row = context.db.prepare('SELECT value, fetched_at AS fetchedAt, last_error AS lastError FROM plugin_hll_weather_cache WHERE key = ?').get(CACHE_KEY);
      } catch (error) {
        row = context.db.prepare('SELECT value, fetched_at AS fetchedAt, last_error AS lastError FROM plugin_hll_weather_cache WHERE key = ?').get(CACHE_KEY);
        if (!row || !Object.keys(parseCacheValue(row.value)).length) return res.status(502).json({ error: 'Weather unavailable' });
        source = 'stale_cache';
      }
    }

    res.json({
      title: cfg.sectionTitle,
      configured: true,
      enabled: cfg.enabled,
      location: { label: cfg.label, units: cfg.units },
      weather: parseCacheValue(row?.value),
      fetchedAt: row?.fetchedAt ? new Date(row.fetchedAt).toISOString() : null,
      source,
      lastError: row?.lastError || null,
      uiAutoRefresh: cfg.uiAutoRefresh,
      uiAutoRefreshInterval: cfg.uiAutoRefreshInterval
    });
  });

  router.get('/search', requireEditor, async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.json({ results: [] });
    try {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
      url.searchParams.set('name', query);
      url.searchParams.set('count', '8');
      url.searchParams.set('language', 'en');
      url.searchParams.set('format', 'json');
      const response = await context.fetch(url, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': SEARCH_USER_AGENT } });
      if (!response.ok) return res.status(502).json({ error: 'Geocoding unavailable' });
      const payload = await response.json();
      const results = (payload.results || []).map((r) => ({
        label: [r.name, r.admin1, r.country, r.postcodes?.[0]].filter(Boolean).join(', '),
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone
      }));
      res.json({ results });
    } catch (error) {
      res.status(502).json({ error: 'Geocoding unavailable' });
    }
  });

  router.post('/refresh', requireEditor, async (req, res) => {
    try {
      const result = await refreshWeather(context);
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  context.mountRouter(router);

  if (pluginConfig(context).enabled) {
    context.registerDashboardSection({
      id: 'weather',
      title: pluginConfig(context).sectionTitle,
      script: context.publicScriptUrl
    });
  }

  refreshWeather(context).catch((error) => context.log?.('warn', 'initial_refresh_failed', { error: error.message }));
  context.setInterval(() => refreshWeather(context).catch(() => {}), pluginConfig(context).refreshMinutes * 60 * 1000, 'refresh weather');
};
