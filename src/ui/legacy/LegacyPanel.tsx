/**
 * Career Legacy (V1): the trophy room, career records, milestone timeline and
 * legacy status, all derived from Ryan's verified (checksum-sealed) results,
 * his stored trophies and the milestones recorded on the career. Nothing here
 * writes; nothing is estimated. A figure the game doesn't record isn't shown.
 */
import { useEffect, useMemo, useState } from 'react';
import { careerStats, type EventLine } from '../../career/careerStats';
import { DESERT_ROSE, desertRoseSeason, majorName, TOP_TOUR_MAJOR_WEEKS } from '../../career/championships';
import { FAME_LEVELS, fameLevel, gameDate, TOURS, type TourId } from '../../career/config';
import { evaluateLegacy, isLegacyWin, isTopTourMajor, LEGACY_MILESTONES, pinkJackets, type LegacyGroup } from '../../career/legacy';
import { isPinkJacket, trophyLook } from '../../catalog/trophies';
import type { TrophyInstance } from '../../core/types';
import type { TournamentRecord } from '../../persistence/records';
import { isVerifiedRecord } from '../../records/albatross';
import { useGame } from '../GameContext';
import { formatMoney, ordinal, toPar } from '../format';
import { TourPill } from '../career/bits';
import { PinkJacket } from './PinkJacket';

const GROUPS: { id: LegacyGroup; label: string }[] = [
  { id: 'victories', label: 'Victories' },
  { id: 'majors', label: 'Majors' },
  { id: 'jacket', label: 'The Pink Jacket' },
  { id: 'season', label: 'Seasons' },
  { id: 'longevity', label: 'Longevity' },
  { id: 'status', label: 'Status' },
];

const TOUR_ORDER: TourId[] = ['amateur', 'mini', 'epson', 'lpga'];

const shortDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');

interface TimelineRow {
  key: string;
  at: string;
  season: number;
  week: number;
  title: string;
  detail: string;
  kind: 'milestone' | 'jacket';
  full: boolean;
}

