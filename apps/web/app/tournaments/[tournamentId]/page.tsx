'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LeagueOsApiClient, type Tournament, type TournamentFormatInstance } from '@leagueos/api';
import { DEFAULT_API_BASE_URL } from '@leagueos/config';
import {
  findUserPlayerId,
  normalizeSelfSignupError,
  parseApiErrorDetail,
  signedFormatIdsFromRegistrations,
  type ApiDetailPayload,
  type FormatRegistrationRow,
  type PlayerTab,
} from '../../../components/playerTournamentSignupLogic';

type PlayerAuth = { token: string; clubId: number };
type FormatLifecycleStatus = 'DRAFT' | 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type FormatViewModel = { format: TournamentFormatInstance; status: FormatLifecycleStatus };

const PLAYER_STORAGE_AUTH = 'leagueos.player.auth';
const PLAYER_TAB_STORAGE_KEY = 'leagueos.player.selectedTab';

function parsePlayerAuth(raw: string | null): PlayerAuth | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: unknown; clubId?: unknown };
    const token = typeof parsed.token === 'string' ? parsed.token : '';
    const clubId =
      typeof parsed.clubId === 'number'
        ? parsed.clubId
        : typeof parsed.clubId === 'string'
          ? Number.parseInt(parsed.clubId, 10)
          : Number.NaN;
    if (!token || !Number.isInteger(clubId)) return null;
    return { token, clubId };
  } catch {
    return null;
  }
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function lifecycleLabel(value: string): string {
  return String(value || '')
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isFormatLifecycleStatus(value: string): value is FormatLifecycleStatus {
  return value === 'DRAFT'
    || value === 'REGISTRATION_OPEN'
    || value === 'REGISTRATION_CLOSED'
    || value === 'IN_PROGRESS'
    || value === 'COMPLETED'
    || value === 'CANCELLED';
}

function formatLifecycleStatus(format: TournamentFormatInstance): FormatLifecycleStatus {
  const configJson = format.config_json;
  const rawStatus = configJson && typeof configJson === 'object' && typeof configJson.ui_format_status === 'string'
    ? configJson.ui_format_status.toUpperCase()
    : '';
  if (isFormatLifecycleStatus(rawStatus)) return rawStatus;

  if (isRegistrationOpen(format)) return 'REGISTRATION_OPEN';
  const now = Date.now();
  const closeAt = format.registration_close_at ? new Date(format.registration_close_at).getTime() : Number.NaN;
  if (!Number.isNaN(closeAt) && now > closeAt) return 'REGISTRATION_CLOSED';
  return 'DRAFT';
}

function statusPill(status: string): CSSProperties {
  const key = String(status || '').toUpperCase();
  if (key === 'REGISTRATION_OPEN') {
    return { ...pill, color: '#0f6b4e', borderColor: '#9edabd', background: '#e7f8ef' };
  }
  if (key === 'REGISTRATION_CLOSED') {
    return { ...pill, color: '#915214', borderColor: '#efcd96', background: '#fff5e5' };
  }
  if (key === 'IN_PROGRESS') {
    return { ...pill, color: '#1f4ea3', borderColor: '#b8ccf3', background: '#ebf1ff' };
  }
  if (key === 'COMPLETED') {
    return { ...pill, color: '#155f61', borderColor: '#add3d6', background: '#e8f6f7' };
  }
  if (key === 'CANCELLED') {
    return { ...pill, color: '#b42318', borderColor: '#efb6b2', background: '#feeceb' };
  }
  return { ...pill, color: '#445467', borderColor: '#ccd6e0', background: '#edf2f7' };
}

function isRegistrationOpen(format: TournamentFormatInstance): boolean {
  const now = Date.now();
  const openAt = format.registration_open_at ? new Date(format.registration_open_at).getTime() : Number.NaN;
  const closeAt = format.registration_close_at ? new Date(format.registration_close_at).getTime() : Number.NaN;
  const afterOpen = Number.isNaN(openAt) || now >= openAt;
  const beforeClose = Number.isNaN(closeAt) || now <= closeAt;
  return afterOpen && beforeClose;
}

function isTournamentRegistrationOpen(status: string): boolean {
  return String(status || '').toUpperCase() === 'REGISTRATION_OPEN';
}

function tournamentEndAt(tournament: Tournament | null): string | null {
  if (!tournament) return null;
  const withEnd = tournament as Tournament & { schedule_end_at?: string | null };
  return withEnd.schedule_end_at ?? null;
}

async function listFormatRegistrations(
  token: string,
  clubId: number,
  tournamentId: number,
  formatId: number,
): Promise<FormatRegistrationRow[]> {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');
  const response = await fetch(
    `${apiBase}/tournaments/${tournamentId}/formats/${formatId}/registrations?club_id=${clubId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Unable to load format registrations (HTTP ${response.status})`);
  }
  return (await response.json()) as FormatRegistrationRow[];
}

