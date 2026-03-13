import type { TournamentMatch as ApiTournamentMatch } from '@leagueos/api';

import { Metric, SaveRow } from './shared';
import { collapseBtn, field, grid2, grid4, insightCard, labelCol, outlineBtn, subCard, td, th } from './styles';
import type { CourtConfig, CourtItem, GeneratedTeam, PlanningMetrics, StageDef } from './types';

type ScheduleTabProps = {
  scheduleDirty: boolean;
  courtDirty: boolean;
  saveSchedules: () => void;
  scheduleStatusLabel: string;
  scheduleActionBusy: 'generate' | 'view' | 'reset' | null;
  generateSchedule: () => void;
  viewBrackets: () => void;
  resetSchedule: () => void;
  courtConfigDraft: CourtConfig | null;
  patchCourtConfigDraft: (transform: (current: CourtConfig) => CourtConfig) => void;
  entrants: number;
  planningMetrics: PlanningMetrics;
  stageCourtAssignmentsOpen: boolean;
  setStageCourtAssignmentsOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  stageDefs: StageDef[];
  courts: CourtItem[];
  scheduleDraft: Record<string, string[]>;
  toggleStageCourt: (stageId: string, courtId: string, checked: boolean) => void;
  bracketMatchesOpen: boolean;
  setBracketMatchesOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  bracketMatches: ApiTournamentMatch[];
  formatRegistrations: Array<{ id: number; player_id: number; player_name: string; status: string }>;
  generatedTeams: GeneratedTeam[];
};

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatRoundLabel(match: ApiTournamentMatch): string {
  if (match.group_code) return `Group(${match.group_code})`;
  return match.round_label || '-';
}

function renderTeamSlot(
  match: ApiTournamentMatch,
  side: 'home' | 'away',
  matchNumberById: Map<number, number>,
  registrationById: Map<number, { player_id: number; player_name: string }>,
  generatedTeams: GeneratedTeam[],
): JSX.Element | string {
  const registrationId = side === 'home' ? match.home_registration_id : match.away_registration_id;
  const source = side === 'home' ? match.home_slot_source : match.away_slot_source;
  const groupCode = side === 'home' ? match.home_slot_group_code : match.away_slot_group_code;
  const groupRank = side === 'home' ? match.home_slot_group_rank : match.away_slot_group_rank;
  const dependencyId = side === 'home' ? match.dependency_match_a_id : match.dependency_match_b_id;

  if (source === 'GROUP_RANK' && groupCode && groupRank) {
    const suffix = registrationId ? ` -> R${registrationId}` : '';
    return `${groupCode}${groupRank}${suffix}`;
  }
  if (source === 'MATCH_WINNER' && dependencyId) {
    const depMatchNo = matchNumberById.get(dependencyId);
    const depLabel = depMatchNo ? `M${depMatchNo}` : `#${dependencyId}`;
    const suffix = registrationId ? ` -> R${registrationId}` : '';
    return `W(${depLabel})${suffix}`;
  }

  if (registrationId) {
    const registration = registrationById.get(registrationId);
    const playerId = registration?.player_id;
    const team = playerId
      ? generatedTeams.find((row) => row.playerIds.includes(String(playerId)))
      : null;
    if (team?.name) {
      const members = team.name.split('/').map((part) => part.trim()).filter(Boolean);
      if (members.length >= 2) {
        return (
          <span style={{ display: 'inline-grid', lineHeight: 1.25 }}>
            <span>{members[0]}</span>
            <span>/ {members.slice(1).join(' / ')}</span>
          </span>
        );
      }
      return team.name;
    }
    if (registration?.player_name) return registration.player_name;
    return `R${registrationId}`;
  }
  return '-';
}

