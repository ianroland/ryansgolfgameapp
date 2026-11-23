import { useEffect, useMemo, useState } from 'react';
import { ALBATROSS_TROPHIES, TROPHY_DEFINITIONS } from '../../catalog/trophies';
import { COURSES } from '../../golf/courses';
import { holeYardage } from '../../golf/course';
import {
  milestoneLabel,
  rankByCount,
  scoreLine,
  type AlbatrossRecord,
  type CountRow,
} from '../../records/albatross';
import type { RecordBook } from '../../services/recordsService';
import { useGame } from '../GameContext';
import { formatGameDate } from '../format';
import { TourPill } from '../career/bits';
import { PixelBird } from './PixelBird';

type View = 'career' | 'season' | 'log' | 'courses' | 'mine';
const VIEWS: { id: View; label: string }[] = [
  { id: 'career', label: 'Career' },
  { id: 'season', label: 'Season' },
  { id: 'log', label: 'All-time log' },
  { id: 'courses', label: 'Courses' },
  { id: 'mine', label: 'My albatrosses' },
];

const where = (a: AlbatrossRecord) => `#${a.holeNumber} ${a.courseName}`;
const when = (a: AlbatrossRecord) => `S${a.season} · Wk ${a.week}`;

function Name({ a, me }: { a: { golferName: string; isPlayer: boolean }; me?: boolean }) {
  return (
    <>
      {a.isPlayer ? 'Ryan' : a.golferName}
      {(me ?? a.isPlayer) && <span className="pill gold you">You</span>}
    </>
  );
}

