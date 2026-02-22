import type { Game, GameParticipant, Player, Season, Session } from '@leagueos/schemas';

export type AdminPage =
  | 'dashboard'
  | 'clubs'
  | 'players'
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
    case 'players': return 'Club Players';
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
    players: 'Club Players',
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