export function ScheduleTab({
  scheduleDirty,
  courtDirty,
  saveSchedules,
  scheduleStatusLabel,
  scheduleActionBusy,
  generateSchedule,
  viewBrackets,
  resetSchedule,
  courtConfigDraft,
  patchCourtConfigDraft,
  entrants,
  planningMetrics,
  stageCourtAssignmentsOpen,
  setStageCourtAssignmentsOpen,
  stageDefs,
  courts,
  scheduleDraft,
  toggleStageCourt,
  bracketMatchesOpen,
  setBracketMatchesOpen,
  bracketMatches,
  formatRegistrations,
  generatedTeams,
}: ScheduleTabProps) {
  const busy = scheduleActionBusy !== null;
  const matchNumberById = new Map(bracketMatches.map((row) => [row.id, row.match_number]));
  const registrationById = new Map(
    formatRegistrations
      .filter((row) => Number.isInteger(row.id))
      .map((row) => [row.id, { player_id: row.player_id, player_name: row.player_name }]),
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <section style={subCard}>
        <strong>Schedule Status</strong>
        <div style={{ ...grid2, marginTop: 10 }}>
          <label style={labelCol}>
            Current Status
            <input value={scheduleStatusLabel} readOnly style={{ ...field, background: '#f7faf8' }} />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignSelf: 'end' }}>
            <button style={outlineBtn} onClick={generateSchedule} disabled={busy}>
              {scheduleActionBusy === 'generate' ? 'Generating...' : 'Generate Schedule'}
            </button>
            <button style={outlineBtn} onClick={viewBrackets} disabled={busy}>
              {scheduleActionBusy === 'view' ? 'Loading...' : 'View Brackets'}
            </button>
            <button style={outlineBtn} onClick={resetSchedule} disabled={busy}>
              {scheduleActionBusy === 'reset' ? 'Resetting...' : 'Reset Schedule'}
            </button>
          </div>
        </div>
      </section>

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
              onChange={(event) => {
                patchCourtConfigDraft((prev) => ({ ...prev, globalWindowStart: event.target.value }));
              }}
              style={field}
            />
          </label>
          <label style={labelCol}>
            Global End
            <input
              type="datetime-local"
              value={courtConfigDraft?.globalWindowEnd || ''}
              onChange={(event) => {
                patchCourtConfigDraft((prev) => ({ ...prev, globalWindowEnd: event.target.value }));
              }}
              style={field}
            />
          </label>
        </div>
      </section>

      <section style={insightCard}>
        <strong>Format Insights</strong>
        <div style={{ ...grid4, marginTop: 8 }}>
          <Metric label="Entrants" value={String(entrants)} />
          <Metric label="Estimated Matches" value={String(planningMetrics.matches)} />
          <Metric label="Estimated Sets" value={String(planningMetrics.sets)} />
          <Metric label="Estimated Duration (hh:mm)" value={planningMetrics.duration} />
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
          !stageDefs.length ? (
            <p style={{ color: '#64748b' }}>Select scheduling model first.</p>
          ) : !courts.length ? (
            <p style={{ color: '#64748b' }}>Add tournament courts first.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {stageDefs.map((stage) => (
                <article key={stage.id} style={subCard}>
                  <strong>{stage.label}</strong>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                    {courts.map((court) => {
                      const checked = (scheduleDraft[stage.id] || []).includes(court.id);
                      return (
                        <label key={court.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              toggleStageCourt(stage.id, court.id, event.target.checked);
                            }}
                          />
                          {court.name}
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

      <section style={subCard}>
        <button
          type="button"
          style={collapseBtn}
          onClick={() => setBracketMatchesOpen((value) => !value)}
        >
          <strong>Bracket Matches</strong>
          <span>{bracketMatchesOpen ? 'Collapse' : 'Expand'}</span>
        </button>

        {bracketMatchesOpen ? (
          bracketMatches.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
              <thead>
                <tr>
                  {['#', 'Round', 'Team A', 'Team B', 'Status', 'Court', 'Start', 'End'].map((header) => (
                    <th key={header} style={th}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bracketMatches.map((match) => (
                  <tr key={match.id}>
                    <td style={td}>{match.match_number}</td>
                    <td style={td}>{formatRoundLabel(match)}</td>
                    <td style={td}>{renderTeamSlot(match, 'home', matchNumberById, registrationById, generatedTeams)}</td>
                    <td style={td}>{renderTeamSlot(match, 'away', matchNumberById, registrationById, generatedTeams)}</td>
                    <td style={td}>{match.status}</td>
                    <td style={td}>{match.court_name || '-'}</td>
                    <td style={td}>{formatDateTime(match.start_at)}</td>
                    <td style={td}>{formatDateTime(match.end_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: '#64748b', marginTop: 8 }}>No generated matches yet. Generate schedule first.</p>
          )
        ) : null}
      </section>

      <SaveRow enabled={scheduleDirty || courtDirty} onSave={saveSchedules} />
    </div>
  );
}
