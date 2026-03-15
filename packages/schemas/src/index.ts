import { z } from 'zod';

// ---------------------------------------------------------------------------
// Role enums — shared across auth, profile, and admin schemas
// ---------------------------------------------------------------------------

export const globalRoleSchema = z.enum(['GLOBAL_ADMIN', 'CLUB_ADMIN', 'RECORDER', 'USER']);
export const clubRoleSchema = z.enum(['GLOBAL_ADMIN', 'CLUB_ADMIN', 'RECORDER', 'USER']);

export type GlobalRole = z.infer<typeof globalRoleSchema>;
export type ClubRole = z.infer<typeof clubRoleSchema>;

// ---------------------------------------------------------------------------

export const authResponseSchema = z.object({
  token: z.string(),
  expires_at: z.string(),
  role: globalRoleSchema,
  club_id: z.number().nullable().optional(),
});

export const seasonSchema = z.object({
  id: z.number(),
  club_id: z.number(),
  name: z.string(),
  format: z.enum(['SINGLES', 'DOUBLES', 'MIXED_DOUBLES']),
  weekday: z.number(),
  start_time_local: z.string(),
  timezone: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
});

const sessionStatusSchema = z.enum(['UPCOMING', 'OPEN', 'CLOSED', 'FINALIZED', 'CANCELLED']);

const sessionCommonSchema = z.object({
  id: z.number(),
  season_id: z.number(),
  status: sessionStatusSchema,
  location: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  opened_at: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
  finalized_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  session_end_time: z.string().nullable().optional(),
});

const sessionLegacySchema = sessionCommonSchema.extend({
  session_start_time: z.string(),
});

const sessionDateSchema = sessionCommonSchema.extend({
  session_date: z.string(),
  start_time_local: z.string().optional(),
  session_start_time: z.string().optional(),
});

export const sessionSchema = z.union([sessionLegacySchema, sessionDateSchema]).transform((row) => {
  if ('session_start_time' in row && typeof row.session_start_time === 'string' && row.session_start_time) {
    const dt = new Date(row.session_start_time);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const hh = String(dt.getHours()).padStart(2, '0');
      const mm = String(dt.getMinutes()).padStart(2, '0');
      const ss = String(dt.getSeconds()).padStart(2, '0');
      return {
        ...row,
        session_start_time: row.session_start_time,
        session_date: `${y}-${m}-${d}`,
        start_time_local: `${hh}:${mm}:${ss}`,
      };
    }
  }

  const sessionDate = 'session_date' in row && typeof row.session_date === 'string' ? row.session_date : '';
  const startTimeLocal = 'start_time_local' in row && typeof row.start_time_local === 'string'
    ? row.start_time_local
    : '';
  const normalizedTime = /^\d{2}:\d{2}:\d{2}$/.test(startTimeLocal)
    ? startTimeLocal
    : /^\d{2}:\d{2}$/.test(startTimeLocal)
      ? `${startTimeLocal}:00`
      : '00:00:00';
  const sessionStartTime =
    'session_start_time' in row && typeof row.session_start_time === 'string' && row.session_start_time
      ? row.session_start_time
      : (sessionDate ? `${sessionDate}T${normalizedTime}` : '');

  return {
    ...row,
    session_start_time: sessionStartTime,
    session_date: sessionDate,
    start_time_local: startTimeLocal,
  };
});

export const leaderboardEntrySchema = z.object({
  rank: z.number().optional(),
  player_id: z.number(),
  display_name: z.string(),
  season_elo_delta: z.number(),
  matches_played: z.number().optional().default(0),
  matches_won: z.number(),
  total_points: z.number(),
  global_elo_score: z.number().optional().default(1000),
  updated_at: z.string(),
});

export const teamLeaderboardEntrySchema = z.object({
  rank: z.number(),
  pair_key: z.string(),
  player_a_id: z.number(),
  player_b_id: z.number(),
  player_a_display_name: z.string(),
  player_b_display_name: z.string(),
  season_elo_delta: z.number(),
  matches_played: z.number(),
  matches_won: z.number(),
  total_points: z.number(),
  current_elo: z.number(),
});

