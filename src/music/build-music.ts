import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IGNORED_ARTISTS = new Set(['1raj', 'rasraj ji maharaj']);

type LastFmImage = {
  ['#text']?: string;
  size?: string;
};

type LastFmArtist = {
  name?: string;
  playcount?: string;
  image?: LastFmImage[];
};

type LastFmTopArtistsResponse = {
  topartists?: {
    artist?: LastFmArtist[] | LastFmArtist;
  };
  error?: number;
  message?: string;
};

type MusicArtist = {
  name: string;
  playcount: number;
  image: string | null;
};

type MusicOutput = {
  updatedAt: string;
  topArtists: MusicArtist[];
};

function normalizeWhitespace(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

function normalizeArtistName(name: string): string {
  return normalizeWhitespace(name).toLowerCase();
}

function pickBestImage(images: LastFmImage[] | undefined): string | null {
  if (!images || images.length === 0) return null;

  const bySize = new Map<string, string>();
  for (const img of images) {
    const url = normalizeWhitespace(img['#text'] || '');
    const size = normalizeWhitespace(img.size || '').toLowerCase();
    if (url) {
      if (size) bySize.set(size, url);
    }
  }

  const preferred = ['mega', 'extralarge', 'large', 'medium', 'small'];
  for (const size of preferred) {
    const url = bySize.get(size);
    if (url) return url;
  }

  // Fallback to any non-empty image URL
  for (const img of images) {
    const url = normalizeWhitespace(img['#text'] || '');
    if (url) return url;
  }

  return null;
}

async function fetchTopArtists(params: { apiKey: string; user: string }): Promise<LastFmArtist[]> {
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  url.searchParams.set('method', 'user.gettopartists');
  url.searchParams.set('user', params.user);
  url.searchParams.set('api_key', params.apiKey);
  url.searchParams.set('period', '7day');
  url.searchParams.set('limit', '50');
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Last.fm request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as LastFmTopArtistsResponse;
  if (typeof data.error === 'number') {
    throw new Error(`Last.fm API error ${data.error}: ${data.message || 'Unknown error'}`);
  }

  const artist = data.topartists?.artist;
  if (!artist) return [];
  return Array.isArray(artist) ? artist : [artist];
}

async function main() {
  const apiKey = process.env.LASTFM_API_KEY;
  const user = process.env.LASTFM_USER;

  if (!apiKey || !normalizeWhitespace(apiKey)) {
    console.error('Missing env var: LASTFM_API_KEY');
    process.exit(1);
  }
  if (!user || !normalizeWhitespace(user)) {
    console.error('Missing env var: LASTFM_USER');
    process.exit(1);
  }

  const projectRoot = join(__dirname, '../..');
  const outputPath = join(projectRoot, 'api/music.json');

  const rawArtists = await fetchTopArtists({ apiKey: normalizeWhitespace(apiKey), user: normalizeWhitespace(user) });

  const filtered = rawArtists
    .map((a) => {
      const name = normalizeWhitespace(a.name || '');
      const playcountNum = Number.parseInt(normalizeWhitespace(a.playcount || ''), 10);
      if (!name) return null;
      if (Number.isNaN(playcountNum)) return null;
      if (IGNORED_ARTISTS.has(normalizeArtistName(name))) return null;
      return {
        name,
        playcount: playcountNum,
        image: pickBestImage(a.image),
      } satisfies MusicArtist;
    })
    .filter((a): a is MusicArtist => a !== null)
    .slice(0, 15);

  const output: MusicOutput = {
    updatedAt: new Date().toISOString(),
    topArtists: filtered,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`Wrote api/music.json with ${filtered.length} artists`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
