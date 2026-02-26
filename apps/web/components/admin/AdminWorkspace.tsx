'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, LeagueOsApiClient } from '@leagueos/api';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import type { AdminUser, Club, Court, Game, GameParticipant, LeaderboardEntry, Player, Profile, Season, Session } from '@leagueos/schemas';
import type { AuthState } from '../types';
import { canAccessAdmin, canManageClubs, toAdminEffectiveRole } from '../../lib/adminPermissions';
import {
  adminAlertError,
  adminAlertSuccess,
  AdminBreadcrumbs,
  AdminCard,
  AdminEmptyState,
  adminMainPanel,
  adminPageShell,
  AdminSidebar,
  AdminTable,
  AdminTopbar,
  field,
  outlineBtn,
  primaryBtn,
} from './AdminShellParts';
import type { AdminNavKey } from './AdminShellParts';
import { adminPageTitle, buildAdminBreadcrumbs, countUniquePlayersInSessionGames, mergeAdminPlayers, type AdminPage } from './adminWorkspaceLogic';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';
const STORAGE_AUTH = 'leagueos.admin.auth';
const STORAGE_CTX = 'leagueos.admin.ctx';
const STORAGE_PROFILE = 'leagueos.admin.profile';

type Props = {
  page: AdminPage;
  seasonId?: number;
  sessionId?: number;
};

type AdminCtx = {
  selectedSeasonId: number | null;
};

function getMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return fallback;
}

