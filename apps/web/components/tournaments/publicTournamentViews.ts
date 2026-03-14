'use client';

import { startTransition, useEffect, useState } from 'react';
import { DEFAULT_API_BASE_URL } from '@leagueos/config';

export type PublicTournament = {
  id: number;
  name: string;
  status: string;
  timezone: string;
  schedule_start_at: string | null;
  schedule_end_at: string | null;
  publication_link: string | null;
  venue_stream_link: string | null;
};

export type PublicCourt = {
  id: number;
  name: string;
  is_active: boolean;
};

export type PublicRegistration = {
  id: number;
  player_id: number;
  player_name: string;
  status: string;
};

export type PublicScore = {
  score_a?: unknown;
  score_b?: unknown;
};

export type PublicMatch = {
  id: number;
  match_number: number;
  stage_code: string;
  group_code: string | null;
  round_number: number | null;
  round_label: string | null;
  match_order_in_round: number | null;
  status: string;
  court_id: number | null;
  court_name: string | null;
  home_registration_id: number | null;
  away_registration_id: number | null;
  home_seed: number | null;
  away_seed: number | null;
  home_slot_source: string | null;
  away_slot_source: string | null;
  home_slot_group_code: string | null;
  away_slot_group_code: string | null;
  home_slot_group_rank: number | null;
  away_slot_group_rank: number | null;
  winner_registration_id: number | null;
  loser_registration_id: number | null;
  dependency_match_a_id: number | null;
  dependency_match_b_id: number | null;
  best_of_sets: number | null;
  sets_to_win: number | null;
  points_to_win_set: number | null;
  win_by_two: boolean | null;
  set_cap: number | null;
  average_set_duration_minutes: number | null;
  start_at: string | null;
  end_at: string | null;
  tentative_start_at: string | null;
  tentative_end_at: string | null;
  score_json: PublicScore;
  row_version: number;
  idempotency_key?: string | null;
};

export type PublicGeneratedTeam = {
  id: string;
  name: string;
  player_ids: string[];
};

export type PublicFormat = {
  id: number;
  name: string;
  format_type: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
  status: string | null;
  scheduling_model: string | null;
  config_json: Record<string, unknown>;
  schedule_generated_at: string | null;
  schedule_published_at: string | null;
  allowed_court_ids: number[];
  registrations: PublicRegistration[];
  matches: PublicMatch[];
};

export type PublicCourtsidePayload = {
  tournament: PublicTournament;
  courts: PublicCourt[];
  formats: PublicFormat[];
  generated_at: string | null;
};

export type DecoratedMatch = {
  format: PublicFormat;
  match: PublicMatch;
  homeLabel: string;
  awayLabel: string;
};

export type TournamentViewLoadState = {
  payload: PublicCourtsidePayload | null;
  loading: boolean;
  error: string;
};

export const LIVE_STATUSES = new Set(['IN_PROGRESS']);
export const UPCOMING_STATUSES = new Set(['SCHEDULED']);
export const COMPLETED_STATUSES = new Set(['COMPLETED', 'FINALIZED']);
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readGeneratedTeams(format: PublicFormat): PublicGeneratedTeam[] {
  const config = asObject(format.config_json) ?? {};
  const pool = asObject(config.pool) ?? {};
  const raw = Array.isArray(pool.generatedTeams) ? pool.generatedTeams : [];
  return raw
    .map((entry) => {
      const item = asObject(entry);
      if (!item) return null;
      const id = typeof item.id === 'string' ? item.id : '';
      const name = typeof item.name === 'string' ? item.name : '';
      const playerIds = Array.isArray(item.playerIds) ? item.playerIds.map((value) => String(value)) : [];
      if (!id || !name) return null;
      return {
        id,
        name,
        player_ids: playerIds,
      };
    })
    .filter((entry): entry is PublicGeneratedTeam => entry !== null);
}

export function matchMoment(match: PublicMatch): number {
  const value = match.start_at ?? match.tentative_start_at ?? match.end_at ?? match.tentative_end_at;
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

export function scoreValue(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function formatTournamentDate(
  value: string | null,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
  fallback = 'TBD',
): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, ...options }).format(parsed);
}

