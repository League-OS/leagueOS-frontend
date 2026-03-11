import type { Season } from '@leagueos/schemas';

export type FormatType = 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
export type SchedulingModel = '' | 'RR' | 'GROUPS_KO' | 'MATCH_COUNT_KO' | 'DIRECT_KNOCKOUT';
export type WinCondition = 'FIRST_TO_POINTS' | 'WIN_BY_2';
export type ViewTab = 'config' | 'pool' | 'schedules' | 'courts';

export type StageRule = {
  setsToWin: 1 | 2 | 3;
  winCondition: WinCondition;
  pointsToWinSet: number;
  maxPointsPerSet?: number;
  winPoints: number;
  lossPoints: number;
  forfeitPoints: number;
  drawPoints: number;
};

export type FormatConfig = {
  maxTeamsAllowed: number;
  setDurationMinutes: number;
  schedulingModel: SchedulingModel;
  rrType: 'single' | 'double';
  rrIncludeKo: 'yes' | 'no';
  rrTeamsToKo: number;
  groupCount: number;
  groupKoTeamsPerGroup: number;
  matchCountPerEntrant: number;
  matchCountKoTeamsToKo: number;
  seedSource: 'ELO' | 'MANUAL';
  stageRules: Record<string, StageRule>;
};

export type PoolPlayer = { playerId: string; registeredAt: string; regRoute?: 'ADMIN' | 'SELF' };
export type GeneratedTeam = { id: string; name: string; playerIds: string[]; elo: number };
export type Group = { id: string; name: string };

export type CourtAvailabilitySlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
};

export type CourtConfig = {
  globalWindowStart: string;
  globalWindowEnd: string;
  availability: Record<string, CourtAvailabilitySlot[]>;
};

export type PoolConfig = {
  groupCount: number;
  poolPlayers: PoolPlayer[];
  generatedTeams: GeneratedTeam[];
  groups: Group[];
  assignments: Record<string, string[]>;
  teamsGenerated: boolean;
  pairsValidated: boolean;
  pairValidationMessage: string;
};

export type Format = {
  id: string;
  name: string;
  type: FormatType;
  regOpen: string;
  regClose: string;
  autoClose: boolean;
  scheduleGeneratedAt?: string | null;
  scheduleLocked?: boolean;
  config: FormatConfig;
  pool: PoolConfig;
  courtConfig: CourtConfig;
  courtAssignments: Record<string, string[]>;
  metaConfigJson?: Record<string, unknown>;
};

export type CourtItem = { id: string; name: string };

export type TournamentRecord = {
  id: string;
  name: string;
  timezone: string;
  seasonId: string;
  seasonName: string;
  adminNotes: string;
  status: 'Draft' | 'Configured';
  formats: Format[];
  courts: CourtItem[];
};

export type ClubPlayer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  elo: number;
  eloSingles?: number;
  eloDoubles?: number;
  eloMixed?: number;
};

export type PlanningMetrics = {
  matches: number;
  sets: number;
  duration: string;
  warnings: string[];
};

export type StageDef = { id: string; label: string };

export type SeasonSource = 'api' | 'fallback';

export type SeasonList = Season[];

export type FormatFormDraft = {
  name: string;
  type: FormatType;
  regOpen: string;
  regClose: string;
  autoClose: boolean;
};

export type SlotDraft = {
  date: string;
  startTime: string;
  endTime: string;
};
