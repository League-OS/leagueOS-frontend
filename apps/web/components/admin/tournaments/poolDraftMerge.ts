export type PoolRegistrationRow = {
  id: number;
  player_id: number;
  player_name: string;
  status: string;
  registration_source: 'ADMIN' | 'SELF' | string;
  seeded_elo?: number | null;
  elo_season_id?: string | null;
  registered_at?: string | null;
};

type PoolPlayer = {
  playerId: string;
  registeredAt: string;
  regRoute?: 'ADMIN' | 'SELF';
  seededElo?: number;
  eloSeasonId?: string;
};

type PoolConfigLike = {
  poolPlayers: PoolPlayer[];
};

function parseRegistrationSource(value: unknown): 'ADMIN' | 'SELF' {
  return value === 'SELF' ? 'SELF' : 'ADMIN';
}

export function mergePoolPlayersWithRegistrations<T extends PoolConfigLike>(
  pool: T,
  registrations: PoolRegistrationRow[],
): T {
  const normalized: T = {
    ...pool,
    poolPlayers: [],
  };

  const seenPlayers = new Set<string>();
  const existingByPlayerId = new Map<string, number>();

  pool.poolPlayers.forEach((entry, index) => {
    const playerId = entry.playerId;
    if (seenPlayers.has(playerId)) return;
    seenPlayers.add(playerId);
    existingByPlayerId.set(playerId, index);
    normalized.poolPlayers.push({ ...entry });
  });

  registrations
    .filter((registration) => registration.status === 'ACTIVE')
    .forEach((registration) => {
      const playerId = String(registration.player_id);
      const existingIndex = existingByPlayerId.get(playerId);
      const seededElo = typeof registration.seeded_elo === 'number' ? registration.seeded_elo : undefined;
      const eloSeasonId = typeof registration.elo_season_id === 'string' ? registration.elo_season_id : '';
      const registeredAt = registration.registered_at || '';
      const regSource = parseRegistrationSource(registration.registration_source);

      if (existingIndex === undefined) {
        normalized.poolPlayers.push({
          playerId,
          registeredAt,
          regRoute: regSource,
          seededElo,
          eloSeasonId,
        });
        existingByPlayerId.set(playerId, normalized.poolPlayers.length - 1);
        return;
      }

      const existing = normalized.poolPlayers[existingIndex] ? { ...normalized.poolPlayers[existingIndex] } : null;
      if (!existing) return;
      const next: PoolPlayer = {
        ...existing,
        regRoute: existing.regRoute || regSource,
      };
      if (!next.registeredAt) next.registeredAt = registeredAt;
      if (next.seededElo === undefined && seededElo !== undefined) next.seededElo = seededElo;
      if (!next.eloSeasonId && eloSeasonId) next.eloSeasonId = eloSeasonId;
      normalized.poolPlayers[existingIndex] = next;
    });

  return normalized;
}
