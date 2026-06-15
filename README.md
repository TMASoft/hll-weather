# hll-weather

Home Lab Launcher plugin for displaying weather as an optional dashboard section.

## Provider

This first version uses [Open-Meteo](https://open-meteo.com/) only. Open-Meteo provides a no-sign-up, no-API-key forecast API for non-commercial use.

Privacy notes:

- Forecast requests are made server-side by Home Lab Launcher, not directly by each browser.
- The plugin rounds configured coordinates before sending them upstream. The default precision is `2` decimal places, roughly city/neighborhood level.
- Open-Meteo states that free API logs may include IP addresses and geographic coordinates for technical and abuse-prevention reasons, are not linked to user identities, are not shared with third parties, and are deleted after 90 days.

## Configuration

After installing the plugin, administrators and editors can configure the weather location directly from the dashboard or via the plugin settings page.

### City Search (Recommended)
You can search for and select your city without needing to manually look up latitude and longitude:
- **First-time setup**: If weather isn't configured, a search box is displayed directly on the dashboard widget for editors and admins.
- **Updating location**: Click the **"Change city"** button on the active weather card to bring up the search interface at any time.

### Manual Settings
Alternatively, configuration can be managed in **Admin -> Plugins -> HLL Weather** using the following fields:

- `label`: Display name for the location (e.g., city name).
- `latitude` and `longitude`: Exact decimal forecast coordinates.
- `units`: Temperature unit (`fahrenheit` or `celsius`).
- `coordinatePrecision`: Admin-only decimal rounding (default `2`) applied before upstream requests. Lower precision improves location privacy but can slightly reduce forecast locality.
- `refreshMinutes`: Server-side API refresh interval (minimum 5 minutes).

Under the hood, the widget uses the `/api/plugins/hll-weather/search?q=<city>` geocoding endpoint to query Open-Meteo locations.

## Local Development

Install this repository as a local development plugin from the launcher Admin console:

```text
/mnt/storage/code/hll-weather
```

Local installs require `NODE_ENV=development` or `ENABLE_LOCAL_PLUGIN_INSTALL=true` in production-like environments.