function fmtDate(value?: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function fmtDateTime(value?: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function toLocalDateInputValue(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localDateInputToUtcIso(dateInput: string): string {
  const [y, m, d] = dateInput.split('-').map(Number);
  if (!y || !m || !d) return dateInput;
  const localMidnight = new Date(y, m - 1, d, 0, 0, 0, 0);
  return localMidnight.toISOString();
}

export function AdminWorkspace({ page, seasonId, sessionId }: Props) {
  const client = useMemo(() => new LeagueOsApiClient({ apiBaseUrl: API_BASE }), []);
  const [auth, setAuth] = useState<AuthState | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_AUTH);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AuthState;
      return parsed?.token && Number.isInteger(parsed?.clubId) ? parsed : null;
    } catch {
      return null;
    }
  });
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_PROFILE);
      if (!raw) return null;
      return JSON.parse(raw) as Profile;
    } catch {
      return null;
    }
  });
  const [clubs, setClubs] = useState<Club[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [participantsByGame, setParticipantsByGame] = useState<Record<number, GameParticipant[]>>({});
  const [seasonLeaderboardRows, setSeasonLeaderboardRows] = useState<LeaderboardEntry[]>([]);
  const [seasonLeaderboardSession, setSeasonLeaderboardSession] = useState<Session | null>(null);
  const [selectedClubId, setSelectedClubId] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_CLUB_ID;
    try {
      const raw = window.localStorage.getItem(STORAGE_AUTH);
      if (!raw) return DEFAULT_CLUB_ID;
      const parsed = JSON.parse(raw) as AuthState;
      return parsed?.clubId ?? DEFAULT_CLUB_ID;
    } catch {
      return DEFAULT_CLUB_ID;
    }
  });
  const [ctx, setCtx] = useState<AdminCtx>(() => {
    if (typeof window === 'undefined') return { selectedSeasonId: null };
    try {
      const raw = window.localStorage.getItem(STORAGE_CTX);
      if (!raw) return { selectedSeasonId: null };
      const parsed = JSON.parse(raw) as AdminCtx;
      return { selectedSeasonId: parsed?.selectedSeasonId ?? null };
    } catch {
      return { selectedSeasonId: null };
    }
  });
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(typeof window !== 'undefined');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState('fvma-clubAdmin@leagueos.local');
  const [loginPassword, setLoginPassword] = useState('Admin@123');

  const [showAddClubModal, setShowAddClubModal] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newClubDescription, setNewClubDescription] = useState('');
  const [clubAdminSearch, setClubAdminSearch] = useState('');
  const [clubAdminInviteEmail, setClubAdminInviteEmail] = useState('');
  const [clubAdminCandidates, setClubAdminCandidates] = useState<Array<{ id: number; email: string; full_name?: string | null; display_name?: string | null }>>([]);
  const [selectedClubAdminId, setSelectedClubAdminId] = useState<number | null>(null);
  const [clubAdminSearching, setClubAdminSearching] = useState(false);
  const [lastClubInvite, setLastClubInvite] = useState<null | { email: string; temporary_password: string; invite_link: string }>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserPrimaryClubId, setNewUserPrimaryClubId] = useState<number | null>(null);
  const [newUserRole, setNewUserRole] = useState<'CLUB_ADMIN' | 'RECORDER' | 'USER'>('USER');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [newPlayerType, setNewPlayerType] = useState<'ROSTER' | 'DROP_IN' | 'DROP_IN_A1'>('ROSTER');
  const [newCourtName, setNewCourtName] = useState('');
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newSeasonFormat, setNewSeasonFormat] = useState<'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES'>('DOUBLES');
  const [newSeasonWeekday, setNewSeasonWeekday] = useState(2);
  const [newSeasonStartTime, setNewSeasonStartTime] = useState('19:00');
  const [newSessionSeasonId, setNewSessionSeasonId] = useState<number | null>(null);
  const [newSessionDate, setNewSessionDate] = useState(() => toLocalDateInputValue(new Date().toISOString()));
  const [newSessionStatus, setNewSessionStatus] = useState<'UPCOMING' | 'OPEN' | 'CANCELLED'>('UPCOMING');
  const [newSessionName, setNewSessionName] = useState('Club Session');

  const role = toAdminEffectiveRole(profile?.role, profile?.club_role);
  const allowed = canAccessAdmin(role);
  const isGlobalAdmin = role === 'GLOBAL_ADMIN';
  const globalAdminAllowedPages = new Set<AdminPage>(['dashboard', 'clubs', 'users']);
  const pageAllowedForRole = !isGlobalAdmin || globalAdminAllowedPages.has(page);
  const visibleNavItems: AdminNavKey[] = isGlobalAdmin
    ? ['dashboard', 'clubs', 'users']
    : ['dashboard', 'clubs', 'seasons', 'sessions', 'courts', 'players'];
  const selectedSeason = seasons.find((s) => s.id === (seasonId ?? ctx.selectedSeasonId)) ?? null;
  const selectedSession = sessions.find((s) => s.id === sessionId) ?? null;

  const sessionsInSeason = useMemo(() => {
    const target = seasonId ?? ctx.selectedSeasonId;
    return target ? sessions.filter((s) => s.season_id === target) : sessions;
  }, [sessions, seasonId, ctx.selectedSeasonId]);

  useEffect(() => {
    setHydrated(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const inviteEmail = (params.get('email') || '').trim();
      if (inviteEmail) setLoginEmail(inviteEmail);
      if (!auth) {
        const rawAuth = localStorage.getItem(STORAGE_AUTH);
        if (rawAuth) {
          const parsed = JSON.parse(rawAuth) as AuthState;
          if (parsed?.token && Number.isInteger(parsed?.clubId)) {
            setAuth(parsed);
            setSelectedClubId(parsed.clubId);
          }
        }
      }
      if (!profile) {
        const rawProfile = localStorage.getItem(STORAGE_PROFILE);
        if (rawProfile) setProfile(JSON.parse(rawProfile) as Profile);
      }
    } catch {
      // ignore bad local storage
    }
    // auth/profile are intentionally not dependencies; this is initial restore only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!auth) return;
    localStorage.setItem(STORAGE_AUTH, JSON.stringify(auth));
  }, [auth]);

  useEffect(() => {
    if (!profile) {
      localStorage.removeItem(STORAGE_PROFILE);
      return;
    }
    localStorage.setItem(STORAGE_PROFILE, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(STORAGE_CTX, JSON.stringify(ctx));
  }, [ctx]);

  useEffect(() => {
    if (!auth) return;
    void loadAdminData(auth.token, auth.clubId);
  }, [auth?.token]); // intentionally token-driven

  async function loadAdminData(token: string, clubId: number) {
    setLoading(true);
    setError(null);
    try {
      const me = await client.profile(token);
      setProfile(me);
      const availableClubs =
        me.role === 'GLOBAL_ADMIN'
          ? await client.clubs(token).catch(() => [] as Club[])
          : await client.profileClubs(token);
      setClubs(availableClubs);

      const activeClubId = availableClubs.find((c) => c.id === clubId)?.id ?? availableClubs[0]?.id ?? clubId;
      setSelectedClubId(activeClubId);

      if (me.role === 'GLOBAL_ADMIN') {
        setPlayers([]);
        setCourts([]);
        setSeasons([]);
        setSessions([]);
        setGames([]);
        setParticipantsByGame({});
        setSeasonLeaderboardRows([]);
        setSeasonLeaderboardSession(null);
        setNewSessionSeasonId(null);
        return;
      }

      const [activePlayers, inactivePlayers, clubCourts, clubSeasons, clubSessions, clubGames, usersList] = await Promise.all([
        client.players(token, activeClubId, true),
        client.players(token, activeClubId, false).catch(() => [] as Player[]),
        client.courts(token, activeClubId),
        client.seasons(token, activeClubId),
        client.sessions(token, activeClubId),
        client.games(token, activeClubId).catch(() => [] as Game[]),
        me.role === 'GLOBAL_ADMIN' ? client.adminUsers(token).catch(() => [] as AdminUser[]) : Promise.resolve([] as AdminUser[]),
      ]);
      const clubPlayers = mergeAdminPlayers(activePlayers, inactivePlayers);

      setPlayers(clubPlayers);
      setCourts(clubCourts);
      setSeasons(clubSeasons);
      setSessions(clubSessions);
      setGames(clubGames);
      setAdminUsers(usersList);
      setNewSessionSeasonId((prev) => prev ?? clubSeasons[0]?.id ?? null);

      const needParticipants = page === 'sessions' || page === 'sessionDetail' || page === 'seasonDetail';
      if (needParticipants && clubGames.length) {
        const rows = await Promise.allSettled(
          clubGames.map(async (g) => [g.id, await client.gameParticipants(token, activeClubId, g.id)] as const),
        );
        const next: Record<number, GameParticipant[]> = {};
        for (const row of rows) {
          if (row.status === 'fulfilled') next[row.value[0]] = row.value[1];
        }
        setParticipantsByGame(next);
      } else {
        setParticipantsByGame({});
    setSeasonLeaderboardRows([]);
    setSeasonLeaderboardSession(null);
      }

      if (page === 'seasonDetail' && seasonId) {
        try {
          const seasonBoard = await client.seasonLeaderboard(token, activeClubId, seasonId);
          setSeasonLeaderboardRows(seasonBoard.leaderboard);
          setSeasonLeaderboardSession(seasonBoard.session);
        } catch {
          setSeasonLeaderboardRows([]);
          setSeasonLeaderboardSession(null);
        }
      } else {
        setSeasonLeaderboardRows([]);
        setSeasonLeaderboardSession(null);
      }
    } catch (e) {
      setProfile(null);
      setError(getMessage(e, 'Failed to load admin data.'));
    } finally {
      setLoading(false);
    }
  }

  async function doLogin() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await client.login({ email: loginEmail, password: loginPassword });
      const me = await client.profile(res.token);
      const nextRole = toAdminEffectiveRole(me.role, me.club_role);
      if (!canAccessAdmin(nextRole)) {
        throw new Error('This account does not have admin access.');
      }

      const isGlobal = me.role === 'GLOBAL_ADMIN';
      const pool = isGlobal
        ? await client.clubs(res.token).catch(() => [] as Club[])
        : await client.profileClubs(res.token);
      const firstClubId = isGlobal ? (res.club_id ?? 0) : (pool[0]?.id ?? res.club_id ?? DEFAULT_CLUB_ID);
      const scoped =
        isGlobal || res.club_id === firstClubId ? res : await client.switchClub(res.token, firstClubId);
      setProfile(me);
      setClubs(pool);
      setSelectedClubId(firstClubId);
      setAuth({ token: scoped.token, clubId: firstClubId });
      setSuccess('Signed in. Loading admin workspace...');
    } catch (e) {
      setError(getMessage(e, 'Login failed.'));
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    if (!auth) return;
    await loadAdminData(auth.token, selectedClubId);
  }

  async function switchClub(nextClubId: number) {
    if (!auth || Number.isNaN(nextClubId)) return;
    try {
      setLoading(true);
      setError(null);
      const scoped = await client.switchClub(auth.token, nextClubId);
      setAuth({ token: scoped.token, clubId: nextClubId });
      setSelectedClubId(nextClubId);
      await loadAdminData(scoped.token, nextClubId);
    } catch (e) {
      setError(getMessage(e, 'Failed to switch club.'));
      setLoading(false);
    }
  }

  function logout() {
    setAuth(null);
    setProfile(null);
    setClubs([]);
    setPlayers([]);
    setCourts([]);
    setSeasons([]);
    setSessions([]);
    setGames([]);
    setAdminUsers([]);
    setParticipantsByGame({});
    setError(null);
    setSuccess(null);
    localStorage.removeItem(STORAGE_AUTH);
    localStorage.removeItem(STORAGE_PROFILE);
  }

  if (!hydrated) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#eef2f7', padding: 24 }}>
        <section style={{ width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #dbe3ef', borderRadius: 18, padding: 20, boxShadow: '0 16px 30px rgba(15,23,42,.08)' }}>
          <h1 style={{ margin: 0, fontSize: 28, color: '#0f172a' }}>LeagueOS Admin</h1>
          <p style={{ margin: '8px 0 0', color: '#64748b' }}>Loading admin workspace...</p>
        </section>
      </main>
    );
  }

  if (auth && !profile) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#eef2f7', padding: 24 }}>
        <section style={{ width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #dbe3ef', borderRadius: 18, padding: 20, boxShadow: '0 16px 30px rgba(15,23,42,.08)' }}>
          <h1 style={{ margin: 0, fontSize: 28, color: '#0f172a' }}>LeagueOS Admin</h1>
          <p style={{ margin: '8px 0 0', color: '#64748b' }}>Restoring your admin session...</p>
        </section>
      </main>
    );
  }

  if (!auth || !profile) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#eef2f7', padding: 24 }}>
        <section style={{ width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #dbe3ef', borderRadius: 18, padding: 20, boxShadow: '0 16px 30px rgba(15,23,42,.08)' }}>
          <h1 style={{ margin: 0, fontSize: 28, color: '#0f172a' }}>LeagueOS Admin</h1>
          <p style={{ margin: '8px 0 14px', color: '#64748b' }}>Desktop-first admin workspace for club operations.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>Email</span>
              <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} style={field} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>Password</span>
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} style={field} />
            </label>
            {error ? <div style={adminAlertError}>{error}</div> : null}
            {success ? <div style={adminAlertSuccess}>{success}</div> : null}
            <button style={primaryBtn} onClick={() => void doLogin()} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In to Admin'}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#eef2f7', padding: 24 }}>
        <section style={{ width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #dbe3ef', borderRadius: 18, padding: 20 }}>
          <h2 style={{ margin: 0, color: '#0f172a' }}>Unauthorized</h2>
          <p style={{ margin: '8px 0 0', color: '#64748b' }}>Only GLOBAL_ADMIN and CLUB_ADMIN can access `/admin`.</p>
        </section>
      </main>
    );
  }

  if (!pageAllowedForRole) {
    return (
      <main style={adminPageShell}>
        <AdminSidebar active="clubs" visibleItems={visibleNavItems} />
        <section style={adminMainPanel}>
          <AdminTopbar
            title="Clubs"
            subtitle={profile.display_name || profile.email || undefined}
            roleLabel={role}
            clubOptions={clubs}
            selectedClubId={selectedClubId}
            onClubChange={(clubId) => void switchClub(clubId)}
            seasonOptions={[]}
            selectedSeasonId={null}
            onSeasonChange={() => {}}
            canSelectClub={false}
            showSeasonFilter={false}
            onRefresh={() => void refresh()}
            onLogout={logout}
            loading={loading}
          />
          <div style={adminAlertError}>
            Global Admin can manage clubs and users. Season, session, court, and player pages are hidden for this role.
          </div>
          <AdminCard title="Go to Clubs">
            <p style={{ margin: 0, color: '#475569' }}>
              Use the Clubs page to create and manage clubs.
            </p>
            <div style={{ marginTop: 12 }}>
              <Link href="/admin/clubs" style={primaryBtn}>Open Clubs</Link>
            </div>
          </AdminCard>
        </section>
      </main>
    );
  }

  const activeNav: AdminNavKey =
    page === 'seasonDetail' ? 'seasons' :
    page === 'sessionDetail' ? 'sessions' :
    (page as AdminNavKey);

  const breadcrumbs = buildAdminBreadcrumbs({ page, seasonId, sessionId, seasons, sessions });

  const sessionMatches = selectedSession
    ? games.filter((g) => g.session_id === selectedSession.id)
    : [];

  return (
    <main style={adminPageShell}>
      <AdminSidebar active={activeNav} visibleItems={visibleNavItems} />
      <section style={adminMainPanel}>
        <AdminTopbar
          title={adminPageTitle(page)}
          subtitle={profile.display_name || profile.email || undefined}
          roleLabel={role}
          clubOptions={clubs}
          selectedClubId={selectedClubId}
          onClubChange={(clubId) => void switchClub(clubId)}
          seasonOptions={seasons.map((s) => ({ id: s.id, name: s.name }))}
          selectedSeasonId={ctx.selectedSeasonId}
          onSeasonChange={(id) => setCtx((prev) => ({ ...prev, selectedSeasonId: id }))}
          canSelectClub={role === 'GLOBAL_ADMIN'}
          showSeasonFilter={!isGlobalAdmin}
          onRefresh={() => void refresh()}
          onLogout={logout}
          loading={loading}
        />
        <AdminBreadcrumbs items={breadcrumbs} />
        {error ? <div style={adminAlertError}>{error}</div> : null}
        {success ? <div style={adminAlertSuccess}>{success}</div> : null}

        {page === 'dashboard' ? (
          <DashboardPanel clubs={clubs} players={players} courts={courts} seasons={seasons} sessions={sessions} />
        ) : null}
        {page === 'clubs' ? (
          <ClubsPanel
            canManage={canManageClubs(role)}
            clubs={clubs}
            showAddClubModal={showAddClubModal}
            setShowAddClubModal={setShowAddClubModal}
            newClubName={newClubName}
            setNewClubName={setNewClubName}
            newClubDescription={newClubDescription}
            setNewClubDescription={setNewClubDescription}
            clubAdminSearch={clubAdminSearch}
            setClubAdminSearch={setClubAdminSearch}
            clubAdminInviteEmail={clubAdminInviteEmail}
            setClubAdminInviteEmail={setClubAdminInviteEmail}
            clubAdminCandidates={clubAdminCandidates}
            selectedClubAdminId={selectedClubAdminId}
            setSelectedClubAdminId={setSelectedClubAdminId}
            clubAdminSearching={clubAdminSearching}
            lastClubInvite={lastClubInvite}
            setLastClubInvite={setLastClubInvite}
            onSearchAdmins={async (q) => {
              if (!auth) return;
              if (q.trim().length < 3) {
                setClubAdminCandidates([]);
                setSelectedClubAdminId(null);
                return;
              }
              setClubAdminSearching(true);
              try {
                const results = await client.clubAdminCandidates(auth.token, q.trim());
                setClubAdminCandidates(results);
              } finally {
                setClubAdminSearching(false);
              }
            }}
            onCreate={async () => {
              if (!auth || !newClubName.trim() || (!selectedClubAdminId && !clubAdminInviteEmail.trim())) return;
              const created = await client.createClub(auth.token, {
                name: newClubName.trim(),
                description: newClubDescription.trim() || undefined,
                club_admin_user_id: selectedClubAdminId ?? undefined,
                club_admin_email: !selectedClubAdminId ? clubAdminInviteEmail.trim() : undefined,
              });
              setLastClubInvite(created.invite ? {
                email: created.invite.email,
                temporary_password: created.invite.temporary_password,
                invite_link: created.invite.invite_link,
              } : null);
              setNewClubName('');
              setNewClubDescription('');
              setClubAdminSearch('');
              setClubAdminInviteEmail('');
              setClubAdminCandidates([]);
              setSelectedClubAdminId(null);
              setShowAddClubModal(false);
              setSuccess(created.invite ? 'Club created. Invite generated for club admin.' : 'Club created and admin assigned.');
              await refresh();
            }}
            onDelete={async (clubId) => {
              if (!auth) return;
              await client.deleteClub(auth.token, clubId);
              setSuccess('Club deleted.');
              await refresh();
            }}
          />
        ) : null}
        {page === 'users' ? (
          <UsersPanel
            canManage={role === 'GLOBAL_ADMIN'}
            users={adminUsers}
            clubs={clubs}
            selectedClubId={selectedClubId}
            showAddUserModal={showAddUserModal}
            setShowAddUserModal={setShowAddUserModal}
            newUserEmail={newUserEmail}
            setNewUserEmail={setNewUserEmail}
            newUserFullName={newUserFullName}
            setNewUserFullName={setNewUserFullName}
            newUserPrimaryClubId={newUserPrimaryClubId}
            setNewUserPrimaryClubId={setNewUserPrimaryClubId}
            newUserRole={newUserRole}
            setNewUserRole={setNewUserRole}
            onCreate={async () => {
              if (!auth || !newUserEmail.trim() || !newUserFullName.trim() || !newUserPrimaryClubId) return;
              await client.createAdminUser(auth.token, {
                email: newUserEmail.trim(),
                full_name: newUserFullName.trim(),
                primary_club_id: newUserPrimaryClubId,
                role: newUserRole,
              });
              setNewUserEmail('');
              setNewUserFullName('');
              setNewUserPrimaryClubId(null);
              setNewUserRole('USER');
              setShowAddUserModal(false);
              setSuccess('User created.');
              await refresh();
            }}
            onToggleStatus={async (u) => {
              if (!auth) return;
              await client.setAdminUserStatus(auth.token, u.id, !u.is_active);
              setSuccess(`User ${u.is_active ? 'disabled' : 'enabled'}.`);
              await refresh();
            }}
          />
        ) : null}
        {page === 'players' ? (
          <PlayersPanel
            players={players}
            newPlayerName={newPlayerName}
            setNewPlayerName={setNewPlayerName}
            newPlayerEmail={newPlayerEmail}
            setNewPlayerEmail={setNewPlayerEmail}
            newPlayerType={newPlayerType}
            setNewPlayerType={setNewPlayerType}
            onCreate={async () => {
              if (!auth || !newPlayerName.trim()) return;
              await client.createPlayer(auth.token, selectedClubId, {
                display_name: newPlayerName.trim(),
                email: newPlayerEmail.trim() || undefined,
                player_type: newPlayerType,
                sex: 'U',
                is_active: true,
              });
              setNewPlayerName('');
              setNewPlayerEmail('');
              setSuccess('Player created.');
              await refresh();
            }}
            onToggle={async (p) => {
              if (!auth) return;
              await client.updatePlayer(auth.token, selectedClubId, p.id, { is_active: !p.is_active });
              setSuccess('Player updated.');
              await refresh();
            }}
            onDelete={async (p) => {
              if (!auth) return;
              await client.deletePlayer(auth.token, selectedClubId, p.id);
              setSuccess('Player deleted.');
              await refresh();
            }}
          />
        ) : null}
        {page === 'courts' ? (
          <CourtsPanel
            courts={courts}
            newCourtName={newCourtName}
            setNewCourtName={setNewCourtName}
            onCreate={async () => {
              if (!auth || !newCourtName.trim()) return;
              await client.createCourt(auth.token, selectedClubId, { name: newCourtName.trim(), is_active: true });
              setNewCourtName('');
              setSuccess('Court created.');
              await refresh();
            }}
            onToggle={async (court) => {
              if (!auth) return;
              await client.updateCourt(auth.token, selectedClubId, court.id, { is_active: !court.is_active });
              setSuccess('Court updated.');
              await refresh();
            }}
            onDelete={async (court) => {
              if (!auth) return;
              await client.deleteCourt(auth.token, selectedClubId, court.id);
              setSuccess('Court deleted.');
              await refresh();
            }}
          />
        ) : null}
        {page === 'seasons' ? (
          <SeasonsPanel
            seasons={seasons}
            sessions={sessions}
            players={players}
            newSeasonName={newSeasonName}
            setNewSeasonName={setNewSeasonName}
            newSeasonFormat={newSeasonFormat}
            setNewSeasonFormat={setNewSeasonFormat}
            newSeasonWeekday={newSeasonWeekday}
            setNewSeasonWeekday={setNewSeasonWeekday}
            newSeasonStartTime={newSeasonStartTime}
            setNewSeasonStartTime={setNewSeasonStartTime}
            onCreate={async () => {
              if (!auth || !newSeasonName.trim()) return;
              await client.createSeason(auth.token, selectedClubId, {
                name: newSeasonName.trim(),
                format: newSeasonFormat,
                weekday: newSeasonWeekday,
                start_time_local: newSeasonStartTime,
                timezone: 'America/Vancouver',
                is_active: true,
              });
              setNewSeasonName('');
              setSuccess('Season created.');
              await refresh();
            }}
            onToggle={async (s) => {
              if (!auth) return;
              await client.updateSeason(auth.token, selectedClubId, s.id, { is_active: !s.is_active });
              setSuccess('Season updated.');
              await refresh();
            }}
          />
        ) : null}
        {page === 'seasonDetail' ? (
          <SeasonDetailPanel
            season={selectedSeason}
            sessions={sessions.filter((s) => s.season_id === selectedSeason?.id)}
            players={players}
            leaderboardRows={seasonLeaderboardRows}
            leaderboardSession={seasonLeaderboardSession}
            onSessionCreate={async () => {
              if (!auth || !selectedSeason || !newSessionDate) return;
              await client.createSession(auth.token, selectedClubId, {
                season_id: selectedSeason.id,
                session_date: localDateInputToUtcIso(newSessionDate),
                status: newSessionStatus,
                location: newSessionName,
              });
              setSuccess('Session created.');
              await refresh();
            }}
            newSessionDate={newSessionDate}
            setNewSessionDate={setNewSessionDate}
            newSessionStatus={newSessionStatus}
            setNewSessionStatus={setNewSessionStatus}
            newSessionName={newSessionName}
            setNewSessionName={setNewSessionName}
            loading={loading}
          />
        ) : null}
        {page === 'sessions' ? (
          <SessionsPanel
            sessions={sessionsInSeason}
            seasons={seasons}
            games={games}
            participantsByGame={participantsByGame}
            newSessionSeasonId={newSessionSeasonId}
            setNewSessionSeasonId={setNewSessionSeasonId}
            newSessionDate={newSessionDate}
            setNewSessionDate={setNewSessionDate}
            newSessionStatus={newSessionStatus}
            setNewSessionStatus={setNewSessionStatus}
            newSessionName={newSessionName}
            setNewSessionName={setNewSessionName}
            onCreate={async () => {
              if (!auth || !newSessionSeasonId) return;
              await client.createSession(auth.token, selectedClubId, {
                season_id: newSessionSeasonId,
                session_date: localDateInputToUtcIso(newSessionDate),
                status: newSessionStatus,
                location: newSessionName,
              });
              setSuccess('Session created.');
              await refresh();
            }}
          />
        ) : null}
        {page === 'sessionDetail' ? (
          <SessionDetailPanel
            session={selectedSession}
            season={seasons.find((s) => s.id === selectedSession?.season_id) ?? null}
            sessionMatches={sessionMatches}
            participantsByGame={participantsByGame}
            players={players}
            courts={courts}
            onClose={async () => {
              if (!auth || !selectedSession) return;
              await client.closeSession(auth.token, selectedClubId, selectedSession.id);
              setSuccess('Session closed.');
              await refresh();
            }}
            onOpen={async () => {
              if (!auth || !selectedSession) return;
              await client.openSession(auth.token, selectedClubId, selectedSession.id);
              setSuccess('Session opened.');
              await refresh();
            }}
            onFinalize={async () => {
              if (!auth || !selectedSession) return;
              await client.finalizeSession(auth.token, selectedClubId, selectedSession.id);
              setSuccess('Session finalized.');
              await refresh();
            }}
            onRevert={async () => {
              if (!auth || !selectedSession) return;
              await client.revertSessionFinalize(auth.token, selectedClubId, selectedSession.id);
              setSuccess('Session reverted.');
              await refresh();
            }}
            onStatusChange={async (nextStatus) => {
              if (!auth || !selectedSession) return;
              if (nextStatus === selectedSession.status) return;
              setError(null);
              setSuccess(null);
              try {
                if (nextStatus === 'OPEN') {
                  if (selectedSession.status === 'CLOSED') {
                    await client.openSession(auth.token, selectedClubId, selectedSession.id);
                  } else {
                    await client.updateSession(auth.token, selectedClubId, selectedSession.id, { status: 'OPEN' });
                  }
                } else if (nextStatus === 'CLOSED') {
                  if (selectedSession.status === 'OPEN') {
                    await client.closeSession(auth.token, selectedClubId, selectedSession.id);
                  } else {
                    await client.updateSession(auth.token, selectedClubId, selectedSession.id, { status: 'CLOSED' });
                  }
                } else {
                  await client.updateSession(auth.token, selectedClubId, selectedSession.id, { status: nextStatus });
                }
                setSuccess(`Session status updated to ${nextStatus}.`);
                await refresh();
              } catch (e) {
                setError(getMessage(e, `Failed to update status to ${nextStatus}.`));
              }
            }}
          />
        ) : null}
      </section>
    </main>
  );
}

