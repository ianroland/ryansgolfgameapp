/**
 * Writes docs/MONIQUE_DIALOGUE_INVENTORY.md from the live line table in
 * src/casino/monique.ts, so the Script Room always reviews exactly what ships.
 * Run: npx vite-node scripts/monique-inventory.ts
 */
import { writeFileSync } from 'node:fs';
import { exprFor, LINES, LINES_APPROVED_ON, SIGNATURE, type MoniqueEvent, type RyanPhase } from '../src/casino/monique';
import pkg from '../package.json';

const GROUPS: { title: string; events: { ev: MoniqueEvent; when: string; phases: string }[] }[] = [
  {
    title: 'Arriving at her table',
    events: [
      { ev: 'pink_jacket', when: 'First roulette visit after Ryan holds a Pink Jacket. Once ever.', phases: 'Act III+ only (a Pink Jacket needs phase-3 Ryan winning the Desert Rose Invitational on the LPGA)' },
      { ev: 'greet_first', when: 'First time at her table.', phases: 'Any' },
      { ev: 'greet_quick_return', when: 'Returning to roulette in the same casino visit.', phases: 'Any' },
      { ev: 'greet_golf_win', when: 'First visit after a new tournament win.', phases: 'Any' },
      { ev: 'greet_missed_cut', when: 'First visit after a missed cut.', phases: 'Any' },
      { ev: 'greet_phase_change', when: "First visit after Ryan's story act changed.", phases: 'Act II+ only' },
      { ev: 'greet_repeat', when: 'Any other arrival.', phases: 'Any' },
    ],
  },
  {
    title: 'At the table (never during a spin)',
    events: [
      { ev: 'banter', when: 'Routine: every 3–5 spins, after the wheel stops.', phases: 'Any' },
      { ev: 'win_streak', when: 'After the 3rd, 5th and 8th winning spin in a row.', phases: 'Any' },
      { ev: 'loss_streak', when: 'After the 3rd/5th/7th/10th losing spin in a row. Line and portrait sharpen: 3 → line 1 neutral, 5 → line 2 raised eyebrow, 7+ → line 3 faint smirk.', phases: 'Any' },
      { ev: 'extraordinary', when: 'A spin paying 10× or more of the stake (e.g. a straight-up hit). Portrait: surprised, then neutral.', phases: 'Any' },
      { ev: 'reckless', when: 'A spin with $1,000+ on the table, or half the bank or more.', phases: 'Any' },
      { ev: 'insufficient_funds', when: 'Placing a chip bigger than the bank.', phases: 'Any' },
    ],
  },
  {
    title: 'Leaving the table',
    events: [
      { ev: 'farewell_ahead', when: 'Leaving ahead this casino visit.', phases: 'Any' },
      { ev: 'farewell_behind', when: 'Leaving behind this casino visit.', phases: 'Any' },
      { ev: 'farewell_broke', when: 'Leaving with under $5.', phases: 'Any' },
    ],
  },
];

const PHASES: RyanPhase[] = [1, 2, 3];
const PHASE_NAME: Record<RyanPhase, string> = { 1: 'Phase 1 (natural hair, he/him): cocky', 2: 'Phase 2 (bald, he/him): bitter', 3: 'Phase 3 (wig and visor, she/her): sharp' };
const status = (approved?: boolean) => (approved ? 'Approved' : 'Draft line');
const esc = (t: string) => t.replace(/\|/g, '\\|');

let moniqueCount = 0, ryanCount = 0, approvedCount = 0;
for (const e of Object.values(LINES)) {
  moniqueCount += e.monique.length;
  approvedCount += e.monique.filter((l) => l.approved).length;
  for (const p of PHASES) {
    ryanCount += e.ryan?.[p]?.length ?? 0;
    approvedCount += e.ryan?.[p]?.filter((l) => l.approved).length ?? 0;
  }
}
const covered = GROUPS.flatMap((g) => g.events.map((e) => e.ev));
const missing = (Object.keys(LINES) as MoniqueEvent[]).filter((e) => !covered.includes(e));
if (missing.length) throw new Error(`Inventory is missing events: ${missing.join(', ')}`);

const out: string[] = [];
out.push('# Madame Monique: dialogue inventory (for Script Room review)', '');
out.push(`Generated from \`src/casino/monique.ts\` (v${pkg.version}) by \`scripts/monique-inventory.ts\`, so it always matches what ships.`, '');
out.push(`**${moniqueCount + ryanCount} lines:** ${moniqueCount} by Monique and ${ryanCount} comebacks by Ryan.`, '');
out.push(approvedCount === moniqueCount + ryanCount
  ? `**All ${approvedCount} lines are approved** (author sign-off ${LINES_APPROVED_ON}; the signature line "${SIGNATURE}" was approved first). No line shows a "Draft line" tag in the game.`
  : `**Approved: ${approvedCount} of ${moniqueCount + ryanCount}.** Lines not yet approved show a "Draft line" tag in the game.`, '');
out.push('To change a line, edit it here and send it back. A changed line goes back to draft until it is signed off. The triggers and the dialogue system stay as they are.', '');
out.push("**How phases work:** Monique's lines are the same in every phase. Ryan's automatic comeback depends on the phase look he is wearing (phase 1 cocky, phase 2 bitter, phase 3 sharp). It plays every other time for routine events, and always for the Pink Jacket and extraordinary wins. There are no player choices.", '');
out.push('Part 1 lists every line by event. Part 2 lists Ryan\'s comebacks by career phase.', '');

out.push('---', '', '# Part 1: by event', '');
for (const g of GROUPS) {
  out.push(`## ${g.title}`, '');
  for (const { ev, when, phases } of g.events) {
    const L = LINES[ev];
    out.push(`### \`${ev}\``, `*When:* ${when}  `, `*Can happen in:* ${phases}  `, `*Monique's portrait:* ${ev === 'loss_streak' ? 'neutral → raised → smirk with the streak' : exprFor(ev)}`, '');
    out.push('| # | Monique (all phases) | Status |', '|---|---|---|');
    L.monique.forEach((l, i) => out.push(`| ${i + 1} | ${esc(l.text)} | ${status(l.approved)} |`));
    out.push('');
    if (L.ryan) {
      out.push('| Ryan\'s phase | Ryan\'s comeback | Status |', '|---|---|---|');
      for (const p of PHASES) for (const l of L.ryan[p] ?? []) out.push(`| ${p} | ${esc(l.text)} | ${status(l.approved)} |`);
      out.push('');
    } else out.push('*No comeback from Ryan for this event.*', '');
  }
}

out.push('---', '', "# Part 2: by Ryan's career phase", '');
out.push("Monique's lines don't change with the phase. These are Ryan's comebacks as each phase hears them.", '');
for (const p of PHASES) {
  out.push(`## ${PHASE_NAME[p]}`, '', '| Event | Ryan | Status |', '|---|---|---|');
  for (const g of GROUPS) for (const { ev } of g.events) for (const l of LINES[ev].ryan?.[p] ?? []) out.push(`| \`${ev}\` | ${esc(l.text)} | ${status(l.approved)} |`);
  out.push('');
}
out.push('**Note:** `pink_jacket` can only fire in Act III or later, but Ryan can still choose any look he has unlocked. That\'s why phase 1 and 2 comebacks exist for it.', '');

writeFileSync(new URL('../docs/MONIQUE_DIALOGUE_INVENTORY.md', import.meta.url), out.join('\n'));
console.log(`wrote ${moniqueCount} Monique + ${ryanCount} Ryan lines`);
