'use client';

import { useEffect, useMemo, useState } from 'react';
import { LeagueOsApiClient } from '@leagueos/api';

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
  GeneratedTeam,
  Group,
  PoolConfig,
  SchedulingModel,
  SlotDraft,
  StageRule,
  TournamentRecord,
  ViewTab,
} from './types';

export function useTournamentWorkspaceState() {
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentTimezone, setTournamentTimezone] = useState('America/Vancouver');
  const [tournamentSeasonId, setTournamentSeasonId] = useState('');
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
  const [stageCourtAssignmentsOpen, setStageCourtAssignmentsOpen] = useState(true);
  const [activeCourtId, setActiveCourtId] = useState<string | null>(null);

  const [configEditMode, setConfigEditMode] = useState(false);
  const [poolEditMode, setPoolEditMode] = useState(false);
  const [scheduleEditMode, setScheduleEditMode] = useState(false);
  const [courtsEditMode, setCourtsEditMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [slotDraft, setSlotDraft] = useState<SlotDraft>(defaultSlotDraft);

  const activeFormat = useMemo(() => formats.find((format) => format.id === activeFormatId) ?? null, [formats, activeFormatId]);
  const stageDefs = useMemo(() => (configDraft ? buildStages(configDraft) : []), [configDraft]);
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);

  const selectedSeasonName = useMemo(() => {
    const selected = clubSeasons.find((season) => String(season.id) === tournamentSeasonId);
    return selected?.name || '';
  }, [clubSeasons, tournamentSeasonId]);

  const activeTournament = useMemo(
    () => tournaments.find((item) => item.id === activeTournamentId) || null,
    [tournaments, activeTournamentId],
  );

  const planningMetrics = useMemo(
    () => (configDraft ? computePlanningMetrics(configDraft) : { matches: 0, sets: 0, duration: '00:00', warnings: [] }),
    [configDraft],
  );

  const isSinglesFormat = activeFormat?.type === 'SINGLES';
  const unitLabel = isSinglesFormat ? 'Player' : 'Team';
  const unitLabelPlural = isSinglesFormat ? 'Players' : 'Teams';

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
          if (fallbackSeasons.length && !tournamentSeasonId) {
            setTournamentSeasonId(String(fallbackSeasons[0].id));
          }
          return;
        }

        const parsed = JSON.parse(raw) as { token?: string; clubId?: number };
        if (!parsed?.token || !Number.isInteger(parsed?.clubId)) {
          setClubSeasons(fallbackSeasons);
          setSeasonSource('fallback');
          if (fallbackSeasons.length && !tournamentSeasonId) {
            setTournamentSeasonId(String(fallbackSeasons[0].id));
          }
          return;
        }

        const seasons = await client.seasons(parsed.token, parsed.clubId as number);
        if (cancelled) return;

        setClubSeasons(seasons.length ? seasons : fallbackSeasons);
        setSeasonSource(seasons.length ? 'api' : 'fallback');
        if (seasons.length && !tournamentSeasonId) {
          setTournamentSeasonId(String(seasons[0].id));
        }
        if (!seasons.length && fallbackSeasons.length && !tournamentSeasonId) {
          setTournamentSeasonId(String(fallbackSeasons[0].id));
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to load seasons.';
        setSeasonLoadError(`Live season load failed (${message}). Using local list.`);
        setClubSeasons(fallbackSeasons);
        setSeasonSource('fallback');
        if (fallbackSeasons.length && !tournamentSeasonId) {
          setTournamentSeasonId(String(fallbackSeasons[0].id));
        }
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

  function resetEditModes() {
    setConfigEditMode(false);
    setPoolEditMode(false);
    setScheduleEditMode(false);
    setCourtsEditMode(false);
  }

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
    resetEditModes();
    resetDirtyFlags();
  }

  function loadDrafts(format: Format) {
    setFormatNameDraft(format.name);
    setConfigDraft(clone(format.config));
    setPoolDraft(clone(format.pool));
    setScheduleDraft(clone(format.courtAssignments));
    setCourtConfigDraft(clone(format.courtConfig || defaultCourtConfig()));
    resetEditModes();
    resetDirtyFlags();
  }

  function canSwitch(): boolean {
    const hasUnsavedChanges = configDirty || poolDirty || scheduleDirty || courtDirty;
    if (!hasUnsavedChanges) return true;
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
    clearActiveFormatDrafts();
    setShowAddCourtModal(false);
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
    setFormDraft(defaultFormatFormDraft());
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
      clearActiveFormatDrafts();
    }
  }

  function closeTournament() {
    if (!canSwitch()) return;
    setActiveTournamentId(null);
    setShowAddFormat(false);
    setActiveFormatId(null);
  }

  function openFormat(formatId: string, tab: ViewTab) {
    if (!canSwitch()) return;
    const target = formats.find((format) => format.id === formatId);
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

  function requestShowAddFormat() {
    if (!canSwitch()) return;
    setShowAddFormat(true);
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

    updateCurrentFormat((format) => ({ ...format, name: formatNameDraft.trim(), config: merged }));
    setConfigDirty(false);
    showSavedNotice('Configuration saved');
  }

  function savePool() {
    if (!poolDraft) return;
    updateCurrentFormat((format) => ({ ...format, pool: clone(poolDraft) }));
    setPoolDirty(false);
    showSavedNotice('Pool saved');
  }

  function saveSchedules() {
    if (!courtConfigDraft) return;
    updateCurrentFormat((format) => ({
      ...format,
      courtAssignments: clone(scheduleDraft),
      courtConfig: clone(courtConfigDraft),
    }));
    setScheduleDirty(false);
    setCourtDirty(false);
    showSavedNotice('Schedules saved');
  }

  function saveCourtsConfig() {
    if (!courtConfigDraft) return;
    updateCurrentFormat((format) => ({ ...format, courtConfig: clone(courtConfigDraft) }));
    setCourtDirty(false);
    showSavedNotice('Court availability saved');
  }

  function updateConfig(next: Partial<FormatConfig>) {
    setConfigDraft((prev) => {
      if (!prev) return prev;
      const merged: FormatConfig = { ...prev, ...next };
      const nextStageIds = new Set(buildStages(merged).map((stage) => stage.id));
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

  function buildSinglesEntries(poolPlayers: PoolConfig['poolPlayers']): GeneratedTeam[] {
    const entries: GeneratedTeam[] = [];
    poolPlayers.forEach((entry) => {
      const player = mockPlayers.find((candidate) => candidate.id === entry.playerId);
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

  function addPlayerToPool() {
    if (!poolDraft || !addPlayerId || !activeFormat) return;
    if (poolDraft.teamsGenerated) return;
    if (poolDraft.poolPlayers.some((entry) => entry.playerId === addPlayerId)) return;

    const next = clone(poolDraft);
    next.poolPlayers.push({
      playerId: addPlayerId,
      registeredAt: new Date().toISOString().slice(0, 10),
      regRoute: 'ADMIN',
    });

    setPoolDraft(next);
    setAddPlayerId('');
    setPoolDirty(true);
  }

  function generateTeamsAndGroups() {
    if (!poolDraft || !activeFormat) return;

    const players = poolDraft.poolPlayers
      .map((entry) => mockPlayers.find((player) => player.id === entry.playerId))
      .filter(Boolean) as ClubPlayer[];
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
    }

    const grouped = buildGroupsAndAssignments(teams, poolDraft.groupCount);
    setPoolDraft({
      ...poolDraft,
      generatedTeams: teams,
      groups: grouped.groups,
      assignments: grouped.assignments,
      teamsGenerated: true,
    });
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
    tournamentSeasonId,
    setTournamentSeasonId,
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
    scheduleDirty,
    setScheduleDirty,
    courtDirty,
    setCourtDirty,

    saveNotice,
    addPlayerId,
    setAddPlayerId,
    stageCourtAssignmentsOpen,
    setStageCourtAssignmentsOpen,
    activeCourtId,
    setActiveCourtId,

    configEditMode,
    setConfigEditMode,
    poolEditMode,
    setPoolEditMode,
    scheduleEditMode,
    setScheduleEditMode,
    courtsEditMode,
    setCourtsEditMode,
    mounted,

    slotDraft,
    setSlotDraft,

    activeFormat,
    stageDefs,
    timezoneOptions,
    activeTournament,
    planningMetrics,
    isSinglesFormat,
    unitLabel,
    unitLabelPlural,

    canSwitch,
    createTournament,
    saveFormatBase,
    openTournament,
    closeTournament,
    openFormat,
    switchTab,
    requestShowAddFormat,
    saveConfig,
    savePool,
    saveSchedules,
    saveCourtsConfig,
    updateConfig,
    updateStageRule,
    patchCourtConfigDraft,
    addCourt,
    addCourtAvailabilitySlot,
    removeCourtAvailabilitySlot,
    addPlayerToPool,
    generateTeamsAndGroups,
    resetTeams,
    reassignTeam,
    toggleStageCourt,
  };
}
