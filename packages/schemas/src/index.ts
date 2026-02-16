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
  status: z.enum(['OPEN', 'CLOSED', 'FINALIZED']),
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
  matches_won: z.number(),
  total_points: z.number(),
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
export type LoginRequest = z.infer<typeof loginRequestSchema>;
