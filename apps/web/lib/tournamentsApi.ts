import { DEFAULT_API_BASE_URL } from '@leagueos/config';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

export type TournamentV2 = {
  id: number;
  club_id: number;
  name: string;
  event_type: 'DOUBLES' | 'MIXED_DOUBLES';
  format: 'GROUPS_KO' | 'MATCH_COUNT_KO';
  status: 'DRAFT' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  enable_quarterfinals: boolean;
  matches_per_team: number | null;
  points_to_win: number;
  win_by_two: boolean;
  max_point_cap: number;
  published: boolean;
  created_at: string;
  updated_at: string;
};

export type TournamentMatch = {
  id: number;
  tournament_id: number;
  stage: string;
  stage_order: number | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'FORFEIT' | 'RETIRED';
  completion_reason: string | null;
  team_a_id: number;
  team_a_seed_no: number | null;
  team_a_name: string;
  team_b_id: number;
  team_b_seed_no: number | null;
  team_b_name: string;
  team_a_points: number | null;
  team_b_points: number | null;
  winner_team_id: number | null;
  group_id: number | null;
  group_code: string | null;
  is_duplicate: boolean;
  created_at: string;
  updated_at: string;
};

export type TournamentMatchesResponse = {
  tournament_id: number;
  count: number;
  matches: TournamentMatch[];
};

export type TournamentDisplayResponse = {
  tournament: {
    id: number;
    club_id: number;
    event_type: string;
    format: string;
    status: string;
    enable_quarterfinals: boolean;
  };
  live_matches: TournamentMatch[];
  upcoming_matches: TournamentMatch[];
  completed_matches: TournamentMatch[];
  standings: unknown;
  bracket: {
    quarterfinals: TournamentMatch[];
    semifinals: TournamentMatch[];
    finals: TournamentMatch[];
  };
};

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.detail?.message ?? body?.message ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export const tournamentsApi = {
  list: (clubId: number, token: string) => api<TournamentV2[]>(`/clubs/${clubId}/tournaments-v2`, token),
  create: (clubId: number, token: string, payload: Record<string, unknown>) =>
    api<TournamentV2>(`/clubs/${clubId}/tournaments-v2`, token, { method: 'POST', body: JSON.stringify(payload) }),
  addPlayers: (clubId: number, tournamentId: number, token: string, playerIds: number[]) =>
    api(`/clubs/${clubId}/tournaments-v2/${tournamentId}/players:add`, token, {
      method: 'POST',
      body: JSON.stringify({ player_ids: playerIds }),
    }),
  generateTeams: (clubId: number, tournamentId: number, token: string) =>
    api(`/clubs/${clubId}/tournaments-v2/${tournamentId}/teams:generate`, token, { method: 'POST' }),
  generateSchedule: (clubId: number, tournamentId: number, token: string) =>
    api(`/clubs/${clubId}/tournaments-v2/${tournamentId}/schedule:generate`, token, { method: 'POST' }),
  standings: (clubId: number, tournamentId: number, token: string) =>
    api(`/clubs/${clubId}/tournaments-v2/${tournamentId}/standings`, token),
  matches: (clubId: number, tournamentId: number, token: string, opts?: { stage?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (opts?.stage) q.set('stage', opts.stage);
    if (opts?.status) q.set('status', opts.status);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return api<TournamentMatchesResponse>(`/clubs/${clubId}/tournaments-v2/${tournamentId}/matches${suffix}`, token);
  },
  display: (clubId: number, tournamentId: number, token: string) =>
    api<TournamentDisplayResponse>(`/clubs/${clubId}/tournaments-v2/${tournamentId}/display`, token),
  advance: (clubId: number, tournamentId: number, token: string) =>
    api(`/clubs/${clubId}/tournaments-v2/${tournamentId}/advance`, token, { method: 'POST' }),
  recordMatch: (
    clubId: number,
    tournamentId: number,
    matchId: number,
    token: string,
    payload: {
      status: 'COMPLETED' | 'FORFEIT' | 'RETIRED';
      completion_reason: 'PLAYED' | 'FORFEIT' | 'RETIRED';
      winner_team_id: number;
      team_a_points?: number | null;
      team_b_points?: number | null;
    },
  ) => api(`/clubs/${clubId}/tournaments-v2/${tournamentId}/matches/${matchId}:record`, token, { method: 'POST', body: JSON.stringify(payload) }),
};
