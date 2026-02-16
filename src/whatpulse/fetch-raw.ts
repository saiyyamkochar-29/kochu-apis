import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function safeSnippet(text: string, maxLen: number = 200): string {
  const s = String(text).trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '...';
}

export async function main(): Promise<void> {
  const baseUrl = (process.env.WHATPULSE_BASE_URL || 'http://localhost:3490').replace(/\/$/, '');
  const url = `${baseUrl}/v1/all-stats`;

  const res = await fetch(url);
  const responseText = await res.text();

  if (!res.ok) {
    console.error(`WhatPulse request failed: HTTP ${res.status} ${res.statusText}.`);
    console.error('Response snippet (no secrets):', safeSnippet(responseText));
    process.exit(1);
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error('WhatPulse response was not valid JSON.');
    console.error('Response snippet:', safeSnippet(responseText));
    process.exit(1);
  }

  const projectRoot = join(__dirname, '../..');
  const rawPath = join(projectRoot, 'raw-data', 'whatpulse-raw.json');

  const rawOutput = {
    _fetchedAt: new Date().toISOString(),
    _source: 'whatpulse-client-api',
    data
  };

  await mkdir(dirname(rawPath), { recursive: true });
  await writeFile(rawPath, JSON.stringify(rawOutput, null, 2) + '\n', 'utf-8');
  console.log('Wrote raw-data/whatpulse-raw.json');
}

const isMain = process.argv[1] && __filename === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
