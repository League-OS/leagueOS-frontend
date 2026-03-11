'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LeagueOsApiClient,
  type Tournament as ApiTournament,
  type TournamentFormatInstance,
  type TournamentMatch as ApiTournamentMatch,
} from '@leagueos/api';
import type { Player as ApiPlayer } from '@leagueos/schemas';

import {
  buildStages,
  clone,
  computePlanningMetrics,
  defaultCourtConfig,
  defaultFormatConfig,
  defaultFormatFormDraft,
  defaultPoolConfig,
  defaultSlotDraft,
  defaultStageRule,
  fallbackSeasons,
  getTimezoneOptions,
  mockPlayers,
} from './config';
import type {
  ClubPlayer,
  CourtConfig,
  CourtItem,
  Format,
  FormatConfig,
  FormatFormDraft,
  FormatType,
  GeneratedTeam,
  Group,
  PoolConfig,
  SchedulingModel,
  SlotDraft,
  StageRule,
  TournamentRecord,
  ViewTab,
} from './types';

type AdminAuth = { token: string; clubId: number };

function readAdminAuth(): AdminAuth | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('leagueos.admin.auth');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: unknown; clubId?: unknown };
    const token = typeof parsed.token === 'string' ? parsed.token : '';
    const clubIdValue = typeof parsed.clubId === 'number'
      ? parsed.clubId
      : typeof parsed.clubId === 'string'
        ? Number.parseInt(parsed.clubId, 10)
        : Number.NaN;
    if (!token || !Number.isInteger(clubIdValue)) return null;
    return { token, clubId: clubIdValue };
  } catch {
    return null;
  }
}

function mapApiTournamentToRecord(row: ApiTournament, seasonName: string): TournamentRecord {
  return {
    id: String(row.id),
    name: row.name,
    timezone: row.timezone,
    seasonId: row.season_id !== null ? String(row.season_id) : '',
    seasonName: seasonName || (row.season_id !== null ? `Season ${row.season_id}` : 'No season'),
    adminNotes: row.admin_notes ?? '',
    status: row.status === 'DRAFT' ? 'Draft' : 'Configured',
    formats: [],
    courts: [],
  };
}

function toDateTimeLocalInput(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const localMs = parsed.getTime() - (parsed.getTimezoneOffset() * 60 * 1000);
  return new Date(localMs).toISOString().slice(0, 16);
}