async function addSelfFormatRegistration(
  token: string,
  clubId: number,
  tournamentId: number,
  formatId: number,
  playerId: number,
): Promise<void> {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');
  const response = await fetch(
    `${apiBase}/tournaments/${tournamentId}/formats/${formatId}/registrations?club_id=${clubId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ player_id: playerId, registration_source: 'SELF' }),
    },
  );
  if (response.ok) return;

  let detail = { code: '', message: `Unable to complete signup (HTTP ${response.status})` };
  try {
    detail = normalizeSelfSignupError(
      parseApiErrorDetail((await response.json()) as ApiDetailPayload, detail.message),
    );
  } catch {
    // keep fallback message
  }
  if (detail.code === 'PLAYER_ALREADY_REGISTERED_IN_FORMAT') return;
  throw new Error(detail.message);
}

export default function TournamentSignupPage() {
  const params = useParams<{ tournamentId: string }>();
  const client = useMemo(
    () =>
      new LeagueOsApiClient({
        apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL,
      }),
    [],
  );
  const tournamentId = Number.parseInt(params?.tournamentId || '', 10);
  const [auth, setAuth] = useState<PlayerAuth | null>(null);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [formats, setFormats] = useState<TournamentFormatInstance[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<number | null>(null);
  const [playerLinkError, setPlayerLinkError] = useState<string | null>(null);
  const [registrationsByFormatId, setRegistrationsByFormatId] = useState<Record<number, FormatRegistrationRow[]>>({});
  const [signingFormatId, setSigningFormatId] = useState<number | null>(null);

  useEffect(() => {
    const stored = parsePlayerAuth(typeof window !== 'undefined' ? window.localStorage.getItem(PLAYER_STORAGE_AUTH) : null);
    setAuth(stored);
    setAuthHydrated(true);
  }, []);

  useEffect(() => {
    if (!Number.isInteger(tournamentId)) {
      setLoading(false);
      setError('Invalid tournament link.');
      return;
    }
    if (!authHydrated) {
      return;
    }
    if (!auth) {
      setLoading(false);
      setError('Please login to continue tournament signup.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setActionError(null);
    setSaved(null);
    void (async () => {
      try {
        const [tournaments, me, players] = await Promise.all([
          client.tournaments(auth.token, auth.clubId),
          client.profile(auth.token),
          client.players(auth.token, auth.clubId),
        ]);
        if (cancelled) return;
        const selected = tournaments.find((item) => item.id === tournamentId) || null;
        if (!selected) {
          setError('Tournament not found for your club access.');
          setTournament(null);
          setFormats([]);
          setRegistrationsByFormatId({});
          setLoading(false);
          return;
        }
        setTournament(selected);

        const linkedPlayerId = findUserPlayerId(me, players);
        setCurrentPlayerId(linkedPlayerId);
        setPlayerLinkError(linkedPlayerId ? null : 'Your account is not linked to an active player profile for this club.');

        const rows = await client.tournamentFormats(auth.token, auth.clubId, tournamentId);
        if (cancelled) return;
        setFormats(rows);
        const registrations = await Promise.all(
          rows.map(async (format) => [format.id, await listFormatRegistrations(auth.token, auth.clubId, tournamentId, format.id)] as const),
        );
        if (cancelled) return;
        setRegistrationsByFormatId(Object.fromEntries(registrations));
      } catch (loadError) {
        if (cancelled) return;
        const message = loadError instanceof Error ? loadError.message : 'Unable to load tournament signup details.';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth, authHydrated, client, tournamentId]);

  async function signupFormat(formatId: number) {
    if (!auth || !Number.isInteger(tournamentId) || !currentPlayerId) return;
    setSigningFormatId(formatId);
    setSaved(null);
    setActionError(null);
    try {
      await addSelfFormatRegistration(auth.token, auth.clubId, tournamentId, formatId, currentPlayerId);
      const refreshed = await listFormatRegistrations(auth.token, auth.clubId, tournamentId, formatId);
      setRegistrationsByFormatId((prev) => ({ ...prev, [formatId]: refreshed }));
      setSaved('Signup completed. Your name is now in the format pool.');
    } catch (signupError) {
      setActionError(signupError instanceof Error ? signupError.message : 'Unable to complete signup.');
    } finally {
      setSigningFormatId(null);
    }
  }

  const tournamentAllowsSignup = tournament ? isTournamentRegistrationOpen(tournament.status) : false;
  const signedFormatIds = useMemo(
    () => signedFormatIdsFromRegistrations(currentPlayerId, registrationsByFormatId),
    [currentPlayerId, registrationsByFormatId],
  );
  const visibleFormats = useMemo<FormatViewModel[]>(
    () =>
      formats
        .map((format) => ({ format, status: formatLifecycleStatus(format) }))
        .filter((item) => item.status !== 'DRAFT' && item.status !== 'CANCELLED'),
    [formats],
  );

  function setPlayerTab(tab: PlayerTab) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(PLAYER_TAB_STORAGE_KEY, tab);
    } catch {
      // ignore storage errors
    }
  }

  return (
    <main style={page}>
      <section style={panel}>
        {loading ? <p style={{ margin: 0 }}>Loading tournament...</p> : null}
        {!loading && error ? (
          <div>
            <p style={{ margin: 0, color: '#b42318', fontWeight: 700 }}>{error}</p>
            <p style={{ margin: '6px 0 0', color: '#5a6b7a' }}>
              If you are not logged in, sign in on the home page and reopen this link.
            </p>
          </div>
        ) : null}

        {!loading && !error && tournament ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <h2 style={{ margin: 0, fontSize: 30, lineHeight: 1.05 }}>{tournament.name}</h2>
                <div style={{ color: '#475569', fontSize: 13, display: 'grid', gap: 2 }}>
                  <div>Start: {fmtDateTime(tournament.schedule_start_at)}</div>
                  <div>End: {fmtDateTime(tournamentEndAt(tournament))}</div>
                </div>
              </div>
              <Link
                href="/"
                onClick={() => setPlayerTab('tournaments')}
                style={ghostBtn}
              >
                Back
              </Link>
            </div>
            <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={statusPill(tournament.status)}>{lifecycleLabel(tournament.status)}</span>
                <span style={{ color: '#57697b', fontSize: 13 }}>{tournament.timezone}</span>
                {!tournamentAllowsSignup ? (
                  <span style={closedPill}>Tournament registration is not open</span>
                ) : null}
              </div>
            </div>
            {saved ? <div style={savedNote}>{saved}</div> : null}
            {actionError ? <div style={errorNote}>{actionError}</div> : null}
            {playerLinkError ? <div style={warningNote}>{playerLinkError}</div> : null}
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              {visibleFormats.length ? (
                visibleFormats.map(({ format, status }) => {
                  const windowOpen = isRegistrationOpen(format);
                  const formatOpenForSignup = status === 'REGISTRATION_OPEN' && windowOpen;
                  const poolRows = (registrationsByFormatId[format.id] ?? []).filter((entry) => entry.status === 'ACTIVE');
                  const disabled = !tournamentAllowsSignup
                    || !formatOpenForSignup
                    || Boolean(signedFormatIds[format.id])
                    || signingFormatId === format.id
                    || !currentPlayerId;
                  return (
                    <article key={format.id} style={formatCard}>
                      <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ display: 'grid', gap: 3 }}>
                            <strong style={{ fontSize: 18 }}>{format.name}</strong>
                            <div style={{ color: '#5a6b7a', fontSize: 13 }}>
                              {lifecycleLabel(format.format_type)} · Opens {fmtDateTime(format.registration_open_at)} · Closes {fmtDateTime(format.registration_close_at)}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={statusPill(status)}>{lifecycleLabel(status)}</span>
                            <button
                              style={disabled ? btnDisabled : btnPrimary}
                              disabled={disabled}
                              title={
                                !currentPlayerId
                                  ? 'Your account needs a linked player profile before it can sign up.'
                                  : !tournamentAllowsSignup
                                    ? 'Tournament registration must be open.'
                                    : !formatOpenForSignup
                                      ? 'Format registration is not open.'
                                      : undefined
                              }
                              onClick={() => signupFormat(format.id)}
                            >
                              {signedFormatIds[format.id] ? 'Signed Up' : signingFormatId === format.id ? 'Saving...' : 'Sign Up'}
                            </button>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#607284' }}>
                              Format Pool
                            </strong>
                            <span style={poolCountPill}>{poolRows.length} entrant{poolRows.length === 1 ? '' : 's'}</span>
                          </div>
                          {poolRows.length ? (
                            <div style={poolChipRow}>
                              {poolRows.map((entry) => (
                                <span
                                  key={entry.id}
                                  style={entry.player_id === currentPlayerId ? poolChipActive : poolChip}
                                >
                                  {entry.player_name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div style={poolEmpty}>Pool is empty.</div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <p style={{ margin: 0, color: '#607284' }}>Registration not open yet.</p>
              )}
            </div>
          </>
        ) : null}
      </section>

      <nav style={bottomNav}>
        <BottomNavLink href="/" active={false} onClick={() => setPlayerTab('home')} label="Home" icon={<HomeIcon active={false} />} />
        <BottomNavLink href="/" active={false} onClick={() => setPlayerTab('leaderboard')} label="Leaderboard" icon={<TrophyIcon active={false} />} />
        <BottomNavLink href="/" active onClick={() => setPlayerTab('tournaments')} label="Tournaments" icon={<TicketIcon active />} />
        <BottomNavLink href="/" active={false} onClick={() => setPlayerTab('inbox')} label="Inbox" icon={<BellIcon active={false} />} />
      </nav>
    </main>
  );
}

function BottomNavLink({
  href,
  active,
  onClick,
  label,
  icon,
}: {
  href: string;
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Link href={href} onClick={onClick} style={active ? bottomTabActive : bottomTab}>
      <span style={active ? bottomIconShellActive : bottomIconShell}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function NavGlyph({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? '#7dd3fc' : 'rgba(255,255,255,0.82)'}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <NavGlyph active={active}>
      <path d="M3.5 11.5 12 4l8.5 7.5" />
      <path d="M6.5 10.5V20h11v-9.5" />
      <path d="M10 20v-5h4v5" />
    </NavGlyph>
  );
}

function TrophyIcon({ active }: { active: boolean }) {
  return (
    <NavGlyph active={active}>
      <path d="M8 5h8v3a4 4 0 0 1-8 0V5Z" />
      <path d="M9 16h6" />
      <path d="M12 12v4" />
      <path d="M7 6H5a2 2 0 0 0 2 3" />
      <path d="M17 6h2a2 2 0 0 1-2 3" />
      <path d="M9 20h6" />
    </NavGlyph>
  );
}

function TicketIcon({ active }: { active: boolean }) {
  return (
    <NavGlyph active={active}>
      <path d="M5 8.5A2.5 2.5 0 0 0 5 13.5v2.5a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 16v-2.5a2.5 2.5 0 0 1 0-5V6a1.5 1.5 0 0 0-1.5-1.5h-11A1.5 1.5 0 0 0 5 6v2.5Z" />
      <path d="M12 4.5v13" strokeDasharray="2.4 2.4" />
    </NavGlyph>
  );
}

function BellIcon({ active }: { active: boolean }) {
  return (
    <NavGlyph active={active}>
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
      <path d="M6 16h12l-1.3-1.8a5.8 5.8 0 0 1-1.1-3.4V9.7a3.6 3.6 0 0 0-7.2 0v1.1a5.8 5.8 0 0 1-1.1 3.4L6 16Z" />
    </NavGlyph>
  );
}

const page: CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at 12% 10%, #dceaf8 0%, rgba(220,234,248,0) 30%), radial-gradient(circle at 90% 16%, #f4ebd8 0%, rgba(244,235,216,0) 28%), linear-gradient(145deg, #f3f6f9 0%, #eef2f6 100%)',
  padding: 16,
  paddingBottom: 'calc(112px + env(safe-area-inset-bottom, 0px))',
  color: '#132033',
};

const panel: CSSProperties = {
  maxWidth: 1040,
  margin: '0 auto',
  border: '1px solid #d0dae5',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.92)',
  padding: 12,
  display: 'grid',
  gap: 10,
};

const formatCard: CSSProperties = {
  border: '1px solid #d8e1ec',
  borderRadius: 10,
  background: '#f9fbfe',
  padding: 11,
};

const pill: CSSProperties = {
  border: '1px solid',
  borderRadius: 999,
  padding: '3px 9px',
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: '0.01em',
  textTransform: 'capitalize',
};

const closedPill: CSSProperties = {
  ...pill,
  color: '#915214',
  borderColor: '#efcd96',
  background: '#fff5e5',
};

const btnPrimary: CSSProperties = {
  border: 0,
  borderRadius: 8,
  background: 'linear-gradient(95deg, #0e8f6f, #14a07a)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 13,
  padding: '8px 11px',
  cursor: 'pointer',
};

const btnDisabled: CSSProperties = {
  border: '1px solid #d2dbe5',
  borderRadius: 8,
  background: '#e5ebf2',
  color: '#6c7d8e',
  fontWeight: 700,
  fontSize: 13,
  padding: '8px 11px',
  cursor: 'not-allowed',
};

const ghostBtn: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  background: '#fff',
  color: '#1f3348',
  padding: '7px 10px',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 13,
};

const savedNote: CSSProperties = {
  border: '1px solid #afdbc4',
  borderRadius: 10,
  background: '#ebf8f1',
  color: '#0f6b4e',
  fontWeight: 700,
  padding: '8px 10px',
  fontSize: 13,
};

const warningNote: CSSProperties = {
  border: '1px solid #efcd96',
  borderRadius: 10,
  background: '#fff5e5',
  color: '#915214',
  fontWeight: 700,
  padding: '8px 10px',
  fontSize: 13,
};

const errorNote: CSSProperties = {
  border: '1px solid #efb6b2',
  borderRadius: 10,
  background: '#feeceb',
  color: '#b42318',
  fontWeight: 700,
  padding: '8px 10px',
  fontSize: 13,
};

const bottomNav: CSSProperties = {
  position: 'fixed',
  bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(520px, calc(100% - 24px))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 30,
  background: 'rgba(15, 23, 42, 0.92)',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.28)',
  backdropFilter: 'blur(18px)',
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  padding: 8,
  zIndex: 90,
};

const bottomTab: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  textDecoration: 'none',
  color: 'rgba(255,255,255,0.76)',
  fontWeight: 600,
  fontSize: 12,
  padding: '8px 6px',
  borderRadius: 22,
  transition: 'background 140ms ease, color 140ms ease, transform 140ms ease',
};

const bottomTabActive: CSSProperties = {
  ...bottomTab,
  color: '#e0f2fe',
  background: 'linear-gradient(180deg, rgba(37, 99, 235, 0.28), rgba(30, 41, 59, 0.42))',
  transform: 'translateY(-1px)',
};

const bottomIconShell: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 17,
  display: 'grid',
  placeItems: 'center',
};

const bottomIconShellActive: CSSProperties = {
  ...bottomIconShell,
  background: 'rgba(125, 211, 252, 0.12)',
  boxShadow: 'inset 0 0 0 1px rgba(125, 211, 252, 0.1)',
};

const poolChipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const poolChip: CSSProperties = {
  borderRadius: 999,
  border: '1px solid #d2dbe5',
  background: '#fff',
  color: '#334155',
  padding: '6px 10px',
  fontSize: 12,
  fontWeight: 600,
};

const poolChipActive: CSSProperties = {
  ...poolChip,
  borderColor: '#75d8c1',
  background: '#e7f8ef',
  color: '#0f6b4e',
};

const poolCountPill: CSSProperties = {
  borderRadius: 999,
  background: '#e2e8f0',
  color: '#475569',
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 700,
};

const poolEmpty: CSSProperties = {
  borderRadius: 12,
  border: '1px dashed #cbd5e1',
  background: '#f8fafc',
  color: '#64748b',
  padding: '10px 12px',
  fontSize: 12,
};
