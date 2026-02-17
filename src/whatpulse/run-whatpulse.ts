import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { main as fetchRawMain } from './fetch-raw.js';
import { main as buildWhatPulseMain } from './build-whatpulse.js';
import { main as buildWeeklyMain } from './build-weekly.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function run(cmd: string, cwd: string): void {
  execSync(cmd, {
    cwd,
    shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    stdio: 'inherit'
  });
}

function tryRun(cmd: string, cwd: string): boolean {
  try {
    run(cmd, cwd);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const projectRoot = join(__dirname, '../..');

  // 1) Pull FIRST (before generating files)
  // If the working tree isn't clean, stash it temporarily so pull can succeed.
  const isClean = tryRun('git diff --quiet', projectRoot) && tryRun('git diff --cached --quiet', projectRoot);
  const hadLocalChanges = !isClean;

  if (hadLocalChanges) {
    console.log('Working tree not clean, stashing changes before pull...');
    run('git stash push -u -m "autostash: whatpulse runner"', projectRoot);
  }

  // Keep branch up to date before generating outputs
  run('git pull --rebase', projectRoot);

  if (hadLocalChanges) {
    console.log('Re-applying stashed changes...');
    // If this conflicts, it will throw and we'll stop (safer than pushing a mess)
    run('git stash pop', projectRoot);
  }

  // 2) Generate outputs
  await fetchRawMain();
  await buildWhatPulseMain();
  await buildWeeklyMain();

  // 3) Stage only the files we care about
  run(
    'git add raw-data/whatpulse-raw.json api/whatpulse.json raw-data/whatpulse-weekly-snapshots.json api/whatpulse-weekly.json',
    projectRoot
  );

  // 4) If nothing staged, exit
  const noStagedChanges = tryRun('git diff --staged --quiet', projectRoot);
  if (noStagedChanges) {
    console.log('No changes to commit');
    return;
  }

  // 5) Commit + push (NO pull after commit)
  run('git config user.name "Kochu Pulse Bot"', projectRoot);
  run('git config user.email "local-pulse-bot@users.noreply.github.com"', projectRoot);
  run('git commit -m "📈 WhatPulse stats updated via Kochu Pulse Bot"', projectRoot);
  

  run('git push', projectRoot);
  console.log('Committed and pushed.');
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