export function formatClock(timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

export function formatTypeLabel(value: PublicFormat['format_type']): string {
  return value.replaceAll('_', ' ');
}

export function stageLabel(match: PublicMatch): string {
  if (match.group_code) return `Group ${match.group_code}`;
  if (match.round_label) return match.round_label;
  return match.stage_code.replaceAll('_', ' ');
}

export function registrationLabel(format: PublicFormat, registrationId: number | null): string {
  if (!registrationId) return 'TBD';
  const registration = format.registrations.find((entry) => entry.id === registrationId) ?? null;
  if (!registration) return `R${registrationId}`;
  if (format.format_type === 'SINGLES') return registration.player_name;
  const team = readGeneratedTeams(format).find((entry) => entry.player_ids.includes(String(registration.player_id)));
  return team?.name ?? registration.player_name;
}

export function slotLabel(format: PublicFormat, match: PublicMatch, side: 'home' | 'away'): string {
  const registrationId = side === 'home' ? match.home_registration_id : match.away_registration_id;
  if (registrationId) return registrationLabel(format, registrationId);

  const source = side === 'home' ? match.home_slot_source : match.away_slot_source;
  const groupCode = side === 'home' ? match.home_slot_group_code : match.away_slot_group_code;
  const groupRank = side === 'home' ? match.home_slot_group_rank : match.away_slot_group_rank;
  const dependencyId = side === 'home' ? match.dependency_match_a_id : match.dependency_match_b_id;

  if (source === 'GROUP_RANK' && groupCode && groupRank) return `${groupCode}${groupRank}`;
  if (source === 'MATCH_WINNER' && dependencyId) return `Winner M${dependencyId}`;
  return 'TBD';
}

export function decorateMatch(format: PublicFormat, match: PublicMatch): DecoratedMatch {
  return {
    format,
    match,
    homeLabel: slotLabel(format, match, 'home'),
    awayLabel: slotLabel(format, match, 'away'),
  };
}

export function matchStatusLabel(status: string): string {
  if (status === 'IN_PROGRESS') return 'Live';
  if (status === 'SCHEDULED') return 'Up Next';
  if (status === 'FINALIZED') return 'Final';
  return status.replaceAll('_', ' ');
}

export function featuredMatches(formats: PublicFormat[]): DecoratedMatch[] {
  return formats
    .flatMap((format) => format.matches.map((match) => decorateMatch(format, match)))
    .sort((left, right) => {
      const leftLive = LIVE_STATUSES.has(left.match.status) ? 0 : UPCOMING_STATUSES.has(left.match.status) ? 1 : 2;
      const rightLive = LIVE_STATUSES.has(right.match.status) ? 0 : UPCOMING_STATUSES.has(right.match.status) ? 1 : 2;
      if (leftLive !== rightLive) return leftLive - rightLive;
      return matchMoment(left.match) - matchMoment(right.match);
    });
}

export function findDefaultOperatorMatch(payload: PublicCourtsidePayload): DecoratedMatch | null {
  const decorated = featuredMatches(payload.formats);
  return decorated.find((entry) => LIVE_STATUSES.has(entry.match.status))
    ?? decorated.find((entry) => UPCOMING_STATUSES.has(entry.match.status))
    ?? decorated[0]
    ?? null;
}

export function useTournamentPublicPayload(tournamentId: number, refreshMs = 20000): TournamentViewLoadState {
  const [payload, setPayload] = useState<PublicCourtsidePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!Number.isInteger(tournamentId)) {
      setLoading(false);
      setError('Invalid tournament URL.');
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`${API_BASE}/tournaments/public/${tournamentId}/courtside`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Unable to load tournament display (HTTP ${response.status}).`);
        }
        const nextPayload = (await response.json()) as PublicCourtsidePayload;
        if (cancelled) return;
        startTransition(() => {
          setPayload(nextPayload);
          setError('');
          setLoading(false);
        });
      } catch (loadError) {
        if (cancelled) return;
        setLoading(false);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load tournament display.');
      }
    }

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, refreshMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tournamentId, refreshMs]);

  return { payload, loading, error };
}
