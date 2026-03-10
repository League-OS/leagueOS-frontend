import { mockPlayers } from './config';
import { EditModeHeader, SaveRow } from './shared';
import { field, grid2, labelCol, outlineBtn, pill, subCard, td, th } from './styles';
import type { PoolConfig } from './types';

type PoolTabProps = {
  poolEditMode: boolean;
  setPoolEditMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  poolDirty: boolean;
  savePool: () => void;
  poolDraft: PoolConfig;
  setPoolDraft: (value: PoolConfig) => void;
  setPoolDirty: (value: boolean) => void;
  addPlayerId: string;
  setAddPlayerId: (value: string) => void;
  addPlayerToPool: () => void;
  generateTeamsAndGroups: () => void;
  resetTeams: () => void;
  reassignTeam: (teamId: string, toGroupId: string) => void;
  isSinglesFormat: boolean;
  unitLabel: string;
  unitLabelPlural: string;
};

export function PoolTab({
  poolEditMode,
  setPoolEditMode,
  poolDirty,
  savePool,
  poolDraft,
  setPoolDraft,
  setPoolDirty,
  addPlayerId,
  setAddPlayerId,
  addPlayerToPool,
  generateTeamsAndGroups,
  resetTeams,
  reassignTeam,
  isSinglesFormat,
  unitLabel,
  unitLabelPlural,
}: PoolTabProps) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <EditModeHeader enabled={poolEditMode} label="Pool" onToggle={() => setPoolEditMode((prev) => !prev)} />
      <SaveRow enabled={poolEditMode && poolDirty} onSave={savePool} />

      <section style={subCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Pool Players ({poolDraft.poolPlayers.length})</strong>
          <span style={pill}>Internal</span>
        </div>
        <div style={{ ...grid2, marginTop: 8 }}>
          <select
            value={addPlayerId}
            onChange={(event) => setAddPlayerId(event.target.value)}
            style={field}
            disabled={!poolEditMode || poolDraft.teamsGenerated}
          >
            <option value="">Select club player</option>
            {mockPlayers
              .filter((player) => !poolDraft.poolPlayers.some((poolPlayer) => poolPlayer.playerId === player.id))
              .map((player) => (
                <option key={player.id} value={player.id}>{player.name} ({player.elo})</option>
              ))}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            {!poolDraft.teamsGenerated ? (
              <button style={outlineBtn} onClick={addPlayerToPool} disabled={!poolEditMode}>Add Player</button>
            ) : (
              <button style={outlineBtn} onClick={resetTeams} disabled={!poolEditMode}>Reset {unitLabelPlural}</button>
            )}
            {!poolDraft.teamsGenerated ? (
              <button style={outlineBtn} onClick={generateTeamsAndGroups} disabled={!poolEditMode}>
                {isSinglesFormat ? 'Generate Groups' : 'Generate Pairs'}
              </button>
            ) : null}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead>
            <tr>
              {['#', 'Name', 'Email', 'Phone', 'Reg Date', 'Reg Route', 'ELO'].map((header) => (
                <th key={header} style={th}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {poolDraft.poolPlayers.length ? (
              poolDraft.poolPlayers.map((poolPlayer, index) => {
                const player = mockPlayers.find((candidate) => candidate.id === poolPlayer.playerId);
                if (!player) return null;
                return (
                  <tr key={poolPlayer.playerId}>
                    <td style={td}>{index + 1}</td>
                    <td style={td}>{player.name}</td>
                    <td style={td}>{player.email}</td>
                    <td style={td}>{player.phone}</td>
                    <td style={td}>{poolPlayer.registeredAt}</td>
                    <td style={td}>{poolPlayer.regRoute || 'ADMIN'}</td>
                    <td style={td}>{player.elo}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td style={td} colSpan={7}>No players added to pool yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={subCard}>
        <div style={grid2}>
          <label style={labelCol}>
            Number of Groups
            <input
              type="number"
              min={1}
              value={poolDraft.groupCount}
              onChange={(event) => {
                const nextGroupCount = Math.max(1, Number(event.target.value) || 1);
                setPoolDraft({ ...poolDraft, groupCount: nextGroupCount });
                setPoolDirty(true);
              }}
              style={field}
              disabled={!poolEditMode}
            />
          </label>
          <label style={labelCol}>
            {unitLabelPlural} Per Group (Derived)
            <input
              value={poolDraft.generatedTeams.length ? String(Math.ceil(poolDraft.generatedTeams.length / poolDraft.groupCount)) : '-'}
              disabled
              style={field}
            />
          </label>
        </div>
      </section>

      <section style={subCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Group List</strong>
          <span style={pill}>Editable</span>
        </div>
        {!poolDraft.teamsGenerated ? (
          <p style={{ color: '#64748b' }}>
            {isSinglesFormat
              ? (poolDraft.poolPlayers.length ? 'Generate groups first.' : 'Add players first.')
              : (poolDraft.poolPlayers.length ? 'Generate pairs first.' : 'Add players first.')}
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
            {poolDraft.groups.map((group) => {
              const teamIds = poolDraft.assignments[group.id] || [];
              return (
                <article key={group.id} style={subCard}>
                  <strong>{group.name} ({teamIds.length})</strong>
                  <div
                    style={{
                      marginTop: 8,
                      minHeight: 44,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      border: '1px dashed #bfd3d9',
                      borderRadius: 10,
                      padding: 8,
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!poolEditMode) return;
                      const teamId = event.dataTransfer.getData('text/plain');
                      if (teamId) reassignTeam(teamId, group.id);
                    }}
                  >
                    {teamIds.map((teamId) => {
                      const team = poolDraft.generatedTeams.find((item) => item.id === teamId);
                      if (!team) return null;
                      return (
                        <span
                          key={teamId}
                          draggable={poolEditMode}
                          onDragStart={(event) => {
                            if (!poolEditMode) return;
                            event.dataTransfer.setData('text/plain', teamId);
                          }}
                          style={{
                            border: '1px solid #d5dbe3',
                            borderRadius: 999,
                            padding: '6px 10px',
                            cursor: poolEditMode ? 'grab' : 'default',
                            background: '#fff',
                          }}
                        >
                          {team.name} · ELO {team.elo}
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

      <SaveRow enabled={poolEditMode && poolDirty} onSave={savePool} />
    </div>
  );
}
