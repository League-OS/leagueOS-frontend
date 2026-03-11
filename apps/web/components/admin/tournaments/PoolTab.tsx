import { useState } from 'react';
import type { Season } from '@leagueos/schemas';

import { SaveRow } from './shared';
import { collapseBtn, field, grid2, labelCol, outlineBtn, pill, subCard, td, th } from './styles';
import type { ClubPlayer, PoolConfig } from './types';

type PoolTabProps = {
  poolDirty: boolean;
  savePool: () => void;
  poolDraft: PoolConfig;
  groupCount: number;
  addPlayerId: string;
  setAddPlayerId: (value: string) => void;
  addPlayerToPool: () => void;
  removePlayerFromPool: (playerId: string) => void;
  updateGeneratedPairing: (teamId: string, playerIndex: 0 | 1, playerId: string) => void;
  validateGeneratedPairs: () => void;
  generateGroupsFromPairs: () => void;
  generateTeamsAndGroups: () => void;
  resetTeams: () => void;
  reassignTeam: (teamId: string, toGroupId: string) => void;
  isSinglesFormat: boolean;
  unitLabel: string;
  unitLabelPlural: string;
  clubPlayers: ClubPlayer[];
  clubSeasons: Season[];
  seasonLoading: boolean;
  seasonSource: 'api' | 'fallback';
  seasonLoadError: string;
  setPoolSeasonId: (seasonId: string) => void;
  poolPlayersOpen: boolean;
  setPoolPlayersOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  poolGroupsOpen: boolean;
  setPoolGroupsOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
};

