/**
 * Madame Monique, the Desert Palms roulette croupier: memory, events and lines.
 *
 * SCRIPT ROOM: every line here is APPROVED. The signature line "The wheel
 * remembers, darling." was approved first; the author approved all of the
 * remaining lines, as written, on 22 Nov 2026. New or changed lines must start
 * as drafts (`approved: false`, shown with a "Draft line" tag) until signed off.
 * The full inventory, by event and Ryan's phase, is docs/MONIQUE_DIALOGUE_INVENTORY.md.
 *
 * She reacts only; nothing here changes odds, payouts or rules, and she never
 * refuses to talk or penalises Ryan.
 */
export type MoniqueExpr = 'neutral' | 'raised' | 'smirk' | 'surprised';
export type RyanPhase = 1 | 2 | 3;
export type MoniqueEvent =
  | 'pink_jacket'
  | 'greet_first'
  | 'greet_quick_return'
  | 'greet_golf_win'
  | 'greet_missed_cut'
  | 'greet_phase_change'
  | 'greet_repeat'
  | 'banter'
  | 'win_streak'
  | 'loss_streak'
  | 'extraordinary'
  | 'reckless'
  | 'insufficient_funds'
  | 'farewell_ahead'
  | 'farewell_behind'
  | 'farewell_broke';

export const SIGNATURE = 'The wheel remembers, darling.';

export interface Line {
  text: string;
  approved?: boolean;
}
interface EventLines {
  monique: Line[];
  /** Ryan's automatic comeback per phase (optional, shown after Monique's line). */
  ryan?: Record<RyanPhase, Line[]>;
}

/** Author approval of every line below, as written (22 Nov 2026). */
export const LINES_APPROVED_ON = '2026-11-22';
const L = (...t: string[]): Line[] => t.map((text) => ({ text, approved: true }));

/** Approved dialogue (see header). */
export const LINES: Record<MoniqueEvent, EventLines> = {
  pink_jacket: {
    monique: L('A Pink Jacket. Sincerely, Ryan, congratulations. It suits you.', 'I heard about the jacket. Well played. Truly.'),
    ryan: { 1: L('Wait, you watch golf?'), 2: L('Careful. That almost sounded nice.'), 3: L('Thank you, Monique. I mean it.') },
  },
  greet_first: {
    monique: L('Welcome to my table. Chips down, chin up.', 'A new face. The wheel adores new faces.'),
    ryan: { 1: L('Relax, I have a system.'), 2: L('Just here to lose money with dignity.'), 3: L('Spin it. I am not scared of you.') },
  },
  greet_quick_return: {
    monique: L('Back so soon? The wheel did not even have time to miss you.', 'You left. You returned. How predictable.'),
  },
  greet_golf_win: {
    monique: L('A tournament win, I hear. Let us see if luck travels.', 'Champion of the fairway. Here you are merely a guest.'),
    ryan: { 1: L('Winners win. Everywhere. Probably.'), 2: L('Won something for once. Let me enjoy it.'), 3: L('Luck had nothing to do with it.') },
  },
  greet_missed_cut: {
    monique: L('A missed cut. The wheel is kinder than the leaderboard. Occasionally.', 'Rough week on the course, darling? Sit.'),
    ryan: { 1: L('The course was rigged.'), 2: L('Do not start.'), 3: L('Happens. Spin.') },
  },
  greet_phase_change: {
    monique: L('A new look. The wheel does not care, but I noticed.', 'Different, yet somehow the same bets. Fascinating.'),
  },
  greet_repeat: {
    monique: L('Ah. You again.', 'Good evening. Your usual seat is free. It always is.', 'The wheel remembers, darling.'),
  },
  banter: {
    monique: L(
      'Bold choice. Not wise. But bold.',
      'Do you pick numbers, or do numbers pick you?',
      'Every chip tells a story. Yours are mostly tragedies.',
      'I have seen that bet before. I have seen it lose before.',
      'The wheel remembers, darling.',
    ),
    ryan: { 1: L('That is called strategy.'), 2: L('Story of my life.'), 3: L('Keep talking. I will keep winning.') },
  },
  win_streak: {
    monique: L('Another win. Do not get comfortable.', 'Three in a row. The house is taking notes.'),
    ryan: { 1: L('Told you. System.'), 2: L('Something finally went right.'), 3: L('Get used to it.') },
  },
  loss_streak: {
    monique: L('Unlucky.', 'Again? How consistent of you.', 'At this point I should thank you personally.'),
    ryan: { 1: L('Warming up.'), 2: L('Naturally.'), 3: L('The wheel owes me one.') },
  },
  extraordinary: {
    monique: L('Oh. Well. That does not happen often.', '...Congratulations. Do not tell anyone I said that.'),
    ryan: { 1: L('Who is the genius now?'), 2: L('Wait, that actually worked?'), 3: L('Pay the lady. I mean, pay me.') },
  },
  reckless: {
    monique: L('That is a great deal of money, darling. Are we feeling brave or foolish?', 'Bold. The wheel loves a generous guest.'),
  },
  insufficient_funds: {
    monique: L('The table requires chips, darling. Imagination is not accepted.', 'Your wallet appears to have left before you did.'),
  },
  farewell_ahead: {
    monique: L('Leaving ahead. Enjoy it. The wheel will be waiting.', 'Go, before it notices.'),
  },
  farewell_behind: {
    monique: L('Better luck next time. Or simply better judgement.', 'Until next time. Bring more chips.'),
  },
  farewell_broke: {
    monique: L('Empty pockets. A classic ending.', 'Do come back when you are solvent, darling.'),
  },
};

