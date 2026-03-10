'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { LeagueOsApiClient } from '@leagueos/api';
import type { Season } from '@leagueos/schemas';

type FormatType = 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
type SchedulingModel = '' | 'RR' | 'GROUPS_KO' | 'MATCH_COUNT_KO' | 'DIRECT_KNOCKOUT';
type WinCondition = 'FIRST_TO_POINTS' | 'WIN_BY_2';
type ViewTab = 'config' | 'pool' | 'schedules' | 'courts';

type StageRule = {
  setsToWin: 1 | 2 | 3;
  winCondition: WinCondition;
  pointsToWinSet: number;
  maxPointsPerSet?: number;
  winPoints: number;
  lossPoints: number;
  forfeitPoints: number;
  drawPoints: number;
};

type FormatConfig = {
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

type PoolPlayer = { playerId: string; registeredAt: string; regRoute?: 'ADMIN' | 'SELF' };
type GeneratedTeam = { id: string; name: string; playerIds: string[]; elo: number };
type Group = { id: string; name: string };
type CourtAvailabilitySlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
};
type CourtConfig = {
  globalWindowStart: string;
  globalWindowEnd: string;
  availability: Record<string, CourtAvailabilitySlot[]>;
};
type PoolConfig = {
  groupCount: number;
  poolPlayers: PoolPlayer[];
  generatedTeams: GeneratedTeam[];
  groups: Group[];
  assignments: Record<string, string[]>;
  teamsGenerated: boolean;
};

type Format = {
  id: string;
  name: string;
  type: FormatType;
  regOpen: string;
  regClose: string;
  autoClose: boolean;
  config: FormatConfig;
  pool: PoolConfig;
  courtConfig: CourtConfig;
  courtAssignments: Record<string, string[]>;
};

type TournamentRecord = {
  id: string;
  name: string;
  timezone: string;
  seasonId: string;
  seasonName: string;
  adminNotes: string;
  status: 'Draft' | 'Configured';
  formats: Format[];
  courts: Array<{ id: string; name: string }>;
};

type ClubPlayer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  elo: number;
};

const mockPlayers: ClubPlayer[] = [
  { id: 'p1', name: 'Noah Singh', email: 'noah@club.test', phone: '+1 555-1001', elo: 1748 },
  { id: 'p2', name: 'Maya Chen', email: 'maya@club.test', phone: '+1 555-1002', elo: 1708 },
  { id: 'p3', name: 'Aarav Sharma', email: 'aarav@club.test', phone: '+1 555-1003', elo: 1681 },
  { id: 'p4', name: 'Ava Martin', email: 'ava@club.test', phone: '+1 555-1004', elo: 1673 },
  { id: 'p5', name: 'Liam Patel', email: 'liam@club.test', phone: '+1 555-1005', elo: 1651 },
  { id: 'p6', name: 'Emma Wong', email: 'emma@club.test', phone: '+1 555-1006', elo: 1635 },
  { id: 'p7', name: 'Nora Diaz', email: 'nora@club.test', phone: '+1 555-1007', elo: 1618 },
  { id: 'p8', name: 'Ethan Das', email: 'ethan@club.test', phone: '+1 555-1008', elo: 1603 },
];

