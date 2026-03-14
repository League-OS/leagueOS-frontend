'use client';

import { useEffect, type CSSProperties } from 'react';

import { AddCourtModal } from './tournaments/AddCourtModal';
import { AddFormatPanel } from './tournaments/AddFormatPanel';
import { ConfigTab } from './tournaments/ConfigTab';
import { CourtsTab } from './tournaments/CourtsTab';
import { FormatDirectoryPanel } from './tournaments/FormatDirectoryPanel';
import type { TournamentShareLink } from './tournaments/FormatDirectoryPanel';
import { FormatTabs } from './tournaments/FormatTabs';
import { PoolTab } from './tournaments/PoolTab';
import { ScheduleTab } from './tournaments/ScheduleTab';
import { TournamentListView } from './tournaments/TournamentListView';
import {
  bodyFontStack,
  card,
  displayFontStack,
  revealStyle,
  saveEnabledStyle,
  savedBadge,
} from './tournaments/styles';
import { useTournamentWorkspaceState } from './tournaments/useTournamentWorkspaceState';

export function TournamentsWorkspace({ embedded = false }: { embedded?: boolean }) {
  const state = useTournamentWorkspaceState();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const tournamentShareLinks: TournamentShareLink[] = state.activeTournamentId
    ? [
      {
        id: 'signup',
        label: 'Tournament Signup URL',
        url: `${origin}/tournaments/${state.activeTournamentId}?signup=one_click`,
        description: 'Use this during registration and club signup phases.',
        qrFileSuffix: 'signup',
        showQr: true,
      },
      {
        id: 'courtside',
        label: 'Public Courtside URL',
        url: `${origin}/tournaments/${state.activeTournamentId}/courtside`,
        description: 'No auth required. Use this for public courtside display and live sharing.',
        qrFileSuffix: 'courtside',
        showQr: true,
      },
      {
        id: 'venue-display',
        label: 'Tournament Venue Display URL',
        url: `${origin}/tournaments/${state.activeTournamentId}/venue-display`,
        description: 'No auth required. Use this on TVs or venue screens for autoplay display.',
        qrFileSuffix: 'venue-display',
        showQr: false,
      },
      {
        id: 'courtside-operator',
        label: 'Courtside Mobile Operator URL',
        url: `${origin}/tournaments/${state.activeTournamentId}/courtside-operator`,
        description: 'Operator console for on-court scoring. Opens read-only until admin auth exists on the device.',
        qrFileSuffix: 'courtside-operator',
        authRequired: true,
        showQr: false,
      },
    ]
    : [];
  const topSaveByTab = state.activeTab === 'config'
    ? { enabled: state.configDirty, onSave: state.saveConfig }
    : state.activeTab === 'pool'
      ? { enabled: state.poolDirty, onSave: state.savePool }
      : state.activeTab === 'schedules'
        ? { enabled: state.scheduleDirty || state.courtDirty, onSave: state.saveSchedules }
        : { enabled: state.courtDirty, onSave: state.saveCourtsConfig };

  const outerStyle: CSSProperties = embedded
    ? { display: 'grid', gap: 10, fontFamily: bodyFontStack }
    : {
      minHeight: '100vh',
      background:
          'radial-gradient(circle at 10% 12%, #e0efe8 0%, rgba(224, 239, 232, 0) 32%), radial-gradient(circle at 88% 16%, #f5ead3 0%, rgba(245, 234, 211, 0) 28%), linear-gradient(160deg, #f4f6f2 0%, #eef2ef 100%)',
      padding: 14,
      fontFamily: bodyFontStack,
      color: '#15241f',
    };

  const innerStyle: CSSProperties = embedded
    ? { display: 'grid', gap: 10 }
    : { maxWidth: 1360, margin: '0 auto', display: 'grid', gap: 10 };

  useEffect(() => {
    const onSidebarReselect = () => {
      if (!state.activeTournamentId) return;
      state.closeTournament();
    };
    window.addEventListener('leagueos:tournaments:sidebar-reselect', onSidebarReselect);
    return () => {
      window.removeEventListener('leagueos:tournaments:sidebar-reselect', onSidebarReselect);
    };
  }, [state.activeTournamentId, state.closeTournament]);

  return (
    <main style={outerStyle}>
      <div style={innerStyle}>
        {state.saveNotice ? (
          <div style={{ ...revealStyle(state.mounted, 0), display: 'flex', justifyContent: 'flex-end' }}>
            <span style={savedBadge}>{state.saveNotice}</span>
          </div>
        ) : null}

        {!state.activeTournamentId ? (
          <TournamentListView
            showCreateTournament={state.showCreateTournament}
            requestShowCreateTournament={state.requestShowCreateTournament}
            requestEditTournament={state.requestEditTournament}
            cancelTournamentEditor={state.cancelTournamentEditor}
            editingTournamentId={state.editingTournamentId}
            editingTournamentStatus={state.editingTournamentStatus}
            tournamentFieldEditability={state.tournamentFieldEditability}
            tournamentName={state.tournamentName}
            setTournamentName={state.setTournamentName}
            tournamentTimezone={state.tournamentTimezone}
            setTournamentTimezone={state.setTournamentTimezone}
            tournamentStartAt={state.tournamentStartAt}
            setTournamentStartAt={state.setTournamentStartAt}
            tournamentEndAt={state.tournamentEndAt}
            setTournamentEndAt={state.setTournamentEndAt}
            tournamentAdminNotes={state.tournamentAdminNotes}
            setTournamentAdminNotes={state.setTournamentAdminNotes}
            timezoneOptions={state.timezoneOptions}
            tournamentFormError={state.tournamentFormError}
            setTournamentFormError={state.setTournamentFormError}
            saveTournament={state.saveTournament}
            tournaments={state.tournaments}
            openTournament={state.openTournament}
            requestDeleteTournament={state.requestDeleteTournament}
          />
        ) : (
          <section style={{ display: 'grid', gap: 10, alignItems: 'start' }}>
            <div style={revealStyle(state.mounted, 90)}>
              <FormatDirectoryPanel
                activeTournament={state.activeTournament}
                formats={state.formats}
                activeFormatId={state.activeFormatId}
                requestShowAddFormat={state.requestShowAddFormat}
                requestEditFormat={state.requestEditFormat}
                requestDeleteFormat={state.requestDeleteFormat}
                openFormatConfig={(formatId) => state.openFormat(formatId, 'config')}
                lifecycleStatusOptions={state.lifecycleStatusOptions}
                allowedLifecycleStatuses={state.allowedLifecycleStatuses}
                updateTournamentStatus={state.updateTournamentStatus}
                shareLinks={tournamentShareLinks}
                requestEditTournament={state.requestEditTournament}
              />
            </div>

            <section style={{ ...card, ...revealStyle(state.mounted, 170) }}>
              {state.showAddFormat ? (
                <AddFormatPanel
                  mode={state.editingFormatId ? 'edit' : 'create'}
                  formDraft={state.formDraft}
                  setFormDraft={state.setFormDraft}
                  formatFormError={state.formatFormError}
                  setFormatFormError={state.setFormatFormError}
                  lifecycleStatusOptions={state.lifecycleStatusOptions}
                  allowedLifecycleStatuses={state.allowedLifecycleStatuses}
                  onCancel={state.cancelFormatEditor}
                  saveFormatBase={state.saveFormatBase}
                />
              ) : !state.activeFormat || !state.configDraft || !state.poolDraft ? (
                <p style={{ color: '#64748b' }}>Select a format from the list above to configure.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <h1 style={{ margin: 0, fontFamily: displayFontStack, fontSize: 30, letterSpacing: '-0.018em', color: '#162722' }}>
                        {state.activeFormat.name}
                      </h1>
                      <p style={{ margin: '4px 0 10px', color: '#57665f', fontSize: 13 }}>Format Configuration</p>
                    </div>
                    <button
                      style={saveEnabledStyle(topSaveByTab.enabled)}
                      disabled={!topSaveByTab.enabled}
                      onClick={topSaveByTab.onSave}
                    >
                      Save
                    </button>
                  </div>

                  <FormatTabs activeTab={state.activeTab} switchTab={state.switchTab} />

                  {state.activeTab === 'config' ? (
                    <ConfigTab
                      configDirty={state.configDirty}
                      saveConfig={state.saveConfig}
                      configDraft={state.configDraft}
                      updateConfig={state.updateConfig}
                      stageDefs={state.stageDefs}
                      updateStageRule={state.updateStageRule}
                      planningMetrics={state.planningMetrics}
                    />
                  ) : null}

                  {state.activeTab === 'pool' ? (
                    <PoolTab
                      poolDirty={state.poolDirty}
                      savePool={state.savePool}
                      poolDraft={state.poolDraft}
                      schedulingModel={state.configDraft?.schedulingModel ?? ''}
                      removePlayersLocked={state.poolRemovalLocked}
                      groupCount={state.configDraft?.groupCount || state.poolDraft.groupCount}
                      addPlayerId={state.addPlayerId}
                      setAddPlayerId={state.setAddPlayerId}
                      addPlayerToPool={state.addPlayerToPool}
                      removePlayerFromPool={state.removePlayerFromPool}
                      updateGeneratedPairing={state.updateGeneratedPairing}
                      validateGeneratedPairs={state.validateGeneratedPairs}
                      generateGroupsFromPairs={state.generateGroupsFromPairs}
                      generateTeamsAndGroups={state.generateTeamsAndGroups}
                      resetTeams={state.resetTeams}
                      reassignTeam={state.reassignTeam}
                      isSinglesFormat={state.isSinglesFormat}
                      unitLabel={state.unitLabel}
                      unitLabelPlural={state.unitLabelPlural}
                      clubPlayers={state.clubPlayersForActiveFormat}
                      clubSeasons={state.clubSeasons}
                      seasonLoading={state.seasonLoading}
                      seasonSource={state.seasonSource}
                      seasonLoadError={state.seasonLoadError}
                      setPoolSeasonId={state.setPoolSeasonId}
                      poolPlayersOpen={state.poolPlayersOpen}
                      setPoolPlayersOpen={state.setPoolPlayersOpen}
                      poolGroupsOpen={state.poolGroupsOpen}
                      setPoolGroupsOpen={state.setPoolGroupsOpen}
                    />
                  ) : null}

                  {state.activeTab === 'schedules' ? (
                    <ScheduleTab
                      scheduleDirty={state.scheduleDirty}
                      courtDirty={state.courtDirty}
                      saveSchedules={state.saveSchedules}
                      scheduleStatusLabel={state.scheduleStatusLabel}
                      scheduleActionBusy={state.scheduleActionBusy}
                      generateSchedule={state.generateSchedule}
                      publishSchedule={state.publishSchedule}
                      saveMatchStartTimes={state.saveMatchStartTimes}
                      updateMatchStartDraft={state.updateMatchStartDraft}
                      matchStartDrafts={state.matchStartDrafts}
                      matchTimesDirty={state.matchTimesDirty}
                      resetSchedule={state.resetSchedule}
                      courtConfigDraft={state.courtConfigDraft}
                      patchCourtConfigDraft={state.patchCourtConfigDraft}
                      entrants={state.effectiveEntrantCount}
                      planningMetrics={state.planningMetrics}
                      stageCourtAssignmentsOpen={state.stageCourtAssignmentsOpen}
                      setStageCourtAssignmentsOpen={state.setStageCourtAssignmentsOpen}
                      stageDefs={state.stageDefs}
                      courts={state.courts}
                      scheduleDraft={state.scheduleDraft}
                      toggleStageCourt={state.toggleStageCourt}
                      bracketMatchesOpen={state.bracketMatchesOpen}
                      setBracketMatchesOpen={state.setBracketMatchesOpen}
                      bracketMatches={state.bracketMatches}
                      formatRegistrations={state.formatRegistrations}
                      generatedTeams={state.poolDraft.generatedTeams}
                    />
                  ) : null}

                  {state.activeTab === 'courts' ? (
                    <CourtsTab
                      courts={state.courts}
                      setShowAddCourtModal={state.setShowAddCourtModal}
                      renameCourt={state.renameCourt}
                      deleteCourt={state.deleteCourt}
                      activeCourtId={state.activeCourtId}
                      setActiveCourtId={state.setActiveCourtId}
                      courtConfigDraft={state.courtConfigDraft}
                      slotDraft={state.slotDraft}
                      setSlotDraft={state.setSlotDraft}
                      addCourtAvailabilitySlot={state.addCourtAvailabilitySlot}
                      removeCourtAvailabilitySlot={state.removeCourtAvailabilitySlot}
                      courtDirty={state.courtDirty}
                      saveCourtsConfig={state.saveCourtsConfig}
                    />
                  ) : null}
                </>
              )}
            </section>
          </section>
        )}
      </div>

      <AddCourtModal
        show={state.showAddCourtModal}
        courtName={state.courtName}
        setCourtName={state.setCourtName}
        setShowAddCourtModal={state.setShowAddCourtModal}
        addCourt={state.addCourt}
      />
    </main>
  );
}
