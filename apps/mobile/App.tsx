import { useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LeagueOsApiClient } from '@leagueos/api';
import { DEFAULT_CLUB_ID, SEEDED_USERS } from '@leagueos/config';
import type { Club, LeaderboardEntry, Profile, Season, Session } from '@leagueos/schemas';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';

type AuthState = { token: string; clubId: number };

export default function App() {
  const client = useMemo(() => new LeagueOsApiClient({ apiBaseUrl: API_BASE }), []);

  const [auth, setAuth] = useState<AuthState | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedClubId, setSelectedClubId] = useState(DEFAULT_CLUB_ID);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState(SEEDED_USERS.clubAdmin.email);
  const [password, setPassword] = useState(SEEDED_USERS.clubAdmin.password);
  const [clubIdInput, setClubIdInput] = useState(String(DEFAULT_CLUB_ID));

  const [seasonModal, setSeasonModal] = useState(false);

  async function loadDashboard(token: string, clubId: number, seasonId?: number) {
    setLoading(true);
    setError(null);
    try {
      const [meRes, seasonsRes] = await Promise.allSettled([
        client.profile(token),
        client.seasons(token, clubId),
      ]);

      if (meRes.status === 'fulfilled') {
        setProfile(meRes.value);
      } else {
        throw meRes.reason;
      }

      // /clubs is global-admin scoped in this backend; keep selected club as local context.
      setClubs([{ id: clubId, name: `Club ${clubId}`, created_at: new Date().toISOString() }]);

      if (seasonsRes.status === 'fulfilled') {
        setSeasons(seasonsRes.value);
      } else {
        throw seasonsRes.reason;
      }

      const seasonList = seasonsRes.value;

      const seasonToLoad = seasonId ?? seasonList[0]?.id;
      if (!seasonToLoad) {
        setSelectedSeasonId(null);
        setSelectedSession(null);
        setLeaderboard([]);
        return;
      }

      setSelectedSeasonId(seasonToLoad);
      const data = await client.seasonLeaderboard(token, clubId, seasonToLoad);
      setSelectedSession(data.session);
      setLeaderboard(data.leaderboard);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    setLoading(true);
    setError(null);
    try {
      const requestedClubId = Number(clubIdInput);
      const res = await client.login({ email, password });
      const clubId = res.club_id ?? requestedClubId;
      const scoped = res.club_id === clubId ? res : await client.switchClub(res.token, clubId);
      const nextAuth = { token: scoped.token, clubId };
      setAuth(nextAuth);
      setSelectedClubId(clubId);
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
    await SecureStore.deleteItemAsync('leagueos_token');
    await SecureStore.deleteItemAsync('leagueos_club');
    setAuth(null);
    setProfile(null);
    setClubs([]);
    setSeasons([]);
    setSelectedSeasonId(null);
    setSelectedSession(null);
    setLeaderboard([]);
    setError(null);
  }

  async function onSeasonSelect(seasonId: number) {
    if (!auth) return;
    setSeasonModal(false);
    setSelectedSeasonId(seasonId);
    await loadDashboard(auth.token, auth.clubId, seasonId);
  }

  if (!auth) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.loginCard}>
          <Text style={styles.title}>LeagueOS Mobile</Text>
          <Text style={styles.subtitle}>Sign in to view leaderboard</Text>

          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={clubIdInput}
            onChangeText={setClubIdInput}
            placeholder="Club ID"
            keyboardType="number-pad"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={styles.primaryBtn} onPress={login} disabled={loading}>
            <Text style={styles.primaryBtnText}>{loading ? 'Signing in...' : 'Sign in'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Season Leaderboard</Text>
          <Text style={styles.headerSub}>{profile?.display_name || profile?.email}</Text>
        </View>
        <Pressable style={styles.ghostBtn} onPress={logout}>
          <Text style={styles.ghostBtnText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <Text style={styles.label}>Club</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {clubs.map((club) => (
            <Pressable
              key={club.id}
              onPress={async () => {
                if (!auth) return;
                const scoped = await client.switchClub(auth.token, club.id);
                setSelectedClubId(club.id);
                const nextAuth = { token: scoped.token, clubId: club.id };
                setAuth(nextAuth);
                await SecureStore.setItemAsync('leagueos_token', scoped.token);
                await SecureStore.setItemAsync('leagueos_club', String(club.id));
                await loadDashboard(nextAuth.token, club.id);
              }}
              style={[styles.pill, selectedClubId === club.id && styles.pillActive]}
            >
              <Text style={[styles.pillText, selectedClubId === club.id && styles.pillTextActive]}>{club.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>Season</Text>
        <Pressable style={styles.selectBtn} onPress={() => setSeasonModal(true)}>
          <Text style={styles.selectText}>{seasons.find((s) => s.id === selectedSeasonId)?.name ?? 'Select season'}</Text>
        </Pressable>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          Session: {selectedSession ? `${selectedSession.session_date} (${selectedSession.status})` : 'No session found'}
        </Text>
        <Pressable
          style={styles.outlineBtn}
          onPress={async () => {
            if (!auth) return;
            await loadDashboard(auth.token, auth.clubId, selectedSeasonId ?? undefined);
          }}
        >
          <Text>Refresh</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView style={styles.tableWrap}>
        <View style={styles.tableHead}>
          <Text style={styles.headCell}>#</Text>
          <Text style={[styles.headCell, { flex: 1 }]}>Player</Text>
          <Text style={styles.headCell}>Delta</Text>
          <Text style={styles.headCell}>Won</Text>
          <Text style={styles.headCell}>Points</Text>
        </View>

        {leaderboard.map((row, i) => (
          <View key={row.player_id} style={styles.row}>
            <Text style={styles.cell}>{i + 1}</Text>
            <Text style={[styles.cell, { flex: 1 }]}>{row.display_name}</Text>
            <Text style={[styles.cell, row.season_elo_delta >= 0 ? styles.good : styles.bad]}>
              {row.season_elo_delta >= 0 ? '+' : ''}
              {row.season_elo_delta}
            </Text>
            <Text style={styles.cell}>{row.matches_won}</Text>
            <Text style={styles.cell}>{row.total_points}</Text>
          </View>
        ))}
      </ScrollView>

      <Modal visible={seasonModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.title, { fontSize: 18 }]}>Choose Season</Text>
            <ScrollView>
              {seasons.map((season) => (
                <Pressable key={season.id} style={styles.modalItem} onPress={() => void onSeasonSelect(season.id)}>
                  <Text>{season.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={[styles.outlineBtn, { marginTop: 10 }]} onPress={() => setSeasonModal(false)}>
              <Text>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f7fa' },
  loginCard: {
    margin: 16,
    marginTop: 40,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 6 },
  subtitle: { color: '#6b7280', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  primaryBtn: {
    backgroundColor: '#0d9488',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  header: {
    backgroundColor: '#0d9488',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#d1fae5' },
  ghostBtn: {
    borderWidth: 1,
    borderColor: '#99f6e4',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  ghostBtnText: { color: '#fff' },
  filters: { padding: 12, gap: 8 },
  label: { fontWeight: '600', color: '#374151' },
  pill: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  pillActive: { backgroundColor: '#ccfbf1', borderColor: '#2dd4bf' },
  pillText: { color: '#374151' },
  pillTextActive: { color: '#0f766e', fontWeight: '700' },
  selectBtn: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  selectText: { color: '#111827' },
  metaRow: {
    paddingHorizontal: 12,
    paddingBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: { color: '#6b7280', fontSize: 12, flex: 1, marginRight: 8 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  tableWrap: { marginHorizontal: 12, marginTop: 8, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  headCell: { width: 60, fontSize: 12, color: '#6b7280', fontWeight: '700' },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  cell: { width: 60, color: '#111827' },
  good: { color: '#16a34a', fontWeight: '700' },
  bad: { color: '#ef4444', fontWeight: '700' },
  error: { color: '#ef4444', marginTop: 6 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 14,
    maxHeight: '72%',
  },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
});
