'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import styles from './CourtsidePublicView.module.css';
import {
  COMPLETED_STATUSES,
  LIVE_STATUSES,
  UPCOMING_STATUSES,
  featuredMatches,
  formatClock,
  formatTournamentDate,
  formatTypeLabel,
  matchMoment,
  matchStatusLabel,
  scoreValue,
  stageLabel,
  useTournamentPublicPayload,
  type DecoratedMatch,
  type PublicMatch,
  type PublicScore,
} from './publicTournamentViews';

function matchStatusClass(status: string): string {
  if (LIVE_STATUSES.has(status)) return `${styles.matchBadge} ${styles.live}`;
  if (COMPLETED_STATUSES.has(status)) return `${styles.matchBadge} ${styles.done}`;
  return `${styles.matchBadge} ${styles.upcoming}`;
}

function setRuleLabel(match: PublicMatch): string {
  const target = match.points_to_win_set ?? 21;
  if (!match.win_by_two) return `First to ${target}`;
  const cap = match.set_cap ?? target;
  return `Win by 2 (cap ${cap})`;
}

function matchRuleLabel(match: PublicMatch): string {
  const bestOf = match.best_of_sets ?? ((match.sets_to_win ?? 1) * 2) - 1;
  return `Best of ${bestOf}`;
}

function winnerLabel(entry: DecoratedMatch): string | null {
  if (!entry.match.winner_registration_id) return null;
  if (entry.match.winner_registration_id === entry.match.home_registration_id) return entry.homeLabel;
  if (entry.match.winner_registration_id === entry.match.away_registration_id) return entry.awayLabel;
  return null;
}

function prettyKey(key: string): string {
  return key
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function prettyScoreValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not available';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return 'Unavailable';
  }
}

function extraScoreRows(score: PublicScore): Array<{ key: string; value: string }> {
  return Object.entries(score)
    .filter(([key]) => key !== 'score_a' && key !== 'score_b')
    .map(([key, value]) => ({ key: prettyKey(key), value: prettyScoreValue(value) }));
}