const fallbackSeasons: Season[] = [
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

const defaultStageRule = (): StageRule => ({
  setsToWin: 1,
  winCondition: 'FIRST_TO_POINTS',
  pointsToWinSet: 21,
  maxPointsPerSet: 30,
  winPoints: 3,
  lossPoints: 0,
  forfeitPoints: 3,
  drawPoints: 1,
});

const defaultFormatConfig = (): FormatConfig => ({
  maxTeamsAllowed: 16,
  setDurationMinutes: 10,
  schedulingModel: '',
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

const defaultPoolConfig = (): PoolConfig => ({
  groupCount: 2,
  poolPlayers: [],
  generatedTeams: [],
  groups: [],
  assignments: {},
  teamsGenerated: false,
});

const defaultCourtConfig = (): CourtConfig => ({
  globalWindowStart: '2026-04-10T09:00',
  globalWindowEnd: '2026-04-10T21:00',
  availability: {},
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fmtDuration(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function getBracketSize(entrants: number): number {
  const n = Math.max(0, Math.floor(entrants));
  let s = 2;
  while (s < n) s *= 2;
  return s;
}

function knockoutLabel(size: number): string {
  if (size === 16) return 'Pre Quarter';
  if (size === 8) return 'Quarter Final';
  if (size === 4) return 'Semi Final';
  if (size === 2) return 'Final';
  return `Round of ${size}`;
}

function knockoutDefs(entrants: number): Array<{ idSuffix: string; label: string; matches: number; entries: number; bracketSize: number }> {
  const entry = Math.max(0, Math.floor(entrants));
  if (entry < 2) return [];
  const size = getBracketSize(entry);
  const out: Array<{ idSuffix: string; label: string; matches: number; entries: number; bracketSize: number }> = [];
  let remaining = entry;
  for (let roundSize = size; roundSize >= 2; roundSize /= 2) {
    const label = knockoutLabel(roundSize);
    const matches = Math.max(0, remaining - roundSize / 2);
    out.push({ idSuffix: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label, matches, entries: remaining, bracketSize: roundSize });
    remaining = Math.max(0, remaining - matches);
  }
  return out;
}

function buildStages(config: FormatConfig): Array<{ id: string; label: string }> {
  if (!config.schedulingModel) return [];
  if (config.schedulingModel === 'RR') {
    const stages = [{ id: 'RR_main', label: config.rrType === 'double' ? 'Double Round Robin' : 'Single Round Robin' }];
    if (config.rrIncludeKo === 'yes') {
      knockoutDefs(config.rrTeamsToKo).forEach((r) => stages.push({ id: `RR_ko_${r.idSuffix}`, label: r.label }));
    }
    return stages;
  }
  if (config.schedulingModel === 'GROUPS_KO') {
    const koTeams = config.groupCount * config.groupKoTeamsPerGroup;
    return [
      { id: 'GK_group', label: `Group Stage (${config.groupCount} groups)` },
      ...knockoutDefs(koTeams).map((r) => ({ id: `GK_${r.idSuffix}`, label: r.label })),
    ];
  }
  if (config.schedulingModel === 'MATCH_COUNT_KO') {
    return [
      { id: 'MCKo_rounds', label: `${config.matchCountPerEntrant} controlled matches per entrant` },
      ...knockoutDefs(config.matchCountKoTeamsToKo).map((r) => ({ id: `MCKo_${r.idSuffix}`, label: r.label })),
    ];
  }
  return knockoutDefs(config.maxTeamsAllowed).map((r) => ({ id: `DK_${r.idSuffix}`, label: r.label }));
}

function isKoStage(stageId: string): boolean {
  if (stageId === 'GK_group' || stageId === 'RR_main' || stageId === 'MCKo_rounds') return false;
  if (stageId.startsWith('RR_ko_') || stageId.startsWith('GK_') || stageId.startsWith('MCKo_') || stageId.startsWith('DK_')) return true;
  return false;
}

export function TournamentsWorkspace({ embedded = false }: { embedded?: boolean }) {
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentTimezone, setTournamentTimezone] = useState('America/Vancouver');
  const [tournamentSeasonId, setTournamentSeasonId] = useState('');
  const [tournamentAdminNotes, setTournamentAdminNotes] = useState('');
  const [clubSeasons, setClubSeasons] = useState<Season[]>([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonLoadError, setSeasonLoadError] = useState('');
  const [seasonSource, setSeasonSource] = useState<'api' | 'fallback'>('fallback');
  const [tournaments, setTournaments] = useState<TournamentRecord[]>([]);
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);
  const [showCreateTournament, setShowCreateTournament] = useState(false);
  const [tournamentFormError, setTournamentFormError] = useState('');
  const [formats, setFormats] = useState<Format[]>([]);
  const [activeFormatId, setActiveFormatId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>('config');
  const [showAddFormat, setShowAddFormat] = useState(false);
  const [formatFormError, setFormatFormError] = useState('');
  const [courts, setCourts] = useState<Array<{ id: string; name: string }>>([]);
  const [courtName, setCourtName] = useState('');
  const [showAddCourtModal, setShowAddCourtModal] = useState(false);
  const [formDraft, setFormDraft] = useState({ name: '', type: 'DOUBLES' as FormatType, regOpen: '2026-03-20T09:00', regClose: '2026-04-02T20:00', autoClose: true });

  const [configDraft, setConfigDraft] = useState<FormatConfig | null>(null);
  const [formatNameDraft, setFormatNameDraft] = useState('');
  const [poolDraft, setPoolDraft] = useState<PoolConfig | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<Record<string, string[]>>({});
  const [courtConfigDraft, setCourtConfigDraft] = useState<CourtConfig | null>(null);
  const [configDirty, setConfigDirty] = useState(false);
  const [poolDirty, setPoolDirty] = useState(false);
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [courtDirty, setCourtDirty] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [addPlayerId, setAddPlayerId] = useState('');
  const [stageCourtAssignmentsOpen, setStageCourtAssignmentsOpen] = useState(true);
  const [activeCourtId, setActiveCourtId] = useState<string | null>(null);
  const [slotDraft, setSlotDraft] = useState<{ date: string; startTime: string; endTime: string }>({
    date: '2026-04-10',
    startTime: '09:00',
    endTime: '12:00',
  });

  const activeFormat = useMemo(() => formats.find((f) => f.id === activeFormatId) ?? null, [formats, activeFormatId]);
  const stageDefs = useMemo(() => (configDraft ? buildStages(configDraft) : []), [configDraft]);
  const timezoneOptions = useMemo(() => {
    const defaultZones = ['America/Vancouver', 'America/Toronto', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC'];
    try {
      // Supported in modern browsers; keep a compact list for usability.
      const intlAny = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
      const supported = typeof Intl !== 'undefined' && typeof intlAny.supportedValuesOf === 'function'
        ? (intlAny.supportedValuesOf('timeZone') || [])
        : [];
      const shortlist = ['America/Vancouver', 'America/Toronto', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC'];
      return shortlist.filter((zone) => supported.length ? supported.includes(zone) : true);
    } catch {
      return defaultZones;
    }
  }, []);
  const selectedSeasonName = useMemo(() => {
    const selected = clubSeasons.find((season) => String(season.id) === tournamentSeasonId);
    return selected?.name || '';
  }, [clubSeasons, tournamentSeasonId]);
  const activeTournament = useMemo(() => tournaments.find((item) => item.id === activeTournamentId) || null, [tournaments, activeTournamentId]);

  useEffect(() => {
    let cancelled = false;
    const client = new LeagueOsApiClient({
      apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000',
    });
    async function loadClubSeasons() {
      setSeasonLoadError('');
      setSeasonLoading(true);
      try {
        if (typeof window === 'undefined') return;
        const raw = window.localStorage.getItem('leagueos.admin.auth');
        if (!raw) {
          setClubSeasons(fallbackSeasons);
          setSeasonSource('fallback');
          if (fallbackSeasons.length && !tournamentSeasonId) setTournamentSeasonId(String(fallbackSeasons[0].id));
          return;
        }
        const parsed = JSON.parse(raw) as { token?: string; clubId?: number };
        if (!parsed?.token || !Number.isInteger(parsed?.clubId)) {
          setClubSeasons(fallbackSeasons);
          setSeasonSource('fallback');
          if (fallbackSeasons.length && !tournamentSeasonId) setTournamentSeasonId(String(fallbackSeasons[0].id));
          return;
        }
        const seasons = await client.seasons(parsed.token, parsed.clubId as number);
        if (cancelled) return;
        setClubSeasons(seasons.length ? seasons : fallbackSeasons);
        setSeasonSource(seasons.length ? 'api' : 'fallback');
        if (seasons.length && !tournamentSeasonId) setTournamentSeasonId(String(seasons[0].id));
        if (!seasons.length && fallbackSeasons.length && !tournamentSeasonId) setTournamentSeasonId(String(fallbackSeasons[0].id));
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to load seasons.';
        setSeasonLoadError(`Live season load failed (${message}). Using local list.`);
        setClubSeasons(fallbackSeasons);
        setSeasonSource('fallback');
        if (fallbackSeasons.length && !tournamentSeasonId) setTournamentSeasonId(String(fallbackSeasons[0].id));
      } finally {
        if (!cancelled) setSeasonLoading(false);
      }
    }
    void loadClubSeasons();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!courts.length) {
      if (activeCourtId) setActiveCourtId(null);
      return;
    }
    if (!activeCourtId || !courts.some((court) => court.id === activeCourtId)) {
      setActiveCourtId(courts[0].id);
    }
  }, [courts, activeCourtId]);

  function loadDrafts(format: Format) {
    setFormatNameDraft(format.name);
    setConfigDraft(clone(format.config));
    setPoolDraft(clone(format.pool));
    setScheduleDraft(clone(format.courtAssignments));
    setCourtConfigDraft(clone(format.courtConfig || defaultCourtConfig()));
    setConfigDirty(false);
    setPoolDirty(false);
    setScheduleDirty(false);
    setCourtDirty(false);
  }

  function canSwitch(): boolean {
    if (!configDirty && !poolDirty && !scheduleDirty && !courtDirty) return true;
    return window.confirm('Unsaved changes detected. Continue without saving?');
  }

  function createTournament() {
    const name = tournamentName.trim();
    if (!name) {
      setTournamentFormError('Tournament name is required.');
      return;
    }
    const id = `trn_${tournaments.length + 1}`;
    const record: TournamentRecord = {
      id,
      name,
      timezone: tournamentTimezone,
      seasonId: tournamentSeasonId,
      seasonName: selectedSeasonName || 'No season',
      adminNotes: tournamentAdminNotes.trim(),
      status: 'Draft',
      formats: [],
      courts: [],
    };
    setTournaments((prev) => [...prev, record]);
    setActiveTournamentId(id);
    setShowCreateTournament(false);
    setShowAddFormat(true);
    setTournamentFormError('');
    setFormats([]);
    setCourts([]);
    setActiveFormatId(null);
    setConfigDraft(null);
    setPoolDraft(null);
    setScheduleDraft({});
    setCourtConfigDraft(null);
    setConfigDirty(false);
    setPoolDirty(false);
    setScheduleDirty(false);
    setCourtDirty(false);
    setShowAddCourtModal(false);
  }

  function showSavedNotice(text = 'Saved') {
    setSaveNotice(text);
    window.setTimeout(() => setSaveNotice(''), 1800);
  }

  function saveFormatBase() {
    if (!formDraft.name.trim()) {
      setFormatFormError('Format name is required.');
      return;
    }
    const id = `fmt_${formats.length + 1}`;
    const next: Format = {
      id,
      name: formDraft.name.trim(),
      type: formDraft.type,
      regOpen: formDraft.regOpen,
      regClose: formDraft.regClose,
      autoClose: formDraft.autoClose,
      config: defaultFormatConfig(),
      pool: defaultPoolConfig(),
      courtConfig: defaultCourtConfig(),
      courtAssignments: {},
    };
    setFormats((prev) => {
      const updated = [...prev, next];
      if (activeTournamentId) {
        setTournaments((items) => items.map((item) => (item.id === activeTournamentId ? { ...item, formats: updated } : item)));
      }
      return updated;
    });
    setActiveFormatId(id);
    setActiveTab('config');
    setShowAddFormat(false);
    setFormDraft({ name: '', type: 'DOUBLES', regOpen: '2026-03-20T09:00', regClose: '2026-04-02T20:00', autoClose: true });
    setFormatFormError('');
    loadDrafts(next);
  }

  function openTournament(tournamentId: string) {
    if (!canSwitch()) return;
    const target = tournaments.find((item) => item.id === tournamentId);
    if (!target) return;
    setActiveTournamentId(tournamentId);
    setShowCreateTournament(false);
    setShowAddFormat(false);
    setFormats(clone(target.formats || []));
    setCourts(clone(target.courts || []));
    setActiveCourtId(target.courts[0]?.id || null);
    setActiveFormatId(target.formats[0]?.id || null);
    if (target.formats[0]) {
      loadDrafts(target.formats[0]);
    } else {
      setFormatNameDraft('');
      setConfigDraft(null);
      setPoolDraft(null);
      setScheduleDraft({});
      setCourtConfigDraft(null);
      setConfigDirty(false);
      setPoolDirty(false);
      setScheduleDirty(false);
      setCourtDirty(false);
    }
  }

  function updateActiveTournamentFormats(nextFormats: Format[]) {
    if (!activeTournamentId) return;
    setTournaments((items) => items.map((item) => (item.id === activeTournamentId ? { ...item, formats: nextFormats } : item)));
  }

  function updateActiveTournamentCourts(nextCourts: Array<{ id: string; name: string }>) {
    if (!activeTournamentId) return;
    setTournaments((items) => items.map((item) => (item.id === activeTournamentId ? { ...item, courts: nextCourts } : item)));
  }

  function openFormat(formatId: string, tab: ViewTab) {
    if (!canSwitch()) return;
    const target = formats.find((f) => f.id === formatId);
    if (!target) return;
    setShowAddFormat(false);
    setActiveFormatId(formatId);
    setActiveTab(tab);
    loadDrafts(target);
  }

  function switchTab(tab: ViewTab) {
    if (tab === activeTab) return;
    if (!canSwitch()) return;
    setActiveTab(tab);
  }

  function saveConfig() {
    if (!activeFormat || !configDraft) return;
    if (!formatNameDraft.trim()) {
      window.alert('Format name is required.');
      return;
    }
    const merged = clone(configDraft);
    const stagedRules: Record<string, StageRule> = {};
    buildStages(merged).forEach((stage) => {
      stagedRules[stage.id] = merged.stageRules[stage.id] || defaultStageRule();
    });
    merged.stageRules = stagedRules;
    setFormats((prev) => {
      const updated = prev.map((f) => (f.id === activeFormat.id ? { ...f, name: formatNameDraft.trim(), config: merged } : f));
      updateActiveTournamentFormats(updated);
      return updated;
    });
    setConfigDirty(false);
    showSavedNotice('Configuration saved');
  }

  function savePool() {
    if (!activeFormat || !poolDraft) return;
    setFormats((prev) => {
      const updated = prev.map((f) => (f.id === activeFormat.id ? { ...f, pool: clone(poolDraft) } : f));
      updateActiveTournamentFormats(updated);
      return updated;
    });
    setPoolDirty(false);
    showSavedNotice('Pool saved');
  }

  function saveSchedules() {
    if (!activeFormat || !courtConfigDraft) return;
    setFormats((prev) => {
      const updated = prev.map((f) => (f.id === activeFormat.id ? { ...f, courtAssignments: clone(scheduleDraft), courtConfig: clone(courtConfigDraft) } : f));
      updateActiveTournamentFormats(updated);
      return updated;
    });
    setScheduleDirty(false);
    setCourtDirty(false);
    showSavedNotice('Schedules saved');
  }

  function saveCourtsConfig() {
    if (!activeFormat || !courtConfigDraft) return;
    setFormats((prev) => {
      const updated = prev.map((f) => (f.id === activeFormat.id ? { ...f, courtConfig: clone(courtConfigDraft) } : f));
      updateActiveTournamentFormats(updated);
      return updated;
    });
    setCourtDirty(false);
    showSavedNotice('Court availability saved');
  }

  function updateConfig(next: Partial<FormatConfig>) {
    setConfigDraft((prev) => {
      if (!prev) return prev;
      const merged: FormatConfig = { ...prev, ...next };
      const nextStageIds = new Set(buildStages(merged).map((s) => s.id));
      const nextRules: Record<string, StageRule> = {};
      nextStageIds.forEach((stageId) => {
        nextRules[stageId] = merged.stageRules[stageId] || defaultStageRule();
      });
      merged.stageRules = nextRules;
      return merged;
    });
    setConfigDirty(true);
  }

  function updateStageRule(stageId: string, patch: Partial<StageRule>) {
    if (!configDraft) return;
    const current = configDraft.stageRules[stageId] || defaultStageRule();
    const updated = { ...current, ...patch };
    setConfigDraft({
      ...configDraft,
      stageRules: {
        ...configDraft.stageRules,
        [stageId]: updated,
      },
    });
    setConfigDirty(true);
  }

  function planning() {
    if (!configDraft) return { matches: 0, sets: 0, duration: '00:00', warnings: [] as string[] };
    const cfg = configDraft;
    let totalMatches = 0;
    const stageMatches: Record<string, number> = {};
    const warnings: string[] = [];

    if (cfg.schedulingModel === 'RR') {
      const rrBase = (cfg.maxTeamsAllowed * (cfg.maxTeamsAllowed - 1)) / 2;
      stageMatches.RR_main = rrBase * (cfg.rrType === 'double' ? 2 : 1);
      totalMatches += stageMatches.RR_main;
      if (cfg.rrIncludeKo === 'yes') {
        knockoutDefs(cfg.rrTeamsToKo).forEach((r) => {
          stageMatches[`RR_ko_${r.idSuffix}`] = r.matches;
          totalMatches += r.matches;
          if (r.entries < r.bracketSize) warnings.push(`${r.label}: wildcards/byes will be used (${r.entries}/${r.bracketSize}).`);
        });
      }
    } else if (cfg.schedulingModel === 'GROUPS_KO') {
      const groups = Math.max(1, cfg.groupCount);
      const base = Math.floor(cfg.maxTeamsAllowed / groups);
      const rem = cfg.maxTeamsAllowed % groups;
      let groupMatches = 0;
      for (let i = 0; i < groups; i += 1) {
        const size = i < rem ? base + 1 : base;
        groupMatches += (size * (size - 1)) / 2;
      }
      stageMatches.GK_group = groupMatches;
      totalMatches += groupMatches;
      knockoutDefs(cfg.groupCount * cfg.groupKoTeamsPerGroup).forEach((r) => {
        stageMatches[`GK_${r.idSuffix}`] = r.matches;
        totalMatches += r.matches;
        if (r.entries < r.bracketSize) warnings.push(`${r.label}: wildcards/byes will be used (${r.entries}/${r.bracketSize}).`);
      });
    } else if (cfg.schedulingModel === 'MATCH_COUNT_KO') {
      stageMatches.MCKo_rounds = Math.floor((cfg.maxTeamsAllowed * cfg.matchCountPerEntrant) / 2);
      totalMatches += stageMatches.MCKo_rounds;
      knockoutDefs(cfg.matchCountKoTeamsToKo).forEach((r) => {
        stageMatches[`MCKo_${r.idSuffix}`] = r.matches;
        totalMatches += r.matches;
        if (r.entries < r.bracketSize) warnings.push(`${r.label}: wildcards/byes will be used (${r.entries}/${r.bracketSize}).`);
      });
    } else if (cfg.schedulingModel === 'DIRECT_KNOCKOUT') {
      knockoutDefs(cfg.maxTeamsAllowed).forEach((r) => {
        stageMatches[`DK_${r.idSuffix}`] = r.matches;
        totalMatches += r.matches;
        if (r.entries < r.bracketSize) warnings.push(`${r.label}: wildcards/byes will be used (${r.entries}/${r.bracketSize}).`);
      });
    }

    let totalSets = 0;
    let totalDuration = 0;
    buildStages(cfg).forEach((stage) => {
      const m = stageMatches[stage.id] || 0;
      const rule = cfg.stageRules[stage.id] || defaultStageRule();
      const setsToWin = Math.max(1, Number(rule.setsToWin || 1));
      const maxSetsInMatch = (2 * setsToWin) - 1;
      totalSets += m * maxSetsInMatch;
      totalDuration += m * ((maxSetsInMatch * cfg.setDurationMinutes) + ((maxSetsInMatch - 1) * 2));
    });
    return { matches: totalMatches, sets: totalSets, duration: fmtDuration(totalDuration), warnings: [...new Set(warnings)] };
  }

  function addCourt() {
    if (!courtName.trim()) return;
    const courtId = `court_${courts.length + 1}`;
    setCourts((prev) => {
      const name = courtName.trim();
      if (prev.some((court) => court.name.toLowerCase() === name.toLowerCase())) return prev;
      const updated = [...prev, { id: courtId, name }];
      updateActiveTournamentCourts(updated);
      return updated;
    });
    if (!activeCourtId) setActiveCourtId(courtId);
    setCourtName('');
    setShowAddCourtModal(false);
  }

  function addCourtAvailabilitySlot() {
    if (!courtConfigDraft || !activeCourtId) return;
    if (!slotDraft.date || !slotDraft.startTime || !slotDraft.endTime) return;
    const next = clone(courtConfigDraft);
    const slots = next.availability[activeCourtId] || [];
    slots.push({
      id: `slot_${slots.length + 1}_${Date.now()}`,
      date: slotDraft.date,
      startTime: slotDraft.startTime,
      endTime: slotDraft.endTime,
    });
    next.availability[activeCourtId] = slots;
    setCourtConfigDraft(next);
    setCourtDirty(true);
  }

  function removeCourtAvailabilitySlot(slotId: string) {
    if (!courtConfigDraft || !activeCourtId) return;
    const next = clone(courtConfigDraft);
    next.availability[activeCourtId] = (next.availability[activeCourtId] || []).filter((slot) => slot.id !== slotId);
    setCourtConfigDraft(next);
    setCourtDirty(true);
  }

  function buildGroupsAndAssignments(entries: GeneratedTeam[], groupCount: number): { groups: Group[]; assignments: Record<string, string[]> } {
    const count = Math.max(1, groupCount);
    const groups: Group[] = Array.from({ length: count }).map((_, i) => {
      const letter = String.fromCharCode(65 + i);
      return { id: `group_${letter}`, name: `Group ${letter}` };
    });
    const assignments: Record<string, string[]> = {};
    groups.forEach((g) => { assignments[g.id] = []; });
    entries.forEach((entry, i) => assignments[groups[i % count].id].push(entry.id));
    return { groups, assignments };
  }

  function buildSinglesEntries(poolPlayers: PoolPlayer[]): GeneratedTeam[] {
    const entries: GeneratedTeam[] = [];
    poolPlayers.forEach((entry) => {
      const player = mockPlayers.find((candidate) => candidate.id === entry.playerId);
      if (!player) return;
      entries.push({ id: `player_${player.id}`, name: player.name, playerIds: [player.id], elo: player.elo });
    });
    return entries;
  }

  function addPlayerToPool() {
    if (!poolDraft || !addPlayerId || !activeFormat) return;
    if (poolDraft.teamsGenerated) return;
    if (poolDraft.poolPlayers.some((p) => p.playerId === addPlayerId)) return;
    const next = clone(poolDraft);
    next.poolPlayers.push({ playerId: addPlayerId, registeredAt: new Date().toISOString().slice(0, 10), regRoute: 'ADMIN' });
    setPoolDraft(next);
    setAddPlayerId('');
    setPoolDirty(true);
  }

  function generateTeamsAndGroups() {
    if (!poolDraft || !activeFormat) return;
    const players = poolDraft.poolPlayers.map((x) => mockPlayers.find((p) => p.id === x.playerId)).filter(Boolean) as ClubPlayer[];
    const sorted = players.slice().sort((a, b) => b.elo - a.elo);
    const teams: GeneratedTeam[] = [];
    if (activeFormat.type === 'SINGLES') {
      if (!poolDraft.poolPlayers.length) {
        window.alert('Add at least one player before generating groups.');
        return;
      }
      teams.push(...buildSinglesEntries(poolDraft.poolPlayers));
    } else {
      if (sorted.length < 2 || sorted.length % 2 !== 0) {
        window.alert('Player count must be even and at least 2 to generate pairs.');
        return;
      }
      for (let i = 0; i < sorted.length; i += 2) {
        const a = sorted[i];
        const b = sorted[i + 1];
        teams.push({ id: `team_${(i / 2) + 1}`, name: `${a.name} / ${b.name}`, playerIds: [a.id, b.id], elo: Math.round((a.elo + b.elo) / 2) });
      }
    }
    const grouped = buildGroupsAndAssignments(teams, poolDraft.groupCount);

    setPoolDraft({ ...poolDraft, generatedTeams: teams, groups: grouped.groups, assignments: grouped.assignments, teamsGenerated: true });
    setPoolDirty(true);
  }

  function resetTeams() {
    if (!poolDraft) return;
    setPoolDraft({ ...poolDraft, generatedTeams: [], groups: [], assignments: {}, teamsGenerated: false });
    setPoolDirty(true);
  }

  function reassignTeam(teamId: string, toGroupId: string) {
    if (!poolDraft) return;
    const next = clone(poolDraft);
    Object.keys(next.assignments).forEach((groupId) => {
      next.assignments[groupId] = (next.assignments[groupId] || []).filter((id) => id !== teamId);
    });
    next.assignments[toGroupId] = [...(next.assignments[toGroupId] || []), teamId];
    setPoolDraft(next);
    setPoolDirty(true);
  }

  const p = planning();
  const isSinglesFormat = activeFormat?.type === 'SINGLES';
  const unitLabel = isSinglesFormat ? 'Player' : 'Team';
  const unitLabelPlural = isSinglesFormat ? 'Players' : 'Teams';
  const saveEnabledStyle = (enabled: boolean): CSSProperties => (enabled ? primaryBtn : disabledSaveBtn);
  const outerStyle: CSSProperties = embedded
    ? { display: 'grid', gap: 12 }
    : { minHeight: '100vh', background: '#eef2f7', padding: 16 };
  const innerStyle: CSSProperties = embedded
    ? { display: 'grid', gap: 12 }
    : { maxWidth: 1400, margin: '0 auto', display: 'grid', gap: 12 };

  return (
    <main style={outerStyle}>
      <div style={innerStyle}>
        <div>
          <h1 style={{ margin: 0, color: '#0f172a' }}>Tournament Config Workspace (Mock)</h1>
          <p style={{ margin: '6px 0 0', color: '#64748b' }}>React/Next implementation with local state only. No API hooks.</p>
          {saveNotice ? <div style={{ marginTop: 8 }}><span style={savedBadge}>{saveNotice}</span></div> : null}
        </div>

        {!activeTournamentId ? (
          showCreateTournament ? (
            <section style={card}>
              <h2 style={{ marginTop: 0 }}>Create Tournament</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                <label style={labelCol}>
                  Tournament Name <span style={{ color: '#b91c1c' }}>*</span>
                  <input value={tournamentName} onChange={(e) => { setTournamentName(e.target.value); if (e.target.value.trim()) setTournamentFormError(''); }} placeholder="Tournament Name" style={field} />
                </label>
                <label style={labelCol}>
                  Timezone
                  <select value={tournamentTimezone} onChange={(e) => setTournamentTimezone(e.target.value)} style={field}>
                    {timezoneOptions.map((zone) => (
                      <option key={zone} value={zone}>{zone}</option>
                    ))}
                  </select>
                </label>
                <label style={labelCol}>
                  Season
                  <select
                    value={tournamentSeasonId}
                    onChange={(e) => setTournamentSeasonId(e.target.value)}
                    style={field}
                    disabled={seasonLoading || !clubSeasons.length}
                  >
                    {!clubSeasons.length ? <option value="">{seasonLoading ? 'Loading seasons...' : 'No club seasons available'}</option> : null}
                    {clubSeasons.map((season) => (
                      <option key={season.id} value={String(season.id)}>{season.name}</option>
                    ))}
                  </select>
                  {!seasonLoading ? (
                    <span style={{ color: '#64748b' }}>
                      {seasonSource === 'api' ? 'Loaded from club seasons.' : 'Using local fallback seasons (log in to Admin for live club seasons).'}
                    </span>
                  ) : null}
                  {seasonLoadError ? <span style={{ color: '#b91c1c' }}>{seasonLoadError}</span> : null}
                </label>
                <label style={labelCol}>
                  Admin Notes
                  <textarea
                    value={tournamentAdminNotes}
                    onChange={(e) => setTournamentAdminNotes(e.target.value)}
                    placeholder="Internal setup notes"
                    style={{ ...field, minHeight: 90, resize: 'vertical' }}
                  />
                </label>
                {tournamentFormError ? <div style={{ color: '#b91c1c', fontWeight: 600 }}>{tournamentFormError}</div> : null}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button style={outlineBtn} onClick={() => setShowCreateTournament(false)}>Cancel</button>
                <button style={saveEnabledStyle(Boolean(tournamentName.trim()))} disabled={!tournamentName.trim()} onClick={createTournament}>Create</button>
              </div>
            </section>
          ) : (
            <section style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>Tournaments</h2>
                <button style={primaryBtn} onClick={() => setShowCreateTournament(true)}>Create New Tournament</button>
              </div>
              {!tournaments.length ? (
                <p style={{ color: '#64748b' }}>No tournaments created yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
                  <thead>
                    <tr>
                      {['Tournament', 'Season', 'Timezone', 'Status', 'Formats', 'Actions'].map((h) => <th key={h} style={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {tournaments.map((item) => (
                      <tr key={item.id}>
                        <td style={td}>{item.name}</td>
                        <td style={td}>{item.seasonName || '-'}</td>
                        <td style={td}>{item.timezone}</td>
                        <td style={td}>{item.status}</td>
                        <td style={td}>{item.formats.length}</td>
                        <td style={td}><button style={outlineBtn} onClick={() => openTournament(item.id)}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )
        ) : (
          <section style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 12 }}>
            <aside style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{activeTournament?.name || 'Untitled Tournament'}</div>
                <button style={outlineBtn} onClick={() => { if (!canSwitch()) return; setActiveTournamentId(null); setShowAddFormat(false); setActiveFormatId(null); }}>Back</button>
              </div>
              <p style={{ color: '#64748b', marginTop: 6 }}>
                Status: {activeTournament?.status || 'Draft'} · {activeTournament?.seasonName || 'No season'} · {activeTournament?.timezone || tournamentTimezone}
              </p>
              <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '10px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Formats</strong>
                <button
                  style={outlineBtn}
                  onClick={() => {
                    if (!canSwitch()) return;
                    setShowAddFormat(true);
                  }}
                >
                  + Add Format
                </button>
              </div>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {formats.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => openFormat(f.id, 'config')}
                    style={{
                      border: '1px solid #dbe3ef',
                      borderRadius: 10,
                      padding: 10,
                      background: activeFormatId === f.id ? '#f0fdfa' : '#fff',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{f.name}</div>
                    <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                      Scheduling Model: {f.config.schedulingModel || 'Not set'}
                    </div>
                  </button>
                ))}
              </div>

              <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '12px 0' }} />
              <strong>Tournament Courts</strong>
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                {courts.map((c) => <div key={c.id} style={{ border: '1px solid #dbe3ef', borderRadius: 999, padding: '6px 10px', fontSize: 13 }}>{c.name}</div>)}
              </div>
              <p style={{ color: '#64748b', margin: '8px 0 0', fontSize: 12 }}>Manage courts and availability in the Courts tab.</p>
            </aside>

            <section style={card}>
              {showAddFormat ? (
                <article style={subCard}>
                  <h3 style={{ marginTop: 0 }}>Add Format Instance</h3>
                  <p style={{ marginTop: 0, color: '#64748b' }}>Define format identity first. Save will open that format configuration.</p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <label style={labelCol}>
                      Format Name <span style={{ color: '#b91c1c' }}>*</span>
                      <input value={formDraft.name} onChange={(e) => { setFormDraft((d) => ({ ...d, name: e.target.value })); if (e.target.value.trim()) setFormatFormError(''); }} placeholder="Format Name" style={field} />
                    </label>
                    <label style={labelCol}>
                      Format Type
                      <select value={formDraft.type} onChange={(e) => setFormDraft((d) => ({ ...d, type: e.target.value as FormatType }))} style={field}>
                        <option value="DOUBLES">Doubles</option>
                        <option value="MIXED_DOUBLES">Mixed Doubles</option>
                        <option value="SINGLES">Singles</option>
                      </select>
                    </label>
                    <label style={labelCol}>
                      Registration Start
                      <input type="datetime-local" value={formDraft.regOpen} onChange={(e) => setFormDraft((d) => ({ ...d, regOpen: e.target.value }))} style={field} />
                    </label>
                    <label style={labelCol}>
                      Registration End
                      <input type="datetime-local" value={formDraft.regClose} onChange={(e) => setFormDraft((d) => ({ ...d, regClose: e.target.value }))} style={field} />
                    </label>
                    <label style={labelCol}>
                      Auto Registration Close
                      <select value={formDraft.autoClose ? 'yes' : 'no'} onChange={(e) => setFormDraft((d) => ({ ...d, autoClose: e.target.value === 'yes' }))} style={field}>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                    {formatFormError ? <div style={{ color: '#b91c1c', fontWeight: 600 }}>{formatFormError}</div> : null}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={outlineBtn} onClick={() => setShowAddFormat(false)}>Cancel</button>
                      <button style={saveEnabledStyle(Boolean(formDraft.name.trim()))} disabled={!formDraft.name.trim()} onClick={saveFormatBase}>Save Format</button>
                    </div>
                  </div>
                </article>
              ) : !activeFormat || !configDraft || !poolDraft ? (
                <p style={{ color: '#64748b' }}>Select a format to start configuring.</p>
              ) : (
                <>
                  <h1 style={{ margin: 0 }}>{activeFormat.name}</h1>
                  <p style={{ margin: '6px 0 12px', color: '#64748b' }}>Format Configuration</p>

                  <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    <button style={activeTab === 'config' ? tabBtnActive : tabBtn} onClick={() => switchTab('config')}>Config</button>
                    <button style={activeTab === 'pool' ? tabBtnActive : tabBtn} onClick={() => switchTab('pool')}>Pool</button>
                    <button style={activeTab === 'schedules' ? tabBtnActive : tabBtn} onClick={() => switchTab('schedules')}>Schedules</button>
                    <button style={activeTab === 'courts' ? tabBtnActive : tabBtn} onClick={() => switchTab('courts')}>Courts</button>
                  </div>

                  {activeTab === 'config' ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <section style={subCard}>
                        <label style={labelCol}>
                          Format Name <span style={{ color: '#b91c1c' }}>*</span>
                          <input
                            value={formatNameDraft}
                            onChange={(e) => {
                              setFormatNameDraft(e.target.value);
                              setConfigDirty(true);
                            }}
                            placeholder="Format Name"
                            style={field}
                          />
                        </label>
                      </section>
                      <section style={subCard}>
                        <strong>Scheduling Model</strong>
                        <select value={configDraft.schedulingModel} onChange={(e) => { updateConfig({ schedulingModel: e.target.value as SchedulingModel }); }} style={{ ...field, marginTop: 8 }}>
                          <option value="">Select model</option>
                          <option value="RR">RR</option>
                          <option value="GROUPS_KO">GROUPS_KO</option>
                          <option value="MATCH_COUNT_KO">MATCH_COUNT_KO</option>
                          <option value="DIRECT_KNOCKOUT">DIRECT_KNOCKOUT</option>
                        </select>
                      </section>

                      <section style={subCard}>
                        <div style={grid2}>
                          <label style={labelCol}>Max Number of Teams Allowed<input type="number" min={1} value={configDraft.maxTeamsAllowed} onChange={(e) => { updateConfig({ maxTeamsAllowed: Number(e.target.value) || 1 }); }} style={field} /></label>
                          <label style={labelCol}>Average Set Duration (min)<input type="number" min={1} value={configDraft.setDurationMinutes} onChange={(e) => updateConfig({ setDurationMinutes: Number(e.target.value) || 1 })} style={field} /></label>
                        </div>
                      </section>

                      {configDraft.schedulingModel === 'RR' ? (
                        <section style={subCard}>
                          <div style={grid2}>
                            <label style={labelCol}>RR Type<select value={configDraft.rrType} onChange={(e) => { updateConfig({ rrType: e.target.value as 'single' | 'double' }); }} style={field}><option value="single">Single</option><option value="double">Double</option></select></label>
                            <label style={labelCol}>Include KO<select value={configDraft.rrIncludeKo} onChange={(e) => { updateConfig({ rrIncludeKo: e.target.value as 'yes' | 'no' }); }} style={field}><option value="no">No</option><option value="yes">Yes</option></select></label>
                          </div>
                          {configDraft.rrIncludeKo === 'yes' ? <label style={labelCol}>Teams Advancing to KO<input type="number" min={2} value={configDraft.rrTeamsToKo} onChange={(e) => { updateConfig({ rrTeamsToKo: Number(e.target.value) || 2 }); }} style={field} /></label> : null}
                        </section>
                      ) : null}
                      {configDraft.schedulingModel === 'GROUPS_KO' ? (
                        <section style={subCard}>
                          <div style={grid2}>
                            <label style={labelCol}>Group Count<input type="number" min={2} value={configDraft.groupCount} onChange={(e) => { updateConfig({ groupCount: Number(e.target.value) || 2 }); }} style={field} /></label>
                            <label style={labelCol}>Teams Advancing to KO per Group<input type="number" min={1} value={configDraft.groupKoTeamsPerGroup} onChange={(e) => { updateConfig({ groupKoTeamsPerGroup: Number(e.target.value) || 1 }); }} style={field} /></label>
                          </div>
                        </section>
                      ) : null}
                      {configDraft.schedulingModel === 'MATCH_COUNT_KO' ? (
                        <section style={subCard}>
                          <div style={grid2}>
                            <label style={labelCol}>Matches Per Entrant<input type="number" min={1} value={configDraft.matchCountPerEntrant} onChange={(e) => { updateConfig({ matchCountPerEntrant: Number(e.target.value) || 1 }); }} style={field} /></label>
                            <label style={labelCol}>Teams Advancing to KO<input type="number" min={2} value={configDraft.matchCountKoTeamsToKo} onChange={(e) => { updateConfig({ matchCountKoTeamsToKo: Number(e.target.value) || 2 }); }} style={field} /></label>
                          </div>
                        </section>
                      ) : null}
                      {configDraft.schedulingModel === 'DIRECT_KNOCKOUT' ? (
                        <section style={subCard}>
                          <label style={labelCol}>Seed Source<select value={configDraft.seedSource} onChange={(e) => updateConfig({ seedSource: e.target.value as 'ELO' | 'MANUAL' })} style={field}><option value="ELO">ELO</option><option value="MANUAL">MANUAL</option></select></label>
                        </section>
                      ) : null}

                      {!!configDraft.schedulingModel ? (
                        <section style={insightCard}>
                          <strong>Format Insights</strong>
                          <div style={{ ...grid4, marginTop: 8 }}>
                            <Metric label="Entrants" value={String(configDraft.maxTeamsAllowed)} />
                            <Metric label="Estimated Matches" value={String(p.matches)} />
                            <Metric label="Estimated Sets" value={String(p.sets)} />
                            <Metric label="Estimated Duration (hh:mm)" value={p.duration} />
                          </div>
                          {p.warnings.length ? <p style={{ marginBottom: 0, color: '#b45309' }}>{p.warnings.join(' · ')}</p> : null}
                        </section>
                      ) : null}

                      {stageDefs.length ? (
                        <section style={subCard}>
                          <strong>Format Stage Rules</strong>
                          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                            {stageDefs.map((stage, i) => {
                              const r = configDraft.stageRules[stage.id] || defaultStageRule();
                              const ko = isKoStage(stage.id);
                              return (
                                <article key={stage.id} style={subCard}>
                                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Stage {i + 1}: {stage.label}</div>
                                  <div style={grid4}>
                                    <label style={labelCol}>Sets to Win Match
                                      <select value={String(r.setsToWin)} onChange={(e) => updateStageRule(stage.id, { setsToWin: Number(e.target.value) as 1 | 2 | 3 })} style={field}>
                                        <option value="1">1 set</option>
                                        <option value="2">2 sets (Best of 3)</option>
                                        <option value="3">3 sets (Best of 5)</option>
                                      </select>
                                    </label>
                                    <label style={labelCol}>Set Win Condition
                                      <select value={r.winCondition} onChange={(e) => updateStageRule(stage.id, { winCondition: e.target.value as WinCondition })} style={field}>
                                        <option value="FIRST_TO_POINTS">First to Points</option>
                                        <option value="WIN_BY_2">Points to Win By 2</option>
                                      </select>
                                    </label>
                                    <label style={labelCol}>Points to Win Set<input type="number" min={1} value={r.pointsToWinSet} onChange={(e) => updateStageRule(stage.id, { pointsToWinSet: Number(e.target.value) || 1 })} style={field} /></label>
                                    {r.winCondition === 'WIN_BY_2' ? <label style={labelCol}>Max Points Per Set<input type="number" min={1} value={r.maxPointsPerSet ?? 30} onChange={(e) => updateStageRule(stage.id, { maxPointsPerSet: Number(e.target.value) || 30 })} style={field} /></label> : null}
                                  </div>
                                  {!ko ? (
                                    <div style={{ ...grid4, marginTop: 8 }}>
                                      <label style={labelCol}>Win Points<input type="number" value={r.winPoints} onChange={(e) => updateStageRule(stage.id, { winPoints: Number(e.target.value) || 0 })} style={field} /></label>
                                      <label style={labelCol}>Loss Points<input type="number" value={r.lossPoints} onChange={(e) => updateStageRule(stage.id, { lossPoints: Number(e.target.value) || 0 })} style={field} /></label>
                                      <label style={labelCol}>Forfeit Points<input type="number" value={r.forfeitPoints} onChange={(e) => updateStageRule(stage.id, { forfeitPoints: Number(e.target.value) || 0 })} style={field} /></label>
                                      <label style={labelCol}>Draw Points<input type="number" value={r.drawPoints} onChange={(e) => updateStageRule(stage.id, { drawPoints: Number(e.target.value) || 0 })} style={field} /></label>
                                    </div>
                                  ) : null}
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      ) : null}
                      <div><button style={saveEnabledStyle(configDirty)} disabled={!configDirty} onClick={saveConfig}>Save</button></div>
                    </div>
                  ) : null}

                  {activeTab === 'pool' ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button style={saveEnabledStyle(poolDirty)} disabled={!poolDirty} onClick={savePool}>Save</button>
                      </div>
                      <section style={subCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>Pool Players ({poolDraft.poolPlayers.length})</strong>
                          <span style={pill}>Internal</span>
                        </div>
                        <div style={{ ...grid2, marginTop: 8 }}>
                          <select value={addPlayerId} onChange={(e) => setAddPlayerId(e.target.value)} style={field} disabled={poolDraft.teamsGenerated}>
                            <option value="">Select club player</option>
                            {mockPlayers.filter((pl) => !poolDraft.poolPlayers.some((pp) => pp.playerId === pl.id)).map((pl) => (
                              <option key={pl.id} value={pl.id}>{pl.name} ({pl.elo})</option>
                            ))}
                          </select>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {!poolDraft.teamsGenerated ? <button style={outlineBtn} onClick={addPlayerToPool}>Add Player</button> : <button style={outlineBtn} onClick={resetTeams}>Reset {unitLabelPlural}</button>}
                            {!poolDraft.teamsGenerated ? <button style={outlineBtn} onClick={generateTeamsAndGroups}>{isSinglesFormat ? 'Generate Groups' : 'Generate Pairs'}</button> : null}
                          </div>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
                          <thead>
                            <tr>
                              {['#', 'Name', 'Email', 'Phone', 'Reg Date', 'Reg Route', 'ELO'].map((h) => <th key={h} style={th}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {poolDraft.poolPlayers.length ? poolDraft.poolPlayers.map((pp, index) => {
                              const pl = mockPlayers.find((x) => x.id === pp.playerId);
                              if (!pl) return null;
                              return (
                                <tr key={pp.playerId}>
                                  <td style={td}>{index + 1}</td>
                                  <td style={td}>{pl.name}</td>
                                  <td style={td}>{pl.email}</td>
                                  <td style={td}>{pl.phone}</td>
                                  <td style={td}>{pp.registeredAt}</td>
                                  <td style={td}>{pp.regRoute || 'ADMIN'}</td>
                                  <td style={td}>{pl.elo}</td>
                                </tr>
                              );
                            }) : <tr><td style={td} colSpan={7}>No players added to pool yet.</td></tr>}
                          </tbody>
                        </table>
                      </section>

                      <section style={subCard}>
                        <div style={grid2}>
                          <label style={labelCol}>Number of Groups<input type="number" min={1} value={poolDraft.groupCount} onChange={(e) => {
                            const nextGroupCount = Math.max(1, Number(e.target.value) || 1);
                            setPoolDraft({ ...poolDraft, groupCount: nextGroupCount });
                            setPoolDirty(true);
                          }} style={field} /></label>
                          <label style={labelCol}>{unitLabelPlural} Per Group (Derived)<input value={poolDraft.generatedTeams.length ? String(Math.ceil(poolDraft.generatedTeams.length / poolDraft.groupCount)) : '-'} disabled style={field} /></label>
                        </div>
                      </section>

                      <section style={subCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>Group List</strong>
                          <span style={pill}>Editable</span>
                        </div>
                        {!poolDraft.teamsGenerated ? <p style={{ color: '#64748b' }}>{isSinglesFormat ? (poolDraft.poolPlayers.length ? 'Generate groups first.' : 'Add players first.') : (poolDraft.poolPlayers.length ? 'Generate pairs first.' : 'Add players first.')}</p> : (
                          <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                            {poolDraft.groups.map((g) => {
                              const teamIds = poolDraft.assignments[g.id] || [];
                              return (
                                <article key={g.id} style={subCard}>
                                  <strong>{g.name} ({teamIds.length})</strong>
                                  <div
                                    style={{ marginTop: 8, minHeight: 44, display: 'flex', flexWrap: 'wrap', gap: 8, border: '1px dashed #bfd3d9', borderRadius: 10, padding: 8 }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      const teamId = e.dataTransfer.getData('text/plain');
                                      if (teamId) reassignTeam(teamId, g.id);
                                    }}
                                  >
                                    {teamIds.map((teamId) => {
                                      const t = poolDraft.generatedTeams.find((x) => x.id === teamId);
                                      if (!t) return null;
                                      return (
                                        <span
                                          key={teamId}
                                          draggable
                                          onDragStart={(e) => e.dataTransfer.setData('text/plain', teamId)}
                                          style={{ border: '1px solid #d5dbe3', borderRadius: 999, padding: '6px 10px', cursor: 'grab', background: '#fff' }}
                                        >
                                          {t.name} · ELO {t.elo}
                                        </span>
                                      );
                                    })}
                                    {!teamIds.length ? <span style={{ color: '#64748b' }}>Drop {unitLabel.toLowerCase()} here.</span> : null}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </section>
                      <div><button style={saveEnabledStyle(poolDirty)} disabled={!poolDirty} onClick={savePool}>Save</button></div>
                    </div>
                  ) : null}

                  {activeTab === 'schedules' ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button style={saveEnabledStyle(scheduleDirty || courtDirty)} disabled={!(scheduleDirty || courtDirty)} onClick={saveSchedules}>Save</button>
                      </div>
                      <section style={subCard}>
                        <strong>Global Scheduling Window</strong>
                        <p style={{ margin: '6px 0 0', color: '#64748b' }}>
                          If a court has no explicit availability slots, it is schedulable for any time within this window.
                        </p>
                        <div style={{ ...grid2, marginTop: 10 }}>
                          <label style={labelCol}>
                            Global Start
                            <input
                              type="datetime-local"
                              value={courtConfigDraft?.globalWindowStart || ''}
                              onChange={(e) => {
                                setCourtConfigDraft((prev) => (prev ? { ...prev, globalWindowStart: e.target.value } : prev));
                                setCourtDirty(true);
                              }}
                              style={field}
                            />
                          </label>
                          <label style={labelCol}>
                            Global End
                            <input
                              type="datetime-local"
                              value={courtConfigDraft?.globalWindowEnd || ''}
                              onChange={(e) => {
                                setCourtConfigDraft((prev) => (prev ? { ...prev, globalWindowEnd: e.target.value } : prev));
                                setCourtDirty(true);
                              }}
                              style={field}
                            />
                          </label>
                        </div>
                      </section>
                      <section style={insightCard}>
                        <strong>Format Insights</strong>
                        <div style={{ ...grid4, marginTop: 8 }}>
                          <Metric label="Entrants" value={String(configDraft.maxTeamsAllowed)} />
                          <Metric label="Estimated Matches" value={String(p.matches)} />
                          <Metric label="Estimated Sets" value={String(p.sets)} />
                          <Metric label="Estimated Duration (hh:mm)" value={p.duration} />
                        </div>
                      </section>
                      <section style={subCard}>
                        <button
                          type="button"
                          style={collapseBtn}
                          onClick={() => setStageCourtAssignmentsOpen((value) => !value)}
                        >
                          <strong>Stage Court Assignment</strong>
                          <span>{stageCourtAssignmentsOpen ? 'Collapse' : 'Expand'}</span>
                        </button>
                        {stageCourtAssignmentsOpen ? (
                          !stageDefs.length ? <p style={{ color: '#64748b' }}>Select scheduling model first.</p> : !courts.length ? <p style={{ color: '#64748b' }}>Add tournament courts first.</p> : (
                            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                              {stageDefs.map((s) => (
                                <article key={s.id} style={subCard}>
                                  <strong>{s.label}</strong>
                                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                                    {courts.map((c) => {
                                      const checked = (scheduleDraft[s.id] || []).includes(c.id);
                                      return (
                                        <label key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => {
                                              const cur = new Set(scheduleDraft[s.id] || []);
                                              if (e.target.checked) cur.add(c.id);
                                              else cur.delete(c.id);
                                              const next = clone(scheduleDraft);
                                              next[s.id] = Array.from(cur);
                                              setScheduleDraft(next);
                                              setScheduleDirty(true);
                                            }}
                                          />
                                          {c.name}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </article>
                              ))}
                            </div>
                          )
                        ) : null}
                      </section>
                      <div><button style={saveEnabledStyle(scheduleDirty || courtDirty)} disabled={!(scheduleDirty || courtDirty)} onClick={saveSchedules}>Save</button></div>
                    </div>
                  ) : null}

                  {activeTab === 'courts' ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>Tournament Courts</strong>
                        <button style={outlineBtn} onClick={() => setShowAddCourtModal(true)}>+ Add Court</button>
                      </div>

                      {!courts.length ? (
                        <section style={subCard}>
                          <p style={{ margin: 0, color: '#64748b' }}>No courts added yet. Add at least one court to configure availability.</p>
                        </section>
                      ) : (
                        <section style={subCard}>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {courts.map((court) => (
                              <button
                                key={court.id}
                                type="button"
                                onClick={() => setActiveCourtId(court.id)}
                                style={{
                                  ...outlineBtn,
                                  textAlign: 'left',
                                  borderColor: activeCourtId === court.id ? '#0d9488' : '#cbd5e1',
                                  background: activeCourtId === court.id ? '#ecfeff' : '#fff',
                                }}
                              >
                                {court.name}
                              </button>
                            ))}
                          </div>
                        </section>
                      )}

                      <section style={subCard}>
                        <strong>Court Availability</strong>
                        {!activeCourtId ? (
                          <p style={{ color: '#64748b' }}>Select a court to configure availability.</p>
                        ) : (
                          <>
                            <p style={{ margin: '6px 0 10px', color: '#64748b' }}>
                              Add one or more date/time slots. If no slots are added for this court, scheduling uses the global window from Schedules.
                            </p>
                            <div style={{ ...grid3, marginBottom: 10 }}>
                              <label style={labelCol}>
                                Date
                                <input type="date" value={slotDraft.date} onChange={(e) => setSlotDraft((prev) => ({ ...prev, date: e.target.value }))} style={field} />
                              </label>
                              <label style={labelCol}>
                                Start Time
                                <input type="time" value={slotDraft.startTime} onChange={(e) => setSlotDraft((prev) => ({ ...prev, startTime: e.target.value }))} style={field} />
                              </label>
                              <label style={labelCol}>
                                End Time
                                <input type="time" value={slotDraft.endTime} onChange={(e) => setSlotDraft((prev) => ({ ...prev, endTime: e.target.value }))} style={field} />
                              </label>
                            </div>
                            <button style={outlineBtn} onClick={addCourtAvailabilitySlot}>Add Availability Slot</button>

                            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
                              <thead>
                                <tr>
                                  {['Date', 'Start', 'End', 'Actions'].map((h) => <th key={h} style={th}>{h}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {(courtConfigDraft?.availability[activeCourtId] || []).length ? (courtConfigDraft?.availability[activeCourtId] || []).map((slot) => (
                                  <tr key={slot.id}>
                                    <td style={td}>{slot.date}</td>
                                    <td style={td}>{slot.startTime}</td>
                                    <td style={td}>{slot.endTime}</td>
                                    <td style={td}><button style={outlineBtn} onClick={() => removeCourtAvailabilitySlot(slot.id)}>Remove</button></td>
                                  </tr>
                                )) : (
                                  <tr>
                                    <td style={td} colSpan={4}>No slots defined. This court uses global schedule start/end by default.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </>
                        )}
                      </section>
                      <div><button style={saveEnabledStyle(courtDirty)} disabled={!courtDirty} onClick={saveCourtsConfig}>Save</button></div>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </section>
        )}
      </div>
      {showAddCourtModal ? (
        <div style={modalBackdrop}>
          <section style={modalCard}>
            <h3 style={{ marginTop: 0 }}>Add Court</h3>
            <label style={labelCol}>
              Court Name
              <input value={courtName} onChange={(e) => setCourtName(e.target.value)} placeholder="Court Name" style={field} />
            </label>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={outlineBtn} onClick={() => setShowAddCourtModal(false)}>Cancel</button>
              <button style={saveEnabledStyle(Boolean(courtName.trim()))} disabled={!courtName.trim()} onClick={addCourt}>Add Court</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #dbe3ef', borderRadius: 10, padding: 10 }}>
      <div style={{ color: '#64748b', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{value}</div>
    </div>
  );
}

const card: CSSProperties = {
  border: '1px solid #dbe3ef',
  borderRadius: 14,
  background: '#fff',
  padding: 12,
};

const subCard: CSSProperties = {
  border: '1px solid #dbe3ef',
  borderRadius: 12,
  background: '#fcfdff',
  padding: 10,
};

const insightCard: CSSProperties = {
  border: '1px solid #bfdbfe',
  borderRadius: 12,
  background: '#eff6ff',
  padding: 10,
};

const field: CSSProperties = {
  width: '100%',
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  background: '#fff',
  minHeight: 38,
  padding: '8px 10px',
};

const primaryBtn: CSSProperties = {
  border: 0,
  borderRadius: 10,
  background: 'linear-gradient(90deg, #14b8a6, #0d9488)',
  color: '#fff',
  padding: '8px 12px',
  fontWeight: 700,
  cursor: 'pointer',
};

const disabledSaveBtn: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  background: '#e2e8f0',
  color: '#64748b',
  padding: '8px 12px',
  fontWeight: 700,
  cursor: 'not-allowed',
};

const outlineBtn: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  background: '#fff',
  color: '#0f172a',
  padding: '8px 10px',
  fontWeight: 600,
  cursor: 'pointer',
};

const tabBtn: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 12,
  background: '#f8fafc',
  color: '#0f172a',
  padding: '10px 18px',
  fontWeight: 700,
  fontSize: 16,
  cursor: 'pointer',
};

const tabBtnActive: CSSProperties = {
  border: '1px solid #0d9488',
  borderRadius: 12,
  background: 'linear-gradient(90deg, #14b8a6, #0d9488)',
  color: '#fff',
  padding: '10px 18px',
  fontWeight: 700,
  fontSize: 16,
  cursor: 'pointer',
};

const pill: CSSProperties = {
  border: '1px solid #a7f3d0',
  color: '#047857',
  borderRadius: 999,
  padding: '2px 10px',
  fontWeight: 700,
  fontSize: 12,
  background: '#ecfdf5',
};

const savedBadge: CSSProperties = {
  border: '1px solid #a7f3d0',
  color: '#065f46',
  borderRadius: 999,
  padding: '4px 10px',
  fontWeight: 700,
  fontSize: 12,
  background: '#ecfdf5',
};

const labelCol: CSSProperties = { display: 'grid', gap: 6, color: '#334155', fontSize: 13 };
const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 };
const grid3: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 };
const grid4: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 };
const th: CSSProperties = { textAlign: 'left', borderBottom: '1px solid #dbe3ef', padding: 8, fontSize: 12, color: '#64748b' };
const td: CSSProperties = { borderBottom: '1px solid #eef2f7', padding: 8, fontSize: 13 };

const collapseBtn: CSSProperties = {
  width: '100%',
  border: '1px solid #dbe3ef',
  borderRadius: 10,
  background: '#f8fafc',
  color: '#0f172a',
  padding: '8px 10px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
};

const modalBackdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2, 6, 23, 0.35)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 40,
  padding: 12,
};

const modalCard: CSSProperties = {
  width: '100%',
  maxWidth: 480,
  border: '1px solid #dbe3ef',
  borderRadius: 12,
  background: '#fff',
  padding: 12,
  boxShadow: '0 12px 28px rgba(15, 23, 42, 0.16)',
};