function DashboardPanel({ clubs, players, courts, seasons, sessions }: { clubs: Club[]; players: Player[]; courts: Court[]; seasons: Season[]; sessions: Session[] }) {
  const cards = [
    ['Clubs', clubs.length],
    ['Players', players.length],
    ['Courts', courts.length],
    ['Seasons', seasons.length],
    ['Sessions', sessions.length],
    ['Open Sessions', sessions.filter((s) => s.status === 'OPEN').length],
  ];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        {cards.map(([label, value]) => (
          <AdminCard key={label} title={String(label)}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a' }}>{value}</div>
          </AdminCard>
        ))}
      </div>
      <AdminCard title="Needs Attention">
        <div style={{ display: 'grid', gap: 8 }}>
          {sessions.filter((s) => s.status === 'OPEN').length === 0 ? (
            <div style={{ color: '#9f1239' }}>No OPEN session found for the current club.</div>
          ) : null}
          {players.filter((p) => !p.email).length > 0 ? (
            <div style={{ color: '#92400e' }}>{players.filter((p) => !p.email).length} player(s) missing email.</div>
          ) : null}
          {courts.length === 0 ? <div style={{ color: '#9f1239' }}>No courts configured.</div> : null}
          {sessions.filter((s) => s.status === 'OPEN').length > 0 && courts.length > 0 ? (
            <div style={{ color: '#065f46' }}>Core setup looks good for session operations.</div>
          ) : null}
        </div>
      </AdminCard>
    </div>
  );
}

