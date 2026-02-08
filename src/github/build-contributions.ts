import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TZ = 'America/New_York';

/** True if (year, month 1-12, day) is in DST for America/New_York (US rule). */
function isDST(year: number, month: number, day: number): boolean {
  if (month < 3 || month > 11) return false;
  if (month > 3 && month < 11) return true;
  const d = day;
  if (month === 3) {
    const first = new Date(year, 2, 1).getDay();
    const secondSunday = 1 + (7 - first) % 7 + 7;
    return d >= secondSunday;
  }
  const first = new Date(year, 10, 1).getDay();
  const firstSunday = 1 + (7 - first) % 7;
  return d < firstSunday;
}

/** Pad number to 2 digits. */
function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Get the most recent Monday 00:00:00 America/New_York as an ISO string (UTC).
 * "Most recent" means the latest Monday 00:00 ET that has already occurred.
 */
function getLastMondayMidnightET(): { start: string; end: string; weekStart: string; weekEnd: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });
  const parts = fmt.formatToParts(now);
  const get = (name: string) => parts.find((p) => p.type === name)?.value ?? '';
  const year = parseInt(get('year'), 10);
  const month = parseInt(get('month'), 10);
  const day = parseInt(get('day'), 10);
  const weekday = get('weekday');

  const dayOfWeek = weekday === 'Mon' ? 1 : weekday === 'Tue' ? 2 : weekday === 'Wed' ? 3 : weekday === 'Thu' ? 4 : weekday === 'Fri' ? 5 : weekday === 'Sat' ? 6 : 7;
  const daysToMonday = dayOfWeek === 1 ? 0 : dayOfWeek - 1;
  let monDay = day - daysToMonday;
  let monMonth = month;
  let monYear = year;
  if (monDay < 1) {
    monDay += 31;
    monMonth--;
    if (monMonth < 1) {
      monMonth = 12;
      monYear--;
    }
  }

  const offsetHours = isDST(monYear, monMonth, monDay) ? -4 : -5;
  const offsetStr = offsetHours <= 0 ? `-${pad2(Math.abs(offsetHours))}` : `+${pad2(offsetHours)}`;
  const endISO = `${monYear}-${pad2(monMonth)}-${pad2(monDay)}T00:00:00${offsetStr}:00`;
  const endDate = new Date(endISO);

  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 7);
  const startISO = startDate.toISOString();
  const endISOUTC = endDate.toISOString();

  const startY = startDate.getUTCFullYear();
  const startM = pad2(startDate.getUTCMonth() + 1);
  const startD = pad2(startDate.getUTCDate());
  const weekStart = `${startY}-${startM}-${startD}`;

  const sundayDate = new Date(endDate);
  sundayDate.setUTCDate(sundayDate.getUTCDate() - 1);
  const weekEnd = `${sundayDate.getUTCFullYear()}-${pad2(sundayDate.getUTCMonth() + 1)}-${pad2(sundayDate.getUTCDate())}`;

  return { start: startISO, end: endISOUTC, weekStart, weekEnd };
}

type DayEntry = { date: string; count: number };
type WeekEntry = { weekStart: string; weekEnd: string; totalContributions: number; days: DayEntry[] };
type Output = { updatedAt: string; timezone: string; weeks: WeekEntry[] };

const GRAPHQL_QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}
`;

async function fetchContributions(login: string, from: string, to: string, token: string): Promise<WeekEntry> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: GRAPHQL_QUERY,
      variables: { login, from, to }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub GraphQL request failed: ${res.status} ${res.statusText}. ${text}`);
  }

  type GqlResponse = {
    data?: { user?: { contributionsCollection?: { contributionCalendar?: { weeks?: { contributionDays?: { date: string; contributionCount: number }[] }[] } } } };
    errors?: { message: string }[];
  };
  const json = (await res.json()) as GqlResponse;

  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map((e: { message: string }) => e.message).join('; ');
    throw new Error(`GraphQL errors: ${messages}`);
  }

  const user = json.data?.user;
  if (!user) {
    throw new Error('User not found or no data returned.');
  }

  const weeks = user.contributionsCollection?.contributionCalendar?.weeks ?? [];
  const days: DayEntry[] = [];
  let totalContributions = 0;
  for (const w of weeks) {
    for (const d of w.contributionDays ?? []) {
      days.push({ date: d.date, count: d.contributionCount });
      totalContributions += d.contributionCount;
    }
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  const boundaries = getLastMondayMidnightET();
  return {
    weekStart: boundaries.weekStart,
    weekEnd: boundaries.weekEnd,
    totalContributions,
    days
  };
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token || !token.trim()) {
    console.error('Missing or empty GITHUB_TOKEN. Set the env var and try again.');
    process.exit(1);
  }

  const username = process.env.GITHUB_USERNAME?.trim() || 'saiyyamkochar-29';

  const boundaries = getLastMondayMidnightET();
  const weekEntry = await fetchContributions(username, boundaries.start, boundaries.end, token);

  const projectRoot = join(__dirname, '../..');
  const outputPath = join(projectRoot, 'api', 'contributions.json');

  let existing: Output = {
    updatedAt: '',
    timezone: TZ,
    weeks: []
  };

  try {
    const raw = await readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(raw) as Output;
    if (parsed && Array.isArray(parsed.weeks)) {
      existing = parsed;
    }
  } catch {
    // file missing or invalid; use default
  }

  const weekStarts = new Set(existing.weeks.map((w) => w.weekStart));
  if (!weekStarts.has(weekEntry.weekStart)) {
    existing.weeks.push(weekEntry);
    existing.weeks.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }
  existing.updatedAt = new Date().toISOString();
  existing.timezone = TZ;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
  console.log(
    `Wrote api/contributions.json (week ${weekEntry.weekStart}–${weekEntry.weekEnd}, ${weekEntry.totalContributions} contributions)`
  );
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