export const playerEloHistoryEntrySchema = z.object({
  season_id: z.number(),
  season_name: z.string(),
  club_id: z.number(),
  format: z.enum(['SINGLES', 'DOUBLES', 'MIXED_DOUBLES']),
  season_elo_delta: z.number(),
  global_elo_score: z.number(),
});

export type PlayerEloHistoryEntry = z.infer<typeof playerEloHistoryEntrySchema>;

export const featureFlagSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  updated_at: z.string().nullable().optional(),
  updated_by_user_id: z.number().nullable().optional(),
  updated_by_email: z.string().nullable().optional(),
});

export const profileSchema = z.object({
  id: z.number(),
  email: z.string(),
  full_name: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  role: globalRoleSchema,
  club_role: clubRoleSchema.nullable().optional(),
  club_id: z.number().optional(),
  show_on_leaderboard: z.boolean().optional().default(true),
});

export const clubSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable().optional(),
  created_at: z.string(),
});

export const adminUserSchema = z.object({
  id: z.number(),
  email: z.string(),
  full_name: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  global_role: globalRoleSchema.nullable().optional(),
  is_active: z.boolean(),
  created_at: z.string(),
  memberships: z.array(z.object({
    club_id: z.number(),
    club_name: z.string(),
    role: clubRoleSchema,
    is_active: z.boolean(),
  })).optional().default([]),
});

export const clubUserSchema = z.object({
  id: z.number(),
  email: z.string(),
  full_name: z.string(),
  is_active: z.boolean(),
  role_in_club: clubRoleSchema,
  phone: z.string().nullable().optional(),
  sex: z.string().nullable().optional(),
  player_type: z.string().nullable().optional(),
  elo_initial_singles: z.number().nullable().optional(),
  elo_initial_doubles: z.number().nullable().optional(),
  elo_initial_mixed: z.number().nullable().optional(),
  show_on_leaderboard: z.boolean().optional().default(true),
});

export const playerSchema = z.object({
  id: z.number(),
  club_id: z.number(),
  display_name: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  elo_initial_doubles: z.number().optional(),
  elo_initial_singles: z.number().optional(),
  elo_initial_mixed: z.number().optional(),
  player_type: z.string().optional(),
  sex: z.string().optional(),
  is_active: z.boolean(),
  show_on_leaderboard: z.boolean().optional().default(true),
  created_at: z.string(),
});

export const courtSchema = z.object({
  id: z.number(),
  club_id: z.number(),
  name: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
});

export const gameParticipantSchema = z.object({
  game_id: z.number(),
  player_id: z.number(),
  display_name: z.string(),
  side: z.enum(['A', 'B']),
  created_at: z.string(),
});

export const gameSchema = z.object({
  id: z.number(),
  session_id: z.number(),
  court_id: z.number(),
  start_time: z.string(),
  status: z.enum(['CREATED', 'FINALIZED']).optional().default('CREATED'),
  created_by_user_id: z.number().nullable().optional(),
  created_by_label: z.string().optional().default('Unknown'),
  score_a: z.number(),
  score_b: z.number(),
  created_at: z.string(),
  /** Populated only when GET /games is called with include_participants=true. */
  participants: z.array(gameParticipantSchema).optional(),
});

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
export type Season = z.infer<typeof seasonSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type TeamLeaderboardEntry = z.infer<typeof teamLeaderboardEntrySchema>;
export type FeatureFlag = z.infer<typeof featureFlagSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Club = z.infer<typeof clubSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type ClubUser = z.infer<typeof clubUserSchema>;
export type Player = z.infer<typeof playerSchema>;
export type Court = z.infer<typeof courtSchema>;
export type Game = z.infer<typeof gameSchema>;
export type GameParticipant = z.infer<typeof gameParticipantSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