function ClubsPanel({
  canManage,
  clubs,
  showAddClubModal,
  setShowAddClubModal,
  newClubName,
  setNewClubName,
  newClubDescription,
  setNewClubDescription,
  clubAdminSearch,
  setClubAdminSearch,
  clubAdminInviteEmail,
  setClubAdminInviteEmail,
  clubAdminCandidates,
  selectedClubAdminId,
  setSelectedClubAdminId,
  clubAdminSearching,
  lastClubInvite,
  setLastClubInvite,
  onSearchAdmins,
  onCreate,
  onDelete,
}: {
  canManage: boolean;
  clubs: Club[];
  showAddClubModal: boolean;
  setShowAddClubModal: (v: boolean) => void;
  newClubName: string;
  setNewClubName: (v: string) => void;
  newClubDescription: string;
  setNewClubDescription: (v: string) => void;
  clubAdminSearch: string;
  setClubAdminSearch: (v: string) => void;
  clubAdminInviteEmail: string;
  setClubAdminInviteEmail: (v: string) => void;
  clubAdminCandidates: Array<{ id: number; email: string; full_name?: string | null; display_name?: string | null }>;
  selectedClubAdminId: number | null;
  setSelectedClubAdminId: (id: number | null) => void;
  clubAdminSearching: boolean;
  lastClubInvite: null | { email: string; temporary_password: string; invite_link: string };
  setLastClubInvite: (v: null | { email: string; temporary_password: string; invite_link: string }) => void;
  onSearchAdmins: (q: string) => Promise<void>;
  onCreate: () => Promise<void>;
  onDelete: (clubId: number) => Promise<void>;
}) {
  const selectedAdmin = clubAdminCandidates.find((u) => u.id === selectedClubAdminId) ?? null;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard title="Club Directory" action={canManage ? (
        <button style={primaryBtn} onClick={() => setShowAddClubModal(true)}>Add Club</button>
      ) : null}>
        {lastClubInvite ? (
          <div style={{ ...adminAlertSuccess, marginBottom: 10 }}>
            Invite ready for <strong>{lastClubInvite.email}</strong>. Temporary password: <code>{lastClubInvite.temporary_password}</code>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href={lastClubInvite.invite_link} target="_blank" rel="noreferrer" style={{ color: '#0d9488', fontWeight: 700 }}>
                Open invite link
              </a>
              <button
                style={outlineBtn}
                onClick={() => void navigator.clipboard?.writeText(lastClubInvite.invite_link)}
              >
                Copy Invite Link
              </button>
              <button style={outlineBtn} onClick={() => setLastClubInvite(null)}>Dismiss</button>
            </div>
          </div>
        ) : null}
        {!canManage ? (
          <AdminEmptyState title="Global Admin action required" description="Club creation and deletion is available only to Global Admin. Club Admin can view club information here." />
        ) : null}
        <AdminTable
          columns={['ID', 'Club Name', 'Description', 'Created', 'Actions']}
          rows={clubs.map((club) => [
            club.id,
            <Link key={`club-${club.id}`} href={`/admin/clubs`} style={{ color: '#0d9488', textDecoration: 'none', fontWeight: 700 }}>{club.name}</Link>,
            club.description || '-',
            fmtDateTime(club.created_at),
            canManage ? (
              <button key="delete" style={outlineBtn} onClick={() => { if (window.confirm(`Delete ${club.name}?`)) void onDelete(club.id); }}>Delete</button>
            ) : 'View only',
          ])}
        />
      </AdminCard>

      {showAddClubModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 640, background: '#fff', borderRadius: 16, border: '1px solid #cbd5e1', boxShadow: '0 20px 50px rgba(15,23,42,.25)', padding: 16, display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 18 }}>Add Club</div>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Club Name</span>
              <input value={newClubName} onChange={(e) => setNewClubName(e.target.value)} style={field} placeholder="Enter club name" />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Club Description</span>
              <textarea value={newClubDescription} onChange={(e) => setNewClubDescription(e.target.value)} style={{ ...field, minHeight: 90, resize: 'vertical' }} placeholder="Enter club description" />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Club Admin</span>
              <input
                value={clubAdminSearch}
                onChange={(e) => {
                  const q = e.target.value;
                  setClubAdminSearch(q);
                  setSelectedClubAdminId(null);
                  void onSearchAdmins(q);
                }}
                style={field}
                placeholder="Search by full name or email (min 3 chars)"
              />
            </label>
            <div style={{ color: '#64748b', fontSize: 12 }}>Select an existing user above, or invite a new club admin by email below.</div>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Invite Club Admin by Email (optional)</span>
              <input
                value={clubAdminInviteEmail}
                onChange={(e) => {
                  setClubAdminInviteEmail(e.target.value);
                  if (e.target.value.trim()) setSelectedClubAdminId(null);
                }}
                style={field}
                placeholder="new-admin@example.com"
              />
            </label>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, minHeight: 74, maxHeight: 180, overflowY: 'auto', background: '#f8fafc' }}>
              {clubAdminSearch.trim().length < 3 ? <div style={{ color: '#64748b', fontSize: 12 }}>Type at least 3 characters to search users.</div> : null}
              {clubAdminSearch.trim().length >= 3 && clubAdminSearching ? <div style={{ color: '#64748b', fontSize: 12 }}>Searching…</div> : null}
              {clubAdminSearch.trim().length >= 3 && !clubAdminSearching && !clubAdminCandidates.length ? <div style={{ color: '#64748b', fontSize: 12 }}>No matching users found.</div> : null}
              {clubAdminCandidates.map((u) => (
                <label key={u.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 4px', cursor: 'pointer' }}>
                  <input type="radio" checked={selectedClubAdminId === u.id} onChange={() => setSelectedClubAdminId(u.id)} />
                  <span style={{ fontSize: 13 }}>
                    {(u.full_name || u.display_name || '(No name)')} — {u.email}
                  </span>
                </label>
              ))}
            </div>
            {selectedAdmin ? <div style={{ color: '#0f766e', fontSize: 12 }}>Selected admin: {selectedAdmin.full_name || selectedAdmin.display_name || selectedAdmin.email}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                style={outlineBtn}
                onClick={() => {
                  setShowAddClubModal(false);
                  setNewClubName('');
                  setNewClubDescription('');
                  setClubAdminSearch('');
                  setClubAdminInviteEmail('');
                  setSelectedClubAdminId(null);
                }}
              >
                Cancel
              </button>
              <button
                style={primaryBtn}
                onClick={() => void onCreate()}
                disabled={!newClubName.trim() || (!selectedClubAdminId && !clubAdminInviteEmail.trim())}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


function UsersPanel(props: {
  canManage: boolean;
  users: AdminUser[];
  clubs: Club[];
  selectedClubId: number;
  showAddUserModal: boolean;
  setShowAddUserModal: (v: boolean) => void;
  newUserEmail: string;
  setNewUserEmail: (v: string) => void;
  newUserFullName: string;
  setNewUserFullName: (v: string) => void;
  newUserPrimaryClubId: number | null;
  setNewUserPrimaryClubId: (v: number | null) => void;
  newUserRole: 'CLUB_ADMIN' | 'RECORDER' | 'USER';
  setNewUserRole: (v: 'CLUB_ADMIN' | 'RECORDER' | 'USER') => void;
  onCreate: () => Promise<void>;
  onToggleStatus: (u: AdminUser) => Promise<void>;
}) {
  const {
    canManage,
    users,
    clubs,
    selectedClubId,
    showAddUserModal,
    setShowAddUserModal,
    newUserEmail,
    setNewUserEmail,
    newUserFullName,
    setNewUserFullName,
    newUserPrimaryClubId,
    setNewUserPrimaryClubId,
    newUserRole,
    setNewUserRole,
    onCreate,
    onToggleStatus,
  } = props;

  const selectedClub = clubs.find((c) => c.id === selectedClubId);
  const clubScopedUsers = users.filter((u) => (u.memberships ?? []).some((m) => m.club_id === selectedClubId));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard
        title={`Users in ${selectedClub?.name ?? `Club ${selectedClubId}`}`}
        action={canManage ? <button style={primaryBtn} onClick={() => { setNewUserPrimaryClubId(selectedClubId); setShowAddUserModal(true); }}>Add User</button> : null}
      >
        <AdminTable
          columns={['User Email', 'Full Name', 'Role in Club', 'Status', 'Action']}
          rows={clubScopedUsers.map((u) => {
            const memberships = u.memberships ?? [];
            const clubMembership = memberships.find((m) => m.club_id === selectedClubId);
            return [
              <a key={`email-${u.id}`} href="#" style={{ color: '#0d9488', textDecoration: 'none', fontWeight: 700 }}>{u.email}</a>,
              u.full_name || u.display_name || '-',
              clubMembership?.role || '-',
              u.is_active ? 'Enabled' : 'Disabled',
              canManage ? (
                <button key={`toggle-${u.id}`} style={outlineBtn} onClick={() => void onToggleStatus(u)}>
                  {u.is_active ? 'Disable' : 'Enable'}
                </button>
              ) : '-',
            ];
          })}
        />
        {!clubScopedUsers.length ? (
          <div style={{ marginTop: 10, color: '#64748b', fontSize: 13 }}>No users assigned to this club yet.</div>
        ) : null}
      </AdminCard>

      {showAddUserModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 16, border: '1px solid #cbd5e1', boxShadow: '0 20px 50px rgba(15,23,42,.25)', padding: 16, display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 18 }}>Add User</div>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>User Email</span>
              <input value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} style={field} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Full Name</span>
              <input value={newUserFullName} onChange={(e) => setNewUserFullName(e.target.value)} style={field} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Primary Club</span>
              <select value={newUserPrimaryClubId ?? ''} onChange={(e) => setNewUserPrimaryClubId(e.target.value ? Number(e.target.value) : null)} style={field}>
                <option value="">Select club</option>
                {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Role</span>
              <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as 'CLUB_ADMIN' | 'RECORDER' | 'USER')} style={field}>
                <option value="USER">USER</option>
                <option value="RECORDER">RECORDER</option>
                <option value="CLUB_ADMIN">CLUB_ADMIN</option>
              </select>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={outlineBtn} onClick={() => setShowAddUserModal(false)}>Cancel</button>
              <button style={primaryBtn} disabled={!newUserEmail.trim() || !newUserFullName.trim() || !newUserPrimaryClubId} onClick={() => void onCreate()}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlayersPanel(props: {
  players: Player[];
  newPlayerName: string;
  setNewPlayerName: (v: string) => void;
  newPlayerEmail: string;
  setNewPlayerEmail: (v: string) => void;
  newPlayerType: 'ROSTER' | 'DROP_IN' | 'DROP_IN_A1';
  setNewPlayerType: (v: 'ROSTER' | 'DROP_IN' | 'DROP_IN_A1') => void;
  onCreate: () => Promise<void>;
  onToggle: (p: Player) => Promise<void>;
  onDelete: (p: Player) => Promise<void>;
}) {
  const { players, newPlayerName, setNewPlayerName, newPlayerEmail, setNewPlayerEmail, newPlayerType, setNewPlayerType, onCreate, onToggle, onDelete } = props;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard title="Player Onboarding">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: 8 }}>
          <input value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} placeholder="Player name" style={field} />
          <input value={newPlayerEmail} onChange={(e) => setNewPlayerEmail(e.target.value)} placeholder="Email (optional)" style={field} />
          <select value={newPlayerType} onChange={(e) => setNewPlayerType(e.target.value as 'ROSTER' | 'DROP_IN' | 'DROP_IN_A1')} style={field}>
            <option value="ROSTER">ROSTER</option>
            <option value="DROP_IN">DROP_IN</option>
            <option value="DROP_IN_A1">DROP_IN_A1</option>
          </select>
          <button style={primaryBtn} onClick={() => void onCreate()} disabled={!newPlayerName.trim()}>Add Player</button>
        </div>
      </AdminCard>
      <AdminCard title="Club Players">
        <AdminTable
          columns={['Player Name', 'ID', 'Email', 'Type', 'Status', 'Actions']}
          rows={players.map((p) => [
            p.display_name,
            p.id,
            p.email || '-',
            p.player_type || '-',
            p.is_active ? 'Active' : 'Inactive',
            <div key={`actions-${p.id}`} style={{ display: 'flex', gap: 8 }}>
              <button style={outlineBtn} onClick={() => void onToggle(p)}>{p.is_active ? 'Deactivate' : 'Activate'}</button>
              <button style={outlineBtn} onClick={() => { if (window.confirm(`Delete ${p.display_name}?`)) void onDelete(p); }}>Delete</button>
            </div>,
          ])}
        />
      </AdminCard>
    </div>
  );
}

