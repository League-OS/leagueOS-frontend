import type { Season } from '@leagueos/schemas';

import type {
  ClubPlayer,
  CourtConfig,
  FormatConfig,
  FormatFormDraft,
  PlanningMetrics,
  PoolConfig,
  SlotDraft,
  StageDef,
  StageRule,
} from './types';

export const mockPlayers: ClubPlayer[] = [
  { id: 'p1', name: 'Noah Singh', email: 'noah@club.test', phone: '+1 555-1001', elo: 1748 },
  { id: 'p2', name: 'Maya Chen', email: 'maya@club.test', phone: '+1 555-1002', elo: 1708 },
  { id: 'p3', name: 'Aarav Sharma', email: 'aarav@club.test', phone: '+1 555-1003', elo: 1681 },
  { id: 'p4', name: 'Ava Martin', email: 'ava@club.test', phone: '+1 555-1004', elo: 1673 },
  { id: 'p5', name: 'Liam Patel', email: 'liam@club.test', phone: '+1 555-1005', elo: 1651 },
  { id: 'p6', name: 'Emma Wong', email: 'emma@club.test', phone: '+1 555-1006', elo: 1635 },
  { id: 'p7', name: 'Nora Diaz', email: 'nora@club.test', phone: '+1 555-1007', elo: 1618 },
  { id: 'p8', name: 'Ethan Das', email: 'ethan@club.test', phone: '+1 555-1008', elo: 1603 },
];