/** Monique's portrait for an event (loss streaks sharpen: neutral → raised eyebrow → faint smirk). */
export function exprFor(ev: MoniqueEvent, lossStreak = 0): MoniqueExpr {
  if (ev === 'extraordinary') return 'surprised';
  if (ev === 'loss_streak') return lossStreak >= 7 ? 'smirk' : lossStreak >= 5 ? 'raised' : 'neutral';
  if (ev === 'reckless' || ev === 'greet_quick_return') return 'raised';
  if (ev === 'farewell_broke' || ev === 'insufficient_funds' || ev === 'banter' || ev === 'greet_repeat') return 'smirk';
  return 'neutral';
}

/** Which loss-streak line (sharper as the streak grows). */
export const lossLineIndex = (lossStreak: number) => (lossStreak >= 7 ? 2 : lossStreak >= 5 ? 1 : 0);

// ───────────────────────── Memory (saved on the career, additively) ─────────────────────────

export interface MoniqueMemory {
  visits: number;
  winStreak: number;
  lossStreak: number;
  bestWinStreak: number;
  worstLossStreak: number;
  /** Session = one casino visit (casino week key). */
  sessionKey: string;
  sessionNet: number;
  spinsSinceBanter: number;
  nextBanterAt: number;
  /** Golf/career facts already remarked on. */
  seenWins: number;
  seenMissedCuts: number;
  seenAct: number;
  pinkAck: boolean;
  /** Rotates through each event's lines so they don't repeat back to back. */
  lineCursor: Record<string, number>;
}

export const FRESH: MoniqueMemory = {
  visits: 0, winStreak: 0, lossStreak: 0, bestWinStreak: 0, worstLossStreak: 0, sessionKey: '', sessionNet: 0,
  spinsSinceBanter: 0, nextBanterAt: 4, seenWins: 0, seenMissedCuts: 0, seenAct: 1, pinkAck: false, lineCursor: {},
};

export function readMemory(flags: Record<string, unknown>): MoniqueMemory {
  const raw = flags.moniqueMemory;
  if (typeof raw !== 'string') return { ...FRESH, lineCursor: {} };
  try {
    return { ...FRESH, ...(JSON.parse(raw) as Partial<MoniqueMemory>) };
  } catch {
    return { ...FRESH, lineCursor: {} };
  }
}

export interface CareerFacts {
  /** Casino week key of this visit. */
  sessionKey: string;
  wins: number;
  missedCuts: number;
  act: number;
  pinkJackets: number;
}

