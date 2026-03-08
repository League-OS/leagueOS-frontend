import { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LeagueOsApiClient } from '@leagueos/api';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import type { Game, GameParticipant, LeaderboardEntry, Profile, Season, Session } from '@leagueos/schemas';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';

const TEAL = '#0d9488';
const TEAL_DARK = '#0f766e';
const TEAL_LIGHT = '#ccfbf1';
const BG = '#f8fafc';

type AuthState = { token: string; clubId: number };
type Tab = 'home' | 'leaderboard' | 'profile';

export default function App() {
  const client = useMemo(() => new LeagueOsApiClient({ apiBaseUrl: API_BASE }), []);

  const [hydrating, setHydrating] = useState(true);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [recentGames, setRecentGames] = useState<Game[]>([]);
  const [participantsByGame, setParticipantsByGame] = useState<Record<number, GameParticipant[]>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [seasonModal, setSeasonModal] = useState(false);

  // Auto-restore session from SecureStore on startup
  useEffect(() => {
    async function restoreSession() {
      try {
        const [storedToken, storedClub] = await Promise.all([
          SecureStore.getItemAsync('leagueos_token'),
          SecureStore.getItemAsync('leagueos_club'),
        ]);
        if (storedToken && storedClub) {
          const clubId = parseInt(storedClub, 10);
          const nextAuth = { token: storedToken, clubId };
          setAuth(nextAuth);
          await loadDashboard(storedToken, clubId);
        }
      } catch {
        // session expired or invalid — fall through to login
      } finally {
        setHydrating(false);
      }
    }
    void restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboard(
    token: string,
    clubId: number,
    seasonId?: number,
    opts?: { silent?: boolean },
  ) {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const [meRes, seasonsRes] = await Promise.allSettled([
        client.profile(token),
        client.seasons(token, clubId),
      ]);

      if (meRes.status === 'fulfilled') setProfile(meRes.value);
      else throw meRes.reason as Error;

      if (seasonsRes.status !== 'fulfilled') throw seasonsRes.reason as Error;
      const seasonList = seasonsRes.value;
      setSeasons(seasonList);

      const seasonToLoad = seasonId ?? selectedSeasonId ?? seasonList[0]?.id;
      if (!seasonToLoad) {
        setSelectedSeasonId(null);
        setSelectedSession(null);
        setLeaderboard([]);
        setRecentGames([]);
        setSessions([]);
        return;
      }

      setSelectedSeasonId(seasonToLoad);

      const [boardData, sessionsData, gamesData] = await Promise.allSettled([
        client.seasonLeaderboard(token, clubId, seasonToLoad),
        client.sessions(token, clubId, seasonToLoad),
        client.games(token, clubId, undefined, undefined, undefined, true),
      ]);

      if (boardData.status === 'fulfilled') {
        setSelectedSession(boardData.value.session);
        setLeaderboard(boardData.value.leaderboard);
      }

      const sessionIdSet = new Set<number>();
      if (sessionsData.status === 'fulfilled') {
        setSessions(sessionsData.value);
        sessionsData.value.forEach((s) => sessionIdSet.add(s.id));
      }

      if (gamesData.status === 'fulfilled') {
        const allGames = gamesData.value;
        const seasonGames = allGames.filter((g) => sessionIdSet.has(g.session_id));
        setRecentGames([...seasonGames].sort((a, b) => b.id - a.id).slice(0, 20));
        const map: Record<number, GameParticipant[]> = {};
        for (const g of allGames) {
          if (g.participants) map[g.id] = g.participants;
        }
        setParticipantsByGame(map);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function login() {
    setLoading(true);
    setError(null);
    try {
      const res = await client.login({ email, password });
      const clubId = res.club_id ?? DEFAULT_CLUB_ID;
      const scoped = res.club_id === clubId ? res : await client.switchClub(res.token, clubId);
      const nextAuth: AuthState = { token: scoped.token, clubId };
      setAuth(nextAuth);
      await SecureStore.setItemAsync('leagueos_token', scoped.token);
      await SecureStore.setItemAsync('leagueos_club', String(clubId));
      await loadDashboard(nextAuth.token, nextAuth.clubId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await Promise.all([
      SecureStore.deleteItemAsync('leagueos_token'),
      SecureStore.deleteItemAsync('leagueos_club'),
    ]);
    setAuth(null);
    setProfile(null);
    setSeasons([]);
    setSessions([]);
    setSelectedSeasonId(null);
    setSelectedSession(null);
    setLeaderboard([]);
    setRecentGames([]);
    setParticipantsByGame({});
    setError(null);
    setEmail('');
    setPassword('');
    setTab('home');
  }

  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId) ?? null;

  // ── Splash ──
  if (hydrating) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.center]}>
        <StatusBar style="dark" />
        <Text style={styles.splashTitle}>LeagueOS</Text>
        <ActivityIndicator color={TEAL} size="large" style={{ marginTop: 16 }} />
      </SafeAreaView>
    );
  }

  // ── Login ──
  if (!auth) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.loginContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.appTitle}>LeagueOS</Text>
          <Text style={styles.loginSubtitle}>Sign in to your account</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            placeholderTextColor="#9ca3af"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#9ca3af"
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={() => void login()}
            disabled={loading}
          >
            <Text style={styles.primaryBtnText}>{loading ? 'Signing in…' : 'Sign In'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main App ──
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>LeagueOS</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {selectedSeason?.name ?? 'No season'}
          </Text>
        </View>
        <Pressable style={styles.seasonBtn} onPress={() => setSeasonModal(true)}>
          <Text style={styles.seasonBtnText}>▼ Season</Text>
        </Pressable>
      </View>

      {/* Loading bar */}
      {loading && !refreshing ? (
        <ActivityIndicator color={TEAL} style={{ marginVertical: 6 }} />
      ) : null}
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      {/* Tabs */}
      {tab === 'home' && (
        <HomeTab
          sessions={sessions}
          recentGames={recentGames}
          participantsByGame={participantsByGame}
          leaderboard={leaderboard}
          refreshing={refreshing}
          onRefresh={() => {
            if (!auth) return;
            setRefreshing(true);
            void loadDashboard(auth.token, auth.clubId, selectedSeasonId ?? undefined, {
              silent: true,
            });
          }}
        />
      )}
      {tab === 'leaderboard' && (
        <LeaderboardTab
          leaderboard={leaderboard}
          selectedSession={selectedSession}
          refreshing={refreshing}
          onRefresh={() => {
            if (!auth) return;
            setRefreshing(true);
            void loadDashboard(auth.token, auth.clubId, selectedSeasonId ?? undefined, {
              silent: true,
            });
          }}
        />
      )}
      {tab === 'profile' && (
        <ProfileTab profile={profile} onLogout={() => void logout()} />
      )}

      {/* Bottom tab bar */}
      <View style={styles.tabBar}>
        {(
          [
            ['home', '🏠', 'Home'],
            ['leaderboard', '🏆', 'Rankings'],
            ['profile', '👤', 'Profile'],
          ] as [Tab, string, string][]
        ).map(([key, icon, label]) => (
          <Pressable key={key} style={styles.tabItem} onPress={() => setTab(key)}>
            <Text style={{ fontSize: 22 }}>{icon}</Text>
            <Text style={[styles.tabLabel, tab === key && styles.tabLabelActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Season picker modal */}
      <Modal visible={seasonModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose Season</Text>
            <ScrollView>
              {seasons.map((s) => (
                <Pressable
                  key={s.id}
                  style={[
                    styles.modalItem,
                    s.id === selectedSeasonId && styles.modalItemActive,
                  ]}
                  onPress={() => {
                    setSeasonModal(false);
                    if (!auth) return;
                    void loadDashboard(auth.token, auth.clubId, s.id);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      s.id === selectedSeasonId && styles.modalItemTextActive,
                    ]}
                  >
                    {s.name}
                  </Text>
                  {s.id === selectedSeasonId ? (
                    <Text style={{ color: TEAL, fontWeight: '700' }}>✓</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.outlineBtn} onPress={() => setSeasonModal(false)}>
              <Text style={styles.outlineBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────
// Home tab
// ────────────────────────────────────────────────────────────

function HomeTab({
  sessions,
  recentGames,
  participantsByGame,
  leaderboard,
  refreshing,
  onRefresh,
}: {
  sessions: Session[];
  recentGames: Game[];
  participantsByGame: Record<number, GameParticipant[]>;
  leaderboard: LeaderboardEntry[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const activeSession =
    sessions.find((s) => s.status === 'OPEN') ??
    sessions.sort((a, b) => b.id - a.id)[0] ??
    null;
  const topThree = leaderboard.slice(0, 3);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 90, paddingTop: 4 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />
      }
    >
      {/* Active session card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>CURRENT SESSION</Text>
        {activeSession ? (
          <>
            <Text style={styles.cardValue}>
              {activeSession.location || `Session ${activeSession.id}`}
            </Text>
            <View style={styles.rowBetween}>
              <Text style={styles.metaText}>{activeSession.session_date}</Text>
              <StatusBadge status={activeSession.status} />
            </View>
          </>
        ) : (
          <Text style={styles.emptyText}>No active session</Text>
        )}
      </View>

      {/* Top 3 */}
      {topThree.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>TOP PLAYERS</Text>
          {topThree.map((row, i) => (
            <View key={row.player_id} style={styles.podiumRow}>
              <Text style={{ fontSize: 22, width: 36 }}>{['🥇', '🥈', '🥉'][i]}</Text>
              <Text style={[styles.podiumName, { flex: 1 }]} numberOfLines={1}>
                {row.display_name}
              </Text>
              <Text
                style={[
                  styles.podiumDelta,
                  row.season_elo_delta >= 0 ? styles.good : styles.bad,
                ]}
              >
                {row.season_elo_delta >= 0 ? '+' : ''}
                {row.season_elo_delta}
              </Text>
              <Text style={styles.podiumPts}>{row.total_points} pts</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Recent matches */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>RECENT MATCHES</Text>
        {recentGames.length === 0 ? (
          <Text style={styles.emptyText}>No matches recorded yet</Text>
        ) : (
          recentGames.slice(0, 12).map((game) => {
            const participants = participantsByGame[game.id] ?? [];
            const sideA = participants
              .filter((p) => p.side === 'A')
              .map((p) => p.display_name)
              .join(' & ');
            const sideB = participants
              .filter((p) => p.side === 'B')
              .map((p) => p.display_name)
              .join(' & ');
            return (
              <View key={game.id} style={styles.matchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchTeam} numberOfLines={1}>
                    {sideA || '—'}
                  </Text>
                  <Text style={styles.matchVs}>vs</Text>
                  <Text style={styles.matchTeam} numberOfLines={1}>
                    {sideB || '—'}
                  </Text>
                </View>
                <View style={styles.scoreBox}>
                  <Text style={styles.scoreNum}>{game.score_a ?? '–'}</Text>
                  <Text style={styles.scoreSep}>–</Text>
                  <Text style={styles.scoreNum}>{game.score_b ?? '–'}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

// ────────────────────────────────────────────────────────────
// Leaderboard tab
// ────────────────────────────────────────────────────────────

function LeaderboardTab({
  leaderboard,
  selectedSession,
  refreshing,
  onRefresh,
}: {
  leaderboard: LeaderboardEntry[];
  selectedSession: Session | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 90, paddingTop: 4 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />
      }
    >
      {selectedSession ? (
        <View style={[styles.card, styles.rowBetween]}>
          <Text style={styles.metaText} numberOfLines={1}>
            {selectedSession.location || `Session ${selectedSession.id}`}
          </Text>
          <StatusBadge status={selectedSession.status} />
        </View>
      ) : null}

      <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
        <View style={styles.tableHead}>
          <Text style={styles.th}>#</Text>
          <Text style={[styles.th, { flex: 1 }]}>Player</Text>
          <Text style={styles.th}>Δ ELO</Text>
          <Text style={styles.th}>W</Text>
          <Text style={styles.th}>Pts</Text>
        </View>
        {leaderboard.map((row, i) => (
          <View
            key={row.player_id}
            style={[styles.tableRow, i % 2 === 0 ? styles.rowEven : null]}
          >
            <Text style={styles.td}>{i + 1}</Text>
            <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>
              {row.display_name}
            </Text>
            <Text
              style={[styles.td, row.season_elo_delta >= 0 ? styles.good : styles.bad]}
            >
              {row.season_elo_delta >= 0 ? '+' : ''}
              {row.season_elo_delta}
            </Text>
            <Text style={styles.td}>{row.matches_won}</Text>
            <Text style={styles.td}>{row.total_points}</Text>
          </View>
        ))}
        {leaderboard.length === 0 ? (
          <Text style={[styles.emptyText, { padding: 20, textAlign: 'center' }]}>
            No leaderboard data yet
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

// ────────────────────────────────────────────────────────────
// Profile tab
// ────────────────────────────────────────────────────────────

function ProfileTab({
  profile,
  onLogout,
}: {
  profile: Profile | null;
  onLogout: () => void;
}) {
  if (!profile) {
    return <ActivityIndicator style={{ marginTop: 40 }} color={TEAL} />;
  }

  const initials = (profile.display_name ?? profile.email)
    .trim()
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 90, paddingTop: 4 }}
    >
      {/* Avatar + name */}
      <View style={styles.card}>
        <View style={styles.avatarRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName} numberOfLines={1}>
              {profile.display_name ?? profile.full_name ?? profile.email}
            </Text>
            <Text style={styles.profileEmail} numberOfLines={1}>
              {profile.email}
            </Text>
            {profile.club_role ? (
              <View style={[styles.badge, styles.badgeTeal, { alignSelf: 'flex-start', marginTop: 6 }]}>
                <Text style={[styles.badgeText, { color: TEAL_DARK }]}>
                  {profile.club_role}
                </Text>
              </View>
            ) : (
              <View style={[styles.badge, styles.badgeGray, { alignSelf: 'flex-start', marginTop: 6 }]}>
                <Text style={styles.badgeText}>{profile.role}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Account info */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>ACCOUNT</Text>
        <InfoRow label="Email" value={profile.email} />
        {profile.full_name ? <InfoRow label="Full Name" value={profile.full_name} /> : null}
        {profile.club_id ? (
          <InfoRow label="Club ID" value={String(profile.club_id)} />
        ) : null}
      </View>

      {/* Sign out */}
      <Pressable
        style={[styles.primaryBtn, { margin: 12, marginTop: 16, backgroundColor: '#dc2626' }]}
        onPress={onLogout}
      >
        <Text style={styles.primaryBtnText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

// ────────────────────────────────────────────────────────────
// Small reusable components
// ────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isGreen = status === 'OPEN' || status === 'FINALIZED';
  return (
    <View style={[styles.badge, isGreen ? styles.badgeGreen : styles.badgeGray]}>
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  center: { justifyContent: 'center', alignItems: 'center' },

  // Splash
  splashTitle: { fontSize: 36, fontWeight: '900', color: TEAL },

  // Login
  loginContainer: {
    margin: 20,
    marginTop: 60,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  appTitle: { fontSize: 34, fontWeight: '900', color: TEAL, marginBottom: 4 },
  loginSubtitle: { color: '#6b7280', marginBottom: 24, fontSize: 15 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 12,
    backgroundColor: '#fff',
    fontSize: 15,
    color: '#111827',
  },
  primaryBtn: {
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.55 },

  // Header
  header: {
    backgroundColor: TEAL,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub: { color: '#ccfbf1', fontSize: 13 },
  seasonBtn: {
    borderWidth: 1,
    borderColor: '#99f6e4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  seasonBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  // Error
  errorText: { color: '#ef4444', marginBottom: 10, fontSize: 13 },
  errorBanner: {
    color: '#ef4444',
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#fef2f2',
    fontSize: 13,
  },

  // Bottom tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingBottom: 10,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', paddingTop: 10 },
  tabLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  tabLabelActive: { color: TEAL, fontWeight: '700' },

  // Card
  card: {
    margin: 12,
    marginBottom: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 1,
    marginBottom: 8,
  },
  cardValue: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { color: '#6b7280', fontSize: 12, flex: 1, marginRight: 8 },
  emptyText: { color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },

  // Status badge
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeGreen: { backgroundColor: '#dcfce7' },
  badgeGray: { backgroundColor: '#f3f4f6' },
  badgeTeal: { backgroundColor: TEAL_LIGHT },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#374151' },

  // Podium (top 3)
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  podiumName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  podiumDelta: { fontWeight: '700', fontSize: 14, minWidth: 48, textAlign: 'right' },
  podiumPts: { fontSize: 12, color: '#6b7280', minWidth: 52, textAlign: 'right' },

  // Matches
  matchRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    alignItems: 'center',
  },
  matchTeam: { fontSize: 13, color: '#111827', fontWeight: '500' },
  matchVs: { fontSize: 11, color: '#9ca3af', marginVertical: 1 },
  scoreBox: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8 },
  scoreNum: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    minWidth: 24,
    textAlign: 'center',
  },
  scoreSep: { color: '#d1d5db', fontSize: 16 },

  // Leaderboard table
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  th: {
    width: 50,
    fontSize: 10,
    color: '#6b7280',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowEven: { backgroundColor: '#fafafa' },
  td: { width: 50, color: '#111827', fontSize: 13 },
  good: { color: '#16a34a', fontWeight: '700' },
  bad: { color: '#ef4444', fontWeight: '700' },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '75%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalItemActive: { backgroundColor: '#f0fdf9' },
  modalItemText: { fontSize: 15, color: '#111827' },
  modalItemTextActive: { color: TEAL, fontWeight: '700' },
  outlineBtn: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  outlineBtnText: { color: '#374151', fontWeight: '600', fontSize: 15 },

  // Profile
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: TEAL_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '800', color: TEAL_DARK },
  profileName: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  profileEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: { color: '#6b7280', fontSize: 14 },
  infoValue: { color: '#0f172a', fontWeight: '600', fontSize: 14, maxWidth: '60%' },
});
