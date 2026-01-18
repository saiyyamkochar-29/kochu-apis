import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface RawLocation {
  timestamp: string;
  lat: number;
  lon: number;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  country?: string;
  country_code?: string;
  [key: string]: string | undefined;
}

interface NominatimResponse {
  address?: NominatimAddress;
}

interface LocationOutput {
  updatedAt: string;
  country: string | null;
  city: string | null;
  timeZone: string | null;
  flag: string | null;
}

/**
 * Convert 2-letter country code to flag emoji
 * Uses Unicode regional indicator symbols (A-Z = U+1F1E6 to U+1F1FF)
 */
function countryCodeToFlag(countryCode: string | undefined): string | null {
  if (!countryCode || countryCode.length !== 2) {
    return null;
  }

  const code = countryCode.toUpperCase();
  const base = 0x1F1E6; // Regional Indicator Symbol Letter A

  try {
    const codePoints = code
      .split('')
      .map(char => base + (char.charCodeAt(0) - 'A'.charCodeAt(0)));
    return String.fromCodePoint(...codePoints);
  } catch {
    return null;
  }
}

/**
 * Extract city name from Nominatim address fields
 * Priority: city > town > village > municipality > county
 */
function extractCity(address: NominatimAddress | undefined): string | null {
  if (!address) {
    return null;
  }

  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    null
  );
}

/**
 * Reverse geocode coordinates using OpenStreetMap Nominatim API
 */
async function reverseGeocode(
  lat: number,
  lon: number
): Promise<{ country: string | null; city: string | null; countryCode: string | null }> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'kochu-apis-location-generator/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as NominatimResponse;
    const address = data.address;

    return {
      country: address?.country || null,
      city: extractCity(address),
      countryCode: address?.country_code || null,
    };
  } catch (error) {
    console.error('Reverse geocoding failed:', error);
    return {
      country: null,
      city: null,
      countryCode: null,
    };
  }
}

/**
 * Get timezone from coordinates using tz-lookup
 */
function getTimeZone(lat: number, lon: number): string | null {
  try {
    return tzLookup(lat, lon);
  } catch (error) {
    console.error('Timezone lookup failed:', error);
    return null;
  }
}

async function main() {
  const projectRoot = join(__dirname, '../..');
  const rawLocationPath = join(projectRoot, 'data/location.raw.json');
  const outputPath = join(projectRoot, 'api/location.json');

  // Read raw location data
  let rawData: RawLocation;
  try {
    const rawContent = readFileSync(rawLocationPath, 'utf-8');
    rawData = JSON.parse(rawContent);
  } catch (error) {
    console.error(`Failed to read ${rawLocationPath}:`, error);
    process.exit(1);
  }

  // Validate lat/lon are numbers
  const { lat, lon } = rawData;
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    console.error('Invalid lat/lon: must be numbers');
    process.exit(1);
  }

  // Reverse geocode to get country and city
  const { country, city, countryCode } = await reverseGeocode(lat, lon);

  // Get timezone
  const timeZone = getTimeZone(lat, lon);

  // Generate flag emoji from country code
  const flag = countryCodeToFlag(countryCode || undefined);

  // Build output object
  const output: LocationOutput = {
    updatedAt: new Date().toISOString(),
    country,
    city,
    timeZone,
    flag,
  };

  // Write output file with 2-space indentation and trailing newline
  const outputJson = JSON.stringify(output, null, 2) + '\n';
  writeFileSync(outputPath, outputJson, 'utf-8');

  console.log(`Successfully generated ${outputPath}`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
function tzLookup(lat: number, lon: number): string | null {
    throw new Error('Function not implemented.');
}

