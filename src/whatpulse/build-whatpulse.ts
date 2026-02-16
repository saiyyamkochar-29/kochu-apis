import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type WhatPulseOutput = {
  updatedAt: string;
  source: 'whatpulse-client-api';
  totals: {
    keys: number | null;
    clicks: number | null;
    scrolls: number | null;
    uptimeSeconds: number | null;
  };
  unpulsed: {
    keys: number | null;
    clicks: number | null;
    scrolls: number | null;
    uptimeSeconds: number | null;
  } | null;
  debug?: {
    topLevelKeys: string[];
    detectedPaths: Record<string, string | null>;
  };
};

type NumericField = 'keys' | 'clicks' | 'scrolls' | 'uptimeSeconds';

const FIELD_PATTERNS: Record<NumericField, string[]> = {
  keys: ['keys', 'keycount', 'keystrokes'],
  clicks: ['clicks', 'mouseclicks'],
  scrolls: ['scrolls', 'scrollcount', 'mousescrolls'],
  uptimeSeconds: ['uptime', 'uptimeseconds', 'seconds']
};

const TOTALS_PATH_HINTS = ['totals', 'total', 'accounttotals'];
const UNPULSED_PATH_HINTS = ['unpulsed', 'unpulse', 'pending'];

interface Candidate {
  value: number;
  path: string;
  pathLower: string;
  section: 'totals' | 'unpulsed' | 'none';
}

function pathScore(pathLower: string, hints: string[]): number {
  let score = 0;
  for (const h of hints) {
    if (pathLower.includes(h)) score += 10;
  }
  return score;
}

function collectCandidates(
  obj: unknown,
  path: string,
  pathLower: string,
  field: NumericField,
  patterns: string[],
  acc: Candidate[]
): void {
  if (obj === null || obj === undefined) return;

  if (typeof obj === 'number' && Number.isFinite(obj)) {
    const key = path.split('/').pop()?.toLowerCase().replace(/\s+/g, '') ?? '';
    if (patterns.some((p) => key.includes(p) || p.includes(key))) {
      const section: Candidate['section'] = pathLower.includes('unpulse') || pathLower.includes('pending')
        ? 'unpulsed'
        : pathLower.includes('total')
          ? 'totals'
          : 'none';
      acc.push({ value: obj, path, pathLower, section });
    }
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => collectCandidates(item, `${path}/${i}`, pathLower, field, patterns, acc));
    return;
  }

  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const nextPath = path ? `${path}/${k}` : k;
      const nextLower = (pathLower + '/' + k.toLowerCase()).replace(/\s+/g, '');
      collectCandidates(v, nextPath, nextLower, field, patterns, acc);
    }
  }
}

function pickBest(candidates: Candidate[], section: 'totals' | 'unpulsed'): Candidate | null {
  const filtered = candidates.filter((c) => (section === 'totals' ? c.section === 'totals' : c.section === 'unpulsed'));
  if (filtered.length === 0) {
    const any = candidates.filter((c) => c.section === 'none');
    if (section === 'totals') {
      const totalsScore = (c: Candidate) => pathScore(c.pathLower, TOTALS_PATH_HINTS);
      const byTotals = [...candidates].sort((a, b) => totalsScore(b) - totalsScore(a));
      return byTotals[0] ?? null;
    }
    const unpulsedScore = (c: Candidate) => pathScore(c.pathLower, UNPULSED_PATH_HINTS);
    const byUnpulsed = [...candidates].sort((a, b) => unpulsedScore(b) - unpulsedScore(a));
    return byUnpulsed[0] ?? null;
  }
  const hints = section === 'totals' ? TOTALS_PATH_HINTS : UNPULSED_PATH_HINTS;
  filtered.sort((a, b) => pathScore(b.pathLower, hints) - pathScore(a.pathLower, hints));
  return filtered[0] ?? null;
}

function extractSection(
  data: unknown,
  section: 'totals' | 'unpulsed'
): { keys: number | null; clicks: number | null; scrolls: number | null; uptimeSeconds: number | null } {
  const result = { keys: null as number | null, clicks: null as number | null, scrolls: null as number | null, uptimeSeconds: null as number | null };
  const fields: NumericField[] = ['keys', 'clicks', 'scrolls', 'uptimeSeconds'];
  for (const field of fields) {
    const acc: Candidate[] = [];
    collectCandidates(data, '', '', field, FIELD_PATTERNS[field], acc);
    const best = pickBest(acc, section);
    if (best) (result as Record<NumericField, number | null>)[field] = best.value;
  }
  return result;
}

export async function main(): Promise<void> {
  const projectRoot = join(__dirname, '../..');
  const rawPath = join(projectRoot, 'raw-data', 'whatpulse-raw.json');

  let raw: string;
  try {
    raw = await readFile(rawPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error('raw-data/whatpulse-raw.json not found. Run whatpulse:fetch first.');
    } else {
      console.error('Failed to read raw-data/whatpulse-raw.json:', err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }

  let parsed: { data?: unknown; _fetchedAt?: string };
  try {
    parsed = JSON.parse(raw) as { data?: unknown; _fetchedAt?: string };
  } catch {
    console.error('raw-data/whatpulse-raw.json is not valid JSON.');
    process.exit(1);
  }

  const data = parsed.data ?? parsed;
  const topLevelKeys = typeof data === 'object' && data !== null && !Array.isArray(data) ? Object.keys(data as object) : [];

  const totals = extractSection(data, 'totals');
  const unpulsedSection = extractSection(data, 'unpulsed');
  const hasUnpulsed =
    unpulsedSection.keys !== null ||
    unpulsedSection.clicks !== null ||
    unpulsedSection.scrolls !== null ||
    unpulsedSection.uptimeSeconds !== null;

  const detectedPaths: Record<string, string | null> = {};
  const fields: NumericField[] = ['keys', 'clicks', 'scrolls', 'uptimeSeconds'];
  for (const section of ['totals', 'unpulsed'] as const) {
    for (const field of fields) {
      const acc: Candidate[] = [];
      collectCandidates(data, '', '', field, FIELD_PATTERNS[field], acc);
      const best = pickBest(acc, section);
      const key = section === 'totals' ? `totals.${field}` : `unpulsed.${field}`;
      detectedPaths[key] = best ? best.path : null;
    }
  }

  const output: WhatPulseOutput = {
    updatedAt: new Date().toISOString(),
    source: 'whatpulse-client-api',
    totals,
    unpulsed: hasUnpulsed ? unpulsedSection : null,
    debug: {
      topLevelKeys,
      detectedPaths
    }
  };

  const apiPath = join(projectRoot, 'api', 'whatpulse.json');
  await mkdir(dirname(apiPath), { recursive: true });
  await writeFile(apiPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log('Wrote api/whatpulse.json');
}

const isMain = process.argv[1] && __filename === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
