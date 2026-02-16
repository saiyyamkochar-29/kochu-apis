import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENDPOINT = 'https://api.todoist.com/sync/v9/completed/get_stats';

function safeSnippet(text: string, maxLen: number = 200): string {
  const s = String(text).trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '...';
}

/** Today's date in UTC as YYYY-MM-DD. */
function todayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Return true if date YYYY-MM-DD is inside range "start/end" (inclusive). */
function dateInRange(date: string, range: string): boolean {
  const [start, end] = range.split('/').map((s) => s.trim());
  if (!start || !end) return false;
  return date >= start && date <= end;
}

/** Sum numeric "completed" (or total_completed, count) from items array. */
function sumCompletedFromItems(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  let sum = 0;
  for (const item of items) {
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const v = o.completed ?? o.total_completed ?? o.count ?? o.total;
      if (typeof v === 'number' && Number.isFinite(v)) sum += v;
    }
  }
  return sum;
}

/** Get week range string from a week item (date_range, week_range, range, or similar). */
function getWeekRange(weekItem: Record<string, unknown>): string | null {
  const range =
    weekItem.date_range ?? weekItem.week_range ?? weekItem.range ?? weekItem.week ?? weekItem.dates;
  if (typeof range === 'string') return range;
  return null;
}

async function main(): Promise<void> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token || !String(token).trim()) {
    console.error('Missing or empty TODOIST_API_TOKEN.');
    process.exit(1);
  }

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token.trim()}`
      }
    });
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    const cause = fetchErr instanceof Error && fetchErr.cause ? ` (${(fetchErr.cause as Error).message})` : '';
    throw new Error(`Todoist request failed: ${msg}${cause}`);
  }

  const responseText = await res.text();
  if (!res.ok) {
    console.error(`Todoist request failed: HTTP ${res.status} ${res.statusText}.`);
    console.error('Response snippet:', safeSnippet(responseText));
    process.exit(1);
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error('Todoist response was not valid JSON.');
    console.error('Response snippet:', safeSnippet(responseText));
    process.exit(1);
  }

  const stats = data && typeof data === 'object' && 'stats' in data ? (data as { stats?: unknown }).stats : data;
  const weekItems = stats && typeof stats === 'object' && 'week_items' in stats ? (stats as { week_items?: unknown }).week_items : null;

  if (!Array.isArray(weekItems) || weekItems.length === 0) {
    console.error('Todoist response missing or empty week_items.');
    process.exit(1);
  }

  const today = todayUtc();
  let chosen = weekItems[0] as Record<string, unknown>;
  for (const w of weekItems) {
    const item = w && typeof w === 'object' ? (w as Record<string, unknown>) : null;
    if (!item) continue;
    const range = getWeekRange(item);
    if (range && dateInRange(today, range)) {
      chosen = item;
      break;
    }
  }

  const weekRange = getWeekRange(chosen) ?? '';
  const items = chosen.items ?? chosen.item ?? chosen.projects ?? [];
  const completedThisWeek = sumCompletedFromItems(items);

  const output = {
    updatedAt: new Date().toISOString(),
    source: 'todoist-sync-v9',
    weekRange,
    completedThisWeek
  };

  const projectRoot = join(__dirname, '../..');
  const apiPath = join(projectRoot, 'api', 'todoist.json');
  await mkdir(dirname(apiPath), { recursive: true });
  await writeFile(apiPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log('Wrote api/todoist.json');
}

function formatErr(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause instanceof Error ? ` (${err.cause.message})` : err.cause ? ` (cause: ${String(err.cause)})` : '';
    return `${err.message}${cause}`;
  }
  return String(err);
}

main().catch((err) => {
  console.error('Fatal error:', formatErr(err));
  console.error('Check network access and that TODOIST_API_TOKEN is valid.');
  process.exit(1);
});
