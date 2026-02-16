import { z } from 'zod';

export const authResponseSchema = z.object({
  token: z.string(),
  expires_at: z.string(),
  role: z.string(),
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

export const sessionSchema = z.object({
  id: z.number(),
  season_id: z.number(),
  session_date: z.string(),
  status: z.enum(['UPCOMING', 'OPEN', 'CLOSED', 'FINALIZED', 'CANCELLED']),
  location: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  opened_at: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
  finalized_at: z.string().nullable().optional(),
  created_at: z.string(),
});

export const leaderboardEntrySchema = z.object({
  player_id: z.number(),
  display_name: z.string(),
  season_elo_delta: z.number(),
  matches_played: z.number().optional().default(0),
  matches_won: z.number(),
  total_points: z.number(),
  global_elo_score: z.number().optional().default(1000),
  updated_at: z.string(),
});

export const profileSchema = z.object({
  id: z.number(),
  email: z.string(),
  full_name: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  role: z.string(),
  club_role: z.string().nullable().optional(),
  club_id: z.number().optional(),
});

export const clubSchema = z.object({
  id: z.number(),
  name: z.string(),
  created_at: z.string(),
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
  created_at: z.string(),
});

export const courtSchema = z.object({
  id: z.number(),
  club_id: z.number(),
  name: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
});

export const gameSchema = z.object({
  id: z.number(),
  session_id: z.number(),
  court_id: z.number(),
  start_time: z.string(),
  score_a: z.number(),
  score_b: z.number(),
  created_at: z.string(),
});

export const gameParticipantSchema = z.object({
  game_id: z.number(),
  player_id: z.number(),
  display_name: z.string(),
  side: z.enum(['A', 'B']),
  created_at: z.string(),
});

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
export type Season = z.infer<typeof seasonSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Club = z.infer<typeof clubSchema>;
export type Player = z.infer<typeof playerSchema>;
export type Court = z.infer<typeof courtSchema>;
export type Game = z.infer<typeof gameSchema>;
export type GameParticipant = z.infer<typeof gameParticipantSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
