'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import styles from './TournamentVenueDisplayView.module.css';
import {
  COMPLETED_STATUSES,
  LIVE_STATUSES,
  UPCOMING_STATUSES,
  featuredMatches,
  formatClock,
  formatTournamentDate,
  matchStatusLabel,
  scoreValue,
  stageLabel,
  useTournamentPublicPayload,
  type DecoratedMatch,
  type PublicMatch,
} from './publicTournamentViews';

type StandingsRow = {
  name: string;
  pts: number;
  diff: number;
  played: number;
};

const ROTATE_MS = 8000;
const SLIDE_NAMES = ['Live Matches', 'Coming Up', 'Bracket', 'Standings'];

function isKnockoutMatch(match: PublicMatch): boolean {
  const stage = String(match.stage_code || '').toUpperCase();
  return stage.includes('KO') || stage.includes('FINAL');
}

function buildGroupStandings(matches: DecoratedMatch[]): Array<{ groupCode: string; rows: StandingsRow[] }> {
  const grouped = new Map<string, Map<string, StandingsRow>>();

  matches
    .filter((entry) => Boolean(entry.match.group_code))
    .filter((entry) => COMPLETED_STATUSES.has(entry.match.status))
    .forEach((entry) => {
      const groupCode = entry.match.group_code || 'Group';
      const group = grouped.get(groupCode) ?? new Map<string, StandingsRow>();
      grouped.set(groupCode, group);

      const homeScore = scoreValue(entry.match.score_json?.score_a) ?? 0;
      const awayScore = scoreValue(entry.match.score_json?.score_b) ?? 0;

      const home = group.get(entry.homeLabel) ?? { name: entry.homeLabel, pts: 0, diff: 0, played: 0 };
      const away = group.get(entry.awayLabel) ?? { name: entry.awayLabel, pts: 0, diff: 0, played: 0 };

      home.played += 1;
      away.played += 1;
      home.diff += homeScore - awayScore;
      away.diff += awayScore - homeScore;

      if (homeScore > awayScore) home.pts += 1;
      if (awayScore > homeScore) away.pts += 1;

      group.set(home.name, home);
      group.set(away.name, away);
    });

  return Array.from(grouped.entries())
    .map(([groupCode, rows]) => ({
      groupCode,
      rows: Array.from(rows.values()).sort((left, right) => {
        if (left.pts !== right.pts) return right.pts - left.pts;
        if (left.diff !== right.diff) return right.diff - left.diff;
        return left.name.localeCompare(right.name);
      }),
    }))
    .sort((left, right) => left.groupCode.localeCompare(right.groupCode));
}

function buildBracketRounds(matches: DecoratedMatch[]): DecoratedMatch[][] {
  const knockout = matches.filter((entry) => isKnockoutMatch(entry.match));
  const rounds = new Map<number, DecoratedMatch[]>();
  knockout.forEach((entry) => {
    const round = entry.match.round_number ?? 1;
    const current = rounds.get(round) ?? [];
    current.push(entry);
    rounds.set(round, current);
  });
  return Array.from(rounds.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, entries]) => entries.sort(
      (left, right) => (left.match.match_order_in_round ?? 0) - (right.match.match_order_in_round ?? 0),
    ));
}