function timelineRows(entry: DecoratedMatch, timezone: string, generatedAt: string | null): string[] {
  const rows = [
    `Status: ${matchStatusLabel(entry.match.status)}`,
    `Court: ${entry.match.court_name || `Court ${entry.match.court_id ?? 'TBD'}`}`,
    `Stage: ${stageLabel(entry.match)}`,
    `Rule: ${matchRuleLabel(entry.match)} · ${setRuleLabel(entry.match)}`,
  ];

  const tentative = formatTournamentDate(
    entry.match.tentative_start_at,
    timezone,
    { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    '',
  );
  const started = formatTournamentDate(
    entry.match.start_at,
    timezone,
    { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    '',
  );
  const ended = formatTournamentDate(
    entry.match.end_at,
    timezone,
    { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    '',
  );
  const synced = formatTournamentDate(
    generatedAt,
    timezone,
    { hour: '2-digit', minute: '2-digit', second: '2-digit' },
    '',
  );
  const winner = winnerLabel(entry);

  if (tentative) rows.push(`Scheduled window: ${tentative}`);
  if (started) rows.push(`Started: ${started}`);
  if (ended) rows.push(`Ended: ${ended}`);
  if (winner) rows.push(`Winner: ${winner}`);
  if (entry.match.dependency_match_a_id || entry.match.dependency_match_b_id) {
    rows.push(
      `Feeders: ${entry.match.dependency_match_a_id ? `M${entry.match.dependency_match_a_id}` : 'TBD'} / ${entry.match.dependency_match_b_id ? `M${entry.match.dependency_match_b_id}` : 'TBD'}`,
    );
  }
  if (synced) rows.push(`Latest public sync: ${synced}`);
  return rows;
}

export function CourtsidePublicView() {
  const params = useParams<{ tournamentId: string }>();
  const tournamentId = Number.parseInt(params?.tournamentId ?? '', 10);
  const { payload, loading, error } = useTournamentPublicPayload(tournamentId, 3000);
  const [selectedFormatId, setSelectedFormatId] = useState<'all' | number>('all');
  const [clock, setClock] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);

  useEffect(() => {
    if (!payload?.tournament.timezone) return;
    setClock(formatClock(payload.tournament.timezone));
    const timer = window.setInterval(() => {
      setClock(formatClock(payload.tournament.timezone));
    }, 30000);
    return () => window.clearInterval(timer);
  }, [payload?.tournament.timezone]);

  useEffect(() => {
    if (!payload) return;
    if (selectedFormatId === 'all') return;
    if (!payload.formats.some((format) => format.id === selectedFormatId)) {
      setSelectedFormatId('all');
    }
  }, [payload, selectedFormatId]);

  const allDecorated = useMemo(() => (payload ? featuredMatches(payload.formats) : []), [payload]);

  useEffect(() => {
    if (!selectedMatchId) return;
    if (!allDecorated.some((entry) => entry.match.id === selectedMatchId)) {
      setSelectedMatchId(null);
    }
  }, [allDecorated, selectedMatchId]);

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={`${styles.panel} ${styles.loadingPanel}`}>
            <span className={styles.kicker}>Tournament Courtside</span>
            <h1 className={styles.title}>Loading public display</h1>
            <p className={styles.support}>Pulling the latest tournament and court schedule.</p>
          </section>
        </div>
      </main>
    );
  }

  if (error || !payload) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={`${styles.panel} ${styles.errorPanel}`}>
            <span className={styles.kicker}>Tournament Courtside</span>
            <h1 className={styles.title}>Public display unavailable</h1>
            <p className={styles.support}>{error || 'No public tournament data was returned.'}</p>
          </section>
        </div>
      </main>
    );
  }

  const visibleFormats = payload.formats.filter((format) => selectedFormatId === 'all' || format.id === selectedFormatId);
  const formatsWithActivity = visibleFormats.filter((format) => format.matches.length > 0);
  const decorated = featuredMatches(formatsWithActivity);
  const selectedMatch = allDecorated.find((entry) => entry.match.id === selectedMatchId) ?? null;
  const featured = decorated[0] ?? null;
  const liveMatches = decorated.filter((entry) => LIVE_STATUSES.has(entry.match.status));
  const upcomingMatches = decorated.filter((entry) => UPCOMING_STATUSES.has(entry.match.status)).slice(0, 8);
  const completedMatches = decorated.filter((entry) => COMPLETED_STATUSES.has(entry.match.status)).slice(0, 6);

  const courtSource = payload.courts.filter((court) => court.is_active);
  const courts = (courtSource.length ? courtSource : payload.courts).map((court) => {
    const matches = decorated
      .filter((entry) => entry.match.court_id === court.id)
      .sort((left, right) => matchMoment(left.match) - matchMoment(right.match));
    return {
      court,
      current: matches.find((entry) => LIVE_STATUSES.has(entry.match.status)) ?? null,
      next: matches.find((entry) => UPCOMING_STATUSES.has(entry.match.status)) ?? null,
      recent: matches.filter((entry) => COMPLETED_STATUSES.has(entry.match.status)).slice(-1)[0] ?? null,
    };
  });

  const liveCourts = courts.filter((entry) => entry.current).length;
  const nextSlot = upcomingMatches[0]?.match.start_at ?? upcomingMatches[0]?.match.tentative_start_at ?? null;
  const selectedExtraScoreRows = selectedMatch ? extraScoreRows(selectedMatch.match.score_json) : [];

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={`${styles.panel} ${styles.headerCard}`}>
          <div className={styles.headerCopy}>
            <span className={styles.kicker}>Tournament Courtside</span>
            <h1 className={styles.title}>{payload.tournament.name}</h1>
            <p className={styles.support}>
              Mobile-first public scoreboard for players and spectators. Tap any live, queued, or completed match card for full detail.
            </p>
          </div>
          <div className={styles.headerMeta}>
            <div className={styles.metaPill}>
              <span>Now</span>
              <strong>{clock || formatClock(payload.tournament.timezone)}</strong>
            </div>
            <div className={styles.metaPill}>
              <span>Timezone</span>
              <strong>{payload.tournament.timezone}</strong>
            </div>
            <div className={styles.metaPill}>
              <span>Next Call</span>
              <strong>
                {formatTournamentDate(nextSlot, payload.tournament.timezone, { hour: '2-digit', minute: '2-digit' })}
              </strong>
            </div>
          </div>
        </header>

        <section className={`${styles.panel} ${styles.heroCard}`}>
          <div className={styles.heroTop}>
            <div>
              <span className={styles.ribbon}>Live Snapshot</span>
              <h2 className={styles.heroTitle}>{featured ? payload.tournament.name : 'No live activity yet'}</h2>
              <p className={styles.heroCopy}>
                {featured
                  ? `${featured.match.court_name || `Court ${featured.match.court_id ?? 'TBD'}`} · ${featured.format.name} · ${stageLabel(featured.match)}`
                  : 'As soon as matches are assigned and started, live boards will appear here.'}
              </p>
            </div>
            <div className={styles.statGrid}>
              <article className={styles.statCard}>
                <span>Live</span>
                <strong>{liveMatches.length}</strong>
              </article>
              <article className={styles.statCard}>
                <span>Courts</span>
                <strong>{liveCourts}</strong>
              </article>
              <article className={styles.statCard}>
                <span>Formats</span>
                <strong>{visibleFormats.length}</strong>
              </article>
            </div>
          </div>

          {featured ? (
            <button type="button" className={styles.featureCard} onClick={() => setSelectedMatchId(featured.match.id)}>
              <div className={styles.featureTop}>
                <span className={matchStatusClass(featured.match.status)}>{matchStatusLabel(featured.match.status)}</span>
                <span className={styles.tapHint}>Tap for match detail</span>
              </div>
              <div className={styles.featureTeams}>
                <div className={styles.teamBlock}>
                  <span className={styles.teamTag}>Home</span>
                  <strong className={styles.teamName}>{featured.homeLabel}</strong>
                </div>
                <div className={styles.scoreBlock}>
                  <span className={styles.score}>
                    {scoreValue(featured.match.score_json?.score_a) ?? '-'}
                    <small>:</small>
                    {scoreValue(featured.match.score_json?.score_b) ?? '-'}
                  </span>
                  <span className={styles.featureMeta}>
                    {featured.match.court_name || `Court ${featured.match.court_id ?? 'TBD'}`} · Match {featured.match.match_number}
                  </span>
                </div>
                <div className={styles.teamBlock}>
                  <span className={styles.teamTag}>Away</span>
                  <strong className={styles.teamName}>{featured.awayLabel}</strong>
                </div>
              </div>
            </button>
          ) : (
            <div className={styles.emptyState}>
              No published or generated court schedule is available for public display yet.
            </div>
          )}
        </section>

        <section className={styles.toolbar}>
          <div className={styles.filterRail}>
            <button
              type="button"
              className={selectedFormatId === 'all' ? `${styles.filterChip} ${styles.filterChipActive}` : styles.filterChip}
              onClick={() => setSelectedFormatId('all')}
            >
              All Formats
            </button>
            {payload.formats.map((format) => (
              <button
                key={format.id}
                type="button"
                className={selectedFormatId === format.id ? `${styles.filterChip} ${styles.filterChipActive}` : styles.filterChip}
                onClick={() => setSelectedFormatId(format.id)}
              >
                {format.name}
              </button>
            ))}
          </div>
          <span className={styles.syncStamp}>
            Synced {formatTournamentDate(payload.generated_at, payload.tournament.timezone, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Live Now</h3>
            <span>{liveMatches.length} active match{liveMatches.length === 1 ? '' : 'es'}</span>
          </div>
          <div className={styles.matchStack}>
            {liveMatches.length ? liveMatches.map((entry) => (
              <button
                key={entry.match.id}
                type="button"
                className={styles.matchCard}
                onClick={() => setSelectedMatchId(entry.match.id)}
              >
                <div className={styles.cardTop}>
                  <span className={matchStatusClass(entry.match.status)}>{matchStatusLabel(entry.match.status)}</span>
                  <span className={styles.tapHint}>Tap for detail</span>
                </div>
                <div className={styles.cardMain}>
                  <div className={styles.cardMeta}>{entry.format.name} · {stageLabel(entry.match)}</div>
                  <div className={styles.scoreRow}>
                    <span>{entry.homeLabel}</span>
                    <strong>{scoreValue(entry.match.score_json?.score_a) ?? '-'}</strong>
                  </div>
                  <div className={styles.scoreRow}>
                    <span>{entry.awayLabel}</span>
                    <strong>{scoreValue(entry.match.score_json?.score_b) ?? '-'}</strong>
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  <span>{entry.match.court_name || `Court ${entry.match.court_id ?? 'TBD'}`}</span>
                  <span>Match {entry.match.match_number}</span>
                </div>
              </button>
            )) : <div className={styles.emptyInline}>No matches are live right now.</div>}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Court Boards</h3>
            <span>Tap any court card for detail</span>
          </div>
          <div className={styles.courtGrid}>
            {courts.map(({ court, current, next, recent }) => {
              const selected = current ?? next ?? recent;
              if (selected) {
                return (
                  <button
                    key={court.id}
                    type="button"
                    className={styles.courtCard}
                    onClick={() => setSelectedMatchId(selected.match.id)}
                  >
                    <div className={styles.cardTop}>
                      <h4>{court.name}</h4>
                      <span className={current ? matchStatusClass('IN_PROGRESS') : next ? matchStatusClass('SCHEDULED') : matchStatusClass('FINALIZED')}>
                        {current ? 'On Court' : next ? 'Queued' : 'Recent'}
                      </span>
                    </div>
                    <div className={styles.cardMain}>
                      <div className={styles.cardMeta}>{selected.format.name}</div>
                      {current || recent ? (
                        <>
                          <div className={styles.scoreRow}>
                            <span>{selected.homeLabel}</span>
                            <strong>{scoreValue(selected.match.score_json?.score_a) ?? '-'}</strong>
                          </div>
                          <div className={styles.scoreRow}>
                            <span>{selected.awayLabel}</span>
                            <strong>{scoreValue(selected.match.score_json?.score_b) ?? '-'}</strong>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={styles.teamList}>{selected.homeLabel}</div>
                          <div className={styles.teamList}>{selected.awayLabel}</div>
                        </>
                      )}
                    </div>
                    <div className={styles.cardFooter}>
                      <span>{stageLabel(selected.match)}</span>
                      <span>{current ? 'Live' : next ? 'Up next' : 'Completed'}</span>
                    </div>
                  </button>
                );
              }
              return (
                <article key={court.id} className={`${styles.courtCard} ${styles.courtCardIdle}`}>
                  <div className={styles.cardTop}>
                    <h4>{court.name}</h4>
                  </div>
                  <div className={styles.emptyInline}>No public match assignment on this court yet.</div>
                </article>
              );
            })}
          </div>
        </section>

        <div className={styles.contentGrid}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>Up Next</h3>
              <span>Queued matches</span>
            </div>
            <div className={styles.matchStack}>
              {upcomingMatches.length ? upcomingMatches.map((entry) => (
                <button
                  key={entry.match.id}
                  type="button"
                  className={styles.matchCard}
                  onClick={() => setSelectedMatchId(entry.match.id)}
                >
                  <div className={styles.cardTop}>
                    <span className={matchStatusClass(entry.match.status)}>{matchStatusLabel(entry.match.status)}</span>
                    <span className={styles.cardMeta}>
                      {formatTournamentDate(entry.match.start_at ?? entry.match.tentative_start_at, payload.tournament.timezone, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={styles.cardMain}>
                    <div className={styles.cardMeta}>{entry.match.court_name || `Court ${entry.match.court_id ?? 'TBD'}`}</div>
                    <div className={styles.teamList}>{entry.homeLabel}</div>
                    <div className={styles.teamList}>{entry.awayLabel}</div>
                  </div>
                  <div className={styles.cardFooter}>
                    <span>{entry.format.name}</span>
                    <span>{stageLabel(entry.match)}</span>
                  </div>
                </button>
              )) : <div className={styles.emptyInline}>No upcoming public matches are queued right now.</div>}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>Recent Results</h3>
              <span>Latest completed matches</span>
            </div>
            <div className={styles.matchStack}>
              {completedMatches.length ? completedMatches.map((entry) => (
                <button
                  key={entry.match.id}
                  type="button"
                  className={styles.matchCard}
                  onClick={() => setSelectedMatchId(entry.match.id)}
                >
                  <div className={styles.cardTop}>
                    <span className={matchStatusClass(entry.match.status)}>{matchStatusLabel(entry.match.status)}</span>
                    <span className={styles.tapHint}>Tap for detail</span>
                  </div>
                  <div className={styles.cardMain}>
                    <div className={styles.cardMeta}>{entry.format.name} · {entry.match.court_name || `Court ${entry.match.court_id ?? 'TBD'}`}</div>
                    <div className={styles.scoreRow}>
                      <span>{entry.homeLabel}</span>
                      <strong>{scoreValue(entry.match.score_json?.score_a) ?? '-'}</strong>
                    </div>
                    <div className={styles.scoreRow}>
                      <span>{entry.awayLabel}</span>
                      <strong>{scoreValue(entry.match.score_json?.score_b) ?? '-'}</strong>
                    </div>
                  </div>
                  <div className={styles.cardFooter}>
                    <span>{winnerLabel(entry) || 'Winner pending'}</span>
                    <span>{stageLabel(entry.match)}</span>
                  </div>
                </button>
              )) : <div className={styles.emptyInline}>Results will populate here once matches finish.</div>}
            </div>
          </section>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Format Snapshot</h3>
            <span>{formatsWithActivity.length} active boards</span>
          </div>
          <div className={styles.formatGrid}>
            {visibleFormats.map((format) => {
              const liveCount = format.matches.filter((match) => LIVE_STATUSES.has(match.status)).length;
              const scheduledCount = format.matches.filter((match) => UPCOMING_STATUSES.has(match.status)).length;
              const completedCount = format.matches.filter((match) => COMPLETED_STATUSES.has(match.status)).length;
              return (
                <article key={format.id} className={styles.formatCard}>
                  <div className={styles.cardTop}>
                    <div>
                      <span className={styles.cardEyebrow}>{formatTypeLabel(format.format_type)}</span>
                      <h4>{format.name}</h4>
                    </div>
                    <span className={matchStatusClass(liveCount ? 'IN_PROGRESS' : scheduledCount ? 'SCHEDULED' : 'FINALIZED')}>
                      {liveCount ? `${liveCount} live` : scheduledCount ? `${scheduledCount} queued` : 'Quiet'}
                    </span>
                  </div>
                  <div className={styles.miniStats}>
                    <div><span>Matches</span><strong>{format.matches.length}</strong></div>
                    <div><span>Finished</span><strong>{completedCount}</strong></div>
                    <div><span>Courts</span><strong>{new Set(format.matches.map((match) => match.court_id).filter((value) => value !== null)).size}</strong></div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {selectedMatch ? (
        <>
          <button type="button" className={styles.detailBackdrop} aria-label="Close match detail" onClick={() => setSelectedMatchId(null)} />
          <aside className={styles.detailSheet}>
            <div className={styles.detailTop}>
              <div>
                <span className={styles.kicker}>Match Detail</span>
                <h2 className={styles.detailTitle}>{selectedMatch.homeLabel} vs {selectedMatch.awayLabel}</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setSelectedMatchId(null)}>
                Close
              </button>
            </div>

            <section className={styles.detailHero}>
              <div className={styles.detailHeroTop}>
                <span className={matchStatusClass(selectedMatch.match.status)}>{matchStatusLabel(selectedMatch.match.status)}</span>
                <span className={styles.detailMeta}>
                  {selectedMatch.match.court_name || `Court ${selectedMatch.match.court_id ?? 'TBD'}`} · Match {selectedMatch.match.match_number}
                </span>
              </div>
              <div className={styles.detailScore}>
                <div className={styles.detailTeam}>
                  <span className={styles.teamTag}>Home</span>
                  <strong>{selectedMatch.homeLabel}</strong>
                </div>
                <div className={styles.detailScoreValue}>
                  {scoreValue(selectedMatch.match.score_json?.score_a) ?? '-'}
                  <small>:</small>
                  {scoreValue(selectedMatch.match.score_json?.score_b) ?? '-'}
                </div>
                <div className={styles.detailTeam}>
                  <span className={styles.teamTag}>Away</span>
                  <strong>{selectedMatch.awayLabel}</strong>
                </div>
              </div>
            </section>

            <section className={styles.detailSection}>
              <h3>Match Context</h3>
              <div className={styles.detailGrid}>
                <article className={styles.detailCard}>
                  <span>Format</span>
                  <strong>{selectedMatch.format.name}</strong>
                </article>
                <article className={styles.detailCard}>
                  <span>Stage</span>
                  <strong>{stageLabel(selectedMatch.match)}</strong>
                </article>
                <article className={styles.detailCard}>
                  <span>Match Rule</span>
                  <strong>{matchRuleLabel(selectedMatch.match)}</strong>
                </article>
                <article className={styles.detailCard}>
                  <span>Set Rule</span>
                  <strong>{setRuleLabel(selectedMatch.match)}</strong>
                </article>
              </div>
            </section>

            <section className={styles.detailSection}>
              <h3>Match Timeline</h3>
              <div className={styles.timelineList}>
                {timelineRows(selectedMatch, payload.tournament.timezone, payload.generated_at).map((row) => (
                  <div key={row} className={styles.timelineRow}>{row}</div>
                ))}
              </div>
            </section>

            <section className={styles.detailSection}>
              <h3>Public Score Feed</h3>
              <div className={styles.detailGrid}>
                <article className={styles.detailCard}>
                  <span>Home Score</span>
                  <strong>{scoreValue(selectedMatch.match.score_json?.score_a) ?? '-'}</strong>
                </article>
                <article className={styles.detailCard}>
                  <span>Away Score</span>
                  <strong>{scoreValue(selectedMatch.match.score_json?.score_b) ?? '-'}</strong>
                </article>
              </div>
              {selectedExtraScoreRows.length ? (
                <div className={styles.timelineList}>
                  {selectedExtraScoreRows.map((row) => (
                    <div key={row.key} className={styles.timelineRow}>
                      <strong>{row.key}:</strong> {row.value}
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.detailCopy}>
                  No additional public scoring log is exposed by the API yet. This screen is showing all currently available public match data.
                </p>
              )}
            </section>
          </aside>
        </>
      ) : null}
    </main>
  );
}
