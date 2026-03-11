'use client';

import type { CSSProperties } from 'react';

import { AddCourtModal } from './tournaments/AddCourtModal';
import { AddFormatPanel } from './tournaments/AddFormatPanel';
import { ConfigTab } from './tournaments/ConfigTab';
import { CourtsTab } from './tournaments/CourtsTab';
import { FormatTabs } from './tournaments/FormatTabs';
import { PoolTab } from './tournaments/PoolTab';
import { ScheduleTab } from './tournaments/ScheduleTab';
import { TournamentListView } from './tournaments/TournamentListView';
import { TournamentSidebar } from './tournaments/TournamentSidebar';
import {
  bodyFontStack,
  card,
  displayFontStack,
  heroBlock,
  revealStyle,
  savedBadge,
} from './tournaments/styles';
import { useTournamentWorkspaceState } from './tournaments/useTournamentWorkspaceState';

export function TournamentsWorkspace({ embedded = false }: { embedded?: boolean }) {
  const state = useTournamentWorkspaceState();

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

  return (
    <main style={outerStyle}>
      <div style={innerStyle}>
        <div style={{ ...heroBlock, ...revealStyle(state.mounted, 0) }}>
          <h1 style={{ margin: 0, color: '#182521', fontFamily: displayFontStack, fontSize: 34, letterSpacing: '-0.02em' }}>
            Tournament Configuration Workspace
          </h1>
          <p style={{ margin: '4px 0 0', color: '#52605b', fontSize: 14 }}>
            Manage tournament setup, formats, pools, schedules, and courts.
          </p>
          {state.saveNotice ? (
            <div style={{ marginTop: 8 }}>
              <span style={savedBadge}>{state.saveNotice}</span>
            </div>
          ) : null}
        </div>

        {!state.activeTournamentId ? (
          <TournamentListView
            showCreateTournament={state.showCreateTournament}
            setShowCreateTournament={state.setShowCreateTournament}
            tournamentName={state.tournamentName}
            setTournamentName={state.setTournamentName}
            tournamentTimezone={state.tournamentTimezone}
            setTournamentTimezone={state.setTournamentTimezone}
            tournamentSeasonId={state.tournamentSeasonId}
            setTournamentSeasonId={state.setTournamentSeasonId}
            tournamentAdminNotes={state.tournamentAdminNotes}
            setTournamentAdminNotes={state.setTournamentAdminNotes}
            timezoneOptions={state.timezoneOptions}
            clubSeasons={state.clubSeasons}
            seasonLoading={state.seasonLoading}
            seasonSource={state.seasonSource}
            seasonLoadError={state.seasonLoadError}
            tournamentFormError={state.tournamentFormError}
            setTournamentFormError={state.setTournamentFormError}
            createTournament={state.createTournament}
            tournaments={state.tournaments}
            openTournament={state.openTournament}
          />
        ) : (
          <section style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 10, alignItems: 'start' }}>
            <div style={revealStyle(state.mounted, 90)}>
              <TournamentSidebar
                activeTournament={state.activeTournament}
                tournamentTimezone={state.tournamentTimezone}
                formats={state.formats}
                activeFormatId={state.activeFormatId}
                requestShowAddFormat={state.requestShowAddFormat}
                openFormatConfig={(formatId) => state.openFormat(formatId, 'config')}
                closeTournament={state.closeTournament}
              />
            </div>

            <section style={{ ...card, ...revealStyle(state.mounted, 170) }}>
              {state.showAddFormat ? (
                <AddFormatPanel
                  formDraft={state.formDraft}
                  setFormDraft={state.setFormDraft}
                  formatFormError={state.formatFormError}
                  setFormatFormError={state.setFormatFormError}
                  setShowAddFormat={state.setShowAddFormat}
                  saveFormatBase={state.saveFormatBase}
                />
              ) : !state.activeFormat || !state.configDraft || !state.poolDraft ? (
                <p style={{ color: '#64748b' }}>Select a format to start configuring.</p>
              ) : (
                <>
                  <h1 style={{ margin: 0, fontFamily: displayFontStack, fontSize: 30, letterSpacing: '-0.018em', color: '#162722' }}>
                    {state.activeFormat.name}
                  </h1>
                  <p style={{ margin: '4px 0 10px', color: '#57665f', fontSize: 13 }}>Format Configuration</p>

                  <FormatTabs activeTab={state.activeTab} switchTab={state.switchTab} />

                  {state.activeTab === 'config' ? (
                    <ConfigTab
                      configDirty={state.configDirty}
                      saveConfig={state.saveConfig}
                      configDraft={state.configDraft}
                      formatNameDraft={state.formatNameDraft}
                      setFormatNameDraft={state.setFormatNameDraft}
                      setConfigDirty={state.setConfigDirty}
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
                      setPoolDraft={(value) => state.setPoolDraft(value)}
                      setPoolDirty={state.setPoolDirty}
                      addPlayerId={state.addPlayerId}
                      setAddPlayerId={state.setAddPlayerId}
                      addPlayerToPool={state.addPlayerToPool}
                      generateTeamsAndGroups={state.generateTeamsAndGroups}
                      resetTeams={state.resetTeams}
                      reassignTeam={state.reassignTeam}
                      isSinglesFormat={state.isSinglesFormat}
                      unitLabel={state.unitLabel}
                      unitLabelPlural={state.unitLabelPlural}
                      clubPlayers={state.clubPlayersForActiveFormat}
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
                      viewBrackets={state.viewBrackets}
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
                    />
                  ) : null}

                  {state.activeTab === 'courts' ? (
                    <CourtsTab
                      courts={state.courts}
                      setShowAddCourtModal={state.setShowAddCourtModal}
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
