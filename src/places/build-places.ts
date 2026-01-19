import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Place {
  city: string;
  region: string;
  country: string;
}

interface RawHome {
  city: string;
  region?: string;
  state?: string;
  country: string;
}

interface RawPlaces {
  home: RawHome;
  places: Place[];
}

interface PlaceWithKey extends Place {
  key: string;
}

interface PlacesOutput {
  updatedAt: string;
  home: Place;
  count: number;
  places: PlaceWithKey[];
}

/**
 * Normalize a home object, converting state to region if needed
 */
function normalizeHome(rawHome: RawHome): Place {
  return {
    city: rawHome.city.trim(),
    region: (rawHome.region || rawHome.state || '').trim(),
    country: rawHome.country.trim(),
  };
}

/**
 * Normalize a place by trimming whitespace and creating a dedupe key
 */
function normalizePlace(place: Place): { normalized: Place; key: string } {
  const normalized: Place = {
    city: place.city.trim(),
    region: place.region.trim(),
    country: place.country.trim(),
  };

  // Create stable dedupe key using lowercase
  const key = `${normalized.city.toLowerCase()}|${normalized.region.toLowerCase()}|${normalized.country.toLowerCase()}`;

  return { normalized, key };
}

/**
 * Sort places by city, then region, then country (case-insensitive)
 */
function sortPlaces(places: PlaceWithKey[]): PlaceWithKey[] {
  return [...places].sort((a, b) => {
    const cityCompare = a.city.toLowerCase().localeCompare(b.city.toLowerCase());
    if (cityCompare !== 0) return cityCompare;

    const regionCompare = a.region.toLowerCase().localeCompare(b.region.toLowerCase());
    if (regionCompare !== 0) return regionCompare;

    return a.country.toLowerCase().localeCompare(b.country.toLowerCase());
  });
}

function main() {
  const projectRoot = join(__dirname, '../..');
  const rawPlacesPath = join(projectRoot, 'data/places.raw.json');
  const outputPath = join(projectRoot, 'api/places.json');

  // Read raw places data
  let rawData: RawPlaces;
  try {
    const rawContent = readFileSync(rawPlacesPath, 'utf-8');
    rawData = JSON.parse(rawContent);
  } catch (error) {
    console.error(`Failed to read ${rawPlacesPath}:`, error);
    process.exit(1);
  }

  // Normalize home (handles both state and region fields)
  const home = normalizeHome(rawData.home);

  // Normalize and dedupe places
  const seenKeys = new Set<string>();
  const placesWithKeys: PlaceWithKey[] = [];

  for (const place of rawData.places) {
    const { normalized, key } = normalizePlace(place);

    // Skip if already seen
    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    placesWithKeys.push({
      ...normalized,
      key,
    });
  }

  // Sort places
  const sortedPlaces = sortPlaces(placesWithKeys);

  // Build output object
  const output: PlacesOutput = {
    updatedAt: new Date().toISOString(),
    home,
    count: sortedPlaces.length,
    places: sortedPlaces,
  };

  // Write output file with 2-space indentation and trailing newline
  const outputJson = JSON.stringify(output, null, 2) + '\n';
  writeFileSync(outputPath, outputJson, 'utf-8');

  console.log(`Successfully generated ${outputPath}`);
  console.log(JSON.stringify(output, null, 2));
}

main();
