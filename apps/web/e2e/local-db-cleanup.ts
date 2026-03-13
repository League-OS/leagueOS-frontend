import { existsSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export function runLocalDbCleanup(): void {
  const enabled = boolFromEnv('E2E_LOCAL_DB_CLEANUP', true);
  if (!enabled) return;

  const defaultApiRepoPath = path.resolve(__dirname, '../../../../leagueOS-api');
  const apiRepoPath = process.env.E2E_API_REPO_PATH || defaultApiRepoPath;
  const cleanupScriptPath = path.join(apiRepoPath, 'scripts', 'cleanup_local_db_for_e2e.py');
  if (!existsSync(cleanupScriptPath)) {
    console.warn(`[e2e] Local DB cleanup skipped: script not found at ${cleanupScriptPath}`);
    return;
  }

  const pythonCmd = process.env.E2E_CLEANUP_PYTHON || 'python3';
  const keepSeasonName = process.env.E2E_KEEP_SEASON_NAME || 'FVMA Spring League 2026';
  const clubId = process.env.E2E_CLEANUP_CLUB_ID || '1';
  const keepSessionId = process.env.E2E_KEEP_SESSION_ID;
  const args = ['-m', 'scripts.cleanup_local_db_for_e2e', '--club-id', clubId, '--keep-season-name', keepSeasonName];
  if (keepSessionId) {
    args.push('--keep-session-id', keepSessionId);
  }

  const result = spawnSync(pythonCmd, args, {
    cwd: apiRepoPath,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`[e2e] Local DB cleanup failed with exit code ${result.status}`);
  }
}

