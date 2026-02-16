import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

const BASE_URL = 'https://saiyyamkochar-29.github.io/kochu-apis';

type EndpointInfo = {
  name: string;
  path: string;
  url: string;
  health: 'ok' | 'error';
  lastUpdated: string | null;
};

function safeSnippet(text: string, maxLen = 200): string {
  const s = String(text).trim();
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '...';
}

function extractLastUpdated(obj: any): string | null {
  const candidates = [obj?.updatedAt, obj?.lastUpdated, obj?.last_updated];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

function buildStatusMarkdown(updatedAt: string, endpoints: EndpointInfo[]) {
  const total = endpoints.length;
  const ok = endpoints.filter((e) => e.health === 'ok').length;
  const error = total - ok;

  const lines: string[] = [];
  lines.push('### API Status');
  lines.push(`- Index: ${BASE_URL}/api.json`);
  lines.push(`- Last updated: ${updatedAt}`);
  lines.push(`- Health: ${ok}/${total} OK, ${error} errors`);
  lines.push('');
  lines.push('Endpoints:');
  for (const e of endpoints) {
    lines.push(`- [${e.name}](/kochu-apis${e.path}) • ${e.health} • ${e.lastUpdated ?? 'null'}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function updateReadme(readmePath: string, statusMd: string) {
  const START = '<!-- API_STATUS_START -->';
  const END = '<!-- API_STATUS_END -->';

  let readme = await readFile(readmePath, 'utf-8');

  // If markers don’t exist, insert them right after the Live API line.
  if (!readme.includes(START) || !readme.includes(END)) {
    const liveApiLine = '**Live API:** `https://saiyyamkochar-29.github.io/kochu-apis/api.json`';
    const idx = readme.indexOf(liveApiLine);
    if (idx === -1) {
      throw new Error('Could not find Live API line in README.md to insert status section.');
    }
    const insertAt = idx + liveApiLine.length;
    readme =
      readme.slice(0, insertAt) +
      '\n\n' +
      START +
      '\n' +
      END +
      '\n' +
      readme.slice(insertAt);
  }

  const before = readme.split(START)[0];
  const after = readme.split(END)[1];

  const next =
    before +
    START +
    '\n' +
    statusMd +
    '\n' +
    END +
    after;

  await writeFile(readmePath, next, 'utf-8');
}

async function main() {
  const projectRoot = process.cwd();
  const apiDir = join(projectRoot, 'api');
  const readmePath = join(projectRoot, 'README.md');

  const files = await readdir(apiDir);
  const jsonFiles = files
    .filter((f) => extname(f).toLowerCase() === '.json')
    .filter((f) => f !== 'index.json');

  const endpoints: EndpointInfo[] = [];

  for (const file of jsonFiles) {
    const filePath = join(apiDir, file);
    const name = basename(file, '.json');
    const relPath = `/api/${file}`;

    try {
      const text = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(text);
      endpoints.push({
        name,
        path: relPath,
        url: `${BASE_URL}${relPath}`,
        health: 'ok',
        lastUpdated: extractLastUpdated(parsed)
      });
    } catch (e) {
      endpoints.push({
        name,
        path: relPath,
        url: `${BASE_URL}${relPath}`,
        health: 'error',
        lastUpdated: null
      });
      console.error(`Warning: failed to parse ${file}:`, safeSnippet((e as Error)?.message ?? e));
    }
  }

  endpoints.sort((a, b) => a.name.localeCompare(b.name));

  const updatedAt = new Date().toISOString();
  const indexObj = {
    updatedAt,
    baseUrl: BASE_URL,
    summary: {
      total: endpoints.length,
      ok: endpoints.filter((e) => e.health === 'ok').length,
      error: endpoints.filter((e) => e.health === 'error').length
    },
    endpoints
  };

  await writeFile(join(projectRoot, 'api.json'), JSON.stringify(indexObj, null, 2) + '\n', 'utf-8');
  await writeFile(join(apiDir, 'index.json'), JSON.stringify(indexObj, null, 2) + '\n', 'utf-8');

  const statusMd = buildStatusMarkdown(updatedAt, endpoints);
  await updateReadme(readmePath, statusMd);

  console.log('Wrote api.json, api/index.json, and updated README.md');
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
