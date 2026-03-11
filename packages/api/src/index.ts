import type { RuntimeConfig } from '@leagueos/config';
import {
  featureFlagSchema,
  authResponseSchema,
  adminUserSchema,
  clubUserSchema,
  clubSchema,
  courtSchema,
  gameSchema,
  gameParticipantSchema,
  leaderboardEntrySchema,
  playerEloHistoryEntrySchema,
  teamLeaderboardEntrySchema,
  loginRequestSchema,
  profileSchema,
  playerSchema,
  seasonSchema,
  sessionSchema,
  type AuthResponse,
  type FeatureFlag,
  type AdminUser,
  type ClubUser,
  type Club,
  type Court,
  type Game,
  type GameParticipant,
  type LeaderboardEntry,
  type PlayerEloHistoryEntry,
  type TeamLeaderboardEntry,
  type LoginRequest,
  type Profile,
  type Player,
  type Season,
  type Session,
} from '@leagueos/schemas';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type RequestOptions = {
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | undefined>;
  token?: string;
  clubId?: number;
  body?: unknown;
};

export type Tournament = {
  id: number;
  club_id: number;
  name: string;
  status: 'DRAFT' | 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  tournament_type: 'INTERNAL';
  season_id: number | null;
  timezone: string;
  admin_notes: string | null;
  publication_link: string | null;
  registration_link: string | null;
  team_scoring_link: string | null;
  venue_stream_link: string | null;
  schedule_start_at: string | null;
  formats_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TournamentFormatInstance = {
  id: number;
  tournament_id: number;
  name: string;
  format_type: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
  registration_open_at: string | null;
  registration_close_at: string | null;
  auto_registration_close: boolean;
  scheduling_model: 'GROUPS_KO' | 'MATCH_COUNT_KO' | 'DIRECT_KNOCKOUT' | 'TRIPLE_TIER_PROGRESSIVE_KO_MULTI' | null;
  average_set_duration_minutes: number;
  max_teams_allowed: number | null;
  matches_per_team: number | null;
  group_count: number | null;
  group_ko_teams_per_group: number | null;
  seed_source: 'ELO' | 'MANUAL';
  config_json: Record<string, unknown>;
  schedule_generated_at: string | null;
  schedule_locked: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TournamentCourt = {
  id: number;
  tournament_id: number;
  source_court_id: number | null;
  name: string;
  is_active: boolean;
  created_at: string | null;
};

export type TournamentGeneratedPair = {
  id: string;
  name: string;
  player_ids: number[];
  player_names: string[];
  team_elo: number;
};

export type TournamentGeneratedPairGroup = {
  id: string;
  name: string;
};

export type TournamentGeneratePairsResponse = {
  format_instance_id: number;
  format_type: 'DOUBLES' | 'MIXED_DOUBLES';
  source: 'REQUEST' | 'REGISTRATION_POOL';
  player_count: number;
  team_count: number;
  group_count: number;
  generated_pairs: TournamentGeneratedPair[];
  groups: TournamentGeneratedPairGroup[];
  assignments: Record<string, string[]>;
};

export type TournamentFormatAllowedCourtsResponse = {
  format_instance_id: number;
  allowed_court_ids: number[];
};

export type TournamentScheduleGenerateResponse = {
  artifact_id: number;
  format_instance_id: number;
  generation_hash: string;
  planning: Record<string, unknown>;
  generated_match_count: number;
  schedule_start_at: string | null;
  slot_minutes: number;
  forced_overlap: boolean;
  conflicts: unknown[];
  status: string;
};

export type TournamentMatch = {
  id: number;
  match_number: number;
  stage_code: string;
  status: string;
  court_id: number | null;
  court_name: string | null;
  home_registration_id: number | null;
  away_registration_id: number | null;
  winner_registration_id: number | null;
  loser_registration_id: number | null;
  start_at: string | null;
  end_at: string | null;
  tentative_start_at: string | null;
  tentative_end_at: string | null;
  row_version: number;
  idempotency_key: string | null;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  detail?: unknown;

  constructor(args: { status: number; message: string; code?: string; detail?: unknown }) {
    super(args.message);
    this.name = 'ApiError';
    this.status = args.status;
    this.code = args.code;
    this.detail = args.detail;
  }
}

export class LeagueOsApiClient {
  private readonly baseUrl: string;

  constructor(config: RuntimeConfig) {
    this.baseUrl = config.apiBaseUrl.replace(/\/$/, '');
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    const query = options.query ?? {};

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.token) headers.Authorization = `Bearer ${options.token}`;

    const res = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const raw = await res.text();
      let parsed: unknown = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // keep raw string if not JSON
      }

      const detail = (parsed as { detail?: unknown })?.detail;
      if (detail && typeof detail === 'object') {
        if (Array.isArray(detail)) {
          const first = detail[0] as { msg?: string } | undefined;
          throw new ApiError({
            status: res.status,
            message: first?.msg ?? `API ${res.status} ${res.statusText}`,
            detail,
          });
        }
        const d = detail as { code?: string; message?: string };
        throw new ApiError({
          status: res.status,
          code: d.code,
          message: d.message ?? `API ${res.status} ${res.statusText}`,
          detail,
        });
      }

      throw new ApiError({
        status: res.status,
        message: typeof parsed === 'string' ? parsed : `API ${res.status} ${res.statusText}`,
        detail: parsed,
      });
    }

    return (await res.json()) as T;
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
    loginRequestSchema.parse(input);
    const data = await this.request<unknown>('/auth/login', {
      method: 'POST',
      body: input,
    });
    return authResponseSchema.parse(data);
  }

  async forgotPassword(email: string): Promise<{ ok: boolean; message: string; reset_link?: string; email_send_error?: string | null }> {
    return this.request<{ ok: boolean; message: string; reset_link?: string; email_send_error?: string | null }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  }

  async resetPassword(token: string, newPassword: string, confirmPassword: string): Promise<{ ok: boolean; message: string }> {
    return this.request<{ ok: boolean; message: string }>('/auth/reset-password', {
      method: 'POST',
      body: {
        token,
        new_password: newPassword,
        confirm_password: confirmPassword,
      },
    });
  }

  async switchClub(token: string, clubId: number): Promise<AuthResponse> {
    const data = await this.request<unknown>('/auth/switch-club', {
      method: 'POST',
      token,
      query: { club_id: clubId },
    });
    return authResponseSchema.parse(data);
  }

  async me(token: string): Promise<Profile> {
    const data = await this.request<unknown>('/auth/me', {
      token,
    });
    return profileSchema.parse(data);
  }

  async profile(token: string): Promise<Profile> {
    const data = await this.request<unknown>('/profile', {
      token,
    });
    return profileSchema.parse(data);
  }

  async profileClubs(token: string): Promise<Club[]> {
    const data = await this.request<unknown[]>('/profile/clubs', {
      token,
    });
    return data.map((d) => clubSchema.parse(d));
  }

  async updateProfile(
    token: string,
    payload: Partial<{
      full_name: string;
      display_name: string;
      show_on_leaderboard: boolean;
    }>,
  ): Promise<Profile> {
    const data = await this.request<unknown>('/profile', {
      method: 'PUT',
      token,
      body: payload,
    });
    return profileSchema.parse(data);
  }

  async featureFlags(token: string): Promise<FeatureFlag[]> {
    const data = await this.request<unknown[]>('/config/feature-flags', {
      token,
    });
    return data.map((d) => featureFlagSchema.parse(d));
  }

  async updateFeatureFlag(token: string, key: string, enabled: boolean): Promise<FeatureFlag> {
    const data = await this.request<unknown>(`/config/feature-flags/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      token,
      body: { enabled },
    });
    return featureFlagSchema.parse(data);
  }

  async clubs(token: string): Promise<Club[]> {
    const data = await this.request<unknown[]>('/clubs', {
      token,
    });
    return data.map((d) => clubSchema.parse(d));
  }

  async createClub(
    token: string,
    payload: { name: string; description?: string; club_admin_user_id?: number; club_admin_email?: string },
  ): Promise<{
    club: Club;
    invite: null | {
      email: string;
      temporary_password: string;
      invite_link: string;
      status: string;
    };
  }> {
    const data = await this.request<{
      club: unknown;
      invite?: {
        email: string;
        temporary_password: string;
        invite_link: string;
        status: string;
      } | null;
    }>('/clubs', {
      method: 'POST',
      token,
      body: payload,
    });
    return {
      club: clubSchema.parse(data.club),
      invite: data.invite ?? null,
    };
  }

  async clubAdminCandidates(token: string, query: string): Promise<Array<{ id: number; email: string; full_name?: string | null; display_name?: string | null }>> {
    const data = await this.request<Array<{ id: number; email: string; full_name?: string | null; display_name?: string | null }>>('/clubs/admin-candidates', {
      token,
      query: { q: query },
    });
    return data;
  }

  async updateClub(token: string, clubId: number, payload: { name?: string; description?: string }): Promise<Club> {
    const data = await this.request<unknown>(`/clubs/${clubId}`, {
      method: 'PUT',
      token,
      body: payload,
    });
    return clubSchema.parse(data);
  }

  async adminUsers(token: string): Promise<AdminUser[]> {
    const data = await this.request<unknown[]>('/admin/users', { token });
    return data.map((d) => adminUserSchema.parse(d));
  }

  async createAdminUser(
    token: string,
    payload: { email: string; full_name: string; primary_club_id: number; role: 'CLUB_ADMIN' | 'RECORDER' | 'USER' },
  ): Promise<AdminUser> {
    const data = await this.request<unknown>('/admin/users', {
      method: 'POST',
      token,
      body: payload,
    });
    return adminUserSchema.parse(data);
  }

  async setAdminUserStatus(token: string, userId: number, isActive: boolean): Promise<AdminUser> {
    const data = await this.request<unknown>(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      token,
      body: { is_active: isActive },
    });
    return adminUserSchema.parse(data);
  }

  async clubUsers(token: string, clubId: number): Promise<ClubUser[]> {
    const data = await this.request<unknown[]>('/club-users', {
      token,
      query: { club_id: clubId },
    });
    return data.map((d) => clubUserSchema.parse(d));
  }

  async clubUserDetail(token: string, clubId: number, userId: number): Promise<ClubUser> {
    const data = await this.request<unknown>(`/club-users/${userId}`, {
      token,
      query: { club_id: clubId },
    });
    return clubUserSchema.parse(data);
  }

  async updateClubUser(
    token: string,
    clubId: number,
    userId: number,
    payload: {
      full_name: string;
      email: string;
      phone?: string;
      sex: 'M' | 'F';
      player_type: 'ROSTER' | 'DROP_IN' | 'DROP_IN_A1';
      elo_initial_singles: number;
      elo_initial_doubles: number;
      elo_initial_mixed: number;
      is_active: boolean;
      show_on_leaderboard?: boolean;
    },
  ): Promise<ClubUser> {
    const data = await this.request<unknown>(`/club-users/${userId}`, {
      method: 'PUT',
      token,
      query: { club_id: clubId },
      body: payload,
    });
    return clubUserSchema.parse(data);
  }

  async inviteUserFromPlayer(
    token: string,
    clubId: number,
    playerId: number,
  ): Promise<{
    status: string;
    club_id: number;
    player_id: number;
    user_id: number;
    email: string;
    temporary_password?: string | null;
    invite_link: string;
  }> {
    return this.request(`/club-users/invite-from-player/${playerId}`, {
      method: 'POST',
      token,
      query: { club_id: clubId },
    });
  }

  async resetClubUserPassword(
    token: string,
    clubId: number,
    userId: number,
    newPassword: string,
    confirmPassword: string,
  ): Promise<{ ok: boolean; user_id: number }> {
    return this.request<{ ok: boolean; user_id: number }>(`/club-users/${userId}/password`, {
      method: 'POST',
      token,
      query: { club_id: clubId },
      body: { new_password: newPassword, confirm_password: confirmPassword },
    });
  }

  async deleteClubUser(
    token: string,
    clubId: number,
    userId: number,
  ): Promise<{ ok: boolean; user_id: number; club_id: number }> {
    return this.request<{ ok: boolean; user_id: number; club_id: number }>(`/club-users/${userId}`, {
      method: 'DELETE',
      token,
      query: { club_id: clubId },
    });
  }

  async deleteClub(token: string, clubId: number): Promise<{ ok: boolean; club_id: number }> {
    return this.request<{ ok: boolean; club_id: number }>(`/clubs/${clubId}`, {
      method: 'DELETE',
      token,
    });
  }

  async players(
    token: string,
    clubId: number,
    isActive = true,
    limit?: number,
    offset?: number,
  ): Promise<Player[]> {
    const data = await this.request<unknown[]>('/players', {
      token,
      clubId,
      query: { club_id: clubId, is_active: isActive, limit, offset },
    });
    return data.map((d) => playerSchema.parse(d));
  }

  async createPlayer(
    token: string,
    clubId: number,
    payload: {
      display_name: string;
      email?: string | null;
      phone?: string | null;
      elo_initial_doubles?: number;
      elo_initial_singles?: number;
      elo_initial_mixed?: number;
      player_type?: 'ROSTER' | 'DROP_IN' | 'DROP_IN_A1';
      sex?: 'M' | 'F' | 'X' | 'U';
      is_active?: boolean;
      show_on_leaderboard?: boolean;
    },
  ): Promise<Player> {
    const data = await this.request<unknown>('/players', {
      method: 'POST',
      token,
      clubId,
      query: { club_id: clubId },
      body: { ...payload, club_id: clubId },
    });
    return playerSchema.parse(data);
  }

  async updatePlayer(
    token: string,
    clubId: number,
    playerId: number,
    payload: Partial<{
      display_name: string;
      email: string | null;
      phone: string | null;
      elo_initial_doubles: number;
      elo_initial_singles: number;
      elo_initial_mixed: number;
      player_type: 'ROSTER' | 'DROP_IN' | 'DROP_IN_A1';
      sex: 'M' | 'F' | 'X' | 'U';
      is_active: boolean;
      show_on_leaderboard: boolean;
    }>,
  ): Promise<Player> {
    const data = await this.request<unknown>(`/players/${playerId}`, {
      method: 'PUT',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
    return playerSchema.parse(data);
  }

  async deletePlayer(token: string, clubId: number, playerId: number): Promise<{ ok: boolean; player_id: number }> {
    return this.request<{ ok: boolean; player_id: number }>(`/players/${playerId}`, {
      method: 'DELETE',
      token,
      clubId,
      query: { club_id: clubId },
    });
  }

  async courts(token: string, clubId: number): Promise<Court[]> {
    const data = await this.request<unknown[]>('/courts', {
      token,
      clubId,
      query: { club_id: clubId },
    });
    return data.map((d) => courtSchema.parse(d));
  }

  async createCourt(token: string, clubId: number, payload: { name: string; is_active?: boolean }): Promise<Court> {
    const data = await this.request<unknown>('/courts', {
      method: 'POST',
      token,
      clubId,
      query: { club_id: clubId },
      body: { ...payload, club_id: clubId },
    });
    return courtSchema.parse(data);
  }

  async updateCourt(token: string, clubId: number, courtId: number, payload: { name?: string; is_active?: boolean }): Promise<Court> {
    const data = await this.request<unknown>(`/courts/${courtId}`, {
      method: 'PUT',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
    return courtSchema.parse(data);
  }

  async deleteCourt(token: string, clubId: number, courtId: number): Promise<{ ok: boolean; court_id: number }> {
    return this.request<{ ok: boolean; court_id: number }>(`/courts/${courtId}`, {
      method: 'DELETE',
      token,
      clubId,
      query: { club_id: clubId },
    });
  }

  async tournaments(token: string, clubId: number): Promise<Tournament[]> {
    return this.request<Tournament[]>('/tournaments', {
      token,
      clubId,
      query: { club_id: clubId },
    });
  }

  async createTournament(
    token: string,
    clubId: number,
    payload: {
      name: string;
      season_id?: number;
      timezone: string;
      admin_notes?: string;
      schedule_start_at?: string;
      publication_link?: string;
      registration_link?: string;
      team_scoring_link?: string;
      venue_stream_link?: string;
    },
  ): Promise<Tournament> {
    return this.request<Tournament>('/tournaments', {
      method: 'POST',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
  }

  async tournamentFormats(token: string, clubId: number, tournamentId: number): Promise<TournamentFormatInstance[]> {
    return this.request<TournamentFormatInstance[]>(`/tournaments/${tournamentId}/formats`, {
      token,
      clubId,
      query: { club_id: clubId },
    });
  }

  async createTournamentFormat(
    token: string,
    clubId: number,
    tournamentId: number,
    payload: {
      name: string;
      format_type: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
      registration_open_at?: string;
      registration_close_at?: string;
      auto_registration_close?: boolean;
    },
  ): Promise<TournamentFormatInstance> {
    return this.request<TournamentFormatInstance>(`/tournaments/${tournamentId}/formats`, {
      method: 'POST',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
  }

  async tournamentCourts(
    token: string,
    clubId: number,
    tournamentId: number,
  ): Promise<TournamentCourt[]> {
    return this.request<TournamentCourt[]>(`/tournaments/${tournamentId}/courts`, {
      token,
      clubId,
      query: { club_id: clubId },
    });
  }

  async createTournamentCourt(
    token: string,
    clubId: number,
    tournamentId: number,
    payload: {
      name: string;
      source_court_id?: number;
      is_active?: boolean;
    },
  ): Promise<TournamentCourt> {
    return this.request<TournamentCourt>(`/tournaments/${tournamentId}/courts`, {
      method: 'POST',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
  }

  async generateTournamentPairs(
    token: string,
    clubId: number,
    tournamentId: number,
    formatInstanceId: number,
    payload: {
      player_ids: number[];
      group_count?: number;
    },
  ): Promise<TournamentGeneratePairsResponse> {
    return this.request<TournamentGeneratePairsResponse>(`/tournaments/${tournamentId}/formats/${formatInstanceId}/pairs/generate`, {
      method: 'POST',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
  }

  async updateTournamentFormat(
    token: string,
    clubId: number,
    tournamentId: number,
    formatInstanceId: number,
    payload: Partial<{
      name: string;
      format_type: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
      registration_open_at: string;
      registration_close_at: string;
      auto_registration_close: boolean;
      scheduling_model: 'GROUPS_KO' | 'MATCH_COUNT_KO' | 'DIRECT_KNOCKOUT' | 'TRIPLE_TIER_PROGRESSIVE_KO_MULTI';
      average_set_duration_minutes: number;
      max_teams_allowed: number;
      matches_per_team: number;
      group_count: number;
      group_ko_teams_per_group: number;
      seed_source: 'ELO' | 'MANUAL';
      config_json: Record<string, unknown>;
    }>,
  ): Promise<TournamentFormatInstance> {
    return this.request<TournamentFormatInstance>(`/tournaments/${tournamentId}/formats/${formatInstanceId}`, {
      method: 'PUT',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
  }

  async deleteTournamentFormat(
    token: string,
    clubId: number,
    tournamentId: number,
    formatInstanceId: number,
  ): Promise<{ ok: boolean; format_instance_id: number }> {
    return this.request<{ ok: boolean; format_instance_id: number }>(`/tournaments/${tournamentId}/formats/${formatInstanceId}`, {
      method: 'DELETE',
      token,
      clubId,
      query: { club_id: clubId },
    });
  }

  async setTournamentFormatCourts(
    token: string,
    clubId: number,
    tournamentId: number,
    formatInstanceId: number,
    payload: {
      allowed_court_ids: number[];
    },
  ): Promise<TournamentFormatAllowedCourtsResponse> {
    return this.request<TournamentFormatAllowedCourtsResponse>(`/tournaments/${tournamentId}/formats/${formatInstanceId}/courts`, {
      method: 'PUT',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
  }

  async generateTournamentSchedule(
    token: string,
    clubId: number,
    tournamentId: number,
    formatInstanceId: number,
    payload: {
      reset_existing?: boolean;
      force_allow_overlap?: boolean;
      override_reason?: string;
    } = {},
  ): Promise<TournamentScheduleGenerateResponse> {
    return this.request<TournamentScheduleGenerateResponse>(`/tournaments/${tournamentId}/formats/${formatInstanceId}/schedule/generate`, {
      method: 'POST',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
  }

  async resetTournamentSchedule(
    token: string,
    clubId: number,
    tournamentId: number,
    formatInstanceId: number,
  ): Promise<{ ok: boolean; format_instance_id: number }> {
    return this.request<{ ok: boolean; format_instance_id: number }>(`/tournaments/${tournamentId}/formats/${formatInstanceId}/schedule/reset`, {
      method: 'POST',
      token,
      clubId,
      query: { club_id: clubId },
    });
  }

  async tournamentFormatMatches(
    token: string,
    clubId: number,
    tournamentId: number,
    formatInstanceId: number,
  ): Promise<TournamentMatch[]> {
    return this.request<TournamentMatch[]>(`/tournaments/${tournamentId}/formats/${formatInstanceId}/matches`, {
      token,
      clubId,
      query: { club_id: clubId },
    });
  }

  async seasons(token: string, clubId: number, isActive?: boolean): Promise<Season[]> {
    const data = await this.request<unknown[]>('/seasons', {
      token,
      clubId,
      query: { club_id: clubId, is_active: isActive },
    });
    return data.map((d) => seasonSchema.parse(d));
  }

  async createSeason(
    token: string,
    clubId: number,
    payload: {
      name: string;
      format: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
      weekday: number;
      start_time_local: string;
      timezone: string;
      is_active: boolean;
    },
  ): Promise<Season> {
    const data = await this.request<unknown>('/seasons', {
      method: 'POST',
      token,
      clubId,
      query: { club_id: clubId },
      body: { ...payload, club_id: clubId },
    });
    return seasonSchema.parse(data);
  }

  async updateSeason(
    token: string,
    clubId: number,
    seasonId: number,
    payload: Partial<{
      name: string;
      weekday: number;
      start_time_local: string;
      timezone: string;
      is_active: boolean;
    }>,
  ): Promise<Season> {
    const data = await this.request<unknown>(`/seasons/${seasonId}`, {
      method: 'PUT',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
    return seasonSchema.parse(data);
  }

  async deleteSeason(token: string, clubId: number, seasonId: number): Promise<{ ok: boolean; season_id: number }> {
    return this.request<{ ok: boolean; season_id: number }>(`/seasons/${seasonId}`, {
      method: 'DELETE',
      token,
      clubId,
      query: { club_id: clubId },
    });
  }

  async sessions(
    token: string,
    clubId: number,
    seasonId?: number,
    limit?: number,
    offset?: number,
  ): Promise<Session[]> {
    const data = await this.request<unknown[]>('/sessions', {
      token,
      clubId,
      query: { club_id: clubId, season_id: seasonId, limit, offset },
    });
    return data.map((d) => sessionSchema.parse(d));
  }

  async createSession(
    token: string,
    clubId: number,
    payload: {
      season_id: number;
      session_start_time: string;
      session_end_time?: string;
      status: 'UPCOMING' | 'OPEN' | 'CANCELLED';
      location?: string;
      address?: string;
    },
  ): Promise<Session> {
    const data = await this.request<unknown>('/sessions', {
      method: 'POST',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
    return sessionSchema.parse(data);
  }

  async updateSession(
    token: string,
    clubId: number,
    sessionId: number,
    payload: Partial<{
      session_start_time: string;
      session_end_time: string;
      status: 'UPCOMING' | 'OPEN' | 'CLOSED' | 'CANCELLED';
      location: string;
      address: string;
    }>,
  ): Promise<Session> {
    const data = await this.request<unknown>(`/sessions/${sessionId}`, {
      method: 'PUT',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
    return sessionSchema.parse(data);
  }

  async closeSession(token: string, clubId: number, sessionId: number): Promise<{ session_id: number; status: string }> {
    return this.request<{ session_id: number; status: string }>(`/sessions/${sessionId}/close`, {
      method: 'POST',
      token,
      clubId,
      query: { club_id: clubId },
    });
  }

  async openSession(token: string, clubId: number, sessionId: number): Promise<{ session_id: number; status: string }> {
    return this.request<{ session_id: number; status: string }>(`/sessions/${sessionId}/open`, {
      method: 'POST',
      token,
      clubId,
      query: { club_id: clubId },
    });
  }

  async deleteSession(token: string, clubId: number, sessionId: number): Promise<{ ok: boolean; session_id: number }> {
    return this.request<{ ok: boolean; session_id: number }>(`/sessions/${sessionId}`, {
      method: 'DELETE',
      token,
      clubId,
      query: { club_id: clubId },
    });
  }

  async sessionLeaderboard(token: string, clubId: number, sessionId: number): Promise<LeaderboardEntry[]> {
    const data = await this.request<unknown[]>(`/sessions/${sessionId}/leaderboard`, {
      token,
      clubId,
      query: { club_id: clubId },
    });
    return data.map((d) => leaderboardEntrySchema.parse(d));
  }

  async finalizeSession(
    token: string,
    clubId: number,
    sessionId: number,
  ): Promise<{ session_id: number; games_finalized: number; ledger_rows_written: number }> {
    return this.request<{ session_id: number; games_finalized: number; ledger_rows_written: number }>(
      `/sessions/${sessionId}/finalize`,
      {
        method: 'POST',
        token,
        clubId,
        query: { club_id: clubId },
      },
    );
  }

  async revertSessionFinalize(
    token: string,
    clubId: number,
    sessionId: number,
  ): Promise<{ session_id: number; ledger_rows_reverted: number; status: string }> {
    return this.request<{ session_id: number; ledger_rows_reverted: number; status: string }>(
      `/sessions/${sessionId}/revert-finalize`,
      {
        method: 'POST',
        token,
        clubId,
        query: { club_id: clubId },
      },
    );
  }

  async createGame(
    token: string,
    clubId: number,
    payload: {
      session_id: number;
      court_id: number;
      start_time: string;
      score_a: number;
      score_b: number;
    },
  ): Promise<Game> {
    const data = await this.request<unknown>('/games', {
      method: 'POST',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
    return gameSchema.parse(data);
  }

  async updateGame(
    token: string,
    clubId: number,
    gameId: number,
    payload: Partial<{
      court_id: number;
      start_time: string;
      score_a: number;
      score_b: number;
    }>,
  ): Promise<Game> {
    const data = await this.request<unknown>(`/games/${gameId}`, {
      method: 'PUT',
      token,
      clubId,
      query: { club_id: clubId },
      body: payload,
    });
    return gameSchema.parse(data);
  }

  async games(
    token: string,
    clubId: number,
    sessionId?: number,
    limit?: number,
    offset?: number,
    includeParticipants = false,
  ): Promise<Game[]> {
    const data = await this.request<unknown[]>('/games', {
      token,
      clubId,
      query: {
        club_id: clubId,
        session_id: sessionId,
        limit,
        offset,
        include_participants: includeParticipants || undefined,
      },
    });
    return data.map((d) => gameSchema.parse(d));
  }

  async deleteGame(token: string, clubId: number, gameId: number): Promise<{ ok: boolean; id: number }> {
    return this.request<{ ok: boolean; id: number }>(`/games/${gameId}`, {
      method: 'DELETE',
      token,
      clubId,
      query: { club_id: clubId },
    });
  }

  async gameParticipants(token: string, clubId: number, gameId: number): Promise<GameParticipant[]> {
    const data = await this.request<unknown[]>(`/games/${gameId}/participants`, {
      token,
      clubId,
      query: { club_id: clubId },
    });
    return data.map((d) => gameParticipantSchema.parse(d));
  }

  async upsertGameParticipants(
    token: string,
    clubId: number,
    gameId: number,
    participants: Array<{ player_id: number; side: 'A' | 'B' }>,
  ): Promise<{ ok: boolean; game_id: number; participant_count: number }> {
    return this.request<{ ok: boolean; game_id: number; participant_count: number }>(`/games/${gameId}/participants`, {
      method: 'PUT',
      token,
      clubId,
      query: { club_id: clubId },
      body: { participants },
    });
  }

  async seasonTeamLeaderboard(token: string, clubId: number, seasonId: number): Promise<TeamLeaderboardEntry[]> {
    const data = await this.request<unknown[]>('/leaderboards/teams', {
      token,
      clubId,
      query: { club_id: clubId, season_id: seasonId },
    });
    return data.map((d) => teamLeaderboardEntrySchema.parse(d));
  }

  /**
   * Return a player's season-by-season Elo history in a single request.
   * Pass `playerId` when viewing another player's profile; omit to resolve
   * the caller's own linked player record server-side.
   */
  async playerEloHistory(
    token: string,
    clubId: number,
    playerId?: number,
  ): Promise<PlayerEloHistoryEntry[]> {
    const data = await this.request<unknown[]>('/leaderboards/player-history', {
      token,
      clubId,
      query: { club_id: clubId, player_id: playerId },
    });
    return data.map((d) => playerEloHistoryEntrySchema.parse(d));
  }

  async seasonLeaderboard(token: string, clubId: number, seasonId: number): Promise<{ session: Session | null; leaderboard: LeaderboardEntry[] }> {
    const sessions = await this.sessions(token, clubId, seasonId);
    const finalized = sessions
      .filter((s) => s.status === 'FINALIZED')
      .sort((a, b) => b.session_start_time.localeCompare(a.session_start_time));

    if (!finalized.length) {
      return { session: null, leaderboard: [] };
    }

    const targetSession = finalized[0];
    const leaderboard = await this.sessionLeaderboard(token, clubId, targetSession.id);
    return { session: targetSession, leaderboard };
  }
}