export function PoolTab({
  poolDirty,
  savePool,
  poolDraft,
  groupCount,
  addPlayerId,
  setAddPlayerId,
  addPlayerToPool,
  removePlayerFromPool,
  updateGeneratedPairing,
  validateGeneratedPairs,
  generateGroupsFromPairs,
  generateTeamsAndGroups,
  resetTeams,
  reassignTeam,
  isSinglesFormat,
  unitLabel,
  unitLabelPlural,
  clubPlayers,
  clubSeasons,
  seasonLoading,
  seasonSource,
  seasonLoadError,
  setPoolSeasonId,
  poolPlayersOpen,
  setPoolPlayersOpen,
  poolGroupsOpen,
  setPoolGroupsOpen,
}: PoolTabProps) {
  const poolLocked = poolDraft.generatedTeams.length > 0 || poolDraft.teamsGenerated;
  const hasPendingPairs = !isSinglesFormat && poolDraft.generatedTeams.length > 0 && !poolDraft.teamsGenerated;
  const canGenerateGroups = poolDraft.pairsValidated;
  const [showGenerateGroupsTooltip, setShowGenerateGroupsTooltip] = useState(false);
  const playersById = new Map(clubPlayers.map((player) => [player.id, player]));
  const poolPlayersById = new Map(poolDraft.poolPlayers.map((entry) => [entry.playerId, entry]));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <section style={subCard}>
        <div style={{ ...grid2, alignItems: 'end' }}>
          <label style={labelCol}>
            ELO Source Season
            <select
              value={poolDraft.seasonId}
              onChange={(event) => setPoolSeasonId(event.target.value)}
              style={field}
              disabled={seasonLoading || !clubSeasons.length}
            >
              {!clubSeasons.length ? (
                <option value="">{seasonLoading ? 'Loading seasons...' : 'No club seasons available'}</option>
              ) : null}
              {clubSeasons.map((season) => (
                <option key={season.id} value={String(season.id)}>{season.name}</option>
              ))}
            </select>
            {!seasonLoading ? (
              <span style={{ color: '#64748b' }}>
                {seasonSource === 'api'
                  ? 'ELO snapshots are taken from this season at player add/signup time.'
                  : 'Using fallback seasons. ELO snapshots are still one-time at player add/signup.'}
              </span>
            ) : null}
            {seasonLoadError ? <span style={{ color: '#b91c1c' }}>{seasonLoadError}</span> : null}
            {poolDraft.poolPlayers.length ? (
              <span style={{ color: '#64748b' }}>
                Changing season affects only players added after this change.
              </span>
            ) : null}
          </label>
        </div>
      </section>

      <section style={subCard}>
        <button type="button" style={collapseBtn} onClick={() => setPoolPlayersOpen((value) => !value)}>
          <strong>Pool Players ({poolDraft.poolPlayers.length})</strong>
          <span>{poolPlayersOpen ? 'Collapse' : 'Expand'}</span>
        </button>

        {poolPlayersOpen ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <span style={pill}>Internal</span>
            </div>

            <div style={{ ...grid2, marginTop: 8 }}>
              <select
                value={addPlayerId}
                onChange={(event) => setAddPlayerId(event.target.value)}
                style={field}
                disabled={poolLocked}
              >
                <option value="">Select club player</option>
                {clubPlayers
                  .filter((player) => !poolDraft.poolPlayers.some((poolPlayer) => poolPlayer.playerId === player.id))
                  .map((player) => (
                    <option key={player.id} value={player.id}>{player.name} ({player.elo})</option>
                  ))}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                {!poolLocked ? (
                  <button style={outlineBtn} onClick={addPlayerToPool}>Add Player</button>
                ) : (
                  <button style={outlineBtn} onClick={resetTeams}>Reset {unitLabelPlural}</button>
                )}
                {!poolLocked ? (
                  <button style={outlineBtn} onClick={generateTeamsAndGroups}>
                    {isSinglesFormat ? 'Generate Groups' : 'Generate Pairs'}
                  </button>
                ) : null}
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
              <thead>
                <tr>
                  {['#', 'Name', 'Email', 'Phone', 'Reg Date', 'Reg Route', 'ELO', 'Action'].map((header) => (
                    <th key={header} style={th}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {poolDraft.poolPlayers.length ? (
                  poolDraft.poolPlayers.map((poolPlayer, index) => {
                    const player = clubPlayers.find((candidate) => candidate.id === poolPlayer.playerId);
                    if (!player) return null;
                    return (
                      <tr key={poolPlayer.playerId}>
                        <td style={td}>{index + 1}</td>
                        <td style={td}>{player.name}</td>
                        <td style={td}>{player.email}</td>
                        <td style={td}>{player.phone}</td>
                        <td style={td}>{poolPlayer.registeredAt}</td>
                        <td style={td}>{poolPlayer.regRoute || 'ADMIN'}</td>
                        <td style={td}>{poolPlayer.seededElo ?? player.elo}</td>
                        <td style={td}>
                          <button
                            style={outlineBtn}
                            disabled={poolLocked}
                            onClick={() => removePlayerFromPool(poolPlayer.playerId)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td style={td} colSpan={8}>No players added to pool yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        ) : null}
      </section>

      {hasPendingPairs ? (
        <section style={subCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <strong>Generated Pairs</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={outlineBtn} onClick={validateGeneratedPairs}>Validate Pairs</button>
              <span
                style={{ position: 'relative', display: 'inline-block' }}
                onMouseEnter={() => {
                  if (!canGenerateGroups) setShowGenerateGroupsTooltip(true);
                }}
                onMouseLeave={() => setShowGenerateGroupsTooltip(false)}
              >
                <button
                  style={canGenerateGroups ? outlineBtn : { ...outlineBtn, background: '#eef2ef', color: '#8b948f', cursor: 'not-allowed' }}
                  disabled={!canGenerateGroups}
                  onClick={generateGroupsFromPairs}
                >
                  Generate Groups
                </button>
                {!canGenerateGroups && showGenerateGroupsTooltip ? (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 8px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      whiteSpace: 'nowrap',
                      background: '#1f2937',
                      color: '#fff',
                      borderRadius: 6,
                      padding: '4px 8px',
                      fontSize: 11,
                      zIndex: 20,
                      boxShadow: '0 6px 12px rgba(15, 23, 42, 0.2)',
                    }}
                  >
                    validate pairs first
                  </span>
                ) : null}
              </span>
            </div>
          </div>
          {poolDraft.pairValidationMessage ? (
            <p style={{ margin: '8px 0 0', color: poolDraft.pairsValidated ? '#047857' : '#b45309' }}>
              {poolDraft.pairValidationMessage}
            </p>
          ) : null}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
            <thead>
              <tr>
                {['#', 'Player 1 (ELO)', 'Player 2 (ELO)', 'Team ELO'].map((header) => (
                  <th key={header} style={th}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {poolDraft.generatedTeams.map((team, index) => {
                const player1Id = team.playerIds[0] || '';
                const player2Id = team.playerIds[1] || '';
                const player1 = playersById.get(player1Id);
                const player2 = playersById.get(player2Id);
                const player1Elo = poolPlayersById.get(player1Id)?.seededElo ?? player1?.elo ?? 0;
                const player2Elo = poolPlayersById.get(player2Id)?.seededElo ?? player2?.elo ?? 0;
                return (
                  <tr key={team.id}>
                    <td style={td}>{index + 1}</td>
                    <td style={td}>
                      <select
                        value={player1Id}
                        onChange={(event) => updateGeneratedPairing(team.id, 0, event.target.value)}
                        style={field}
                      >
                        <option value="">Select player</option>
                        {poolDraft.poolPlayers.map((poolPlayer) => {
                          const player = playersById.get(poolPlayer.playerId);
                          if (!player) return null;
                          return (
                            <option key={player.id} value={player.id}>
                              {player.name} ({poolPlayer.seededElo ?? player.elo})
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td style={td}>
                      <select
                        value={player2Id}
                        onChange={(event) => updateGeneratedPairing(team.id, 1, event.target.value)}
                        style={field}
                      >
                        <option value="">Select player</option>
                        {poolDraft.poolPlayers.map((poolPlayer) => {
                          const player = playersById.get(poolPlayer.playerId);
                          if (!player) return null;
                          return (
                            <option key={player.id} value={player.id}>
                              {player.name} ({poolPlayer.seededElo ?? player.elo})
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td style={td}>
                      {Math.round(((player1Elo + player2Elo) / 2) || 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      <section style={subCard}>
        <button type="button" style={collapseBtn} onClick={() => setPoolGroupsOpen((value) => !value)}>
          <strong>Group List</strong>
          <span>{poolGroupsOpen ? 'Collapse' : 'Expand'}</span>
        </button>

        {poolGroupsOpen ? (
          <>
            <div style={{ ...grid2, marginTop: 8 }}>
              <label style={labelCol}>
                Number of Groups
                <input
                  value={String(groupCount)}
                  disabled
                  style={field}
                />
              </label>
              <label style={labelCol}>
                {unitLabelPlural} Per Group (Derived)
                <input
                  value={poolDraft.generatedTeams.length ? String(Math.ceil(poolDraft.generatedTeams.length / Math.max(1, groupCount))) : '-'}
                  disabled
                  style={field}
                />
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <strong>Groups</strong>
              <span style={pill}>Editable</span>
            </div>

            {!poolDraft.teamsGenerated ? (
              <p style={{ color: '#64748b' }}>
                {isSinglesFormat
                  ? (poolDraft.poolPlayers.length ? 'Generate groups first.' : 'Add players first.')
                  : hasPendingPairs
                    ? 'Validate pairs, then generate groups.'
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
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.setData('text/plain', teamId);
                              }}
                              style={{
                                border: '1px solid #d5dbe3',
                                borderRadius: 999,
                                padding: '6px 10px',
                                cursor: 'grab',
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
          </>
        ) : null}
      </section>

      <SaveRow enabled={poolDirty} onSave={savePool} />
    </div>
  );
}