function CountTable({ rows, empty, testid }: { rows: CountRow[]; empty: string; testid: string }) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="data-table alb-table" data-testid={testid}>
        <thead>
          <tr>
            <th>Rank</th>
            <th className="l">Golfer</th>
            <th title="Verified albatrosses">Albatrosses</th>
            <th title="Rounds in events on file">Rounds</th>
            <th className="l">Most recent</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.golferId} className={r.isPlayer ? 'me' : ''}>
              <td className="rank">{r.rankLabel}</td>
              <td className="l"><Name a={r} /></td>
              <td className="big">{r.count}</td>
              <td>{r.rounds || '—'}</td>
              <td className="l">
                {scoreLine(r.latest)} · {where(r.latest)}
                <span className="sub">{when(r.latest)} · {r.latest.tournamentName}</span>
              </td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogTable({ list, numbered = true, testid }: { list: AlbatrossRecord[]; numbered?: boolean; testid: string }) {
  return (
    <div className="table-wrap">
      <table className="data-table alb-table alb-log" data-testid={testid}>
        <thead>
          <tr>
            {numbered && <th>#</th>}
            <th className="l">Golfer</th>
            <th className="l">Course · hole</th>
            <th>Par</th>
            <th>Yds</th>
            <th>Score</th>
            <th className="l">Tournament</th>
            <th className="l">When</th>
          </tr>
        </thead>
        <tbody>
          {list.map((a, i) => (
            <tr key={a.id} className={a.isPlayer ? 'me' : ''}>
              {numbered && <td className="rank">{i + 1}</td>}
              <td className="l"><Name a={a} /></td>
              <td className="l">
                {a.courseName}
                <span className="sub">Hole {a.holeNumber} · {a.holeName} · Rd {a.round}</span>
              </td>
              <td>{a.par}</td>
              <td>{a.yards}</td>
              <td className="big">{a.strokes}</td>
              <td className="l">
                <TourPill tour={a.tour} /> {a.tournamentName}
                {a.major && <span className="pill gold">Major</span>}
                {a.shot && <span className="sub">{a.shot}</span>}
              </td>
              <td className="l">
                {when(a)}
                <span className="sub">{formatGameDate(a.gameDate)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CourseView({ book }: { book: RecordBook }) {
  const played = new Set(book.albatrosses.map((a) => a.courseId));
  const [courseId, setCourseId] = useState<string>(() => COURSES.find((c) => played.has(c.id))?.id ?? COURSES[0].id);
  const [hole, setHole] = useState<'all' | number>('all');
  const course = COURSES.find((c) => c.id === courseId) ?? COURSES[0];
  const atCourse = book.albatrosses.filter((a) => a.courseId === course.id);
  const shown = atCourse.filter((a) => hole === 'all' || a.holeNumber === hole);
  return (
    <>
      <div className="alb-filters">
        <label>
          Course
          <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setHole('all'); }} data-testid="alb-course">
            {COURSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({book.albatrosses.filter((a) => a.courseId === c.id).length})
              </option>
            ))}
          </select>
        </label>
        <label>
          Hole
          <select value={hole} onChange={(e) => setHole(e.target.value === 'all' ? 'all' : Number(e.target.value))} data-testid="alb-hole">
            <option value="all">All holes</option>
            {course.holes.map((h) => (
              <option key={h.number} value={h.number}>
                {h.number} · {h.name} (par {h.par})
              </option>
            ))}
          </select>
        </label>
      </div>
      <ol className="alb-holes" aria-label={`Albatrosses by hole at ${course.name}`}>
        {course.holes.map((h) => {
          const n = atCourse.filter((a) => a.holeNumber === h.number).length;
          const possible = h.par >= 4;
          return (
            <li key={h.number}>
              <button className={`${hole === h.number ? 'on' : ''} ${n ? 'has' : ''}`} onClick={() => setHole(hole === h.number ? 'all' : h.number)} disabled={!possible} title={possible ? undefined : 'A par 3 can’t be three under'}>
                <span className="hn">{h.number}</span>
                <span className="hp">Par {h.par} · {holeYardage(h)}y</span>
                <b className="hc">{possible ? n : '—'}</b>
              </button>
            </li>
          );
        })}
      </ol>
      {shown.length ? (
        <LogTable list={shown} numbered={false} testid="alb-course-list" />
      ) : (
        <p className="empty">No albatrosses recorded {hole === 'all' ? `at ${course.name}` : `on hole ${hole}`} yet.</p>
      )}
    </>
  );
}

function MineView({ mine }: { mine: AlbatrossRecord[] }) {
  const next = ALBATROSS_TROPHIES.find((t) => t.count > mine.length);
  if (!mine.length) {
    return (
      <div className="alb-empty-mine">
        <PixelBird className="alb-bird small" />
        <p>
          <b>No albatrosses yet.</b> Hole a par 5 in two or a par 4 from the tee, three under par on one hole. Tour pros
          see one every few seasons. When it happens it goes in here for good, with a <b>{TROPHY_DEFINITIONS.albatross_first.name}</b> for the clubhouse.
        </p>
      </div>
    );
  }
  return (
    <>
      {next && (
        <p className="alb-next">
          {next.count - mine.length} more to unlock the <b>{TROPHY_DEFINITIONS[next.defId].name}</b>.
        </p>
      )}
      <ol className="alb-plaques" data-testid="alb-mine">
        {[...mine].reverse().map((a) => {
          const n = mine.indexOf(a) + 1;
          return (
            <li key={a.id} className="alb-plaque">
              <span className="ap-num">#{n}</span>
              <span className="ap-score">{a.strokes}</span>
              <span className="ap-par">Par {a.par}</span>
              <div className="ap-body">
                <b>Hole {a.holeNumber} · {a.holeName}</b>
                <span>{a.courseName} · {a.yards} yds</span>
                <span>
                  {a.tournamentName}, round {a.round} · {when(a)}
                </span>
                {a.shot && <span className="ap-shot">{a.shot}</span>}
                {milestoneLabel(n) && <span className="ap-milestone">{milestoneLabel(n)}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** The record book: the Albatross Leaderboard. */
export function RecordsPanel() {
  const { services, state } = useGame();
  const c = state.career;
  const [book, setBook] = useState<RecordBook | null>(null);
  const [view, setView] = useState<View>('career');
  const [season, setSeason] = useState<number>(c.season);

  useEffect(() => {
    let live = true;
    void services.records.recordBook().then((b) => live && setBook(b));
    return () => {
      live = false;
    };
  }, [services, c.totals.events, c.season]);

  const career = useMemo(() => (book ? rankByCount(book.albatrosses, book.rounds) : []), [book]);
  const seasonRows = useMemo(() => (book ? rankByCount(book.albatrosses.filter((a) => a.season === season), book.rounds) : []), [book, season]);
  if (!book) return <main className="records"><p className="muted">Loading the record book…</p></main>;

  const mine = book.albatrosses.filter((a) => a.golferId === c.playerId);
  const latest = book.albatrosses[book.albatrosses.length - 1];

  return (
    <main className="records" data-testid="records">
      <section className="hub-card alb-hero">
        <PixelBird className="alb-bird hero" title="Albatross" />
        <div>
          <h2 className="hub-title">Albatross Leaderboard</h2>
          <p className="muted">Three under par on one hole: a par 5 in 2, a par 4 in 1. Every entry comes from a verified, finished hole score.</p>
        </div>
        <dl className="alb-summary">
          <div><dt>On record</dt><dd data-testid="alb-total">{book.albatrosses.length}</dd></div>
          <div><dt>Ryan</dt><dd data-testid="alb-mine-count">{mine.length}</dd></div>
          <div><dt>Latest</dt><dd className="small">{latest ? `${latest.isPlayer ? 'Ryan' : latest.golferName}, ${when(latest)}` : '—'}</dd></div>
        </dl>
      </section>

      <section className="hub-card">
        <nav className="subtabs" aria-label="Albatross Leaderboard">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)} data-testid={`alb-view-${v.id}`} aria-pressed={view === v.id}>
              {v.label}
            </button>
          ))}
        </nav>

        {view === 'career' && <CountTable rows={career} testid="alb-career" empty="No albatrosses on record yet. When anyone in a field Ryan plays makes one, it lands here." />}

        {view === 'season' && (
          <>
            <div className="alb-filters">
              <label>
                Season
                <select value={season} onChange={(e) => setSeason(Number(e.target.value))} data-testid="alb-season">
                  {Array.from({ length: c.season }, (_, i) => c.season - i).map((s) => (
                    <option key={s} value={s}>Season {s}{s === c.season ? ' (current)' : ''}</option>
                  ))}
                </select>
              </label>
            </div>
            <CountTable rows={seasonRows} testid="alb-season-table" empty={`No albatrosses in season ${season} yet.`} />
          </>
        )}

        {view === 'log' &&
          (book.albatrosses.length ? (
            <LogTable list={book.albatrosses} testid="alb-log" />
          ) : (
            <p className="empty">The all-time log is empty. The first albatross in any event Ryan plays will be entry #1.</p>
          ))}

        {view === 'courses' && <CourseView book={book} />}

        {view === 'mine' && <MineView mine={mine} />}

        <p className="fineprint">
          Tracking covers every golfer in the events Ryan plays: {book.verifiedEvents} event{book.verifiedEvents === 1 ? '' : 's'} on file
          {book.storedEvents > book.verifiedEvents ? ` (${book.storedEvents - book.verifiedEvents} without verifiable hole scores, skipped)` : ''}. Ties share a rank;
          within a tie the most recent albatross is listed first.
        </p>
      </section>
    </main>
  );
}
