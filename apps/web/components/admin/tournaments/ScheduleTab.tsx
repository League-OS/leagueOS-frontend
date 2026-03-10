import { EditModeHeader, Metric, SaveRow } from './shared';
import { collapseBtn, field, grid2, grid4, insightCard, labelCol, subCard } from './styles';
import type { CourtConfig, CourtItem, PlanningMetrics, StageDef } from './types';

type ScheduleTabProps = {
  scheduleEditMode: boolean;
  setScheduleEditMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  scheduleDirty: boolean;
  courtDirty: boolean;
  saveSchedules: () => void;
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
};

export function ScheduleTab({
  scheduleEditMode,
  setScheduleEditMode,
  scheduleDirty,
  courtDirty,
  saveSchedules,
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
}: ScheduleTabProps) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <EditModeHeader enabled={scheduleEditMode} label="Schedule" onToggle={() => setScheduleEditMode((prev) => !prev)} />
      <SaveRow enabled={scheduleEditMode && (scheduleDirty || courtDirty)} onSave={saveSchedules} />

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
              disabled={!scheduleEditMode}
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
              disabled={!scheduleEditMode}
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
                            disabled={!scheduleEditMode}
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

      <SaveRow enabled={scheduleEditMode && (scheduleDirty || courtDirty)} onSave={saveSchedules} />
    </div>
  );
}