function CourtsPanel(props: {
  courts: Court[];
  newCourtName: string;
  setNewCourtName: (v: string) => void;
  onCreate: () => Promise<void>;
  onToggle: (c: Court) => Promise<void>;
  onDelete: (c: Court) => Promise<void>;
}) {
  const { courts, newCourtName, setNewCourtName, onCreate, onToggle, onDelete } = props;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard title="Add Court">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr auto', gap: 8 }}>
          <input value={newCourtName} onChange={(e) => setNewCourtName(e.target.value)} placeholder="Court name" style={field} />
          <button style={primaryBtn} onClick={() => void onCreate()} disabled={!newCourtName.trim()}>Create Court</button>
        </div>
      </AdminCard>
      <AdminCard title="Courts">
        <AdminTable
          columns={['Court', 'Status', 'Created', 'Actions']}
          rows={courts.map((c) => [
            c.name,
            c.is_active ? 'Active' : 'Inactive',
            fmtDateTime(c.created_at),
            <div key={`court-${c.id}`} style={{ display: 'flex', gap: 8 }}>
              <button style={outlineBtn} onClick={() => void onToggle(c)}>{c.is_active ? 'Deactivate' : 'Activate'}</button>
              <button style={outlineBtn} onClick={() => { if (window.confirm(`Delete ${c.name}?`)) void onDelete(c); }}>Delete</button>
            </div>,
          ])}
        />
      </AdminCard>
    </div>
  );
}

