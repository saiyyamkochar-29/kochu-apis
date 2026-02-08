import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import XboxWebApiClient from 'xbox-webapi';
import { applyEnvRefreshToken, setUserXuid, type XboxClient } from './xbox-auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEBUG = process.env.DEBUG_XBOX === '1' || process.env.DEBUG_XBOX === 'true';

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

/** Preferred image type order (lowercase). */
const PREFERRED_IMAGE_TYPES = ['tile', 'displayimage', 'poster', 'boxart', 'hero', 'screenshot'];

/**
 * Collect candidate image URLs from a title record. Handles:
 * - title.images as array of { url, type }
 * - title.displayImage, title.image, title.boxArt, title.poster, title.tile, title.background (string or object with url)
 */
function collectImageCandidates(title: Record<string, unknown>): { url: string; type?: string }[] {
  const candidates: { url: string; type?: string }[] = [];

  const push = (url: unknown, type?: string) => {
    const s = typeof url === 'string' ? url : (url && typeof url === 'object' && 'url' in url && typeof (url as { url: unknown }).url === 'string' ? (url as { url: string }).url : null);
    if (s && normalizeWhitespace(s)) candidates.push({ url: normalizeWhitespace(s), type });
  };

  const arr = title.images;
  if (Array.isArray(arr)) {
    for (const item of arr) {
      if (item && typeof item === 'object' && 'url' in item) push((item as { url: unknown }).url, (item as { type?: string }).type);
    }
  }

  const singleFields = ['displayImage', 'image', 'boxArt', 'poster', 'tile', 'background'] as const;
  for (const key of singleFields) {
    const v = title[key];
    if (v !== undefined && v !== null) push(v, key);
  }

  return candidates;
}

function pickBestImage(title: Record<string, unknown>): string | null {
  const candidates = collectImageCandidates(title);
  if (candidates.length === 0) return null;

  const byType = new Map<string, string>();
  for (const c of candidates) {
    const type = (c.type || '').toLowerCase().replace(/\s+/g, ' ');
    if (type) byType.set(type, c.url);
  }

  for (const preferred of PREFERRED_IMAGE_TYPES) {
    const url = byType.get(preferred);
    if (url) return url;
  }

  return candidates[0]?.url ?? null;
}

/** Sanitize a title for debug logging: no tokens, no xuid. */
function sanitizeTitleForDebug(title: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const skip = new Set(['tokens', 'token', 'access_token', 'refresh_token', 'xuid', 'xid']);
  for (const [k, v] of Object.entries(title)) {
    if (skip.has(k.toLowerCase())) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && (v as object).constructor?.name === 'Object') {
      out[k] = sanitizeTitleForDebug(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function main() {
  const refreshToken = process.env.XBOX_REFRESH_TOKEN;
  const xuid = process.env.XBOX_XUID;

  if (!refreshToken || !normalizeWhitespace(refreshToken)) {
    console.error('Missing or empty env var: XBOX_REFRESH_TOKEN');
    console.error('Set XBOX_REFRESH_TOKEN and XBOX_XUID to run this script.');
    process.exit(1);
  }
  if (!xuid || !normalizeWhitespace(xuid)) {
    console.error('Missing or empty env var: XBOX_XUID');
    console.error('Set XBOX_REFRESH_TOKEN and XBOX_XUID to run this script.');
    process.exit(1);
  }

  const clientId = process.env.XBOX_CLIENT_ID || 'dummy';
  const client = (XboxWebApiClient as unknown as (cfg: { clientId: string; clientSecret?: string }) => XboxClient)({
    clientId,
    clientSecret: ''
  });

  applyEnvRefreshToken(client, refreshToken.trim());

  try {
    await client.isAuthenticated();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Authentication failed:', msg);
    console.error('Check that XBOX_REFRESH_TOKEN is valid and not expired. Re-run the OAuth flow if needed.');
    process.exit(1);
  }

  setUserXuid(client, xuid.trim());

  const titlehub = client.getProvider('titlehub') as { getTitleHistory: () => Promise<{ titles?: Record<string, unknown>[]; xuid?: string }> };
  if (!titlehub || typeof titlehub.getTitleHistory !== 'function') {
    console.error('Titlehub provider or getTitleHistory not available; xbox-webapi may have changed.');
    process.exit(1);
  }

  if (DEBUG) console.error('[DEBUG_XBOX] Calling titlehub.getTitleHistory()');

  let rawHistory: { titles?: Record<string, unknown>[]; xuid?: string };
  try {
    rawHistory = await titlehub.getTitleHistory();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Title history request failed:', msg);
    process.exit(1);
  }

  const titles = Array.isArray(rawHistory?.titles) ? rawHistory.titles : [];
  if (DEBUG && titles.length > 0) {
    console.error('[DEBUG_XBOX] First title (sanitized):', JSON.stringify(sanitizeTitleForDebug(titles[0]), null, 2));
  }

  const recentGames: XboxGame[] = titles
    .slice(0, 10)
    .map((title: Record<string, unknown>) => ({
      name: normalizeWhitespace((title.name as string) ?? ''),
      image: pickBestImage(title)
    }))
    .filter((game: XboxGame) => game.name.length > 0);

  const output: XboxOutput = {
    recentGames
  };

  const projectRoot = join(__dirname, '../..');
  const outputPath = join(projectRoot, 'api', 'xbox.json');

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`Wrote api/xbox.json with ${recentGames.length} games`);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
