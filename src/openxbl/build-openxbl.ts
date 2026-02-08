import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OPENXBL_BASE = 'https://xbl.io/api/v2';

type RecentGame = {
  name: string;
  titleId: string;
  lastPlayed: string | null;
  platform: 'pc' | 'xbox' | 'unknown';
  image: string | null;
};

type GamesOutput = {
  updatedAt: string;
  source: 'openxbl';
  recentGames: RecentGame[];
};

function normalizeWhitespace(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

/** Safe snippet for error messages: no secrets, limited length. */
function safeSnippet(text: string, maxLen: number = 200): string {
  const s = String(text).trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '...';
}

/** Collect image URL candidates from a title-like object. */
function collectImageCandidates(obj: Record<string, unknown>): { url: string; type?: string }[] {
  const candidates: { url: string; type?: string }[] = [];
  const push = (url: unknown, type?: string) => {
    const s =
      typeof url === 'string'
        ? url
        : url && typeof url === 'object' && 'url' in url && typeof (url as { url: unknown }).url === 'string'
          ? (url as { url: string }).url
          : null;
    if (s && normalizeWhitespace(s)) candidates.push({ url: normalizeWhitespace(s), type });
  };
  const arr = obj.images ?? obj.Images;
  if (Array.isArray(arr)) {
    for (const item of arr) {
      if (item && typeof item === 'object' && 'url' in item) push((item as { url: unknown }).url, (item as { type?: string }).type);
    }
  }
  for (const key of ['displayImage', 'image', 'boxArt', 'poster', 'tile', 'background']) {
    const v = obj[key];
    if (v !== undefined && v !== null) push(v, key);
  }
  return candidates;
}

const PREFERRED_IMAGE_TYPES = ['tile', 'displayimage', 'poster', 'boxart', 'hero', 'screenshot'];

function pickBestImage(obj: Record<string, unknown>): string | null {
  const candidates = collectImageCandidates(obj);
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

/** Guess platform from device/platform-related fields (case-insensitive). */
function guessPlatform(obj: Record<string, unknown>): 'pc' | 'xbox' | 'unknown' {
  const parts: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === 'string') parts.push(v);
    if (Array.isArray(v)) v.forEach((x) => add(x));
    if (v && typeof v === 'object') Object.values(v).forEach((x) => add(x));
  };
  for (const key of ['devices', 'device', 'platform', 'platforms', 'type', 'titleKind']) {
    if (obj[key] !== undefined) add(obj[key]);
  }
  const combined = parts.join(' ').toLowerCase();
  if (/\b(pc|windows)\b/.test(combined)) return 'pc';
  if (/\b(xbox|scarlett|durango)\b/.test(combined)) return 'xbox';
  return 'unknown';
}

/** Parse lastPlayed from various shapes; return ISO string or null. */
function parseLastPlayed(obj: Record<string, unknown>): string | null {
  const direct =
    obj.lastTimePlayed ??
    obj.lastPlayed ??
    obj.LastPlayed ??
    obj.lastTimePlayedUtc;

  // also handle nested titleHistory.lastTimePlayed
  const nested =
    typeof obj.titleHistory === 'object' && obj.titleHistory !== null
      ? (obj.titleHistory as Record<string, unknown>).lastTimePlayed ??
        (obj.titleHistory as Record<string, unknown>).lastPlayed
      : undefined;

  const v = direct ?? nested;

  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  return null;
}

/** Extract title ID as string. */
function getTitleId(obj: Record<string, unknown>): string {
  const v = obj.titleId ?? obj.TitleId ?? obj.id;
  if (v !== undefined && v !== null) return String(v);
  return '';
}

/** Extract title name. */
function getName(obj: Record<string, unknown>): string {
  const v = obj.name ?? obj.Name ?? obj.displayName ?? obj.titleName ?? '';
  return normalizeWhitespace(String(v ?? ''));
}

/** Normalize a single raw title into our shape; include extra fields for raw debug file. */
function normalizeTitle(raw: Record<string, unknown>): RecentGame & { _raw?: Record<string, unknown> } {
  const name = getName(raw);
  const titleId = getTitleId(raw);
  const lastPlayed = parseLastPlayed(raw);
  const platform = guessPlatform(raw);
  const image = pickBestImage(raw);
  return {
    name,
    titleId,
    lastPlayed,
    platform,
    image,
    _raw: raw
  };
}

/** Extract titles array from OpenXBL response (handles multiple shapes). */
function extractTitles(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== 'object') return [];
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.titles)) return o.titles as Record<string, unknown>[];
  if (Array.isArray(o.Titles)) return o.Titles as Record<string, unknown>[];
  const th = o.titleHistory ?? o.TitleHistory;
  if (th && typeof th === 'object' && Array.isArray((th as Record<string, unknown>).titles)) {
    return (th as Record<string, unknown>).titles as Record<string, unknown>[];
  }
  if (Array.isArray(o)) return o as Record<string, unknown>[];
  return [];
}

async function main() {
  const apiKey = process.env.OPENXBL_API_KEY;
  const xuid = process.env.XBOX_XUID;

  if (!apiKey || !normalizeWhitespace(apiKey)) {
    console.error('Missing or empty OPENXBL_API_KEY. Set the env var and try again.');
    process.exit(1);
  }
  if (!xuid || !normalizeWhitespace(xuid)) {
    console.error('Missing or empty XBOX_XUID. Set the env var and try again.');
    process.exit(1);
  }

  const url = `${OPENXBL_BASE}/player/titleHistory/${encodeURIComponent(xuid.trim())}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Authorization': apiKey.trim(),
      'Accept': 'application/json',
      'Accept-Language': 'en-US',
    }
  });

  const responseText = await res.text();
  if (!res.ok) {
    console.error(`OpenXBL request failed: HTTP ${res.status} ${res.statusText}.`);
    console.error('Response snippet (no secrets):', safeSnippet(responseText));
    process.exit(1);
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error('OpenXBL response was not valid JSON.');
    console.error('Response snippet:', safeSnippet(responseText));
    process.exit(1);
  }

  const rawTitles = extractTitles(data);
  const normalized = rawTitles
    .filter((t) => t && typeof t === 'object')
    .map((t) => normalizeTitle(t as Record<string, unknown>));

  const recentGames: RecentGame[] = normalized.slice(0, 10).map(({ _raw, ...rest }) => rest);

  const rawForFile = {
    _fetchedAt: new Date().toISOString(),
    _xuidUsed: xuid.trim(),
    _titleCount: rawTitles.length,
    titles: normalized.map((n) => ({
      name: n.name,
      titleId: n.titleId,
      lastPlayed: n.lastPlayed,
      platform: n.platform,
      image: n.image,
      _raw: n._raw
    }))
  };

  const gamesOutput: GamesOutput = {
    updatedAt: new Date().toISOString(),
    source: 'openxbl',
    recentGames
  };

  const projectRoot = join(__dirname, '../..');
  const rawPath = join(projectRoot, 'raw-data', 'openxbl-raw.json');
  const apiPath = join(projectRoot, 'api', 'games.json');

  await mkdir(dirname(rawPath), { recursive: true });
  await mkdir(dirname(apiPath), { recursive: true });

  await writeFile(rawPath, JSON.stringify(rawForFile, null, 2) + '\n', 'utf-8');
  await writeFile(apiPath, JSON.stringify(gamesOutput, null, 2) + '\n', 'utf-8');

  console.log(`Wrote raw-data/openxbl-raw.json and api/games.json (${recentGames.length} recent games)`);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
