import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { waitForPostLoginReady } from './readiness';

export type Credentials = { email: string; password: string };

const FALLBACK_CREDS: Credentials[] = [
  { email: process.env.E2E_EMAIL || 'leagueadmin@leagueos.local', password: process.env.E2E_PASSWORD || 'LeagueAdmin@123' },
  { email: process.env.E2E_ADMIN_EMAIL || 'leagueadmin@leagueos.local', password: process.env.E2E_ADMIN_PASSWORD || 'LeagueAdmin@123' },
  { email: process.env.E2E_UI_EMAIL || 'leagueadmin@leagueos.local', password: process.env.E2E_UI_PASSWORD || 'LeagueAdmin@123' },
  { email: 'enosh_fvma_badminton_club@leagueos.local', password: 'Recorder@123' },
  { email: 'fvma-clubAdmin@leagueos.local', password: 'Admin@123' },
];

function dedupeCreds(creds: Credentials[]) {
  const seen = new Set<string>();
  return creds.filter((c) => {
    const k = `${c.email}::${c.password}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function getCandidateCreds(extra: Credentials[] = []): Credentials[] {
  return dedupeCreds([...extra, ...FALLBACK_CREDS]);
}

export async function loginWithAnyCredential(page: Page, candidates: Credentials[] = getCandidateCreds()) {
  let lastErr: unknown;
  const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
  for (const creds of candidates) {
    await page.goto(baseUrl);

    // Already authenticated via storageState.
    if (!(await page.getByLabel('Email').isVisible().catch(() => false))) {
      await waitForPostLoginReady(page, 6_000);
      return creds;
    }

    await page.getByLabel('Email').fill(creds.email);
    await page.getByPlaceholder('Enter your password').fill(creds.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    try {
      await waitForPostLoginReady(page, 12_000);
      return creds;
    } catch (err) {
      lastErr = err;
      // If sign-in failed, stay deterministic by continuing with next candidate.
    }
  }

  throw new Error(`Unable to login with any known E2E credentials. Last error: ${String(lastErr)}`);
}

let cachedApiCreds: Credentials | null = null;

export async function apiLoginWithAnyCredential(request: APIRequestContext, candidates: Credentials[] = getCandidateCreds()) {
  let lastStatus = 0;
  let lastBody = '';
  const apiBase = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';

  const ordered = cachedApiCreds
    ? [cachedApiCreds, ...candidates.filter((c) => c.email !== cachedApiCreds!.email || c.password !== cachedApiCreds!.password)]
    : candidates;

  for (const creds of ordered) {
    const res = await request.post(`${apiBase}/auth/login`, { data: creds });
    if (res.ok()) {
      const json = (await res.json()) as { token: string; club_id: number };
      expect(json.token).toBeTruthy();
      expect(typeof json.club_id).toBe('number');
      cachedApiCreds = creds;
      return { ...json, creds };
    }
    lastStatus = res.status();
    lastBody = await res.text().catch(() => '');

    // Do not burst through fallback list on server-side login rate-limits.
    if (lastStatus === 429) break;
  }

  throw new Error(`API login failed for known E2E credentials. Last status=${lastStatus}, body=${lastBody.slice(0, 300)}`);
}