export function LegacyPanel({ onOpenTrophies }: { onOpenTrophies?: () => void }) {
  const { state, services, setInspectTrophyId } = useGame();
  const c = state.career;
  const [records, setRecords] = useState<TournamentRecord[] | null>(null);
  const [showLocked, setShowLocked] = useState(true);

  useEffect(() => {
    let live = true;
    void services.career.listTournaments().then((r) => live && setRecords(r.filter(isVerifiedRecord)));
    return () => {
      live = false;
    };
  }, [services, c.totals.events, c.season]);

  const stats = useMemo(() => (records ? careerStats(records, c.playerId) : null), [records, c.playerId]);
  const history = stats?.history ?? [];
  const earned = c.achievements ?? {};
  // Proven milestones (with the record that proved each); shown only once recorded on the career.
  const jacketSet = useMemo(() => new Set(state.trophies.filter((t) => t.ownerId === c.playerId && isPinkJacket(t)).map((t) => t.sourceTournamentId)), [state.trophies, c.playerId]);
  const proven = useMemo(() => evaluateLegacy(history, c.seasonLog ?? [], c.fame, jacketSet), [history, c.seasonLog, c.fame, jacketSet]);

  const jacketTrophies = useMemo(
    () =>
      state.trophies
        .filter((t) => t.ownerId === c.playerId && trophyLook(t).style === 'pink_jacket')
        .sort((a, b) => (desertRoseSeason(a.sourceTournamentId) ?? 0) - (desertRoseSeason(b.sourceTournamentId) ?? 0)),
    [state.trophies, c.playerId],
  );

  if (!stats) return <main className="legacy"><p className="muted">Opening the trophy room…</p></main>;

  const wins = history.filter(isLegacyWin);
  const majors = wins.filter(isTopTourMajor);
  const jackets = pinkJackets(history, jacketSet);
  const milestonesEarned = LEGACY_MILESTONES.filter((m) => earned[m.id]);
  const level = fameLevel(c.fame);

  // Timeline: recorded milestones in their original chronology, plus each Pink Jacket.
  const byId = new Map(proven.map((p) => [p.id, p]));
  const timeline: TimelineRow[] = [
    ...milestonesEarned.map((m) => {
      const p = byId.get(m.id);
      const at = p?.at || earned[m.id];
      return {
        key: m.id,
        at,
        season: p?.season ?? 0,
        week: p?.week ?? 0,
        title: m.name,
        detail: p?.eventName ? `${p.eventName}` : p?.marker ?? m.description,
        kind: 'milestone' as const,
        full: m.celebrate === 'full',
      };
    }),
    ...jackets.map((e, i) => ({
      key: `jacket:${e.tournamentId}`,
      at: gameDate(e.season, e.week),
      season: e.season,
      week: e.week,
      title: `${DESERT_ROSE.award} · No. ${i + 1}`,
      detail: eventLabel(e),
      kind: 'jacket' as const,
      full: true,
    })),
  ].sort((a, b) => (a.at && b.at ? a.at.localeCompare(b.at) : a.at ? -1 : b.at ? 1 : 0) || (a.kind === b.kind ? 0 : a.kind === 'jacket' ? -1 : 1));

  // Defending-champion plaques: back-to-back Desert Rose wins.
  const defenses = jackets.filter((e) => jackets.some((p) => p.season === e.season - 1));

  const otherTrophies = groupTrophies(state.trophies.filter((t) => t.ownerId === c.playerId && trophyLook(t).style !== 'pink_jacket'));
  const winsBySeason = new Map<number, number>();
  for (const w of wins) winsBySeason.set(w.season, (winsBySeason.get(w.season) ?? 0) + 1);

  return (
    <main className="legacy" data-testid="legacy">
      <section className="hub-card legacy-hero">
        <PinkJacket size={92} className="legacy-hero-jacket" title={DESERT_ROSE.award} />
        <div>
          <h2 className="hub-title">Career Legacy</h2>
          <p className="muted">Everything here comes from verified results: finished, sealed tournaments, the trophies they awarded and the seasons Ryan has completed.</p>
        </div>
        <dl className="alb-summary">
          <div><dt>Wins</dt><dd data-testid="legacy-wins">{wins.length}</dd></div>
          <div><dt>Majors</dt><dd data-testid="legacy-majors">{majors.length}</dd></div>
          <div><dt>Pink Jackets</dt><dd data-testid="legacy-jackets">{jackets.length}</dd></div>
          <div><dt>Milestones</dt><dd data-testid="legacy-milestone-count">{milestonesEarned.length}<small>/{LEGACY_MILESTONES.length}</small></dd></div>
        </dl>
      </section>

      {/* A. Trophy room */}
      <section className="hub-card" aria-labelledby="lg-room">
        <h3 id="lg-room" className="section-title">Trophy Room</h3>

        <div className="jacket-room">
          <div className="jacket-room-head">
            <h4>{DESERT_ROSE.award}</h4>
            <span className="muted">{DESERT_ROSE.name} · {DESERT_ROSE.venue}</span>
          </div>
          {jacketTrophies.length ? (
            <ul className="jacket-rack" data-testid="jacket-rack">
              {jacketTrophies.map((t, i) => (
                <li key={t.id}>
                  <button className="jacket-slot" onClick={() => setInspectTrophyId(t.id)} data-testid="jacket-slot" aria-label={`${DESERT_ROSE.award} No. ${i + 1}, season ${desertRoseSeason(t.sourceTournamentId)}`}>
                    <PinkJacket size={110} />
                    <span className="jacket-no">No. {i + 1}</span>
                    <span className="jacket-season">Season {desertRoseSeason(t.sourceTournamentId)}</span>
                    <span className="jacket-score">Won · {toPar(t.finish.toPar)}</span>
                  </button>
                </li>
              ))}
              {defenses.map((e) => (
                <li key={`def-${e.tournamentId}`} className="defense-plaque" data-testid="defense-plaque">
                  <span className="dp-kicker">Defending Champion</span>
                  <span className="dp-years">Seasons {e.season - 1} &amp; {e.season}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="jacket-rack empty-rack" data-testid="jacket-rack-empty">
              <PinkJacket size={110} className="locked" />
              <p className="muted">Win {DESERT_ROSE.name}, the season&rsquo;s first major, on the LPGA in phase 3 to hang a Pink Jacket here.</p>
            </div>
          )}
        </div>

        <div className="legacy-trophies">
          <h4>Championship trophies</h4>
          {otherTrophies.length ? (
            <ul className="legacy-trophy-list" data-testid="legacy-trophies">
              {otherTrophies.map((g) => (
                <li key={g.name}>
                  <span className={`trophy-badge ${g.style}`} aria-hidden />
                  <span className="lt-name">{g.name}</span>
                  <span className="lt-count">×{g.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No trophies yet.</p>
          )}
          {onOpenTrophies && (
            <button className="btn small ghost" onClick={onOpenTrophies} data-testid="legacy-open-cabinet">Open the clubhouse cabinet</button>
          )}
        </div>

        <div className="legacy-plaques">
          <div className="lp-head">
            <h4>Milestones</h4>
            <label className="lp-toggle">
              <input type="checkbox" checked={showLocked} onChange={(e) => setShowLocked(e.target.checked)} /> Show locked
            </label>
          </div>
          {GROUPS.map((g) => {
            const list = LEGACY_MILESTONES.filter((m) => m.group === g.id && (showLocked || earned[m.id]));
            if (!list.length) return null;
            return (
              <div key={g.id} className="lp-group">
                <h5>{g.label}</h5>
                <ul>
                  {list.map((m) => {
                    const got = earned[m.id];
                    const p = byId.get(m.id);
                    return (
                      <li key={m.id} className={`plaque ${got ? 'earned' : 'locked'} ${m.celebrate === 'full' ? 'headline' : ''}`} data-testid={`plaque-${m.id}`} data-earned={got ? 'yes' : 'no'}>
                        <span className="pl-name">{m.name}</span>
                        <span className="pl-sub">{got ? (p?.eventName ? `${p.eventName} · S${p.season}` : p?.marker ?? shortDate(got)) : m.description}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <div className="legacy-cols">
        {/* B. Career records */}
        <section className="hub-card" aria-labelledby="lg-records">
          <h3 id="lg-records" className="section-title">Career Records</h3>
          <dl className="legacy-records" data-testid="legacy-records">
            <div><dt>Tournament wins</dt><dd>{wins.length}</dd></div>
            <div><dt>Top-tour wins</dt><dd>{wins.filter((w) => w.tour === 'lpga').length}</dd></div>
            <div><dt>Majors</dt><dd>{majors.length}</dd></div>
            <div><dt>Pink Jackets</dt><dd>{jackets.length}</dd></div>
            <div><dt>Prize money</dt><dd className="small">{formatMoney(stats.earnings)}</dd></div>
            <div><dt>Events played</dt><dd>{stats.events}</dd></div>
          </dl>
          <p className="legacy-note muted">Wins count outright first places (playoffs included). Q-School places are qualifying finishes, not wins.</p>

          <h4>Majors</h4>
          <table className="data-table legacy-majors">
            <thead><tr><th className="l">Major</th><th>Wins</th><th className="l">Seasons</th></tr></thead>
            <tbody>
              {TOP_TOUR_MAJOR_WEEKS.map((w) => {
                const won = majors.filter((e) => e.week === w);
                const best = bestFinish(history.filter((e) => e.tour === 'lpga' && e.week === w));
                return (
                  <tr key={w} className={won.length ? 'win' : ''}>
                    <td className="l">{w === DESERT_ROSE.week ? DESERT_ROSE.name : majorName(w)}</td>
                    <td>{won.length}</td>
                    <td className="l">{won.length ? won.map((e) => e.season).sort((a, b) => a - b).join(', ') : best ? `Best: ${best}` : 'Not played'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h4>Best finishes</h4>
          <table className="data-table">
            <thead><tr><th className="l">Tour</th><th>Events</th><th>Wins</th><th>Best</th></tr></thead>
            <tbody>
              {TOUR_ORDER.filter((t) => history.some((e) => e.tour === t)).map((t) => {
                const ev = history.filter((e) => e.tour === t);
                return (
                  <tr key={t}>
                    <td className="l"><TourPill tour={t} /> <span className="sr-only">{TOURS[t].name}</span></td>
                    <td>{ev.length}</td>
                    <td>{ev.filter(isLegacyWin).length}</td>
                    <td>{bestFinish(ev) ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h4>Season by season</h4>
          {stats.bySeason.length ? (
            <div className="table-wrap">
              <table className="data-table" data-testid="legacy-seasons">
                <thead><tr><th>Season</th><th>Events</th><th>Wins</th><th>Top 10</th><th>Cuts</th><th>Best</th><th>Prize money</th></tr></thead>
                <tbody>
                  {stats.bySeason.map((s) => (
                    <tr key={s.season} className={s.season === c.season ? 'current' : ''}>
                      <td>{s.season}</td>
                      <td>{s.events}</td>
                      <td>{winsBySeason.get(s.season) ?? 0}</td>
                      <td>{s.top10s}</td>
                      <td>{s.cutsPlayed ? `${s.cutsMade}/${s.cutsPlayed}` : '—'}</td>
                      <td>{s.bestFinish ? ordinal(s.bestFinish) : '—'}</td>
                      <td>{formatMoney(s.earnings)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No finished events yet.</p>
          )}
        </section>

        <div className="legacy-side">
          {/* C. Timeline */}
          <section className="hub-card" aria-labelledby="lg-timeline">
            <h3 id="lg-timeline" className="section-title">Timeline</h3>
            {timeline.length ? (
              <ol className="legacy-timeline" data-testid="legacy-timeline">
                {timeline.map((r) => (
                  <li key={r.key} className={`${r.kind} ${r.full ? 'headline' : ''}`} data-testid="timeline-entry" data-id={r.key}>
                    <span className="tl-when">{r.at ? shortDate(r.at) : 'Recognized'}<small>{r.season ? `Season ${r.season}${r.week && r.week < 99 ? ` · Wk ${r.week}` : ''}` : ''}</small></span>
                    <span className="tl-what">
                      {r.kind === 'jacket' && <PinkJacket size={26} />}
                      <b>{r.title}</b>
                      <small>{r.detail}</small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty">Milestones appear here as Ryan earns them.</p>
            )}
          </section>

          {/* D. Legacy status */}
          <section className="hub-card" aria-labelledby="lg-status">
            <h3 id="lg-status" className="section-title">Legacy Status</h3>
            <p className="legacy-level" data-testid="legacy-level">{level.name}<small>Fame {Math.round(c.fame)}</small></p>
            <ol className="fame-ladder">
              {FAME_LEVELS.map((l) => (
                <li key={l.name} className={l.name === level.name ? 'on' : c.fame >= l.min ? 'past' : ''}>
                  <span>{l.name}</span>
                  <small>{l.min}+</small>
                </li>
              ))}
            </ol>
            <p className="legacy-note muted">Legacy status is Ryan&rsquo;s fame level. It rises with results and fades a little each week Ryan is out of the spotlight.</p>
          </section>
        </div>
      </div>
    </main>
  );
}

function eventLabel(e: EventLine) {
  return `Won ${e.name} · ${toPar(e.toPar)}`;
}

function bestFinish(ev: EventLine[]): string | null {
  const made = ev.filter((e) => e.madeCut).sort((a, b) => a.position - b.position);
  return made.length ? (made[0].posLabel === '1' ? 'Won' : made[0].posLabel) : null;
}

function groupTrophies(list: TrophyInstance[]) {
  const out = new Map<string, { name: string; style: string; count: number }>();
  for (const t of list) {
    const look = trophyLook(t);
    const g = out.get(look.name) ?? { name: look.name, style: look.style, count: 0 };
    g.count++;
    out.set(look.name, g);
  }
  return [...out.values()];
}

