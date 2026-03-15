import type { Game, GameParticipant, LeaderboardEntry, Player, Season, Session } from '@leagueos/schemas';

export type AdminPage =
  | 'dashboard'
  | 'clubs'
  | 'config'
  | 'players'
  | 'users'
  | 'courts'
  | 'seasons'
  | 'sessions'
  | 'seasonDetail'
  | 'sessionDetail';

export function mergeAdminPlayers(activePlayers: Player[], inactivePlayers: Player[]): Player[] {
  const playerMap = new Map<number, Player>();
  for (const p of [...activePlayers, ...inactivePlayers]) playerMap.set(p.id, p);
  return [...playerMap.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
}

export function adminPageTitle(page: AdminPage): string {
  switch (page) {
    case 'dashboard': return 'Admin Dashboard';
    case 'clubs': return 'Clubs';
    case 'config': return 'Config';
    case 'players': return 'Club Players';
    case 'users': return 'Users';
    case 'courts': return 'Courts';
    case 'seasons': return 'Seasons';
    case 'sessions': return 'Sessions';
    case 'seasonDetail': return 'Season Detail';
    case 'sessionDetail': return 'Session Detail';
  }
}

export function buildAdminBreadcrumbs(args: {
  page: AdminPage;
  seasonId?: number;
  sessionId?: number;
  seasons: Season[];
  sessions: Session[];
}): Array<{ label: string; href?: string }> {
  const { page, seasonId, sessionId, seasons, sessions } = args;
  if (page === 'seasonDetail') {
    const season = seasons.find((s) => s.id === seasonId);
    return [{ label: 'Admin', href: '/admin' }, { label: 'Seasons', href: '/admin/seasons' }, { label: season?.name ?? `Season ${seasonId}` }];
  }
  if (page === 'sessionDetail') {
    const session = sessions.find((s) => s.id === sessionId);
    return [{ label: 'Admin', href: '/admin' }, { label: 'Sessions', href: '/admin/sessions' }, { label: session?.location || `Session ${sessionId}` }];
  }
  const map: Record<Exclude<AdminPage, 'seasonDetail' | 'sessionDetail'>, string> = {
    dashboard: 'Dashboard',
    clubs: 'Clubs',
    config: 'Config',
    players: 'Club Players',
    users: 'Users',
    courts: 'Courts',
    seasons: 'Seasons',
    sessions: 'Sessions',
  };
  return [{ label: 'Admin', href: '/admin' }, { label: map[page as keyof typeof map] }];
}

export function countUniquePlayersInSessionGames(sessionGames: Game[], participantsByGame: Record<number, GameParticipant[]>): number {
  return new Set(
    sessionGames.flatMap((g) => (participantsByGame[g.id] ?? []).map((p) => p.player_id)),
  ).size;
}

export function buildSeasonPlayerStats(args: {
  players: Player[];
  seasonFormat: Season['format'];
  sessions: Session[];
  games: Game[];
  participantsByGame: Record<number, GameParticipant[]>;
  leaderboardRows: LeaderboardEntry[];
}): Map<number, { matchesPlayed: number; eloScore: number }> {
  const { players, seasonFormat, sessions, games, participantsByGame, leaderboardRows } = args;
  const seasonSessionIds = new Set(sessions.map((session) => session.id));
  const matchesByPlayerId = new Map<number, number>();

  for (const game of games) {
    if (!seasonSessionIds.has(game.session_id)) continue;
    const participantIds = new Set((participantsByGame[game.id] ?? []).map((participant) => participant.player_id));
    for (const playerId of participantIds) {
      matchesByPlayerId.set(playerId, (matchesByPlayerId.get(playerId) ?? 0) + 1);
    }
  }

  const leaderboardByPlayerId = new Map(leaderboardRows.map((row) => [row.player_id, row]));
  const stats = new Map<number, { matchesPlayed: number; eloScore: number }>();
  for (const player of players) {
    const leaderboardRow = leaderboardByPlayerId.get(player.id);
    const initialElo =
      seasonFormat === 'SINGLES' ? player.elo_initial_singles
      : seasonFormat === 'MIXED_DOUBLES' ? player.elo_initial_mixed
      : player.elo_initial_doubles;
    stats.set(player.id, {
      matchesPlayed: matchesByPlayerId.get(player.id) ?? leaderboardRow?.matches_played ?? 0,
      eloScore: leaderboardRow?.global_elo_score ?? initialElo ?? 1000,
    });
  }
  return stats;
}

/** Display label for game status in the admin Session Detail match table. */
export function gameStatusDisplay(game: { status?: string }): string {
  return game.status === 'FINALIZED' ? 'FINALIZED' : 'Created';
}
