/**
 * CI-1 selection: the round's plan, as a pure fold over every boundary
 * reached this round. Cap, cooldown, late reserve and repeat come from the
 * plan itself, never from stored state, so the plan is identical on every
 * reload and device. A planned selection counts against the cap whether or
 * not it was ever shown (Decision C). Revision 3 adds per-context thresholds
 * and caps, the late reserve, the contender and Kayla bonuses, and the
 * Ryan-far filter with its special-event exemption.
 */
import { hashString } from '../golf/math';
import { capFor, contextOf, EXCEPTIONAL, EXCEPTIONAL_OVERRIDE, GATE_TOP, LATE_HOLES, PROFILES, TYPE_PRIORITY } from './constants';
import { detect, totalsAt } from './detect';
import { isProximate, score4, type ScoreCtx } from './score';
import type { Candidate, Decision, Moment, ProfileId, RevealSnapshot, SuppressReason } from './types';

const prio = (t: Moment['type']) => TYPE_PRIORITY.indexOf(t);

export interface PlanOptions {
  exceptionalOverride?: boolean;
}

/** One candidate per golfer: an exceptional tag wins, then the highest S4, then type priority, then the later hole. */
export function mergeCandidates(raw: Moment[], ctxFor: (m: Moment) => ScoreCtx): Candidate[] {
  const byGolfer = new Map<string, Moment[]>();
  for (const m of raw) byGolfer.set(m.golferId, [...(byGolfer.get(m.golferId) ?? []), m]);
  const out: Candidate[] = [];
  for (const [, tags] of [...byGolfer].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const scored = tags.map((m) => ({ m, s4: score4(m, ctxFor(m)), x: EXCEPTIONAL.has(m.type) }));
    scored.sort((a, b) => Number(b.x) - Number(a.x) || (a.x && b.x ? prio(a.m.type) - prio(b.m.type) : 0) || b.s4 - a.s4 || prio(a.m.type) - prio(b.m.type) || b.m.hole - a.m.hole);
    const top = scored[0];
    const also = [...new Set(scored.slice(1).map((s) => s.m.type).filter((t) => t !== top.m.type))].sort((a, b) => prio(a) - prio(b));
    out.push({ moment: { ...top.m, alsoTags: also }, s4: top.s4, exceptional: top.x });
  }
  return out;
}

const byHash = (a: Candidate, b: Candidate) => hashString(a.moment.momentId) - hashString(b.moment.momentId);
const exceptionalOrder = (a: Candidate, b: Candidate) => prio(a.moment.type) - prio(b.moment.type) || b.s4 - a.s4 || byHash(a, b);
const normalOrder = (a: Candidate, b: Candidate) => b.s4 - a.s4 || prio(a.moment.type) - prio(b.moment.type) || a.moment.position - b.moment.position || byHash(a, b);

export function planRound(snap: RevealSnapshot, profileId: ProfileId, opts: PlanOptions = {}): Decision[] {
  const override = opts.exceptionalOverride ?? EXCEPTIONAL_OVERRIDE;
  const profile = PROFILES[profileId];
  const H = snap.pars.length;
  const context = contextOf(snap.special, snap.isFinal);
  const cap = capFor(profileId, context, H);
  const threshold4 = 4 * profile.threshold[context];
  const ryanAlive = snap.alive.includes(snap.ryanId);
  const featured = new Set<string>();
  const decisions: Decision[] = [];
  let used = 0;
  let overrideUsed = false;
  let qLast: number | null = null;
  let p = 0;

  for (const q of snap.boundaries) {
    if (q <= p) continue;
    const atQ = totalsAt(snap, q);
    const ryanTotalToPar = ryanAlive ? atQ.get(snap.ryanId)! : 0;
    const lead = Math.min(...atQ.values());
    const ctx = (m: Moment): ScoreCtx => ({
      profile: profileId,
      special: snap.special,
      isFinal: snap.isFinal,
      holesPerRound: H,
      ryanAlive,
      ryanTotalToPar,
      lead,
      rivalId: snap.rivalId,
      repeat: featured.has(m.golferId),
    });
    const candidates = mergeCandidates(detect(snap, p, q), ctx);
    // Item 9: the Ryan-far filter (non-final rounds only); M3 exempts the top of a special event's board.
    const ryanGap = ryanAlive ? ryanTotalToPar - lead : Infinity;
    const farFilter = profile.ryanFarGap !== null && !snap.isFinal && ryanGap >= profile.ryanFarGap;
    const gateOk = (c: Candidate) => {
      const near = isProximate(c.moment.totalToPar, ctx(c.moment));
      const rival = c.moment.golferId === snap.rivalId;
      if (farFilter) return near || rival || (snap.special && c.moment.position <= profile.majorTopExempt);
      return c.moment.position <= GATE_TOP || near || rival;
    };

    const capLeft = used < cap;
    const exceptionalRoom = capLeft || (override && !overrideUsed && used === cap && cap > 0);
    const cooling = qLast !== null && q - qLast < profile.cooldown;
    // Item 5: after the first selection, later non-exceptional slots wait for the last holes.
    const reserved = profile.lateReserve && used >= 1 && q <= H - LATE_HOLES;
    let selected: Candidate | null = null;

    const exc = candidates.filter((c) => c.exceptional).sort(exceptionalOrder);
    if (exc.length && exceptionalRoom) selected = exc[0];
    if (!selected && capLeft && !cooling && !reserved) {
      const ok = candidates.filter((c) => !c.exceptional && gateOk(c) && c.s4 >= threshold4).sort(normalOrder);
      if (ok.length) selected = ok[0];
    }

    const suppressed: { momentId: string; reason: SuppressReason }[] = [];
    for (const c of candidates) {
      if (c === selected) continue;
      let reason: SuppressReason;
      // Reasons follow the rule order of Revision 3: cap, cooldown, late reserve, gate, threshold.
      if (c.exceptional) reason = exceptionalRoom ? 'lost_tiebreak' : 'suppressed_cap';
      else if (!capLeft) reason = 'suppressed_cap';
      else if (cooling) reason = 'suppressed_cooldown';
      else if (reserved) reason = 'late_reserve';
      else if (!gateOk(c)) reason = 'gate';
      else if (c.s4 < threshold4) reason = 'below_threshold';
      else reason = 'lost_tiebreak';
      suppressed.push({ momentId: c.moment.momentId, reason });
    }

    if (selected) {
      if (!capLeft) overrideUsed = true;
      used++;
      qLast = q;
      featured.add(selected.moment.golferId);
    }
    decisions.push({ q, p, candidates, selected: selected?.moment.momentId ?? null, suppressed });
    p = q;
  }
  return decisions;
}

/** The decision at boundary q, or null if q is not a boundary of this round. */
export function selectAt(snap: RevealSnapshot, profileId: ProfileId, q: number, opts: PlanOptions = {}): Decision | null {
  return planRound(snap, profileId, opts).find((d) => d.q === q) ?? null;
}
