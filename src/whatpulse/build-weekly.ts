import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type Counters = { keys: number; clicks: number; scrolls: number; uptimeSeconds: number };

type Snapshot = {
  capturedAt: string;
  source: string;
  counters: Counters;
};

type WhatPulseJson = {
  updatedAt?: string;
  source?: string;
  totals?: Partial<Record<keyof Counters, number | null>>;
  unpulsed?: Partial<Record<keyof Counters, number | null>> | null;
};

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function getCounters(api: WhatPulseJson): Counters {
  const prefer = api.unpulsed ?? api.totals ?? {};
  const keys = toNumber(prefer.keys);
  const clicks = toNumber(prefer.clicks);
  const scrolls = toNumber(prefer.scrolls);
  const uptimeSeconds = toNumber(prefer.uptimeSeconds);
  if (keys == null || clicks == null || scrolls == null || uptimeSeconds == null) {
    throw new Error(
      'api/whatpulse.json missing counters. Prefer unpulsed; fallback totals. Need keys, clicks, scrolls, uptimeSeconds.'
    );
  }
  return { keys, clicks, scrolls, uptimeSeconds };
}

function delta(prev: Counters, current: Counters): Counters {
  return {
    keys: Math.max(0, current.keys - prev.keys),
    clicks: Math.max(0, current.clicks - prev.clicks),
    scrolls: Math.max(0, current.scrolls - prev.scrolls),
    uptimeSeconds: Math.max(0, current.uptimeSeconds - prev.uptimeSeconds)
  };
}

export async function main(): Promise<void> {
  const projectRoot = join(__dirname, '../..');
  const apiPath = join(projectRoot, 'api', 'whatpulse.json');
  const snapshotsPath = join(projectRoot, 'raw-data', 'whatpulse-weekly-snapshots.json');
  const weeklyPath = join(projectRoot, 'api', 'whatpulse-weekly.json');

  let apiRaw: string;
  try {
    apiRaw = await readFile(apiPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('api/whatpulse.json not found. Run whatpulse:build first.');
    }
    throw err;
  }

  let api: WhatPulseJson;
  try {
    api = JSON.parse(apiRaw) as WhatPulseJson;
  } catch {
    throw new Error('api/whatpulse.json is not valid JSON.');
  }

  const counters = getCounters(api);
  const capturedAt = new Date().toISOString();
  const snapshot: Snapshot = {
    capturedAt,
    source: 'whatpulse-client-api',
    counters
  };

  let snapshots: Snapshot[] = [];
  try {
    const raw = await readFile(snapshotsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) snapshots = parsed as Snapshot[];
  } catch {
    // ENOENT or invalid JSON: keep []
  }

  snapshots.push(snapshot);
  await mkdir(dirname(snapshotsPath), { recursive: true });
  await writeFile(snapshotsPath, JSON.stringify(snapshots, null, 2) + '\n', 'utf-8');

  const updatedAt = capturedAt;
  const source = 'whatpulse-client-api';
  const window = 'weekly';

  if (snapshots.length < 2) {
    await mkdir(dirname(weeklyPath), { recursive: true });
    const output = {
      updatedAt,
      source,
      window,
      range: null as string | null,
      counters: null as Counters | null,
      note: 'Not enough history yet. Run again next week to compute deltas.' as string | null
    };
    await writeFile(weeklyPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
    console.log('Wrote api/whatpulse-weekly.json (no delta yet; run again next week).');
    return;
  }

  const prev = snapshots[snapshots.length - 2];
  const current = snapshots[snapshots.length - 1];
  const range = `${prev.capturedAt}/${current.capturedAt}`;
  const countersDelta = delta(prev.counters, current.counters);

  await mkdir(dirname(weeklyPath), { recursive: true });
  const output = {
    updatedAt,
    source,
    window,
    range,
    counters: countersDelta,
    note: null as string | null
  };
  await writeFile(weeklyPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log('Wrote api/whatpulse-weekly.json');
}

const isMain = process.argv[1] && __filename === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