function SeasonsPanel(props: {
  seasons: Season[];
  sessions: Session[];
  players: Player[];
  newSeasonName: string;
  setNewSeasonName: (v: string) => void;
  newSeasonFormat: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
  setNewSeasonFormat: (v: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES') => void;
  newSeasonWeekday: number;
  setNewSeasonWeekday: (v: number) => void;
  newSeasonStartTime: string;
  setNewSeasonStartTime: (v: string) => void;
  onCreate: () => Promise<void>;
  onToggle: (s: Season) => Promise<void>;
}) {
  const {
    seasons, sessions, players, newSeasonName, setNewSeasonName, newSeasonFormat, setNewSeasonFormat, newSeasonWeekday, setNewSeasonWeekday, newSeasonStartTime, setNewSeasonStartTime, onCreate, onToggle,
  } = props;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard title="Create Season">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8 }}>
          <input value={newSeasonName} onChange={(e) => setNewSeasonName(e.target.value)} placeholder="Season name" style={field} />
          <select value={newSeasonFormat} onChange={(e) => setNewSeasonFormat(e.target.value as 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES')} style={field}>
            <option value="DOUBLES">DOUBLES</option>
            <option value="SINGLES">SINGLES</option>
            <option value="MIXED_DOUBLES">MIXED_DOUBLES</option>
          </select>
          <select value={newSeasonWeekday} onChange={(e) => setNewSeasonWeekday(Number(e.target.value))} style={field}>
            {[0,1,2,3,4,5,6].map((n) => <option key={n} value={n}>Weekday {n}</option>)}
          </select>
          <input type="time" step={300} value={newSeasonStartTime} onChange={(e) => setNewSeasonStartTime(e.target.value)} style={field} />
          <button style={primaryBtn} onClick={() => void onCreate()} disabled={!newSeasonName.trim()}>Create</button>
        </div>
      </AdminCard>
      <AdminCard title="Seasons">
        <AdminTable
          columns={['Season Name', 'Start Date', 'End Date', '# Players', 'Status', '# Sessions', 'Actions']}
          rows={seasons.map((s) => {
            const seasonSessions = sessions.filter((x) => x.season_id === s.id).sort((a, b) => a.session_date.localeCompare(b.session_date));
            const startDate = seasonSessions[0]?.session_date ?? '-';
            const endDate = seasonSessions[seasonSessions.length - 1]?.session_date ?? '-';
            return [
              <Link key={`season-${s.id}`} href={`/admin/seasons/${s.id}`} style={{ color: '#0d9488', textDecoration: 'none', fontWeight: 700 }}>{s.name}</Link>,
              fmtDate(startDate),
              fmtDate(endDate),
              players.length,
              s.is_active ? 'Active' : 'Closed',
              seasonSessions.length,
              <button key="toggle" style={outlineBtn} onClick={() => void onToggle(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button>,
            ];
          })}
        />
      </AdminCard>
    </div>
  );
}

function SeasonDetailPanel(props: {
  season: Season | null;
  sessions: Session[];
  players: Player[];
  onSessionCreate: () => Promise<void>;
  newSessionDate: string;
  setNewSessionDate: (v: string) => void;
  newSessionStatus: 'UPCOMING' | 'OPEN' | 'CANCELLED';
  setNewSessionStatus: (v: 'UPCOMING' | 'OPEN' | 'CANCELLED') => void;
  newSessionName: string;
  setNewSessionName: (v: string) => void;
  loading: boolean;
  leaderboardRows: LeaderboardEntry[];
  leaderboardSession: Session | null;
}) {
  const { season, sessions, players, onSessionCreate, newSessionDate, setNewSessionDate, newSessionStatus, setNewSessionStatus, newSessionName, setNewSessionName, loading, leaderboardRows, leaderboardSession } = props;
  if (!season) return <AdminEmptyState title="Season not found" description="Select a valid season from the Seasons page." />;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard title={`Season Info: ${season.name}`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 10 }}>
          <Info label="Format" value={season.format} />
          <Info label="Weekday" value={String(season.weekday)} />
          <Info label="Start Time" value={season.start_time_local} />
          <Info label="Timezone" value={season.timezone} />
          <Info label="Status" value={season.is_active ? 'Active' : 'Closed'} />
        </div>
      </AdminCard>

      <AdminCard title="Sessions in Season" action={
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={newSessionDate} onChange={(e) => setNewSessionDate(e.target.value)} style={field} />
          <input value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)} placeholder="Session Name" style={field} />
          <select value={newSessionStatus} onChange={(e) => setNewSessionStatus(e.target.value as 'UPCOMING' | 'OPEN' | 'CANCELLED')} style={field}>
            <option value="UPCOMING">UPCOMING</option>
            <option value="OPEN">OPEN</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
          <button style={primaryBtn} onClick={() => void onSessionCreate()} disabled={loading}>Add Session</button>
        </div>
      }>
        <AdminTable
          columns={['Session Name', 'Session Date', 'Start Time', 'Status', 'Matches', 'Players']}
          rows={sessions.map((s) => [
            <Link key={`sess-link-${s.id}`} href={`/admin/sessions/${s.id}`} style={{ color: '#0d9488', textDecoration: 'none', fontWeight: 700 }}>{s.location || `Session ${s.id}`}</Link>,
            fmtDate(s.session_date),
            season.start_time_local,
            s.status,
            '-', // match count can be derived later from games
            '-', // session player count can be derived later from participants
          ])}
        />
      </AdminCard>

      <AdminCard title="Players in Season" action={<Link href="/admin/players" style={{ ...outlineBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Manage Club Players</Link>}>
        <AdminTable
          columns={['Player Name', 'ID', 'Matches Played', 'Player Status', 'ELO Score']}
          rows={players.map((p) => [p.display_name, p.id, '-', p.player_type || '-', '-'])}
        />
      </AdminCard>

      <AdminCard title="Season Leaderboard">
        {leaderboardSession ? (
          <div style={{ marginBottom: 10, color: '#475569', fontSize: 13 }}>
            Source session: <strong>{leaderboardSession.location || `Session ${leaderboardSession.id}`}</strong> ({fmtDate(leaderboardSession.session_date)} · {leaderboardSession.status})
          </div>
        ) : null}
        {leaderboardRows.length ? (
          <AdminTable
            columns={['#', 'Player', 'Delta', 'Played', 'Won', 'Points', 'Global ELO']}
            rows={leaderboardRows.map((row, i) => [
              i + 1,
              row.display_name,
              row.season_elo_delta > 0 ? `+${row.season_elo_delta}` : String(row.season_elo_delta),
              row.matches_played ?? 0,
              row.matches_won,
              row.total_points,
              row.global_elo_score ?? 1000,
            ])}
          />
        ) : (
          <AdminEmptyState title="No leaderboard data yet" description="Finalize at least one session in this season to populate leaderboard rankings." />
        )}
      </AdminCard>
    </div>
  );
}

