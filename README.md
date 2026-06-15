# hll-weather

Home Lab Launcher plugin for displaying weather as an optional dashboard section.

## Provider

This first version uses [Open-Meteo](https://open-meteo.com/) only. Open-Meteo provides a no-sign-up, no-API-key forecast API for non-commercial use.

Privacy notes:

- Forecast requests are made server-side by Home Lab Launcher, not directly by each browser.
- The plugin rounds configured coordinates before sending them upstream. The default precision is `2` decimal places, roughly city/neighborhood level.
- Open-Meteo states that free API logs may include IP addresses and geographic coordinates for technical and abuse-prevention reasons, are not linked to user identities, are not shared with third parties, and are deleted after 90 days.

## Configuration

Install the plugin, then configure it in **Admin -> Plugins -> HLL Weather**.

Important fields:

- `label`: Display name for the location.
- `latitude` and `longitude`: Forecast coordinates.
- `units`: `fahrenheit` or `celsius`.
- `coordinatePrecision`: Admin-only coordinate rounding before upstream requests. Lower precision improves location privacy but can reduce forecast locality.
- `refreshMinutes`: Server refresh interval. Minimum 5 minutes.

Use `/api/plugins/hll-weather/search?q=<city>` as an editor/admin helper for Open-Meteo geocoding, or enter coordinates directly.

## Local Development

Install this repository as a local development plugin from the launcher Admin console:

```text
/mnt/storage/code/hll-weather
```

Local installs require `NODE_ENV=development` or `ENABLE_LOCAL_PLUGIN_INSTALL=true` in production-like environments.
