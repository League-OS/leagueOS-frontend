import type { Player, Profile } from '@leagueos/schemas';

export type PlayerTab = 'home' | 'leaderboard' | 'tournaments' | 'profile' | 'inbox';

export type FormatRegistrationRow = {
  id: number;
  player_id: number;
  player_name: string;
  registration_source: string;
  status: string;
  registered_at: string | null;
};

export type ApiDetailPayload = { detail?: unknown };

export function isPlayerTab(value: string | null | undefined): value is PlayerTab {
  return value === 'home'
    || value === 'leaderboard'
    || value === 'tournaments'
    || value === 'profile'
    || value === 'inbox';
}

export function findUserPlayerId(profile: Profile | null, players: Player[]): number | null {
  if (!profile) return null;
  const profileEmail = profile.email?.toLowerCase();
  if (profileEmail) {
    const emailMatch = players.find((player) => player.email?.toLowerCase() === profileEmail);
    if (emailMatch) return emailMatch.id;
  }

  const names = [profile.display_name, profile.full_name]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase());
  if (names.length) {
    const nameMatch = players.find((player) => names.includes(player.display_name.trim().toLowerCase()));
    if (nameMatch) return nameMatch.id;
  }

  return null;
}

export function parseApiErrorDetail(payload: ApiDetailPayload, fallback: string): { code: string; message: string } {
  if (!payload || typeof payload !== 'object') {
    return { code: '', message: fallback };
  }
  const detail = payload.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return { code: '', message: detail };
  }
  if (!detail || typeof detail !== 'object') {
    return { code: '', message: fallback };
  }
  const code = typeof (detail as { code?: unknown }).code === 'string' ? String((detail as { code?: unknown }).code) : '';
  const message = typeof (detail as { message?: unknown }).message === 'string'
    ? String((detail as { message?: unknown }).message)
    : fallback;
  return { code, message };
}

export function normalizeSelfSignupError(detail: { code: string; message: string }): { code: string; message: string } {
  if (
    detail.code === 'FORBIDDEN'
    && detail.message.includes('Permission required: tournaments.manage')
  ) {
    return {
      code: detail.code,
      message: 'Player self-signup is supported, but the running API is out of date. Restart the API service and retry.',
    };
  }
  return detail;
}

export function signedFormatIdsFromRegistrations(
  currentPlayerId: number | null,
  registrationsByFormatId: Record<number, FormatRegistrationRow[]>,
): Record<number, boolean> {
  if (!currentPlayerId) return {};
  const next: Record<number, boolean> = {};
  Object.entries(registrationsByFormatId).forEach(([formatId, registrations]) => {
    const active = registrations.some((entry) => entry.status === 'ACTIVE' && entry.player_id === currentPlayerId);
    if (active) next[Number(formatId)] = true;
  });
  return next;
}