function SessionsPanel(props: {
  sessions: Session[];
  seasons: Season[];
  games: Game[];
  participantsByGame: Record<number, GameParticipant[]>;
  newSessionSeasonId: number | null;
  setNewSessionSeasonId: (v: number | null) => void;
  newSessionDate: string;
  setNewSessionDate: (v: string) => void;
  newSessionStatus: 'UPCOMING' | 'OPEN' | 'CANCELLED';
  setNewSessionStatus: (v: 'UPCOMING' | 'OPEN' | 'CANCELLED') => void;
  newSessionName: string;
  setNewSessionName: (v: string) => void;
  onCreate: () => Promise<void>;
}) {
  const { sessions, seasons, games, participantsByGame, newSessionSeasonId, setNewSessionSeasonId, newSessionDate, setNewSessionDate, newSessionStatus, setNewSessionStatus, newSessionName, setNewSessionName, onCreate } = props;
  const seasonById = new Map(seasons.map((s) => [s.id, s]));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard title="Add New Session">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr auto', gap: 8 }}>
          <select value={newSessionSeasonId ?? ''} onChange={(e) => setNewSessionSeasonId(e.target.value ? Number(e.target.value) : null)} style={field}>
            <option value="">Select season</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="date" value={newSessionDate} onChange={(e) => setNewSessionDate(e.target.value)} style={field} />
          <select value={newSessionStatus} onChange={(e) => setNewSessionStatus(e.target.value as 'UPCOMING' | 'OPEN' | 'CANCELLED')} style={field}>
            <option value="UPCOMING">UPCOMING</option>
            <option value="OPEN">OPEN</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
          <input value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)} placeholder="Session Name" style={field} />
          <button style={primaryBtn} onClick={() => void onCreate()} disabled={!newSessionSeasonId}>Create</button>
        </div>
      </AdminCard>
      <AdminCard title="Club Sessions">
        <AdminTable
          columns={['Session Name', 'Session Date', 'Start Time', 'Session Status', 'Matches', 'Players']}
          rows={sessions
            .slice()
            .sort((a, b) => b.session_date.localeCompare(a.session_date))
            .map((s) => {
              const season = seasonById.get(s.season_id);
              const sessionGames = games.filter((g) => g.session_id === s.id);
              const playerCount = countUniquePlayersInSessionGames(sessionGames, participantsByGame);
              return [
                <Link key={`sd-${s.id}`} href={`/admin/sessions/${s.id}`} style={{ color: '#0d9488', textDecoration: 'none', fontWeight: 700 }}>{s.location || `Session ${s.id}`}</Link>,
                fmtDate(s.session_date),
                season?.start_time_local || '-',
                s.status,
                sessionGames.length,
                playerCount || '-',
              ];
            })}
        />
      </AdminCard>
    </div>
  );
}

