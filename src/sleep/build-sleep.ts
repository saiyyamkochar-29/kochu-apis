import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parse a single duration line into seconds.
 * - Only digits (e.g. "16") → seconds (ss)
 * - M:SS or MM:SS (e.g. "1:20", "3:16") → minutes and seconds
 * - H:MM:SS → hours, minutes, seconds
 * Returns null if unparseable.
 */
function parseDurationLine(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':');
  if (parts.length === 1) {
    const n = parseInt(parts[0], 10);
    if (Number.isNaN(n) || n < 0) return null;
    return n; // seconds only
  }
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseInt(parts[1], 10);
    if (Number.isNaN(m) || Number.isNaN(s) || m < 0 || s < 0 || s >= 60) return null;
    return m * 60 + s; // minutes:seconds
  }
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseInt(parts[2], 10);
    if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s) || h < 0 || m < 0 || m >= 60 || s < 0 || s >= 60) return null;
    return h * 3600 + m * 60 + s;
  }
  return null;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

async function main() {
  const projectRoot = join(__dirname, '../..');
  const rawPath = join(projectRoot, 'raw-data', 'sleep-raw');

  let raw: string;
  try {
    raw = await readFile(rawPath, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error('raw-data/sleep-raw is missing. Create the file and add one duration per line.');
    } else {
      console.error('Failed to read raw-data/sleep-raw:', msg);
    }
    process.exit(1);
  }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let totalSeconds = 0;
  for (const line of lines) {
    const sec = parseDurationLine(line);
    if (sec === null) {
      console.warn('Unparseable duration line (ignored):', JSON.stringify(line));
      continue;
    }
    totalSeconds += sec;
  }

  const segments = lines.length;

  const sleepMinutes = Math.round(totalSeconds / 60);
  const sleepHours = Math.round((totalSeconds / 3600) * 100) / 100;

  const hours = Math.floor(totalSeconds / 3600);
  const remainder = totalSeconds % 3600;
  const minutes = Math.floor(remainder / 60);
  const seconds = remainder % 60;

  const hhmm = `${hours}:${pad2(minutes)}`;
  const hhmmss = `${hours}:${pad2(minutes)}:${pad2(seconds)}`;

  const output = {
    updatedAt: new Date().toISOString(),
    segments,
    sleepSeconds: totalSeconds,
    sleepMinutes,
    sleepHours,
    detailed: {
      hours,
      minutes,
      seconds,
      hhmm,
      hhmmss
    }
  };

  const outputPath = join(projectRoot, 'api', 'sleep.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`Wrote api/sleep.json (${segments} segments, ${output.detailed.hhmmss} total)`);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
