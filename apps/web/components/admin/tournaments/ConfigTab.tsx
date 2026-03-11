import { defaultStageRule, isKoStage } from './config';
import { Metric, SaveRow } from './shared';
import { editFieldset, field, grid4, insightCard, labelCol, subCard } from './styles';
import type { FormatConfig, PlanningMetrics, SchedulingModel, StageDef, StageRule, WinCondition } from './types';

type ConfigTabProps = {
  configDirty: boolean;
  saveConfig: () => void;
  configDraft: FormatConfig;
  updateConfig: (next: Partial<FormatConfig>) => void;
  stageDefs: StageDef[];
  updateStageRule: (stageId: string, patch: Partial<StageRule>) => void;
  planningMetrics: PlanningMetrics;
};

function schedulingModelDescription(model: SchedulingModel): string {
  if (model === 'RR') {
    return 'Round Robin where each entrant plays all others. You can optionally add a knockout phase after RR.';
  }
  if (model === 'GROUPS_KO') {
    return 'Entrants are split into groups first, then top performers from each group advance into knockout rounds.';
  }
  if (model === 'MATCH_COUNT_KO') {
    return 'Each entrant gets a controlled number of matches first, then selected entrants progress into knockout rounds.';
  }
  if (model === 'DIRECT_KNOCKOUT') {
    return 'Direct elimination bracket from the start. Losing a match eliminates the entrant.';
  }
  return 'Select a scheduling model to define stage flow and stage-specific match rules.';
}

