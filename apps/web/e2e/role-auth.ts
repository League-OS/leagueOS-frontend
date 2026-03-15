import { expect, type APIRequestContext, type Page } from '@playwright/test';

export type Credentials = { email: string; password: string };
export type ResolvedRole = 'GLOBAL_ADMIN' | 'CLUB_ADMIN' | 'USER';

type LoginResponse = { token: string; club_id: number; role: string };
type ProfileResponse = { role?: string | null; club_role?: string | null };
type ResolvedAuth = { creds: Credentials; login: LoginResponse; profile: ProfileResponse };

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';
const WEB_BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const ROLE_CACHE: Partial<Record<ResolvedRole, ResolvedAuth>> = {};

function dedupeCreds(list: Credentials[]): Credentials[] {
  const seen = new Set<string>();
  const output: Credentials[] = [];
  for (const entry of list) {
    const key = `${entry.email}::${entry.password}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(entry);
  }
  return output;
}

function effectiveRole(profile: ProfileResponse, loginRole: string): ResolvedRole {
  if (String(profile.role || '').toUpperCase() === 'GLOBAL_ADMIN' || String(loginRole).toUpperCase() === 'GLOBAL_ADMIN') {
    return 'GLOBAL_ADMIN';
  }
  if (String(profile.club_role || '').toUpperCase() === 'CLUB_ADMIN') {
    return 'CLUB_ADMIN';
  }
  return 'USER';
}

function roleCandidates(target: ResolvedRole): Credentials[] {
  if (target === 'GLOBAL_ADMIN') {
    return dedupeCreds([
      { email: 'globaladmin@leagueos.local', password: 'GlobalAdmin@123' },
      { email: process.env.E2E_GLOBAL_ADMIN_EMAIL || '', password: process.env.E2E_GLOBAL_ADMIN_PASSWORD || '' },
      { email: process.env.E2E_EMAIL || '', password: process.env.E2E_PASSWORD || '' },
      { email: 'GlobalAdmin@leagueos.local', password: 'GlobalAdmin@123' },
      { email: 'bonythomasv@gmail.com', password: 'GlobalAdmin@123' },
      { email: 'niviljacob@gmail.com', password: 'GlobalAdmin@123' },
    ].filter((entry) => entry.email && entry.password));
  }
  if (target === 'CLUB_ADMIN') {
    return dedupeCreds([
      { email: 'fvma-clubAdmin@leagueos.local', password: 'Admin@123' },
      { email: process.env.E2E_CLUB_ADMIN_EMAIL || '', password: process.env.E2E_CLUB_ADMIN_PASSWORD || '' },
      { email: process.env.E2E_ADMIN_EMAIL || '', password: process.env.E2E_ADMIN_PASSWORD || '' },
      { email: process.env.E2E_UI_EMAIL || '', password: process.env.E2E_UI_PASSWORD || '' },
      { email: 'leagueadmin@leagueos.local', password: 'LeagueAdmin@123' },
    ].filter((entry) => entry.email && entry.password));
  }
  return dedupeCreds([
    { email: 'playerone@leagueos.local', password: 'PlayerOne@123' },
    { email: 'playertwo@leagueos.local', password: 'PlayerTwo@123' },
    { email: process.env.E2E_USER_EMAIL || '', password: process.env.E2E_USER_PASSWORD || '' },
    { email: process.env.E2E_PLAYER_EMAIL || '', password: process.env.E2E_PLAYER_PASSWORD || '' },
    { email: process.env.E2E_RECORDER_EMAIL || '', password: process.env.E2E_RECORDER_PASSWORD || '' },
    { email: 'enosh_fvma_badminton_club@leagueos.local', password: 'Recorder@123' },
  ].filter((entry) => entry.email && entry.password));
}

export async function resolveCredentialForRole(request: APIRequestContext, target: ResolvedRole) {
  const cached = ROLE_CACHE[target];
  if (cached) {
    return cached;
  }

  let lastFailure = 'no-candidates';
  for (const creds of roleCandidates(target)) {
    const loginRes = await request.post(`${API_BASE}/auth/login`, { data: creds });
    if (!loginRes.ok()) {
      lastFailure = `login ${loginRes.status()} for ${creds.email}`;
      if (loginRes.status() === 429) break;
      continue;
    }
    const login = (await loginRes.json()) as LoginResponse;
    const profileRes = await request.get(`${API_BASE}/profile`, {
      headers: { Authorization: `Bearer ${login.token}` },
    });
    if (!profileRes.ok()) {
      lastFailure = `profile ${profileRes.status()} for ${creds.email}`;
      continue;
    }
    const profile = (await profileRes.json()) as ProfileResponse;
    if (effectiveRole(profile, login.role) === target) {
      const resolved = { creds, login, profile };
      ROLE_CACHE[target] = resolved;
      return resolved;
    }
    lastFailure = `role mismatch for ${creds.email}`;
  }
  throw new Error(`Unable to resolve credentials for ${target}. Last failure: ${lastFailure}`);
}

export async function resetUiAuthState(page: Page) {
  await page.goto(WEB_BASE);
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.context().clearCookies();
  await page.goto(WEB_BASE);
}

async function submitLogin(page: Page, creds: Credentials, submitLabel: RegExp) {
  await expect(page.getByLabel('Email')).toBeVisible();
  await page.getByLabel('Email').fill(creds.email);
  await page.getByRole('textbox', { name: /^password/i }).fill(creds.password);
  await page.getByRole('button', { name: submitLabel }).click();
}

export async function waitForPlayerShell(page: Page, timeout = 15_000) {
  await expect.poll(async () => {
    const signInVisible = await page.getByRole('button', { name: /^sign in$/i }).isVisible().catch(() => false);
    const emailVisible = await page.getByLabel('Email').isVisible().catch(() => false);
    if (signInVisible && emailVisible) return 'login';

    const tabVisible =
      await page.getByRole('button', { name: /home|leaderboard|tournaments|inbox/i }).first().isVisible().catch(() => false);
    const logoutVisible = await page.getByRole('button', { name: /logout|sign out/i }).isVisible().catch(() => false);
    return tabVisible || logoutVisible ? 'ready' : 'pending';
  }, { timeout, message: 'Player shell was not ready after login.' }).toBe('ready');
}

export async function waitForAdminShell(page: Page, timeout = 15_000) {
  await expect.poll(async () => {
    const signInVisible = await page.getByRole('button', { name: /sign in to admin/i }).isVisible().catch(() => false);
    const emailVisible = await page.getByLabel('Email').isVisible().catch(() => false);
    if (signInVisible && emailVisible) return 'login';

    const dashboardLinkVisible = await page.getByRole('link', { name: /^dashboard$/i }).isVisible().catch(() => false);
    const logoutVisible = await page.getByRole('button', { name: /logout/i }).isVisible().catch(() => false);
    return dashboardLinkVisible || logoutVisible ? 'ready' : 'pending';
  }, { timeout, message: 'Admin shell was not ready after login.' }).toBe('ready');
}

export async function loginViaUi(page: Page, creds: Credentials) {
  await resetUiAuthState(page);
  await page.goto(WEB_BASE);
  await submitLogin(page, creds, /^sign in$/i);
  await waitForPlayerShell(page);
}

export async function loginViaAdminUi(page: Page, creds: Credentials) {
  await resetUiAuthState(page);
  await page.goto(`${WEB_BASE}/admin`);
  await submitLogin(page, creds, /sign in to admin/i);
  await waitForAdminShell(page);
}

export async function logoutToLogin(page: Page) {
  const logoutButton = page.getByRole('button', { name: /logout|sign out/i }).first();
  const logoutVisible = await logoutButton.isVisible().catch(() => false);
  if (logoutVisible) {
    await logoutButton.click();
  }

  await expect.poll(() => new URL(page.url()).pathname, { timeout: 15_000 }).toBe('/');
  await expect(page.getByLabel('Email')).toBeVisible();
}
