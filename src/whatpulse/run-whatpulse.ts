import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { main as fetchRawMain } from './fetch-raw.js';
import { main as buildWhatPulseMain } from './build-whatpulse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function run(cmd: string, options?: { cwd?: string }): void {
  const projectRoot = options?.cwd ?? join(__dirname, '../..');
  execSync(cmd, {
    cwd: projectRoot,
    shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    stdio: 'inherit'
  });
}

async function main(): Promise<void> {
  const projectRoot = join(__dirname, '../..');

  await fetchRawMain();
  await buildWhatPulseMain();

  run('git add raw-data/whatpulse-raw.json api/whatpulse.json', { cwd: projectRoot });

  try {
    run('git diff --staged --quiet', { cwd: projectRoot });
  } catch {
    run('git config user.name "Local Pulse Bot"', { cwd: projectRoot });
    run('git config user.email "local-pulse-bot@users.noreply.github.com"', { cwd: projectRoot });
    run('git commit -m "📈 WhatPulse stats updated via Local Pulse Bot"', { cwd: projectRoot });
    run('git pull --rebase', { cwd: projectRoot });
    run('git push', { cwd: projectRoot });
    console.log('Committed and pushed.');
    return;
  }

  console.log('No changes to commit');
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