export function ConfigTab({
  configDirty,
  saveConfig,
  configDraft,
  updateConfig,
  stageDefs,
  updateStageRule,
  planningMetrics,
}: ConfigTabProps) {
  const compactGrid2 = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 320px))',
    gap: 10,
    justifyContent: 'start',
  } as const;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {!!configDraft.schedulingModel ? (
        <section style={insightCard}>
          <strong>Format Insights</strong>
          <div style={{ ...grid4, marginTop: 8 }}>
            <Metric label="Entrants" value={String(configDraft.maxTeamsAllowed)} />
            <Metric label="Estimated Matches" value={String(planningMetrics.matches)} />
            <Metric label="Estimated Sets" value={String(planningMetrics.sets)} />
            <Metric label="Estimated Duration (hh:mm)" value={planningMetrics.duration} />
          </div>
          {planningMetrics.warnings.length ? (
            <p style={{ marginBottom: 0, color: '#b45309' }}>{planningMetrics.warnings.join(' · ')}</p>
          ) : null}
        </section>
      ) : null}

      <fieldset style={editFieldset}>
        <section style={subCard}>
          <strong>Scheduling Model</strong>
          <div style={{ maxWidth: 360, marginTop: 8 }}>
            <select
              value={configDraft.schedulingModel}
              onChange={(event) => {
                updateConfig({ schedulingModel: event.target.value as SchedulingModel });
              }}
              style={field}
            >
              <option value="">Select model</option>
              <option value="RR">RR</option>
              <option value="GROUPS_KO">GROUPS_KO</option>
              <option value="MATCH_COUNT_KO">MATCH_COUNT_KO</option>
              <option value="DIRECT_KNOCKOUT">DIRECT_KNOCKOUT</option>
            </select>
          </div>
          <p style={{ margin: '8px 0 0', color: '#52605b', maxWidth: 760 }}>
            {schedulingModelDescription(configDraft.schedulingModel)}
          </p>
        </section>

        <section style={subCard}>
          <div style={compactGrid2}>
            <label style={labelCol}>
              Max Number of Teams Allowed
              <input
                type="number"
                min={1}
                value={configDraft.maxTeamsAllowed}
                onChange={(event) => {
                  updateConfig({ maxTeamsAllowed: Number(event.target.value) || 1 });
                }}
                style={field}
              />
            </label>
            <label style={labelCol}>
              Average Set Duration (min)
              <input
                type="number"
                min={1}
                value={configDraft.setDurationMinutes}
                onChange={(event) => {
                  updateConfig({ setDurationMinutes: Number(event.target.value) || 1 });
                }}
                style={field}
              />
            </label>
          </div>
        </section>

        {configDraft.schedulingModel === 'RR' ? (
          <section style={subCard}>
            <div style={compactGrid2}>
              <label style={labelCol}>
                RR Type
                <select
                  value={configDraft.rrType}
                  onChange={(event) => {
                    updateConfig({ rrType: event.target.value as 'single' | 'double' });
                  }}
                  style={field}
                >
                  <option value="single">Single</option>
                  <option value="double">Double</option>
                </select>
              </label>
              <label style={labelCol}>
                Include KO
                <select
                  value={configDraft.rrIncludeKo}
                  onChange={(event) => {
                    updateConfig({ rrIncludeKo: event.target.value as 'yes' | 'no' });
                  }}
                  style={field}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
            </div>
            {configDraft.rrIncludeKo === 'yes' ? (
              <div style={{ marginTop: 8, maxWidth: 320 }}>
                <label style={labelCol}>
                  Teams Advancing to KO
                  <input
                    type="number"
                    min={2}
                    value={configDraft.rrTeamsToKo}
                    onChange={(event) => {
                      updateConfig({ rrTeamsToKo: Number(event.target.value) || 2 });
                    }}
                    style={field}
                  />
                </label>
              </div>
            ) : null}
          </section>
        ) : null}

        {configDraft.schedulingModel === 'GROUPS_KO' ? (
          <section style={subCard}>
            <div style={compactGrid2}>
              <label style={labelCol}>
                Group Count
                <input
                  type="number"
                  min={2}
                  value={configDraft.groupCount}
                  onChange={(event) => {
                    updateConfig({ groupCount: Number(event.target.value) || 2 });
                  }}
                  style={field}
                />
              </label>
              <label style={labelCol}>
                Teams Advancing to KO per Group
                <input
                  type="number"
                  min={1}
                  value={configDraft.groupKoTeamsPerGroup}
                  onChange={(event) => {
                    updateConfig({ groupKoTeamsPerGroup: Number(event.target.value) || 1 });
                  }}
                  style={field}
                />
              </label>
            </div>
          </section>
        ) : null}

        {configDraft.schedulingModel === 'MATCH_COUNT_KO' ? (
          <section style={subCard}>
            <div style={compactGrid2}>
              <label style={labelCol}>
                Matches Per Entrant
                <input
                  type="number"
                  min={1}
                  value={configDraft.matchCountPerEntrant}
                  onChange={(event) => {
                    updateConfig({ matchCountPerEntrant: Number(event.target.value) || 1 });
                  }}
                  style={field}
                />
              </label>
              <label style={labelCol}>
                Teams Advancing to KO
                <input
                  type="number"
                  min={2}
                  value={configDraft.matchCountKoTeamsToKo}
                  onChange={(event) => {
                    updateConfig({ matchCountKoTeamsToKo: Number(event.target.value) || 2 });
                  }}
                  style={field}
                />
              </label>
            </div>
          </section>
        ) : null}

        {stageDefs.length ? (
          <section style={subCard}>
            <strong>Format Stage Rules</strong>
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              {stageDefs.map((stage, index) => {
                const rule = configDraft.stageRules[stage.id] || defaultStageRule();
                const isKo = isKoStage(stage.id);

                return (
                  <article key={stage.id} style={subCard}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Stage {index + 1}: {stage.label}</div>
                    <div style={grid4}>
                      <label style={labelCol}>
                        Sets to Win Match
                        <select
                          value={String(rule.setsToWin)}
                          onChange={(event) => {
                            updateStageRule(stage.id, { setsToWin: Number(event.target.value) as 1 | 2 | 3 });
                          }}
                          style={field}
                        >
                          <option value="1">1 set</option>
                          <option value="2">2 sets (Best of 3)</option>
                          <option value="3">3 sets (Best of 5)</option>
                        </select>
                      </label>
                      <label style={labelCol}>
                        Set Win Condition
                        <select
                          value={rule.winCondition}
                          onChange={(event) => {
                            updateStageRule(stage.id, { winCondition: event.target.value as WinCondition });
                          }}
                          style={field}
                        >
                          <option value="FIRST_TO_POINTS">First to Points</option>
                          <option value="WIN_BY_2">Points to Win By 2</option>
                        </select>
                      </label>
                      <label style={labelCol}>
                        Points to Win Set
                        <input
                          type="number"
                          min={1}
                          value={rule.pointsToWinSet}
                          onChange={(event) => {
                            updateStageRule(stage.id, { pointsToWinSet: Number(event.target.value) || 1 });
                          }}
                          style={field}
                        />
                      </label>
                      {rule.winCondition === 'WIN_BY_2' ? (
                        <label style={labelCol}>
                          Max Points Per Set
                          <input
                            type="number"
                            min={1}
                            value={rule.maxPointsPerSet ?? 30}
                            onChange={(event) => {
                              updateStageRule(stage.id, { maxPointsPerSet: Number(event.target.value) || 30 });
                            }}
                            style={field}
                          />
                        </label>
                      ) : null}
                    </div>

                    {!isKo ? (
                      <div style={{ ...grid4, marginTop: 8 }}>
                        <label style={labelCol}>
                          Win Points
                          <input
                            type="number"
                            value={rule.winPoints}
                            onChange={(event) => {
                              updateStageRule(stage.id, { winPoints: Number(event.target.value) || 0 });
                            }}
                            style={field}
                          />
                        </label>
                        <label style={labelCol}>
                          Loss Points
                          <input
                            type="number"
                            value={rule.lossPoints}
                            onChange={(event) => {
                              updateStageRule(stage.id, { lossPoints: Number(event.target.value) || 0 });
                            }}
                            style={field}
                          />
                        </label>
                        <label style={labelCol}>
                          Forfeit Points
                          <input
                            type="number"
                            value={rule.forfeitPoints}
                            onChange={(event) => {
                              updateStageRule(stage.id, { forfeitPoints: Number(event.target.value) || 0 });
                            }}
                            style={field}
                          />
                        </label>
                        <label style={labelCol}>
                          Draw Points
                          <input
                            type="number"
                            value={rule.drawPoints}
                            onChange={(event) => {
                              updateStageRule(stage.id, { drawPoints: Number(event.target.value) || 0 });
                            }}
                            style={field}
                          />
                        </label>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

      </fieldset>

      <SaveRow enabled={configDirty} onSave={saveConfig} />
    </div>
  );
}
