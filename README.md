# kochu-apis
🌱 Life in the form of JSON

## Location API

The location API generates geographic information from raw location data.

### How it works

1. **Input**: `data/location.raw.json` (written by iPhone Shortcut, contains timestamp, lat, lon)
2. **Generator**: TypeScript script (`src/location/build-location.ts`) that:
   - Reads raw location data
   - Reverse geocodes coordinates using OpenStreetMap Nominatim API to get country and city
   - Computes timezone using `tz-lookup` (offline)
   - Generates flag emoji from country code
3. **Output**: `api/location.json` (public API endpoint for GitHub Pages)

### Running locally

```bash
npm install
npm run build:location
```

This will compile TypeScript and run the location generator to update `api/location.json`.

### Output schema

```json
{
  "updatedAt": "2026-01-17T20:25:03.000Z",
  "country": "United States",
  "city": "State College",
  "timeZone": "America/New_York",
  "flag": "🇺🇸"
}
```