export function TournamentVenueDisplayView() {
  const params = useParams<{ tournamentId: string }>();
  const tournamentId = Number.parseInt(params?.tournamentId ?? '', 10);
  const { payload, loading, error } = useTournamentPublicPayload(tournamentId, ROTATE_MS);
  const [slideIndex, setSlideIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [clock, setClock] = useState('');

  useEffect(() => {
    if (!payload?.tournament.timezone) return;
    setClock(formatClock(payload.tournament.timezone));
    const timer = window.setInterval(() => {
      setClock(formatClock(payload.tournament.timezone));
    }, 30000);
    return () => window.clearInterval(timer);
  }, [payload?.tournament.timezone]);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio = Math.min(1, elapsed / ROTATE_MS);
      setProgress(ratio * 100);
      if (elapsed >= ROTATE_MS) {
        window.clearInterval(timer);
        setSlideIndex((value) => (value + 1) % SLIDE_NAMES.length);
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [slideIndex]);

  const decorated = useMemo(() => (payload ? featuredMatches(payload.formats) : []), [payload]);
  const liveMatches = decorated.filter((entry) => LIVE_STATUSES.has(entry.match.status));
  const upcomingMatches = decorated.filter((entry) => UPCOMING_STATUSES.has(entry.match.status)).slice(0, 6);
  const standings = useMemo(() => buildGroupStandings(decorated), [decorated]);
  const bracketRounds = useMemo(() => buildBracketRounds(decorated), [decorated]);
  const finalRound = bracketRounds[bracketRounds.length - 1] ?? [];
  const champion = finalRound[0]?.match.winner_registration_id
    ? (finalRound[0].match.winner_registration_id === finalRound[0].match.home_registration_id ? finalRound[0].homeLabel : finalRound[0].awayLabel)
    : 'TBD';

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.headerCard}>
            <span className={styles.eyebrow}>LeagueOS Venue Display</span>
            <h1>Loading venue display</h1>
          </div>
        </div>
      </main>
    );
  }

  if (error || !payload) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.headerCard}>
            <span className={styles.eyebrow}>LeagueOS Venue Display</span>
            <h1>Venue display unavailable</h1>
            <p>{error || 'No tournament data returned.'}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.eyebrow}>LeagueOS Venue Display</span>
            <h1>{payload.tournament.name}</h1>
          </div>
          <div className={styles.metaStrip}>
            <span className={styles.pill}>Autoplay display</span>
            <span className={styles.pill}>{SLIDE_NAMES[slideIndex]}</span>
            <span className={styles.pill}>{clock || formatClock(payload.tournament.timezone)}</span>
          </div>
        </header>

        <section className={styles.slides}>
          <section className={slideIndex === 0 ? `${styles.slide} ${styles.active}` : styles.slide}>
            <div className={styles.slideHead}>
              <div>
                <h2>Live Matches</h2>
                <p>All active courts with score and current match state.</p>
              </div>
              <span className={styles.pill}>Slide 1 / 4</span>
            </div>
            <div className={styles.liveGrid}>
              {liveMatches.length ? liveMatches.map((entry, index) => (
                <article key={entry.match.id} className={index === 0 ? `${styles.liveCard} ${styles.primary}` : styles.liveCard}>
                  <div className={styles.matchMeta}>
                    <span>{entry.format.name} · {stageLabel(entry.match)}</span>
                    <span className={styles.status}>{matchStatusLabel(entry.match.status)}</span>
                  </div>
                  <div className={styles.liveTeams}>
                    <div className={styles.teamBlock}>
                      <strong>{entry.homeLabel}</strong>
                      <span>{entry.match.court_name || `Court ${entry.match.court_id ?? 'TBD'}`}</span>
                    </div>
                    <div className={styles.score}>
                      {scoreValue(entry.match.score_json?.score_a) ?? '-'}
                      <small>-</small>
                      {scoreValue(entry.match.score_json?.score_b) ?? '-'}
                    </div>
                    <div className={styles.teamBlock}>
                      <strong>{entry.awayLabel}</strong>
                      <span>Match {entry.match.match_number}</span>
                    </div>
                  </div>
                  <div className={styles.liveFoot}>
                    <div className={styles.statCard}><span>Format</span><strong>{entry.format.format_type.replaceAll('_', ' ')}</strong></div>
                    <div className={styles.statCard}><span>Round</span><strong>{stageLabel(entry.match)}</strong></div>
                    <div className={styles.statCard}><span>Start</span><strong>{formatTournamentDate(entry.match.start_at ?? entry.match.tentative_start_at, payload.tournament.timezone, { hour: '2-digit', minute: '2-digit' })}</strong></div>
                  </div>
                </article>
              )) : <div className={styles.emptyCard}>No matches are live right now.</div>}
            </div>
          </section>

          <section className={slideIndex === 1 ? `${styles.slide} ${styles.active}` : styles.slide}>
            <div className={styles.slideHead}>
              <div>
                <h2>Coming Up Soon</h2>
                <p>Queued courts, next fixtures, and scheduled start windows.</p>
              </div>
              <span className={styles.pill}>Slide 2 / 4</span>
            </div>
            <div className={styles.queueGrid}>
              {upcomingMatches.length ? upcomingMatches.map((entry) => (
                <article key={entry.match.id} className={styles.queueCard}>
                  <div className={styles.matchMeta}>
                    <span>{entry.format.name}</span>
                    <span>{entry.match.court_name || `Court ${entry.match.court_id ?? 'TBD'}`}</span>
                  </div>
                  <div className={styles.queueTime}>
                    {formatTournamentDate(entry.match.start_at ?? entry.match.tentative_start_at, payload.tournament.timezone, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className={styles.queueTeams}>
                    {entry.homeLabel}
                    <br />
                    vs
                    <br />
                    {entry.awayLabel}
                  </div>
                  <div className={styles.statCard}><span>Stage</span><strong>{stageLabel(entry.match)}</strong></div>
                </article>
              )) : <div className={styles.emptyCard}>No upcoming matches are queued.</div>}
            </div>
          </section>

          <section className={slideIndex === 2 ? `${styles.slide} ${styles.active}` : styles.slide}>
            <div className={styles.slideHead}>
              <div>
                <h2>Knockout Bracket</h2>
                <p>Tournament progression through the elimination rounds.</p>
              </div>
              <span className={styles.pill}>Slide 3 / 4</span>
            </div>
            {bracketRounds.length ? (
              <div className={styles.bracketLayout} style={{ gridTemplateColumns: `repeat(${bracketRounds.length}, minmax(0, 1fr)) minmax(220px, 0.9fr)` }}>
                {bracketRounds.map((round, index) => (
                  <div key={`round-${index + 1}`} className={styles.roundColumn}>
                    <div className={styles.roundLabel}>Round {index + 1}</div>
                    <div className={styles.roundStack}>
                      {round.map((entry) => (
                        <article key={entry.match.id} className={styles.bracketMatch}>
                          <div className={styles.bracketMeta}>{entry.match.round_label || stageLabel(entry.match)}</div>
                          <div className={styles.entryRow}>
                            <span>{entry.homeLabel}</span>
                            <strong>{scoreValue(entry.match.score_json?.score_a) ?? '-'}</strong>
                          </div>
                          <div className={styles.entryRow}>
                            <span>{entry.awayLabel}</span>
                            <strong>{scoreValue(entry.match.score_json?.score_b) ?? '-'}</strong>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
                <aside className={styles.championCard}>
                  <span className={styles.eyebrow}>Champion</span>
                  <strong>{champion}</strong>
                  <span className={styles.subtle}>Final currently {finalRound[0] ? matchStatusLabel(finalRound[0].match.status) : 'not scheduled'}</span>
                </aside>
              </div>
            ) : <div className={styles.emptyCard}>No knockout bracket is available for display yet.</div>}
          </section>

          <section className={slideIndex === 3 ? `${styles.slide} ${styles.active}` : styles.slide}>
            <div className={styles.slideHead}>
              <div>
                <h2>Group Standings</h2>
                <p>Current group tables with match points and differential.</p>
              </div>
              <span className={styles.pill}>Slide 4 / 4</span>
            </div>
            <div className={styles.standingsLayout}>
              {standings.length ? standings.slice(0, 4).map((group) => (
                <article key={group.groupCode} className={styles.standingsCard}>
                  <h3>Group {group.groupCode}</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th>Pts</th>
                        <th>Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td>{row.pts}</td>
                          <td>{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </article>
              )) : <div className={styles.emptyCard}>No completed group-stage results are available yet.</div>}
            </div>
          </section>
        </section>

        <footer className={styles.footer}>
          <span>Hands-free venue mode. No interaction required.</span>
          <div className={styles.progress}>
            <div className={styles.progressBar} style={{ width: `${progress}%` }} />
          </div>
        </footer>
      </div>
    </main>
  );
}
