import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XboxWebApiClient } from 'xbox-webapi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type XboxGame = {
  name: string;
  image: string | null;
};

type XboxOutput = {
  recentGames: XboxGame[];
};

function normalizeWhitespace(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

function pickBestImage(images: any[]): string | null {
  if (!images || images.length === 0) return null;

  // Look for different image types, preferring larger/primary ones
  const byType = new Map<string, string>();
  for (const img of images) {
    const url = normalizeWhitespace(img.url || '');
    const type = normalizeWhitespace(img.type || '').toLowerCase();
    if (url) {
      if (type) byType.set(type, url);
    }
  }

  // Preferred image types in order
  const preferred = ['tile', 'poster', 'boxart', 'hero', 'screenshot'];
  for (const type of preferred) {
    const url = byType.get(type);
    if (url) return url;
  }

  // Fallback to any image
  for (const img of images) {
    const url = normalizeWhitespace(img.url || '');
    if (url) return url;
  }

  return null;
}

async function main() {
  const refreshToken = process.env.XBOX_REFRESH_TOKEN;
  const xuid = process.env.XBOX_XUID;

  if (!refreshToken || !normalizeWhitespace(refreshToken)) {
    console.error('Missing env var: XBOX_REFRESH_TOKEN');
    process.exit(1);
  }
  if (!xuid || !normalizeWhitespace(xuid)) {
    console.error('Missing env var: XBOX_XUID');
    process.exit(1);
  }

  const client = XboxWebApiClient({ clientId: '', clientSecret: '' });
  await client.authenticate(refreshToken);

  const titleHubProvider = client.getProvider('titlehub');
  const titleHistory = await titleHubProvider.getTitleHistory(xuid);

  const recentGames: XboxGame[] = (titleHistory.titles || [])
    .slice(0, 10)
    .map((title: any) => ({
      name: normalizeWhitespace(title.name || ''),
      image: pickBestImage(title.images || [])
    }))
    .filter((game: XboxGame) => game.name.length > 0);

  const output: XboxOutput = {
    recentGames
  };

  const projectRoot = join(__dirname, '../..');
  const outputPath = join(projectRoot, 'api/xbox.json');

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`Wrote api/xbox.json with ${recentGames.length} games`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});