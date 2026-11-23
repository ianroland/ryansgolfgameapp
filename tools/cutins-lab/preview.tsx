/**
 * CI-2 review gallery: every approved cut-in category, rendered by the same
 * component the game uses, from genuine simulation records only
 * (preview-records.json). Each record is re-planned with the shipped CI-1
 * selector here; a record that CI-1 would not select is shown as an error,
 * never as a cut-in. Not part of the game build.
 *
 * Open with the dev server: /tools/cutins-lab/preview.html
 */
import { createRoot } from 'react-dom/client';
import '@fontsource/tiny5/400.css';
import '@fontsource/jersey-15/400.css';
import '../../src/ui/styles.css';
import { planRound } from '../../src/cutins/plan';
import type { ProfileId, RevealSnapshot } from '../../src/cutins/types';
import { buildCutInView, CutInFrame, type CutInView } from '../../src/ui/tournament/CutInCard';
import { CUTIN_LABEL } from '../../src/ui/tournament/cutinCopy';
import backdrop from '../../src/assets/backdrop_coast.png';
import data from './preview-records.json';

interface GalleryRecord {
  category: string;
  momentId: string;
  profile: ProfileId;
  q: number;
  source: { tournamentId: string; event: string; tour: string; special: boolean; season: number; mode: string; round: number; rounds: number; careerSeed: number };
  names: Record<string, string>;
  snapshot: RevealSnapshot;
}

function viewOf(r: GalleryRecord): CutInView | string {
  const d = planRound(r.snapshot, r.profile).find((x) => x.q === r.q);
  if (!d || d.selected !== r.momentId) return `CI-1 does not select ${r.momentId} at q ${r.q}`;
  const m = d.candidates.find((c) => c.moment.momentId === r.momentId)!.moment;
  return buildCutInView(r.snapshot, r.q, m, r.names);
}

const css = `
  body { background: #06160c; }
  .gal { max-width: 1240px; margin: 0 auto; padding: 24px 16px 60px; }
  .gal h1 { font-family: var(--head); font-weight: 400; font-size: 40px; margin: 0 0 4px; color: var(--gold); text-shadow: 3px 3px 0 var(--ink); text-transform: uppercase; }
  .gal p.lead { color: var(--muted); margin: 0 0 22px; max-width: 900px; }
  .gal-item { margin: 0 0 34px; }
  .gal-cap { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: baseline; margin: 0 0 8px; color: var(--muted); font-size: 14px; }
  .gal-cap strong { font-family: var(--head); font-weight: 400; font-size: 24px; color: var(--text); }
  .gal-cap code { color: var(--gold-2); font-size: 12px; }
  .tv { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border: 4px solid var(--ink); box-shadow: 0 0 0 3px var(--gold-dark);
        background: linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(16,60,30,.9) 75%), url(${backdrop}) center 30% / cover; image-rendering: pixelated; container-type: inline-size; }
  .tv .cutin-layer.still { position: absolute; cursor: default; }
  .tv .cutin-layer.still .cutin-skip, .tv .cutin-layer.still .cutin-timer { display: none; }
  .err { color: var(--danger); }
  .gal-play { margin: -8px 0 26px; font-size: 18px; } .gal-play a { color: var(--gold-2); } .gal-play .muted { color: var(--muted); font-size: 14px; }
`;

function Gallery() {
  const records = (data as unknown as { records: GalleryRecord[] }).records;
  const order = Object.keys(CUTIN_LABEL);
  const missing = order.filter((t) => !records.some((r) => r.category === t));
  return (
    <div className="gal">
      <style>{css}</style>
      <h1>Cut-in gallery · CI-2 review</h1>
      <p className="lead">
        One genuine moment per approved category, re-selected live by the shipped CI-1 selector from a real simulated round. Same component as the game, frozen (no timer, no skip).
        {missing.length ? <span className="err"> Missing categories: {missing.join(', ')}.</span> : ' All seven categories are covered by real records.'}
      </p>
      <p className="gal-play">
        Play the review build with cut-ins:{' '}
        <a href="../../index.html#cutins-fulltv">Full TV</a> · <a href="../../index.html#cutins-balanced">Balanced (default)</a> · <a href="../../index.html#cutins-off">Off</a>
        <span className="muted"> (remembered on this device; enter any tournament in Full or Key Holes mode)</span>
      </p>
      {order.map((type) => records.filter((r) => r.category === type).map((r) => {
        const v = viewOf(r);
        return (
          <section className="gal-item" key={r.momentId} data-testid={`gallery-${type}`}>
            <div className="gal-cap">
              <strong>{CUTIN_LABEL[type as keyof typeof CUTIN_LABEL]}</strong>
              <span>{r.source.event} · {r.source.tour.toUpperCase()}{r.source.special ? ' major' : ''} · season {r.source.season} · round {r.source.round} of {r.source.rounds} · after hole {r.q} · {r.profile === 'fullTv' ? 'Full TV' : 'Balanced'}</span>
              <code>{r.momentId}</code>
            </div>
            <div className="tv">{typeof v === 'string' ? <p className="err">{v}</p> : <CutInFrame view={v} still />}</div>
          </section>
        );
      }))}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