function SessionDetailPanel(props: {
  session: Session | null;
  season: Season | null;
  sessionMatches: Game[];
  participantsByGame: Record<number, GameParticipant[]>;
  players: Player[];
  courts: Court[];
  onClose: () => Promise<void>;
  onOpen: () => Promise<void>;
  onFinalize: () => Promise<void>;
  onRevert: () => Promise<void>;
  onStatusChange: (status: 'UPCOMING' | 'OPEN' | 'CLOSED' | 'CANCELLED') => Promise<void>;
}) {
  const { session, season, sessionMatches, participantsByGame, courts, onClose, onOpen, onFinalize, onRevert, onStatusChange } = props;
  const [statusSaving, setStatusSaving] = useState(false);
  if (!session) return <AdminEmptyState title="Session not found" description="Select a valid session from the Sessions page." />;
  const courtById = new Map(courts.map((c) => [c.id, c.name]));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard title={`Session Info: ${session.location || `Session ${session.id}`}`} action={
        <div style={{ display: 'flex', gap: 8 }}>
          {session.status === 'UPCOMING' ? <button style={outlineBtn} onClick={() => void onStatusChange('OPEN')}>Open Session</button> : null}
          {session.status === 'OPEN' ? <button style={outlineBtn} onClick={() => void onClose()}>Close Session</button> : null}
          {session.status === 'CLOSED' ? <button style={outlineBtn} onClick={() => void onOpen()}>Open Session</button> : null}
          {session.status === 'CLOSED' ? <button style={primaryBtn} onClick={() => void onFinalize()}>Finalize Session</button> : null}
          {session.status === 'FINALIZED' ? <button style={outlineBtn} onClick={() => void onRevert()}>Revert Finalize</button> : null}
        </div>
      }>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 10 }}>
          <Info label="Session Date" value={fmtDate(session.session_date)} />
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 10 }}>
            <div style={{ color: '#64748b', fontSize: 12 }}>Status</div>
            {session.status === 'FINALIZED' ? (
              <div style={{ marginTop: 4, color: '#0f172a', fontWeight: 700 }}>FINALIZED</div>
            ) : (
              <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                <select
                  aria-label="Session Status"
                  value={session.status}
                  disabled={statusSaving}
                  onChange={async (e) => {
                    const nextStatus = e.target.value as 'UPCOMING' | 'OPEN' | 'CLOSED' | 'CANCELLED';
                    setStatusSaving(true);
                    try {
                      await onStatusChange(nextStatus);
                    } finally {
                      setStatusSaving(false);
                    }
                  }}
                  style={{
                    height: 40,
                    width: '100%',
                    minWidth: 0,
                    borderRadius: 10,
                    border: '1px solid #0ea5e9',
                    padding: '0 12px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#0f172a',
                    background: statusSaving ? '#f1f5f9' : '#fff',
                    opacity: statusSaving ? 0.8 : 1,
                    cursor: statusSaving ? 'wait' : 'pointer',
                    appearance: 'auto',
                    WebkitAppearance: 'menulist',
                  }}
                >
                  <option value="UPCOMING">UPCOMING</option>
                  <option value="OPEN">OPEN</option>
                  <option value="CLOSED">CLOSED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
                <div style={{ fontSize: 11, color: '#64748b' }}>{statusSaving ? 'Updating status…' : 'Choose a new status to update this session.'}</div>
              </div>
            )}
          </div>
          <Info label="Season" value={season?.name || `Season ${session.season_id}`} />
          <Info label="Start Time" value={season?.start_time_local || '-'} />
          <Info label="Opened" value={fmtDateTime(session.opened_at)} />
          <Info label="Finalized" value={fmtDateTime(session.finalized_at)} />
        </div>
      </AdminCard>
      <AdminCard title="Matches in Session" action={
        <Link href="/" style={{ ...outlineBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          Add Match (open User Add Game)
        </Link>
      }>
        <AdminTable
          columns={['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Court', 'Start Time', 'Score A', 'Score B', 'Status']}
          rows={sessionMatches.map((g) => {
            const participants = participantsByGame[g.id] ?? [];
            const sideA = participants.filter((p) => p.side === 'A').map((p) => p.display_name);
            const sideB = participants.filter((p) => p.side === 'B').map((p) => p.display_name);
            return [
              sideA[0] || '-',
              sideA[1] || '-',
              sideB[0] || '-',
              sideB[1] || '-',
              courtById.get(g.court_id) || `Court ${g.court_id}`,
              fmtDateTime(g.start_time),
              g.score_a,
              g.score_b,
              'Created',
            ];
          })}
        />
      </AdminCard>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 10 }}>
      <div style={{ color: '#64748b', fontSize: 12 }}>{label}</div>
      <div style={{ marginTop: 4, color: '#0f172a', fontWeight: 700 }}>{value}</div>
    </div>
  );
}
