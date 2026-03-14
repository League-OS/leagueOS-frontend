'use client';

import { useEffect, useState } from 'react';
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
  scoreValue,
  stageLabel,
  useTournamentPublicPayload,
} from './publicTournamentViews';

function matchStatusClass(status: string): string {
  if (LIVE_STATUSES.has(status)) return `${styles.matchBadge} ${styles.live}`;
  if (COMPLETED_STATUSES.has(status)) return `${styles.matchBadge} ${styles.done}`;
  return `${styles.matchBadge} ${styles.upcoming}`;
}

function matchStatusLabel(status: string): string {
  if (status === 'IN_PROGRESS') return 'Live';
  if (status === 'SCHEDULED') return 'Up Next';
  if (status === 'FINALIZED') return 'Final';
  return status.replaceAll('_', ' ');
}

export function CourtsidePublicView() {
  const params = useParams<{ tournamentId: string }>();
  const tournamentId = Number.parseInt(params?.tournamentId ?? '', 10);
  const { payload, loading, error } = useTournamentPublicPayload(tournamentId, 20000);
  const [selectedFormatId, setSelectedFormatId] = useState<'all' | number>('all');
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
    if (!payload) return;
    if (selectedFormatId === 'all') return;
    if (!payload.formats.some((format) => format.id === selectedFormatId)) {
      setSelectedFormatId('all');
    }
  }, [payload, selectedFormatId]);

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

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.kicker}>Tournament Courtside</span>
            <h1 className={styles.title}>{payload.tournament.name}</h1>
            <p className={styles.support}>
              Tournament-level public display. No login required.
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
              <span>Window</span>
              <strong>
                {formatTournamentDate(payload.tournament.schedule_start_at, payload.tournament.timezone, { month: 'short', day: 'numeric' })}
                {' - '}
                {formatTournamentDate(payload.tournament.schedule_end_at, payload.tournament.timezone, { month: 'short', day: 'numeric' })}
              </strong>
            </div>
          </div>
        </header>

        <section className={`${styles.panel} ${styles.hero}`}>
          <div className={styles.heroLead}>
            <div>
              <span className={styles.ribbon}>Broadcast Deck</span>
              <h2 className={styles.heroTitle}>
                {featured ? featured.match.court_name || `Court ${featured.match.court_id}` : 'No live court activity yet'}
              </h2>
              <p className={styles.support}>
                {featured
                  ? `${featured.format.name} · ${stageLabel(featured.match)}`
                  : 'Schedules will appear here once matches are generated for this tournament.'}
              </p>
            </div>
            <div className={styles.statGrid}>
              <article className={styles.statCard}>
                <span>Live Matches</span>
                <strong>{liveMatches.length}</strong>
              </article>
              <article className={styles.statCard}>
                <span>Live Courts</span>
                <strong>{liveCourts}</strong>
              </article>
              <article className={styles.statCard}>
                <span>Formats</span>
                <strong>{visibleFormats.length}</strong>
              </article>
              <article className={styles.statCard}>
                <span>Next Slot</span>
                <strong>
                  {formatTournamentDate(nextSlot, payload.tournament.timezone, { hour: '2-digit', minute: '2-digit' })}
                </strong>
              </article>
            </div>
          </div>

          {featured ? (
            <article className={styles.featureCard}>
              <div className={styles.featureTop}>
                <span className={matchStatusClass(featured.match.status)}>{matchStatusLabel(featured.match.status)}</span>
                <span className={styles.featureMeta}>
                  {stageLabel(featured.match)} · Match {featured.match.match_number}
                </span>
              </div>
              <div className={styles.featureTeams}>
                <div>
                  <span className={styles.teamTag}>Home</span>
                  <div className={styles.teamName}>{featured.homeLabel}</div>
                </div>
                <div className={styles.scoreBlock}>
                  <span className={styles.score}>
                    {scoreValue(featured.match.score_json?.score_a) ?? '-'}
                    <small>:</small>
                    {scoreValue(featured.match.score_json?.score_b) ?? '-'}
                  </span>
                  <span className={styles.featureMeta}>
                    {formatTournamentDate(
                      featured.match.start_at ?? featured.match.tentative_start_at,
                      payload.tournament.timezone,
                      { hour: '2-digit', minute: '2-digit' },
                    )}
                  </span>
                </div>
                <div>
                  <span className={styles.teamTag}>Away</span>
                  <div className={styles.teamName}>{featured.awayLabel}</div>
                </div>
              </div>
            </article>
          ) : (
            <div className={styles.emptyState}>
              No published or generated court schedule is available for public display yet.
            </div>
          )}
        </section>

        <section className={styles.toolbar}>
          <div className={styles.filterRail}>
            <button
              className={selectedFormatId === 'all' ? `${styles.filterChip} ${styles.filterChipActive}` : styles.filterChip}
              onClick={() => setSelectedFormatId('all')}
            >
              All Formats
            </button>
            {payload.formats.map((format) => (
              <button
                key={format.id}
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
                  <div className={styles.formatTop}>
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

        <div className={styles.contentGrid}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>Court Boards</h3>
              <span>Live first, next match second</span>
            </div>
            <div className={styles.courtGrid}>
              {courts.map(({ court, current, next, recent }) => (
                <article key={court.id} className={styles.courtCard}>
                  <div className={styles.courtTop}>
                    <h4>{court.name}</h4>
                    <span className={current ? matchStatusClass('IN_PROGRESS') : next ? matchStatusClass('SCHEDULED') : matchStatusClass('FINALIZED')}>
                      {current ? 'On Court' : next ? 'Queued' : 'Idle'}
                    </span>
                  </div>

                  {current ? (
                    <div className={styles.matchPanel}>
                      <span className={styles.cardEyebrow}>{current.format.name}</span>
                      <div className={styles.teamLine}>
                        <span>{current.homeLabel}</span>
                        <strong>{scoreValue(current.match.score_json?.score_a) ?? '-'}</strong>
                      </div>
                      <div className={styles.teamLine}>
                        <span>{current.awayLabel}</span>
                        <strong>{scoreValue(current.match.score_json?.score_b) ?? '-'}</strong>
                      </div>
                    </div>
                  ) : null}

                  {!current && next ? (
                    <div className={styles.matchPanel}>
                      <span className={styles.cardEyebrow}>{next.format.name}</span>
                      <div className={styles.teamStack}>
                        <span>{next.homeLabel}</span>
                        <span>{next.awayLabel}</span>
                      </div>
                      <span className={styles.muted}>
                        Starts {formatTournamentDate(next.match.start_at ?? next.match.tentative_start_at, payload.tournament.timezone, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ) : null}

                  {!current && !next && recent ? (
                    <div className={styles.matchPanel}>
                      <span className={styles.cardEyebrow}>Last Result</span>
                      <div className={styles.teamStack}>
                        <span>{recent.homeLabel}</span>
                        <span>{recent.awayLabel}</span>
                      </div>
                    </div>
                  ) : null}

                  {!current && !next && !recent ? (
                    <div className={styles.emptyInline}>No public match assignment on this court yet.</div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>Schedule Runway</h3>
              <span>Next eight calls</span>
            </div>
            <div className={styles.timeline}>
              {upcomingMatches.length ? upcomingMatches.map((entry) => (
                <article key={entry.match.id} className={styles.timelineItem}>
                  <div className={styles.timelineHead}>
                    <span className={styles.cardEyebrow}>{entry.format.name}</span>
                    <span className={styles.muted}>
                      {formatTournamentDate(entry.match.start_at ?? entry.match.tentative_start_at, payload.tournament.timezone, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <strong>{entry.match.court_name || `Court ${entry.match.court_id ?? 'TBD'}`}</strong>
                  <div className={styles.teamStack}>
                    <span>{entry.homeLabel}</span>
                    <span>{entry.awayLabel}</span>
                  </div>
                  <span className={styles.muted}>{stageLabel(entry.match)}</span>
                </article>
              )) : <div className={styles.emptyInline}>No upcoming public matches are queued right now.</div>}
            </div>

            <div className={styles.sectionHeader}>
              <h3>Recent Results</h3>
              <span>Latest completed matches</span>
            </div>
            <div className={styles.timeline}>
              {completedMatches.length ? completedMatches.map((entry) => (
                <article key={entry.match.id} className={styles.timelineItem}>
                  <div className={styles.timelineHead}>
                    <span className={styles.cardEyebrow}>{entry.format.name}</span>
                    <span className={styles.muted}>{entry.match.court_name || `Court ${entry.match.court_id ?? 'TBD'}`}</span>
                  </div>
                  <div className={styles.teamLine}>
                    <span>{entry.homeLabel}</span>
                    <strong>{scoreValue(entry.match.score_json?.score_a) ?? '-'}</strong>
                  </div>
                  <div className={styles.teamLine}>
                    <span>{entry.awayLabel}</span>
                    <strong>{scoreValue(entry.match.score_json?.score_b) ?? '-'}</strong>
                  </div>
                </article>
              )) : <div className={styles.emptyInline}>Results will populate here once matches finish.</div>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