/** Arriving at the table: the greeting (most notable thing first). Returns the event and the updated memory. */
export function arrive(m: MoniqueMemory, f: CareerFacts): { ev: MoniqueEvent; mem: MoniqueMemory } {
  const mem: MoniqueMemory = { ...m, lineCursor: { ...m.lineCursor } };
  const sameSession = mem.sessionKey === f.sessionKey && mem.visits > 0;
  let ev: MoniqueEvent;
  if (f.pinkJackets > 0 && !mem.pinkAck) {
    ev = 'pink_jacket';
    mem.pinkAck = true;
  } else if (mem.visits === 0) ev = 'greet_first';
  else if (sameSession) ev = 'greet_quick_return';
  else if (f.act !== mem.seenAct) ev = 'greet_phase_change';
  else if (f.wins > mem.seenWins) ev = 'greet_golf_win';
  else if (f.missedCuts > mem.seenMissedCuts) ev = 'greet_missed_cut';
  else ev = 'greet_repeat';
  mem.visits += 1;
  if (!sameSession) {
    mem.sessionKey = f.sessionKey;
    mem.sessionNet = 0;
  }
  mem.seenWins = f.wins;
  mem.seenMissedCuts = f.missedCuts;
  mem.seenAct = f.act;
  return { ev, mem };
}

/**
 * After a spin settles. `staked` and `paid` are the spin's totals; `bankBefore` the balance before the bets.
 * `nextBanter` picks the gap to the next routine line (3–5 spins).
 */
export function afterSpin(
  m: MoniqueMemory,
  s: { staked: number; paid: number; straightHit: boolean; bankBefore: number },
  nextBanter: () => number,
): { ev: MoniqueEvent | null; mem: MoniqueMemory } {
  const mem: MoniqueMemory = { ...m, lineCursor: { ...m.lineCursor } };
  const net = s.paid - s.staked;
  mem.sessionNet += net;
  if (net > 0) {
    mem.winStreak += 1;
    mem.lossStreak = 0;
    mem.bestWinStreak = Math.max(mem.bestWinStreak, mem.winStreak);
  } else if (net < 0) {
    mem.lossStreak += 1;
    mem.winStreak = 0;
    mem.worstLossStreak = Math.max(mem.worstLossStreak, mem.lossStreak);
  }
  mem.spinsSinceBanter += 1;
  let ev: MoniqueEvent | null = null;
  if (s.paid >= s.staked * 10 && s.paid > 0) ev = 'extraordinary';
  else if (s.staked >= 1000 || (s.bankBefore > 0 && s.staked >= s.bankBefore * 0.5)) ev = 'reckless';
  else if (net > 0 && [3, 5, 8].includes(mem.winStreak)) ev = 'win_streak';
  else if (net < 0 && [3, 5, 7, 10].includes(mem.lossStreak)) ev = 'loss_streak';
  else if (mem.spinsSinceBanter >= mem.nextBanterAt) ev = 'banter';
  if (ev) {
    mem.spinsSinceBanter = 0;
    mem.nextBanterAt = nextBanter();
  }
  return { ev, mem };
}

export function farewellEvent(m: MoniqueMemory, balance: number): MoniqueEvent {
  if (balance < 5) return 'farewell_broke';
  return m.sessionNet > 0 ? 'farewell_ahead' : 'farewell_behind';
}

/** The next line for an event, rotating so the same line doesn't come twice in a row. */
export function pickLine(m: MoniqueMemory, ev: MoniqueEvent, lossStreak = 0): { line: Line; mem: MoniqueMemory } {
  const lines = LINES[ev].monique;
  if (ev === 'loss_streak') return { line: lines[lossLineIndex(lossStreak)], mem: m };
  const i = (m.lineCursor[ev] ?? 0) % lines.length;
  return { line: lines[i], mem: { ...m, lineCursor: { ...m.lineCursor, [ev]: i + 1 } } };
}

/** Ryan's automatic comeback for this event in his current phase (every other time, so it doesn't crowd her). */
export function ryanComeback(ev: MoniqueEvent, phase: RyanPhase, n: number): Line | null {
  const r = LINES[ev].ryan?.[phase];
  if (!r || !r.length) return null;
  return ev === 'pink_jacket' || ev === 'extraordinary' || n % 2 === 0 ? r[Math.floor(n / 2) % r.length] : null;
}