function toUtcIsoFromInput(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function mapApiFormatToLocal(row: TournamentFormatInstance): Format {
  const config = defaultFormatConfig();
  const rawConfigJson = asObject(row.config_json) ?? {};
  const persistedPool = normalizePoolFromConfigJson(rawConfigJson.pool);
  const persistedCourtAssignments = normalizeCourtAssignmentsFromConfigJson(rawConfigJson.court_assignments);
  const persistedCourtConfig = normalizeCourtConfigFromConfigJson(rawConfigJson.court_config);
  const uiSchedulingModelRaw = typeof rawConfigJson.ui_scheduling_model === 'string' ? rawConfigJson.ui_scheduling_model : '';
  const columnSchedulingModel = typeof row.scheduling_model === 'string' ? row.scheduling_model : '';
  const mappedSchedulingModel = isUiSchedulingModel(columnSchedulingModel) && columnSchedulingModel !== ''
    ? columnSchedulingModel
    : (isUiSchedulingModel(uiSchedulingModelRaw) && uiSchedulingModelRaw !== '' ? uiSchedulingModelRaw : 'DIRECT_KNOCKOUT');
  const mergedConfig: FormatConfig = {
    ...config,
    schedulingModel: mappedSchedulingModel,
    setDurationMinutes: row.average_set_duration_minutes || config.setDurationMinutes,
    maxTeamsAllowed: row.max_teams_allowed || config.maxTeamsAllowed,
    matchCountPerEntrant: row.matches_per_team || config.matchCountPerEntrant,
    groupCount: row.group_count || config.groupCount,
    groupKoTeamsPerGroup: row.group_ko_teams_per_group || config.groupKoTeamsPerGroup,
  };
  const mergedPool: PoolConfig = {
    ...(persistedPool ?? defaultPoolConfig()),
    groupCount: mergedConfig.groupCount,
  };
  return {
    id: String(row.id),
    name: row.name,
    type: row.format_type,
    regOpen: toDateTimeLocalInput(row.registration_open_at),
    regClose: toDateTimeLocalInput(row.registration_close_at),
    autoClose: row.auto_registration_close,
    scheduleGeneratedAt: row.schedule_generated_at,
    scheduleLocked: row.schedule_locked,
    config: mergedConfig,
    pool: mergedPool,
    courtConfig: persistedCourtConfig ?? defaultCourtConfig(),
    courtAssignments: persistedCourtAssignments ?? {},
    metaConfigJson: rawConfigJson,
  };
}

function mapApiPlayerToClubPlayer(row: ApiPlayer): ClubPlayer {
  return {
    id: String(row.id),
    name: row.display_name,
    email: row.email ?? '-',
    phone: row.phone ?? '-',
    elo: row.elo_initial_doubles ?? row.elo_initial_singles ?? row.elo_initial_mixed ?? 1000,
    eloSingles: row.elo_initial_singles ?? row.elo_initial_doubles ?? row.elo_initial_mixed ?? 1000,
    eloDoubles: row.elo_initial_doubles ?? row.elo_initial_singles ?? row.elo_initial_mixed ?? 1000,
    eloMixed: row.elo_initial_mixed ?? row.elo_initial_doubles ?? row.elo_initial_singles ?? 1000,
  };
}

function eloForFormat(player: ClubPlayer, formatType?: FormatType): number {
  if (formatType === 'SINGLES') return player.eloSingles ?? player.elo;
  if (formatType === 'MIXED_DOUBLES') return player.eloMixed ?? player.elo;
  return player.eloDoubles ?? player.elo;
}

function isUiSchedulingModel(value: string): value is SchedulingModel {
  return value === '' || value === 'RR' || value === 'GROUPS_KO' || value === 'MATCH_COUNT_KO' || value === 'DIRECT_KNOCKOUT';
}

function effectiveSchedulingModel(value: SchedulingModel | undefined | null): Exclude<SchedulingModel, ''> {
  if (value) return value;
  return 'DIRECT_KNOCKOUT';
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizePoolFromConfigJson(value: unknown): PoolConfig | null {
  const obj = asObject(value);
  if (!obj) return null;

  const poolPlayersRaw = Array.isArray(obj.poolPlayers) ? obj.poolPlayers : [];
  const generatedTeamsRaw = Array.isArray(obj.generatedTeams) ? obj.generatedTeams : [];
  const groupsRaw = Array.isArray(obj.groups) ? obj.groups : [];
  const assignmentsObj = asObject(obj.assignments) ?? {};

  const poolPlayers: PoolConfig['poolPlayers'] = poolPlayersRaw
    .map((row) => {
      const item = asObject(row);
      if (!item) return null;
      const playerId = typeof item.playerId === 'string' ? item.playerId : String(item.playerId ?? '');
      if (!playerId) return null;
      const regRoute: 'ADMIN' | 'SELF' = item.regRoute === 'SELF' ? 'SELF' : 'ADMIN';
      const seededEloRaw = Number(item.seededElo);
      const seededElo = Number.isFinite(seededEloRaw) ? seededEloRaw : undefined;
      return {
        playerId,
        registeredAt: typeof item.registeredAt === 'string' ? item.registeredAt : '',
        regRoute,
        seededElo,
        eloSeasonId: typeof item.eloSeasonId === 'string' ? item.eloSeasonId : '',
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const generatedTeams: PoolConfig['generatedTeams'] = generatedTeamsRaw
    .map((row) => {
      const item = asObject(row);
      if (!item) return null;
      const id = typeof item.id === 'string' ? item.id : '';
      const name = typeof item.name === 'string' ? item.name : '';
      const playerIds = Array.isArray(item.playerIds)
        ? item.playerIds.map((idValue) => String(idValue))
        : [];
      const elo = Number(item.elo);
      if (!id || !name || Number.isNaN(elo)) return null;
      return {
        id,
        name,
        playerIds,
        elo,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const groups: PoolConfig['groups'] = groupsRaw
    .map((row) => {
      const item = asObject(row);
      if (!item) return null;
      const id = typeof item.id === 'string' ? item.id : '';
      const name = typeof item.name === 'string' ? item.name : '';
      if (!id || !name) return null;
      return { id, name };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const assignments: Record<string, string[]> = {};
  Object.entries(assignmentsObj).forEach(([groupId, ids]) => {
    if (!Array.isArray(ids)) return;
    assignments[groupId] = ids.map((idValue) => String(idValue));
  });

  const groupCountRaw = Number(obj.groupCount);
  const groupCount = Number.isInteger(groupCountRaw) && groupCountRaw >= 1 ? groupCountRaw : 2;
  const seasonId = typeof obj.seasonId === 'string' ? obj.seasonId : '';
  const teamsGenerated = Boolean(obj.teamsGenerated);
  const pairsValidated = Boolean(obj.pairsValidated || teamsGenerated);
  const pairValidationMessage = typeof obj.pairValidationMessage === 'string' ? obj.pairValidationMessage : '';

  return {
    groupCount,
    seasonId,
    poolPlayers,
    generatedTeams,
    groups,
    assignments,
    teamsGenerated,
    pairsValidated,
    pairValidationMessage,
  };
}

function normalizeCourtAssignmentsFromConfigJson(value: unknown): Record<string, string[]> | null {
  const obj = asObject(value);
  if (!obj) return null;

  const assignments: Record<string, string[]> = {};
  Object.entries(obj).forEach(([stageId, courtIds]) => {
    if (!Array.isArray(courtIds)) return;
    assignments[stageId] = courtIds.map((courtId) => String(courtId));
  });

  return assignments;
}

function normalizeCourtConfigFromConfigJson(value: unknown): CourtConfig | null {
  const obj = asObject(value);
  if (!obj) return null;

  const defaults = defaultCourtConfig();
  const availabilityObj = asObject(obj.availability) ?? {};
  const availability: CourtConfig['availability'] = {};
  Object.entries(availabilityObj).forEach(([courtId, slotsValue]) => {
    if (!Array.isArray(slotsValue)) return;
    const slots = slotsValue
      .map((slotValue) => {
        const slot = asObject(slotValue);
        if (!slot) return null;
        const id = typeof slot.id === 'string' ? slot.id : '';
        const date = typeof slot.date === 'string' ? slot.date : '';
        const startTime = typeof slot.startTime === 'string' ? slot.startTime : '';
        const endTime = typeof slot.endTime === 'string' ? slot.endTime : '';
        if (!id || !date || !startTime || !endTime) return null;
        return { id, date, startTime, endTime };
      })
      .filter((slot): slot is NonNullable<typeof slot> => slot !== null);
    availability[courtId] = slots;
  });

  return {
    globalWindowStart:
      typeof obj.globalWindowStart === 'string' ? obj.globalWindowStart : defaults.globalWindowStart,
    globalWindowEnd: typeof obj.globalWindowEnd === 'string' ? obj.globalWindowEnd : defaults.globalWindowEnd,
    availability,
  };
}

function extractAllowedCourtIds(assignments: Record<string, string[]>): number[] {
  return Array.from(
    new Set(
      Object.values(assignments)
        .flatMap((courtIds) => courtIds)
        .map((courtId) => Number.parseInt(courtId, 10))
        .filter((courtId) => Number.isInteger(courtId)),
    ),
  ).sort((a, b) => a - b);
}

export function useTournamentWorkspaceState() {
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentTimezone, setTournamentTimezone] = useState('America/Vancouver');
  const [tournamentAdminNotes, setTournamentAdminNotes] = useState('');
  const [clubSeasons, setClubSeasons] = useState(fallbackSeasons);
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
  const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
  const [formatFormError, setFormatFormError] = useState('');

  const [courts, setCourts] = useState<CourtItem[]>([]);
  const [courtName, setCourtName] = useState('');
  const [showAddCourtModal, setShowAddCourtModal] = useState(false);

  const [formDraft, setFormDraft] = useState<FormatFormDraft>(defaultFormatFormDraft);
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
  const [clubPlayers, setClubPlayers] = useState<ClubPlayer[]>(mockPlayers);
  const [stageCourtAssignmentsOpen, setStageCourtAssignmentsOpen] = useState(true);
  const [poolPlayersOpen, setPoolPlayersOpen] = useState(true);
  const [poolGroupsOpen, setPoolGroupsOpen] = useState(true);
  const [bracketMatchesOpen, setBracketMatchesOpen] = useState(false);
  const [bracketMatches, setBracketMatches] = useState<ApiTournamentMatch[]>([]);
  const [scheduleActionBusy, setScheduleActionBusy] = useState<'generate' | 'view' | 'reset' | null>(null);
  const [activeCourtId, setActiveCourtId] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);

  const [slotDraft, setSlotDraft] = useState<SlotDraft>(defaultSlotDraft);
  const client = useMemo(
    () =>
      new LeagueOsApiClient({
        apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000',
      }),
    [],
  );

  const activeFormat = useMemo(() => formats.find((format) => format.id === activeFormatId) ?? null, [formats, activeFormatId]);
  const stageDefs = useMemo(() => {
    if (!configDraft) return [];
    return buildStages({
      ...configDraft,
      schedulingModel: effectiveSchedulingModel(configDraft.schedulingModel),
    });
  }, [configDraft]);
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);

  const activeTournament = useMemo(
    () => tournaments.find((item) => item.id === activeTournamentId) || null,
    [tournaments, activeTournamentId],
  );

  const isSinglesFormat = activeFormat?.type === 'SINGLES';
  const unitLabel = isSinglesFormat ? 'Player' : 'Team';
  const unitLabelPlural = isSinglesFormat ? 'Players' : 'Teams';
  const effectiveEntrantCount = useMemo(() => {
    if (!configDraft) return 0;
    if (poolDraft?.teamsGenerated) return poolDraft.generatedTeams.length;
    if (poolDraft?.poolPlayers.length) {
      if (isSinglesFormat) return poolDraft.poolPlayers.length;
      return Math.max(1, Math.floor(poolDraft.poolPlayers.length / 2));
    }
    return configDraft.maxTeamsAllowed;
  }, [configDraft, poolDraft, isSinglesFormat]);
  const planningMetrics = useMemo(() => {
    if (!configDraft) return { matches: 0, sets: 0, duration: '00:00', warnings: [] };
    const planningConfig: FormatConfig = {
      ...configDraft,
      maxTeamsAllowed: Math.max(1, effectiveEntrantCount || configDraft.maxTeamsAllowed),
      schedulingModel: effectiveSchedulingModel(configDraft.schedulingModel),
    };
    return computePlanningMetrics(planningConfig);
  }, [configDraft, effectiveEntrantCount]);
  const scheduleStatusLabel = useMemo(() => {
    if (!activeFormat?.scheduleGeneratedAt) return 'Not Generated';
    const parsed = new Date(activeFormat.scheduleGeneratedAt);
    if (Number.isNaN(parsed.getTime())) return 'Generated';
    return `Generated (${parsed.toLocaleString()})`;
  }, [activeFormat?.scheduleGeneratedAt]);

  const clubPlayersForActiveFormat = useMemo(
    () =>
      clubPlayers.map((player) => ({
        ...player,
        elo: eloForFormat(player, activeFormat?.type),
      })),
    [clubPlayers, activeFormat?.type],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadClubSeasons() {
      setSeasonLoadError('');
      setSeasonLoading(true);
      try {
        const auth = readAdminAuth();
        if (!auth) {
          setClubSeasons(fallbackSeasons);
          setSeasonSource('fallback');
          return;
        }

        const seasons = await client.seasons(auth.token, auth.clubId);
        if (cancelled) return;

        setClubSeasons(seasons.length ? seasons : fallbackSeasons);
        setSeasonSource(seasons.length ? 'api' : 'fallback');
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to load seasons.';
        setSeasonLoadError(`Live season load failed (${message}). Using local list.`);
        setClubSeasons(fallbackSeasons);
        setSeasonSource('fallback');
      } finally {
        if (!cancelled) setSeasonLoading(false);
      }
    }

    void loadClubSeasons();
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    if (!poolDraft || poolDraft.seasonId || !clubSeasons.length) return;
    setPoolDraft((prev) => {
      if (!prev || prev.seasonId) return prev;
      return { ...prev, seasonId: String(clubSeasons[0].id) };
    });
  }, [poolDraft, clubSeasons]);

  useEffect(() => {
    let cancelled = false;

    async function loadClubPlayers() {
      try {
        const auth = readAdminAuth();
        if (!auth) {
          setClubPlayers(mockPlayers);
          return;
        }

        const [activePlayers, inactivePlayers] = await Promise.all([
          client.players(auth.token, auth.clubId, true, 500, 0),
          client.players(auth.token, auth.clubId, false, 500, 0),
        ]);
        if (cancelled) return;

        const allPlayers = [...activePlayers, ...inactivePlayers];
        const deduped = new Map<string, ClubPlayer>();
        allPlayers.forEach((player) => {
          deduped.set(String(player.id), mapApiPlayerToClubPlayer(player));
        });
        const nextPlayers = Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
        setClubPlayers(nextPlayers.length ? nextPlayers : mockPlayers);
      } catch {
        if (cancelled) return;
        setClubPlayers(mockPlayers);
      }
    }

    void loadClubPlayers();
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    let cancelled = false;

    async function loadTournaments() {
      try {
        const auth = readAdminAuth();
        if (!auth) return;
        const rows = await client.tournaments(auth.token, auth.clubId);
        if (cancelled) return;
        setTournaments((prev) => rows.map((row) => {
          const seasonName = clubSeasons.find((season) => season.id === row.season_id)?.name ?? '';
          const mapped = mapApiTournamentToRecord(row, seasonName);
          const existing = prev.find((item) => item.id === mapped.id);
          if (!existing) return mapped;
          return { ...mapped, formats: existing.formats, courts: existing.courts };
        }));
      } catch {
        // Keep local workspace state when API tournaments cannot be fetched.
      }
    }

    void loadTournaments();
    return () => {
      cancelled = true;
    };
  }, [client, clubSeasons]);

  useEffect(() => {
    setMounted(true);
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

  function resetDirtyFlags() {
    setConfigDirty(false);
    setPoolDirty(false);
    setScheduleDirty(false);
    setCourtDirty(false);
  }

  function clearActiveFormatDrafts() {
    setFormatNameDraft('');
    setConfigDraft(null);
    setPoolDraft(null);
    setScheduleDraft({});
    setCourtConfigDraft(null);
    setBracketMatches([]);
    setBracketMatchesOpen(false);
    resetDirtyFlags();
  }

  function defaultPoolSeasonId(): string {
    return clubSeasons.length ? String(clubSeasons[0].id) : '';
  }

  function loadDrafts(format: Format) {
    setFormatNameDraft(format.name);
    setConfigDraft(clone(format.config));
    const nextPool = {
      ...clone(format.pool),
      groupCount: format.config.groupCount,
      seasonId: format.pool.seasonId || defaultPoolSeasonId(),
    };
    const hasGeneratedPairsOrGroups = nextPool.generatedTeams.length > 0 || nextPool.teamsGenerated;
    setPoolDraft(nextPool);
    setPoolPlayersOpen(!hasGeneratedPairsOrGroups);
    setPoolGroupsOpen(true);
    setScheduleDraft(clone(format.courtAssignments));
    setCourtConfigDraft(clone(format.courtConfig || defaultCourtConfig()));
    setBracketMatches([]);
    setBracketMatchesOpen(false);
    resetDirtyFlags();
  }

  function toFormatFormDraft(format: Format): FormatFormDraft {
    return {
      name: format.name,
      type: format.type,
      regOpen: format.regOpen,
      regClose: format.regClose,
      autoClose: format.autoClose,
    };
  }

  function canSwitch(): boolean {
    const hasUnsavedChanges = configDirty || poolDirty || scheduleDirty || courtDirty;
    if (!hasUnsavedChanges) return true;
    return window.confirm('Unsaved changes detected. Continue without saving?');
  }

  function setActiveTournamentConfiguredStatus(tournamentId: string) {
    setTournaments((items) => items.map((item) => (item.id === tournamentId ? { ...item, status: 'Configured' } : item)));
  }

  function loadTournamentFormatsFromApi(tournamentId: string, preferredFormatId?: string | null) {
    const auth = readAdminAuth();
    const parsedTournamentId = Number.parseInt(tournamentId, 10);
    if (!auth || !Number.isInteger(parsedTournamentId)) return;

    void (async () => {
      try {
        const apiFormats = await client.tournamentFormats(auth.token, auth.clubId, parsedTournamentId);
        const mappedFormats = apiFormats.map(mapApiFormatToLocal);
        setTournaments((items) => items.map((item) => (item.id === tournamentId ? { ...item, formats: mappedFormats } : item)));
        setFormats(mappedFormats);
        if (!mappedFormats.length) {
          setActiveFormatId(null);
          clearActiveFormatDrafts();
          setEditingFormatId(null);
          return;
        }
        const selected = preferredFormatId
          ? mappedFormats.find((format) => format.id === preferredFormatId) ?? null
          : null;
        if (selected) {
          setActiveFormatId(selected.id);
          loadDrafts(selected);
          return;
        }
        setActiveFormatId(null);
        clearActiveFormatDrafts();
      } catch {
        // Keep local format list when API load fails.
      }
    })();
  }

  function loadTournamentCourtsFromApi(tournamentId: string, preferredCourtId?: string | null) {
    const auth = readAdminAuth();
    const parsedTournamentId = Number.parseInt(tournamentId, 10);
    if (!auth || !Number.isInteger(parsedTournamentId)) return;

    void (async () => {
      try {
        const apiCourts = await client.tournamentCourts(auth.token, auth.clubId, parsedTournamentId);
        const mappedCourts = apiCourts.map((row) => ({ id: String(row.id), name: row.name }));
        setTournaments((items) => items.map((item) => (item.id === tournamentId ? { ...item, courts: mappedCourts } : item)));
        setCourts(mappedCourts);
        if (!mappedCourts.length) {
          setActiveCourtId(null);
          return;
        }
        const selected = mappedCourts.find((court) => court.id === preferredCourtId) ?? mappedCourts[0];
        setActiveCourtId(selected.id);
      } catch {
        // Keep local court list when API load fails.
      }
    })();
  }

  function applyCreatedTournament(record: TournamentRecord) {
    setTournaments((prev) => {
      const withoutExisting = prev.filter((item) => item.id !== record.id);
      return [...withoutExisting, record];
    });
    setActiveTournamentId(record.id);
    setShowCreateTournament(false);
    setShowAddFormat(false);
    setEditingFormatId(null);
    setTournamentFormError('');
    setFormats([]);
    setCourts([]);
    setActiveFormatId(null);
    clearActiveFormatDrafts();
    setShowAddCourtModal(false);
  }

  async function createTournament() {
    const name = tournamentName.trim();
    if (!name) {
      setTournamentFormError('Tournament name is required.');
      return;
    }
    setTournamentFormError('');

    const auth = readAdminAuth();
    if (!auth) {
      const id = `local_trn_${tournaments.length + 1}`;
      const localRecord: TournamentRecord = {
        id,
        name,
        timezone: tournamentTimezone,
        seasonId: '',
        seasonName: 'No season',
        adminNotes: tournamentAdminNotes.trim(),
        status: 'Draft',
        formats: [],
        courts: [],
      };
      applyCreatedTournament(localRecord);
      return;
    }

    try {
      const created = await client.createTournament(auth.token, auth.clubId, {
        name,
        timezone: tournamentTimezone,
        admin_notes: tournamentAdminNotes.trim() || undefined,
      });
      const seasonName = clubSeasons.find((season) => season.id === created.season_id)?.name ?? '';
      applyCreatedTournament(mapApiTournamentToRecord(created, seasonName));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create tournament.';
      setTournamentFormError(message);
    }
  }

  function showSavedNotice(text = 'Saved') {
    setSaveNotice(text);
    window.setTimeout(() => setSaveNotice(''), 1800);
  }

  function updateActiveTournamentFormats(nextFormats: Format[]) {
    if (!activeTournamentId) return;
    setTournaments((items) => items.map((item) => (item.id === activeTournamentId ? { ...item, formats: nextFormats } : item)));
  }

  function updateActiveTournamentCourts(nextCourts: CourtItem[]) {
    if (!activeTournamentId) return;
    setTournaments((items) => items.map((item) => (item.id === activeTournamentId ? { ...item, courts: nextCourts } : item)));
  }

  function updateCurrentFormat(transform: (format: Format) => Format) {
    if (!activeFormat) return;
    setFormats((prev) => {
      const updated = prev.map((format) => (format.id === activeFormat.id ? transform(format) : format));
      updateActiveTournamentFormats(updated);
      return updated;
    });
  }

  function saveFormatBase() {
    void (async () => {
      if (!formDraft.name.trim()) {
        setFormatFormError('Format name is required.');
        return;
      }

      setFormatFormError('');

      const auth = readAdminAuth();
      const parsedTournamentId = activeTournamentId ? Number.parseInt(activeTournamentId, 10) : Number.NaN;
      const editingTarget = editingFormatId ? formats.find((format) => format.id === editingFormatId) ?? null : null;

      if (editingTarget) {
        const parsedFormatId = Number.parseInt(editingTarget.id, 10);
        if (auth && Number.isInteger(parsedTournamentId) && Number.isInteger(parsedFormatId)) {
          try {
            await client.updateTournamentFormat(auth.token, auth.clubId, parsedTournamentId, parsedFormatId, {
              name: formDraft.name.trim(),
              format_type: formDraft.type,
              registration_open_at: toUtcIsoFromInput(formDraft.regOpen),
              registration_close_at: toUtcIsoFromInput(formDraft.regClose),
              auto_registration_close: formDraft.autoClose,
            });
            const updated = await client.updateTournamentFormat(auth.token, auth.clubId, parsedTournamentId, parsedFormatId, {
              seed_source: 'ELO',
            });
            const mapped = mapApiFormatToLocal(updated);
            setFormats((prev) => {
              const nextFormats = prev.map((format) => (format.id === mapped.id ? mapped : format));
              if (activeTournamentId) {
                setTournaments((items) => items.map((item) => (item.id === activeTournamentId ? { ...item, formats: nextFormats } : item)));
              }
              return nextFormats;
            });
            setEditingFormatId(null);
            setShowAddFormat(false);
            setFormDraft(defaultFormatFormDraft());
            setActiveFormatId(mapped.id);
            setActiveTab('config');
            loadDrafts(mapped);
            showSavedNotice('Format updated');
            return;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to update format.';
            setFormatFormError(message);
            return;
          }
        }

        const typeChanged = editingTarget.type !== formDraft.type;
        const nextLocal: Format = {
          ...editingTarget,
          name: formDraft.name.trim(),
          type: formDraft.type,
          regOpen: formDraft.regOpen,
          regClose: formDraft.regClose,
          autoClose: formDraft.autoClose,
          pool: typeChanged
            ? {
              ...editingTarget.pool,
              generatedTeams: [],
              groups: [],
              assignments: {},
              teamsGenerated: false,
              pairsValidated: false,
              pairValidationMessage: '',
            }
            : editingTarget.pool,
        };
        setFormats((prev) => {
          const nextFormats = prev.map((format) => (format.id === nextLocal.id ? nextLocal : format));
          if (activeTournamentId) {
            setTournaments((items) => items.map((item) => (item.id === activeTournamentId ? { ...item, formats: nextFormats } : item)));
          }
          return nextFormats;
        });
        setEditingFormatId(null);
        setShowAddFormat(false);
        setFormDraft(defaultFormatFormDraft());
        setActiveFormatId(nextLocal.id);
        setActiveTab('config');
        loadDrafts(nextLocal);
        showSavedNotice('Format updated');
        return;
      }

      if (auth && Number.isInteger(parsedTournamentId)) {
        try {
          const created = await client.createTournamentFormat(auth.token, auth.clubId, parsedTournamentId, {
            name: formDraft.name.trim(),
            format_type: formDraft.type,
            registration_open_at: toUtcIsoFromInput(formDraft.regOpen),
            registration_close_at: toUtcIsoFromInput(formDraft.regClose),
            auto_registration_close: formDraft.autoClose,
          });
          const enforced = await client.updateTournamentFormat(
            auth.token,
            auth.clubId,
            parsedTournamentId,
            created.id,
            {
              seed_source: 'ELO',
            },
          );
          const next = mapApiFormatToLocal(enforced);
          setFormats((prev) => {
            const updated = prev.some((format) => format.id === next.id)
              ? prev.map((format) => (format.id === next.id ? next : format))
              : [...prev, next];
            if (activeTournamentId) {
              setTournaments((items) => items.map((item) => (item.id === activeTournamentId ? { ...item, formats: updated } : item)));
            }
            return updated;
          });

          if (activeTournamentId) setActiveTournamentConfiguredStatus(activeTournamentId);
          setActiveFormatId(next.id);
          setActiveTab('config');
          setShowAddFormat(false);
          setEditingFormatId(null);
          setFormDraft(defaultFormatFormDraft());
          loadDrafts(next);
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to save format.';
          setFormatFormError(message);
          return;
        }
      }

      const id = `fmt_${formats.length + 1}`;
      const next: Format = {
        id,
        name: formDraft.name.trim(),
        type: formDraft.type,
        regOpen: formDraft.regOpen,
        regClose: formDraft.regClose,
        autoClose: formDraft.autoClose,
        scheduleGeneratedAt: null,
        scheduleLocked: false,
        config: defaultFormatConfig(),
        pool: defaultPoolConfig(),
        courtConfig: defaultCourtConfig(),
        courtAssignments: {},
        metaConfigJson: {},
      };

      setFormats((prev) => {
        const updated = [...prev, next];
        if (activeTournamentId) {
          setTournaments((items) => items.map((item) => (item.id === activeTournamentId ? { ...item, formats: updated } : item)));
        }
        return updated;
      });

      if (activeTournamentId) setActiveTournamentConfiguredStatus(activeTournamentId);
      setActiveFormatId(id);
      setActiveTab('config');
      setShowAddFormat(false);
      setEditingFormatId(null);
      setFormDraft(defaultFormatFormDraft());
      loadDrafts(next);
    })();
  }

  function openTournament(tournamentId: string) {
    if (!canSwitch()) return;
    const target = tournaments.find((item) => item.id === tournamentId);
    if (!target) return;

    setActiveTournamentId(tournamentId);
    setShowCreateTournament(false);
    setShowAddFormat(false);
    setEditingFormatId(null);
    setFormats(clone(target.formats || []));
    setCourts(clone(target.courts || []));
    setActiveCourtId(target.courts[0]?.id || null);
    setActiveFormatId(null);
    clearActiveFormatDrafts();
    setFormDraft(defaultFormatFormDraft());

    loadTournamentFormatsFromApi(tournamentId, null);
    loadTournamentCourtsFromApi(tournamentId, target.courts[0]?.id ?? null);
  }

  function closeTournament() {
    if (!canSwitch()) return;
    setActiveTournamentId(null);
    setShowAddFormat(false);
    setEditingFormatId(null);
    setActiveFormatId(null);
    clearActiveFormatDrafts();
  }

  function openFormat(formatId: string, tab: ViewTab) {
    if (!canSwitch()) return;
    const target = formats.find((format) => format.id === formatId);
    if (!target) return;

    setShowAddFormat(false);
    setEditingFormatId(null);
    setActiveFormatId(formatId);
    setActiveTab(tab);
    loadDrafts(target);
  }

  function switchTab(tab: ViewTab) {
    if (tab === activeTab) return;
    if (!canSwitch()) return;
    setActiveTab(tab);
  }

  function requestShowAddFormat() {
    if (!canSwitch()) return;
    setEditingFormatId(null);
    setFormatFormError('');
    setFormDraft(defaultFormatFormDraft());
    setShowAddFormat(true);
  }

  function requestEditFormat(formatId: string) {
    if (!canSwitch()) return;
    const target = formats.find((format) => format.id === formatId);
    if (!target) return;
    setEditingFormatId(target.id);
    setFormatFormError('');
    setFormDraft(toFormatFormDraft(target));
    setShowAddFormat(true);
  }

  function requestDeleteFormat(formatId: string) {
    if (!canSwitch()) return;
    const target = formats.find((format) => format.id === formatId);
    if (!target) return;
    if (!window.confirm(`Delete format "${target.name}"?`)) return;

    void (async () => {
      const auth = readAdminAuth();
      const parsedTournamentId = activeTournamentId ? Number.parseInt(activeTournamentId, 10) : Number.NaN;
      const parsedFormatId = Number.parseInt(target.id, 10);

      if (auth && Number.isInteger(parsedTournamentId) && Number.isInteger(parsedFormatId)) {
        try {
          await client.deleteTournamentFormat(auth.token, auth.clubId, parsedTournamentId, parsedFormatId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to delete format.';
          window.alert(message);
          return;
        }
      }

      const nextFormats = formats.filter((format) => format.id !== formatId);
      setFormats(nextFormats);
      updateActiveTournamentFormats(nextFormats);

      if (activeFormatId === formatId) {
        setActiveFormatId(null);
        clearActiveFormatDrafts();
        setShowAddFormat(false);
        setEditingFormatId(null);
      }

      showSavedNotice('Format deleted');
    })();
  }

  function cancelFormatEditor() {
    setShowAddFormat(false);
    setEditingFormatId(null);
    setFormatFormError('');
    setFormDraft(defaultFormatFormDraft());
  }

  function patchCourtConfigDraft(transform: (current: CourtConfig) => CourtConfig) {
    setCourtConfigDraft((prev) => (prev ? transform(clone(prev)) : prev));
    setCourtDirty(true);
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

    void (async () => {
      const auth = readAdminAuth();
      const parsedTournamentId = activeTournamentId ? Number.parseInt(activeTournamentId, 10) : Number.NaN;
      const parsedFormatId = Number.parseInt(activeFormat.id, 10);
      const backendSchedulingModel = merged.schedulingModel === 'GROUPS_KO'
        || merged.schedulingModel === 'MATCH_COUNT_KO'
        || merged.schedulingModel === 'DIRECT_KNOCKOUT'
        ? merged.schedulingModel
        : undefined;

      if (auth && Number.isInteger(parsedTournamentId) && Number.isInteger(parsedFormatId)) {
        try {
          const mergedConfigJson: Record<string, unknown> = {
            ...(activeFormat.metaConfigJson || {}),
            ui_scheduling_model: merged.schedulingModel,
            stage_rules: merged.stageRules,
          };
          const updated = await client.updateTournamentFormat(
            auth.token,
            auth.clubId,
            parsedTournamentId,
            parsedFormatId,
            {
              name: formatNameDraft.trim(),
              average_set_duration_minutes: merged.setDurationMinutes,
              max_teams_allowed: merged.maxTeamsAllowed,
              matches_per_team: merged.matchCountPerEntrant,
              group_count: merged.groupCount,
              group_ko_teams_per_group: merged.groupKoTeamsPerGroup,
              seed_source: 'ELO',
              scheduling_model: backendSchedulingModel,
              config_json: mergedConfigJson,
            },
          );
          const mapped = mapApiFormatToLocal(updated);
          setFormats((prev) => {
            const nextFormats = prev.map((format) => (format.id === mapped.id ? mapped : format));
            if (activeTournamentId) {
              setTournaments((items) => items.map((item) => (
                item.id === activeTournamentId ? { ...item, formats: nextFormats } : item
              )));
            }
            return nextFormats;
          });
          setFormatNameDraft(mapped.name);
          setConfigDraft(clone(mapped.config));
          setConfigDirty(false);
          showSavedNotice('Configuration saved');
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to save configuration.';
          window.alert(message);
          return;
        }
      }

      updateCurrentFormat((format) => ({ ...format, name: formatNameDraft.trim(), config: merged }));
      setConfigDirty(false);
      showSavedNotice('Configuration saved');
    })();
  }

  function savePool() {
    if (!poolDraft || !activeFormat) return;

    void (async () => {
      const auth = readAdminAuth();
      const parsedTournamentId = activeTournamentId ? Number.parseInt(activeTournamentId, 10) : Number.NaN;
      const parsedFormatId = Number.parseInt(activeFormat.id, 10);

      if (auth && Number.isInteger(parsedTournamentId) && Number.isInteger(parsedFormatId)) {
        try {
          const mergedConfigJson: Record<string, unknown> = {
            ...(activeFormat.metaConfigJson || {}),
            pool: clone(poolDraft),
          };
          const updated = await client.updateTournamentFormat(
            auth.token,
            auth.clubId,
            parsedTournamentId,
            parsedFormatId,
            {
              config_json: mergedConfigJson,
            },
          );
          const mapped = mapApiFormatToLocal(updated);
          setFormats((prev) => {
            const nextFormats = prev.map((format) => (format.id === mapped.id ? mapped : format));
            if (activeTournamentId) {
              setTournaments((items) => items.map((item) => (
                item.id === activeTournamentId ? { ...item, formats: nextFormats } : item
              )));
            }
            return nextFormats;
          });
          setPoolDraft(clone(mapped.pool));
          setPoolDirty(false);
          showSavedNotice('Pool saved');
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to save pool.';
          window.alert(message);
          return;
        }
      }

      updateCurrentFormat((format) => ({ ...format, pool: clone(poolDraft) }));
      setPoolDirty(false);
      showSavedNotice('Pool saved');
    })();
  }

  function saveSchedules() {
    if (!courtConfigDraft || !activeFormat) return;

    const nextCourtAssignments = clone(scheduleDraft);
    const nextCourtConfig = clone(courtConfigDraft);

    void (async () => {
      const auth = readAdminAuth();
      const parsedTournamentId = activeTournamentId ? Number.parseInt(activeTournamentId, 10) : Number.NaN;
      const parsedFormatId = Number.parseInt(activeFormat.id, 10);

      if (auth && Number.isInteger(parsedTournamentId) && Number.isInteger(parsedFormatId)) {
        try {
          const allowedCourtIds = extractAllowedCourtIds(nextCourtAssignments);
          await client.setTournamentFormatCourts(auth.token, auth.clubId, parsedTournamentId, parsedFormatId, {
            allowed_court_ids: allowedCourtIds,
          });

          const mergedConfigJson: Record<string, unknown> = {
            ...(activeFormat.metaConfigJson || {}),
            court_assignments: nextCourtAssignments,
            court_config: nextCourtConfig,
          };

          const updated = await client.updateTournamentFormat(
            auth.token,
            auth.clubId,
            parsedTournamentId,
            parsedFormatId,
            {
              config_json: mergedConfigJson,
            },
          );

          const mapped = mapApiFormatToLocal(updated);
          setFormats((prev) => {
            const nextFormats = prev.map((format) => (format.id === mapped.id ? mapped : format));
            if (activeTournamentId) {
              setTournaments((items) => items.map((item) => (
                item.id === activeTournamentId ? { ...item, formats: nextFormats } : item
              )));
            }
            return nextFormats;
          });
          setScheduleDraft(clone(mapped.courtAssignments));
          setCourtConfigDraft(clone(mapped.courtConfig));
          setScheduleDirty(false);
          setCourtDirty(false);
          showSavedNotice('Schedules saved');
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to save schedules.';
          window.alert(message);
          return;
        }
      }

      updateCurrentFormat((format) => ({
        ...format,
        courtAssignments: nextCourtAssignments,
        courtConfig: nextCourtConfig,
      }));
      setScheduleDirty(false);
      setCourtDirty(false);
      showSavedNotice('Schedules saved');
    })();
  }

  function saveCourtsConfig() {
    if (!courtConfigDraft || !activeFormat) return;
    const nextCourtConfig = clone(courtConfigDraft);
    const nextCourtAssignments = clone(scheduleDraft);

    void (async () => {
      const auth = readAdminAuth();
      const parsedTournamentId = activeTournamentId ? Number.parseInt(activeTournamentId, 10) : Number.NaN;
      const parsedFormatId = Number.parseInt(activeFormat.id, 10);

      if (auth && Number.isInteger(parsedTournamentId) && Number.isInteger(parsedFormatId)) {
        try {
          const mergedConfigJson: Record<string, unknown> = {
            ...(activeFormat.metaConfigJson || {}),
            court_assignments: nextCourtAssignments,
            court_config: nextCourtConfig,
          };

          const updated = await client.updateTournamentFormat(
            auth.token,
            auth.clubId,
            parsedTournamentId,
            parsedFormatId,
            {
              config_json: mergedConfigJson,
            },
          );

          const mapped = mapApiFormatToLocal(updated);
          setFormats((prev) => {
            const nextFormats = prev.map((format) => (format.id === mapped.id ? mapped : format));
            if (activeTournamentId) {
              setTournaments((items) => items.map((item) => (
                item.id === activeTournamentId ? { ...item, formats: nextFormats } : item
              )));
            }
            return nextFormats;
          });
          setScheduleDraft(clone(mapped.courtAssignments));
          setCourtConfigDraft(clone(mapped.courtConfig));
          setCourtDirty(false);
          showSavedNotice('Court availability saved');
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to save court availability.';
          window.alert(message);
          return;
        }
      }

      updateCurrentFormat((format) => ({ ...format, courtConfig: nextCourtConfig }));
      setCourtDirty(false);
      showSavedNotice('Court availability saved');
    })();
  }

  function generateSchedule() {
    if (!activeFormat || !activeTournamentId) return;
    if (scheduleDirty || courtDirty) {
      window.alert('Save schedule changes first before generating.');
      return;
    }

    void (async () => {
      setScheduleActionBusy('generate');
      const auth = readAdminAuth();
      const parsedTournamentId = Number.parseInt(activeTournamentId, 10);
      const parsedFormatId = Number.parseInt(activeFormat.id, 10);

      if (auth && Number.isInteger(parsedTournamentId) && Number.isInteger(parsedFormatId)) {
        try {
          await client.generateTournamentSchedule(auth.token, auth.clubId, parsedTournamentId, parsedFormatId, {});
          loadTournamentFormatsFromApi(activeTournamentId, activeFormat.id);
          showSavedNotice('Schedule generated');
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to generate schedule.';
          window.alert(message);
          return;
        } finally {
          setScheduleActionBusy(null);
        }
      }

      updateCurrentFormat((format) => ({
        ...format,
        scheduleGeneratedAt: new Date().toISOString(),
        scheduleLocked: true,
      }));
      showSavedNotice('Schedule generated');
      setScheduleActionBusy(null);
    })();
  }

  function viewBrackets() {
    if (!activeFormat || !activeTournamentId) return;

    void (async () => {
      setScheduleActionBusy('view');
      const auth = readAdminAuth();
      const parsedTournamentId = Number.parseInt(activeTournamentId, 10);
      const parsedFormatId = Number.parseInt(activeFormat.id, 10);

      if (auth && Number.isInteger(parsedTournamentId) && Number.isInteger(parsedFormatId)) {
        try {
          const rows = await client.tournamentFormatMatches(auth.token, auth.clubId, parsedTournamentId, parsedFormatId);
          setBracketMatches(rows);
          setBracketMatchesOpen(true);
          if (!rows.length) {
            showSavedNotice('No matches generated yet');
          }
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to load brackets.';
          window.alert(message);
          return;
        } finally {
          setScheduleActionBusy(null);
        }
      }

      setBracketMatchesOpen(true);
      setScheduleActionBusy(null);
    })();
  }

  function resetSchedule() {
    if (!activeFormat || !activeTournamentId) return;
    if (!window.confirm('Reset generated schedule for this format?')) return;

    void (async () => {
      setScheduleActionBusy('reset');
      const auth = readAdminAuth();
      const parsedTournamentId = Number.parseInt(activeTournamentId, 10);
      const parsedFormatId = Number.parseInt(activeFormat.id, 10);

      if (auth && Number.isInteger(parsedTournamentId) && Number.isInteger(parsedFormatId)) {
        try {
          await client.resetTournamentSchedule(auth.token, auth.clubId, parsedTournamentId, parsedFormatId);
          setBracketMatches([]);
          setBracketMatchesOpen(false);
          loadTournamentFormatsFromApi(activeTournamentId, activeFormat.id);
          showSavedNotice('Schedule reset');
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to reset schedule.';
          window.alert(message);
          return;
        } finally {
          setScheduleActionBusy(null);
        }
      }

      updateCurrentFormat((format) => ({
        ...format,
        scheduleGeneratedAt: null,
        scheduleLocked: false,
      }));
      setBracketMatches([]);
      setBracketMatchesOpen(false);
      showSavedNotice('Schedule reset');
      setScheduleActionBusy(null);
    })();
  }

  function updateConfig(next: Partial<FormatConfig>) {
    const requestedGroupCount = typeof next.groupCount === 'number' ? Math.max(1, Math.floor(next.groupCount)) : null;
    setConfigDraft((prev) => {
      if (!prev) return prev;
      const merged: FormatConfig = { ...prev, ...next };
      if (requestedGroupCount !== null) merged.groupCount = requestedGroupCount;
      const nextStageIds = new Set(buildStages(merged).map((stage) => stage.id));
      const nextRules: Record<string, StageRule> = {};
      nextStageIds.forEach((stageId) => {
        nextRules[stageId] = merged.stageRules[stageId] || defaultStageRule();
      });
      merged.stageRules = nextRules;
      return merged;
    });
    if (requestedGroupCount !== null) {
      setPoolDraft((prev) => {
        if (!prev) return prev;
        const nextPool = clone(prev);
        const groupCountChanged = nextPool.groupCount !== requestedGroupCount;
        nextPool.groupCount = requestedGroupCount;
        if (groupCountChanged && nextPool.generatedTeams.length) {
          nextPool.groups = [];
          nextPool.assignments = {};
          nextPool.teamsGenerated = false;
          nextPool.pairValidationMessage = '';
        }
        return nextPool;
      });
      setPoolDirty(true);
    }
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

  function addCourt() {
    const name = courtName.trim();
    if (!name) return;
    if (courts.some((court) => court.name.toLowerCase() === name.toLowerCase())) {
      window.alert('Court with this name already exists.');
      return;
    }

    const auth = readAdminAuth();
    const parsedTournamentId = activeTournamentId ? Number.parseInt(activeTournamentId, 10) : Number.NaN;
    if (auth && Number.isInteger(parsedTournamentId)) {
      void (async () => {
        try {
          const created = await client.createTournamentCourt(auth.token, auth.clubId, parsedTournamentId, { name });
          const createdCourt: CourtItem = { id: String(created.id), name: created.name };
          setCourts((prev) => {
            if (prev.some((court) => court.id === createdCourt.id)) return prev;
            const updated = [...prev, createdCourt];
            updateActiveTournamentCourts(updated);
            return updated;
          });
          setActiveCourtId(createdCourt.id);
          setCourtName('');
          setShowAddCourtModal(false);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to add court.';
          window.alert(message);
        }
      })();
      return;
    }

    const courtId = `court_${courts.length + 1}`;
    setCourts((prev) => {
      const updated = [...prev, { id: courtId, name }];
      updateActiveTournamentCourts(updated);
      return updated;
    });
    setActiveCourtId(courtId);
    setCourtName('');
    setShowAddCourtModal(false);
  }

  function renameCourt(courtId: string, nextNameRaw: string) {
    const nextName = nextNameRaw.trim();
    if (!nextName) return;
    const target = courts.find((court) => court.id === courtId);
    if (!target) return;
    if (target.name === nextName) return;
    if (courts.some((court) => court.id !== courtId && court.name.toLowerCase() === nextName.toLowerCase())) {
      window.alert('Court with this name already exists.');
      return;
    }

    const nextCourts = courts.map((court) => (
      court.id === courtId ? { ...court, name: nextName } : court
    ));
    setCourts(nextCourts);
    updateActiveTournamentCourts(nextCourts);
    showSavedNotice('Court renamed');
  }

  function deleteCourt(courtId: string) {
    const target = courts.find((court) => court.id === courtId);
    if (!target) return;
    if (!window.confirm(`Delete court \"${target.name}\"?`)) return;

    const nextCourts = courts.filter((court) => court.id !== courtId);
    setCourts(nextCourts);
    updateActiveTournamentCourts(nextCourts);
    if (activeCourtId === courtId) {
      setActiveCourtId(nextCourts[0]?.id || null);
    }

    patchCourtConfigDraft((next) => {
      if (next.availability[courtId]) {
        delete next.availability[courtId];
      }
      return next;
    });

    setScheduleDraft((prev) => {
      const next = clone(prev);
      Object.keys(next).forEach((stageId) => {
        next[stageId] = (next[stageId] || []).filter((id) => id !== courtId);
      });
      return next;
    });
    setScheduleDirty(true);
    showSavedNotice('Court deleted');
  }

  function addCourtAvailabilitySlot() {
    if (!courtConfigDraft || !activeCourtId) return;
    if (!slotDraft.date || !slotDraft.startTime || !slotDraft.endTime) return;

    patchCourtConfigDraft((next) => {
      const slots = next.availability[activeCourtId] || [];
      slots.push({
        id: `slot_${slots.length + 1}_${Date.now()}`,
        date: slotDraft.date,
        startTime: slotDraft.startTime,
        endTime: slotDraft.endTime,
      });
      next.availability[activeCourtId] = slots;
      return next;
    });
  }

  function removeCourtAvailabilitySlot(slotId: string) {
    if (!courtConfigDraft || !activeCourtId) return;
    patchCourtConfigDraft((next) => {
      next.availability[activeCourtId] = (next.availability[activeCourtId] || []).filter((slot) => slot.id !== slotId);
      return next;
    });
  }

  function buildGroupsAndAssignments(entries: GeneratedTeam[], groupCount: number): { groups: Group[]; assignments: Record<string, string[]> } {
    const count = Math.max(1, groupCount);
    const groups: Group[] = Array.from({ length: count }).map((_, index) => {
      const letter = String.fromCharCode(65 + index);
      return { id: `group_${letter}`, name: `Group ${letter}` };
    });

    const assignments: Record<string, string[]> = {};
    groups.forEach((group) => {
      assignments[group.id] = [];
    });
    entries.forEach((entry, index) => {
      assignments[groups[index % count].id].push(entry.id);
    });

    return { groups, assignments };
  }

  function buildPoolPlayerLookup(pool: PoolConfig, basePlayers: ClubPlayer[]): Map<string, ClubPlayer> {
    const base = new Map(basePlayers.map((player) => [player.id, player]));
    const lookup = new Map<string, ClubPlayer>();
    pool.poolPlayers.forEach((entry) => {
      const player = base.get(entry.playerId);
      if (!player) return;
      lookup.set(entry.playerId, {
        ...player,
        elo: typeof entry.seededElo === 'number' ? entry.seededElo : player.elo,
      });
    });
    return lookup;
  }

  function buildSinglesEntries(
    poolPlayers: PoolConfig['poolPlayers'],
    playersById: Map<string, ClubPlayer>,
  ): GeneratedTeam[] {
    const entries: GeneratedTeam[] = [];
    poolPlayers.forEach((entry) => {
      const player = playersById.get(entry.playerId);
      if (!player) return;
      entries.push({
        id: `player_${player.id}`,
        name: player.name,
        playerIds: [player.id],
        elo: player.elo,
      });
    });
    return entries;
  }

  function hydrateTeam(teamId: string, playerIds: [string, string], playersById: Map<string, ClubPlayer>): GeneratedTeam {
    const playerA = playersById.get(playerIds[0]);
    const playerB = playersById.get(playerIds[1]);
    const nameA = playerA?.name || 'Unassigned';
    const nameB = playerB?.name || 'Unassigned';
    const teamElo = Math.round((((playerA?.elo || 0) + (playerB?.elo || 0)) / 2) || 0);
    return {
      id: teamId,
      name: `${nameA} / ${nameB}`,
      playerIds,
      elo: teamElo,
    };
  }

  function setPoolSeasonId(seasonId: string) {
    if (!poolDraft) return;
    if (poolDraft.seasonId === seasonId) return;
    setPoolDraft({
      ...poolDraft,
      seasonId,
    });
    setPoolDirty(true);
  }

  function addPlayerToPool() {
    if (!poolDraft || !addPlayerId || !activeFormat) return;
    if (poolDraft.generatedTeams.length > 0 || poolDraft.teamsGenerated) return;
    if (poolDraft.poolPlayers.some((entry) => entry.playerId === addPlayerId)) return;

    const next = clone(poolDraft);
    const player = clubPlayersForActiveFormat.find((item) => item.id === addPlayerId);
    const resolvedSeasonId = next.seasonId || defaultPoolSeasonId();
    next.poolPlayers.push({
      playerId: addPlayerId,
      registeredAt: new Date().toISOString().slice(0, 10),
      regRoute: 'ADMIN',
      seededElo: player?.elo,
      eloSeasonId: resolvedSeasonId,
    });
    if (!next.seasonId) next.seasonId = resolvedSeasonId;

    setPoolDraft(next);
    setAddPlayerId('');
    setPoolDirty(true);
  }

  function removePlayerFromPool(playerId: string) {
    if (!poolDraft || poolDraft.generatedTeams.length > 0 || poolDraft.teamsGenerated) return;
    if (!poolDraft.poolPlayers.some((entry) => entry.playerId === playerId)) return;
    const next = clone(poolDraft);
    next.poolPlayers = next.poolPlayers.filter((entry) => entry.playerId !== playerId);
    setPoolDraft(next);
    if (addPlayerId === playerId) setAddPlayerId('');
    setPoolDirty(true);
  }

  function updateGeneratedPairing(teamId: string, playerIndex: 0 | 1, playerId: string) {
    if (!poolDraft || !activeFormat || activeFormat.type === 'SINGLES') return;
    const next = clone(poolDraft);
    const teamIdx = next.generatedTeams.findIndex((team) => team.id === teamId);
    if (teamIdx < 0) return;
    const currentTeam = next.generatedTeams[teamIdx];
    const playerIds: [string, string] = [
      currentTeam.playerIds[0] || '',
      currentTeam.playerIds[1] || '',
    ];
    playerIds[playerIndex] = playerId;
    const playersById = buildPoolPlayerLookup(next, clubPlayersForActiveFormat);
    next.generatedTeams[teamIdx] = hydrateTeam(teamId, playerIds, playersById);
    next.pairsValidated = false;
    next.pairValidationMessage = '';
    next.groups = [];
    next.assignments = {};
    next.teamsGenerated = false;
    setPoolDraft(next);
    setPoolDirty(true);
  }

  function validateGeneratedPairs() {
    if (!poolDraft || !activeFormat || activeFormat.type === 'SINGLES') return;
    const poolPlayerIds = poolDraft.poolPlayers.map((entry) => entry.playerId);
    if (!poolPlayerIds.length) return;
    const next = clone(poolDraft);
    const allPool = new Set(poolPlayerIds);
    const counts = new Map<string, number>();
    const playerToRows = new Map<string, number[]>();
    const rowIssues = new Set<number>();
    const playersById = buildPoolPlayerLookup(next, clubPlayersForActiveFormat);

    next.generatedTeams.forEach((team, index) => {
      const row = index + 1;
      if (team.playerIds.length !== 2 || !team.playerIds[0] || !team.playerIds[1]) {
        rowIssues.add(row);
        return;
      }
      if (team.playerIds[0] === team.playerIds[1]) {
        rowIssues.add(row);
        return;
      }
      team.playerIds.forEach((playerId) => {
        if (!allPool.has(playerId)) {
          rowIssues.add(row);
          return;
        }
        counts.set(playerId, (counts.get(playerId) || 0) + 1);
        const rows = playerToRows.get(playerId) || [];
        rows.push(row);
        playerToRows.set(playerId, rows);
      });
    });

    const duplicatePlayerIds = Array.from(playerToRows.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([playerId]) => playerId);
    duplicatePlayerIds.forEach((playerId) => {
      (playerToRows.get(playerId) || []).forEach((row) => rowIssues.add(row));
    });
    const invalidPlayers = Array.from(playerToRows.keys()).filter((playerId) => !allPool.has(playerId));
    const unassignedPlayers = poolPlayerIds.filter((playerId) => !counts.has(playerId));
    const issueRows = Array.from(rowIssues).sort((a, b) => a - b);

    if (issueRows.length || invalidPlayers.length || duplicatePlayerIds.length || unassignedPlayers.length) {
      next.pairsValidated = false;
      const reportedRows = issueRows.length
        ? issueRows
        : next.generatedTeams.map((_, index) => index + 1);
      const messageParts = [`Pair validation failed on line(s): ${reportedRows.join(', ')}.`];
      if (duplicatePlayerIds.length) {
        const duplicateNames = duplicatePlayerIds
          .map((playerId) => playersById.get(playerId)?.name || playerId)
          .join(', ');
        messageParts.push(`Duplicate assignments: ${duplicateNames}.`);
      }
      if (unassignedPlayers.length) {
        const unassignedNames = unassignedPlayers
          .map((playerId) => playersById.get(playerId)?.name || playerId)
          .join(', ');
        messageParts.push(`Unassigned players: ${unassignedNames}.`);
      }
      if (invalidPlayers.length) {
        messageParts.push('Some rows contain players outside the pool list.');
      }
      next.pairValidationMessage = messageParts.join(' ');
      setPoolDraft(next);
      setPoolDirty(true);
      return;
    }

    next.pairsValidated = true;
    next.pairValidationMessage = 'Pairs validated. You can now generate groups.';
    setPoolDraft(next);
    setPoolDirty(true);
  }

  function generateGroupsFromPairs() {
    if (!poolDraft || !activeFormat) return;
    if (activeFormat.type === 'SINGLES') return;
    if (!poolDraft.generatedTeams.length) return;
    if (!poolDraft.pairsValidated) {
      window.alert('Validate pairs before generating groups.');
      return;
    }
    const nextGroupCount = configDraft?.groupCount || poolDraft.groupCount || 1;
    const grouped = buildGroupsAndAssignments(poolDraft.generatedTeams, nextGroupCount);
    setPoolDraft({
      ...poolDraft,
      groupCount: nextGroupCount,
      groups: grouped.groups,
      assignments: grouped.assignments,
      teamsGenerated: true,
    });
    setPoolPlayersOpen(false);
    setPoolGroupsOpen(true);
    setPoolDirty(true);
  }

  function generateTeamsAndGroups() {
    if (!poolDraft || !activeFormat) return;

    void (async () => {
      const auth = readAdminAuth();
      const parsedTournamentId = activeTournamentId ? Number.parseInt(activeTournamentId, 10) : Number.NaN;
      const parsedFormatId = Number.parseInt(activeFormat.id, 10);
      const groupCount = configDraft?.groupCount || poolDraft.groupCount || 1;

      if (auth && Number.isInteger(parsedTournamentId) && Number.isInteger(parsedFormatId) && activeFormat.type !== 'SINGLES') {
        const playerIds = poolDraft.poolPlayers
          .map((entry) => Number.parseInt(entry.playerId, 10))
          .filter((value) => Number.isInteger(value));
        if (playerIds.length !== poolDraft.poolPlayers.length) {
          window.alert('All pool players must have valid numeric IDs before generating pairs.');
          return;
        }

        try {
          const generated = await client.generateTournamentPairs(
            auth.token,
            auth.clubId,
            parsedTournamentId,
            parsedFormatId,
            {
              player_ids: playerIds,
              group_count: groupCount,
            },
          );

          const teams: GeneratedTeam[] = generated.generated_pairs.map((pair) => ({
            id: pair.id,
            name: pair.name,
            playerIds: pair.player_ids.map((id) => String(id)),
            elo: pair.team_elo,
          }));

          setPoolDraft({
            ...poolDraft,
            groupCount,
            generatedTeams: teams,
            groups: [],
            assignments: {},
            teamsGenerated: false,
            pairsValidated: false,
            pairValidationMessage: '',
          });
          setPoolPlayersOpen(false);
          setPoolDirty(true);
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to generate pairs.';
          window.alert(message);
          return;
        }
      }

      const playersById = buildPoolPlayerLookup(poolDraft, clubPlayersForActiveFormat);
      const players = poolDraft.poolPlayers
        .map((entry) => playersById.get(entry.playerId))
        .filter(Boolean) as ClubPlayer[];
      const sorted = players.slice().sort((a, b) => b.elo - a.elo);

      const teams: GeneratedTeam[] = [];
      if (activeFormat.type === 'SINGLES') {
        if (!poolDraft.poolPlayers.length) {
          window.alert('Add at least one player before generating groups.');
          return;
        }
        teams.push(...buildSinglesEntries(poolDraft.poolPlayers, playersById));
      } else {
        if (sorted.length < 2 || sorted.length % 2 !== 0) {
          window.alert('Player count must be even and at least 2 to generate pairs.');
          return;
        }
        for (let index = 0; index < sorted.length; index += 2) {
          const playerA = sorted[index];
          const playerB = sorted[index + 1];
          teams.push({
            id: `team_${(index / 2) + 1}`,
            name: `${playerA.name} / ${playerB.name}`,
            playerIds: [playerA.id, playerB.id],
            elo: Math.round((playerA.elo + playerB.elo) / 2),
          });
        }
        setPoolDraft({
          ...poolDraft,
          groupCount,
          generatedTeams: teams,
          groups: [],
          assignments: {},
          teamsGenerated: false,
          pairsValidated: false,
          pairValidationMessage: '',
        });
        setPoolPlayersOpen(false);
        setPoolDirty(true);
        return;
      }

      const grouped = buildGroupsAndAssignments(teams, groupCount);
      setPoolDraft({
        ...poolDraft,
        groupCount,
        generatedTeams: teams,
        groups: grouped.groups,
        assignments: grouped.assignments,
        teamsGenerated: true,
        pairsValidated: true,
        pairValidationMessage: '',
      });
      setPoolPlayersOpen(false);
      setPoolGroupsOpen(true);
      setPoolDirty(true);
    })();
  }

  function resetTeams() {
    if (!poolDraft) return;
    setPoolDraft({
      ...poolDraft,
      groupCount: configDraft?.groupCount || poolDraft.groupCount,
      generatedTeams: [],
      groups: [],
      assignments: {},
      teamsGenerated: false,
      pairsValidated: false,
      pairValidationMessage: '',
    });
    setPoolPlayersOpen(true);
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

  function toggleStageCourt(stageId: string, courtId: string, checked: boolean) {
    const current = new Set(scheduleDraft[stageId] || []);
    if (checked) current.add(courtId);
    else current.delete(courtId);
    const next = clone(scheduleDraft);
    next[stageId] = Array.from(current);
    setScheduleDraft(next);
    setScheduleDirty(true);
  }

  return {
    tournamentName,
    setTournamentName,
    tournamentTimezone,
    setTournamentTimezone,
    tournamentAdminNotes,
    setTournamentAdminNotes,
    clubSeasons,
    seasonLoading,
    seasonLoadError,
    seasonSource,

    tournaments,
    activeTournamentId,
    showCreateTournament,
    setShowCreateTournament,
    tournamentFormError,
    setTournamentFormError,

    formats,
    activeFormatId,
    activeTab,
    showAddFormat,
    setShowAddFormat,
    editingFormatId,
    formatFormError,
    setFormatFormError,

    courts,
    courtName,
    setCourtName,
    showAddCourtModal,
    setShowAddCourtModal,

    formDraft,
    setFormDraft,
    configDraft,
    setConfigDraft,
    formatNameDraft,
    setFormatNameDraft,
    poolDraft,
    setPoolDraft,
    scheduleDraft,
    setScheduleDraft,
    courtConfigDraft,
    setCourtConfigDraft,

    configDirty,
    setConfigDirty,
    poolDirty,
    setPoolDirty,
    setPoolSeasonId,
    scheduleDirty,
    setScheduleDirty,
    courtDirty,
    setCourtDirty,

    saveNotice,
    addPlayerId,
    setAddPlayerId,
    stageCourtAssignmentsOpen,
    setStageCourtAssignmentsOpen,
    poolPlayersOpen,
    setPoolPlayersOpen,
    poolGroupsOpen,
    setPoolGroupsOpen,
    bracketMatchesOpen,
    setBracketMatchesOpen,
    bracketMatches,
    scheduleActionBusy,
    activeCourtId,
    setActiveCourtId,

    mounted,

    slotDraft,
    setSlotDraft,

    activeFormat,
    stageDefs,
    timezoneOptions,
    activeTournament,
    effectiveEntrantCount,
    planningMetrics,
    scheduleStatusLabel,
    isSinglesFormat,
    unitLabel,
    unitLabelPlural,
    clubPlayersForActiveFormat,

    canSwitch,
    createTournament,
    saveFormatBase,
    openTournament,
    closeTournament,
    openFormat,
    switchTab,
    requestShowAddFormat,
    requestEditFormat,
    requestDeleteFormat,
    cancelFormatEditor,
    saveConfig,
    savePool,
    saveSchedules,
    saveCourtsConfig,
    generateSchedule,
    viewBrackets,
    resetSchedule,
    updateConfig,
    updateStageRule,
    patchCourtConfigDraft,
    addCourt,
    renameCourt,
    deleteCourt,
    addCourtAvailabilitySlot,
    removeCourtAvailabilitySlot,
    addPlayerToPool,
    removePlayerFromPool,
    updateGeneratedPairing,
    validateGeneratedPairs,
    generateGroupsFromPairs,
    generateTeamsAndGroups,
    resetTeams,
    reassignTeam,
    toggleStageCourt,
  };
}