export const fallbackSeasons: Season[] = [
  {
    id: 9001,
    club_id: 1,
    name: 'Spring 2026',
    format: 'DOUBLES',
    weekday: 2,
    start_time_local: '18:00:00',
    timezone: 'America/Vancouver',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 9002,
    club_id: 1,
    name: 'Summer 2026',
    format: 'MIXED_DOUBLES',
    weekday: 4,
    start_time_local: '18:00:00',
    timezone: 'America/Vancouver',
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

export const defaultStageRule = (): StageRule => ({
  setsToWin: 1,
  winCondition: 'FIRST_TO_POINTS',
  pointsToWinSet: 21,
  maxPointsPerSet: 30,
  winPoints: 3,
  lossPoints: 0,
  forfeitPoints: 3,
  drawPoints: 1,
});

export const defaultFormatConfig = (): FormatConfig => ({
  maxTeamsAllowed: 16,
  setDurationMinutes: 10,
  schedulingModel: 'DIRECT_KNOCKOUT',
  rrType: 'single',
  rrIncludeKo: 'no',
  rrTeamsToKo: 4,
  groupCount: 2,
  groupKoTeamsPerGroup: 2,
  matchCountPerEntrant: 4,
  matchCountKoTeamsToKo: 4,
  seedSource: 'ELO',
  stageRules: {},
});

export const defaultPoolConfig = (): PoolConfig => ({
  groupCount: 2,
  poolPlayers: [],
  generatedTeams: [],
  groups: [],
  assignments: {},
  teamsGenerated: false,
});

export const defaultCourtConfig = (): CourtConfig => ({
  globalWindowStart: '2026-04-10T09:00',
  globalWindowEnd: '2026-04-10T21:00',
  availability: {},
});

export const defaultFormatFormDraft = (): FormatFormDraft => ({
  name: '',
  type: 'DOUBLES',
  regOpen: '2026-03-20T09:00',
  regClose: '2026-04-02T20:00',
  autoClose: true,
});

export const defaultSlotDraft = (): SlotDraft => ({
  date: '2026-04-10',
  startTime: '09:00',
  endTime: '12:00',
});

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function fmtDuration(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const hours = String(Math.floor(mins / 60)).padStart(2, '0');
  const minutes = String(mins % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getBracketSize(entrants: number): number {
  const n = Math.max(0, Math.floor(entrants));
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

function knockoutLabel(size: number): string {
  if (size === 16) return 'Pre Quarter';
  if (size === 8) return 'Quarter Final';
  if (size === 4) return 'Semi Final';
  if (size === 2) return 'Final';
  return `Round of ${size}`;
}

export type KnockoutDef = {
  idSuffix: string;
  label: string;
  matches: number;
  entries: number;
  bracketSize: number;
};

export function knockoutDefs(entrants: number): KnockoutDef[] {
  const entry = Math.max(0, Math.floor(entrants));
  if (entry < 2) return [];
  const size = getBracketSize(entry);
  const rounds: KnockoutDef[] = [];
  let remaining = entry;
  for (let roundSize = size; roundSize >= 2; roundSize /= 2) {
    const label = knockoutLabel(roundSize);
    const matches = Math.max(0, remaining - roundSize / 2);
    rounds.push({
      idSuffix: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      label,
      matches,
      entries: remaining,
      bracketSize: roundSize,
    });
    remaining = Math.max(0, remaining - matches);
  }
  return rounds;
}

export function buildStages(config: FormatConfig): StageDef[] {
  if (!config.schedulingModel) return [];
  if (config.schedulingModel === 'RR') {
    const stages: StageDef[] = [
      { id: 'RR_main', label: config.rrType === 'double' ? 'Double Round Robin' : 'Single Round Robin' },
    ];
    if (config.rrIncludeKo === 'yes') {
      knockoutDefs(config.rrTeamsToKo).forEach((round) => {
        stages.push({ id: `RR_ko_${round.idSuffix}`, label: round.label });
      });
    }
    return stages;
  }
  if (config.schedulingModel === 'GROUPS_KO') {
    const koTeams = config.groupCount * config.groupKoTeamsPerGroup;
    return [
      { id: 'GK_group', label: `Group Stage (${config.groupCount} groups)` },
      ...knockoutDefs(koTeams).map((round) => ({ id: `GK_${round.idSuffix}`, label: round.label })),
    ];
  }
  if (config.schedulingModel === 'MATCH_COUNT_KO') {
    return [
      { id: 'MCKo_rounds', label: `${config.matchCountPerEntrant} controlled matches per entrant` },
      ...knockoutDefs(config.matchCountKoTeamsToKo).map((round) => ({ id: `MCKo_${round.idSuffix}`, label: round.label })),
    ];
  }
  return knockoutDefs(config.maxTeamsAllowed).map((round) => ({ id: `DK_${round.idSuffix}`, label: round.label }));
}

export function isKoStage(stageId: string): boolean {
  if (stageId === 'GK_group' || stageId === 'RR_main' || stageId === 'MCKo_rounds') return false;
  return stageId.startsWith('RR_ko_') || stageId.startsWith('GK_') || stageId.startsWith('MCKo_') || stageId.startsWith('DK_');
}

export function computePlanningMetrics(config: FormatConfig): PlanningMetrics {
  let totalMatches = 0;
  const stageMatches: Record<string, number> = {};
  const warnings: string[] = [];

  if (config.schedulingModel === 'RR') {
    const rrBase = (config.maxTeamsAllowed * (config.maxTeamsAllowed - 1)) / 2;
    stageMatches.RR_main = rrBase * (config.rrType === 'double' ? 2 : 1);
    totalMatches += stageMatches.RR_main;
    if (config.rrIncludeKo === 'yes') {
      knockoutDefs(config.rrTeamsToKo).forEach((round) => {
        stageMatches[`RR_ko_${round.idSuffix}`] = round.matches;
        totalMatches += round.matches;
        if (round.entries < round.bracketSize) {
          warnings.push(`${round.label}: wildcards/byes will be used (${round.entries}/${round.bracketSize}).`);
        }
      });
    }
  } else if (config.schedulingModel === 'GROUPS_KO') {
    const groups = Math.max(1, config.groupCount);
    const base = Math.floor(config.maxTeamsAllowed / groups);
    const remainder = config.maxTeamsAllowed % groups;
    let groupMatches = 0;
    for (let i = 0; i < groups; i += 1) {
      const size = i < remainder ? base + 1 : base;
      groupMatches += (size * (size - 1)) / 2;
    }
    stageMatches.GK_group = groupMatches;
    totalMatches += groupMatches;
    knockoutDefs(config.groupCount * config.groupKoTeamsPerGroup).forEach((round) => {
      stageMatches[`GK_${round.idSuffix}`] = round.matches;
      totalMatches += round.matches;
      if (round.entries < round.bracketSize) {
        warnings.push(`${round.label}: wildcards/byes will be used (${round.entries}/${round.bracketSize}).`);
      }
    });
  } else if (config.schedulingModel === 'MATCH_COUNT_KO') {
    stageMatches.MCKo_rounds = Math.floor((config.maxTeamsAllowed * config.matchCountPerEntrant) / 2);
    totalMatches += stageMatches.MCKo_rounds;
    knockoutDefs(config.matchCountKoTeamsToKo).forEach((round) => {
      stageMatches[`MCKo_${round.idSuffix}`] = round.matches;
      totalMatches += round.matches;
      if (round.entries < round.bracketSize) {
        warnings.push(`${round.label}: wildcards/byes will be used (${round.entries}/${round.bracketSize}).`);
      }
    });
  } else if (config.schedulingModel === 'DIRECT_KNOCKOUT') {
    knockoutDefs(config.maxTeamsAllowed).forEach((round) => {
      stageMatches[`DK_${round.idSuffix}`] = round.matches;
      totalMatches += round.matches;
      if (round.entries < round.bracketSize) {
        warnings.push(`${round.label}: wildcards/byes will be used (${round.entries}/${round.bracketSize}).`);
      }
    });
  }

  let totalSets = 0;
  let totalDuration = 0;
  buildStages(config).forEach((stage) => {
    const matches = stageMatches[stage.id] || 0;
    const rule = config.stageRules[stage.id] || defaultStageRule();
    const setsToWin = Math.max(1, Number(rule.setsToWin || 1));
    const maxSetsInMatch = (2 * setsToWin) - 1;
    totalSets += matches * maxSetsInMatch;
    totalDuration += matches * ((maxSetsInMatch * config.setDurationMinutes) + ((maxSetsInMatch - 1) * 2));
  });

  return {
    matches: totalMatches,
    sets: totalSets,
    duration: fmtDuration(totalDuration),
    warnings: [...new Set(warnings)],
  };
}

export function getTimezoneOptions(): string[] {
  const defaultZones = ['America/Vancouver', 'America/Toronto', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC'];
  try {
    const intlAny = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    const supported = typeof Intl !== 'undefined' && typeof intlAny.supportedValuesOf === 'function'
      ? (intlAny.supportedValuesOf('timeZone') || [])
      : [];
    return defaultZones.filter((zone) => (supported.length ? supported.includes(zone) : true));
  } catch {
    return defaultZones;
  }
}
