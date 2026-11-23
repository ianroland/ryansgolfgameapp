# Madame Monique: dialogue inventory (for Script Room review)

Generated from `src/casino/monique.ts` (v0.13.2) by `scripts/monique-inventory.ts`, so it always matches what ships.

**61 lines:** 37 by Monique and 24 comebacks by Ryan.

**All 61 lines are approved** (author sign-off 2026-11-22; the signature line "The wheel remembers, darling." was approved first). No line shows a "Draft line" tag in the game.

To change a line, edit it here and send it back. A changed line goes back to draft until it is signed off. The triggers and the dialogue system stay as they are.

**How phases work:** Monique's lines are the same in every phase. Ryan's automatic comeback depends on the phase look he is wearing (phase 1 cocky, phase 2 bitter, phase 3 sharp). It plays every other time for routine events, and always for the Pink Jacket and extraordinary wins. There are no player choices.

Part 1 lists every line by event. Part 2 lists Ryan's comebacks by career phase.

---

# Part 1: by event

## Arriving at her table

### `pink_jacket`
*When:* First roulette visit after Ryan holds a Pink Jacket. Once ever.  
*Can happen in:* Act III+ only (a Pink Jacket needs phase-3 Ryan winning the Desert Rose Invitational on the LPGA)  
*Monique's portrait:* neutral

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | A Pink Jacket. Sincerely, Ryan, congratulations. It suits you. | Approved |
| 2 | I heard about the jacket. Well played. Truly. | Approved |

| Ryan's phase | Ryan's comeback | Status |
|---|---|---|
| 1 | Wait, you watch golf? | Approved |
| 2 | Careful. That almost sounded nice. | Approved |
| 3 | Thank you, Monique. I mean it. | Approved |

### `greet_first`
*When:* First time at her table.  
*Can happen in:* Any  
*Monique's portrait:* neutral

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | Welcome to my table. Chips down, chin up. | Approved |
| 2 | A new face. The wheel adores new faces. | Approved |

| Ryan's phase | Ryan's comeback | Status |
|---|---|---|
| 1 | Relax, I have a system. | Approved |
| 2 | Just here to lose money with dignity. | Approved |
| 3 | Spin it. I am not scared of you. | Approved |

### `greet_quick_return`
*When:* Returning to roulette in the same casino visit.  
*Can happen in:* Any  
*Monique's portrait:* raised

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | Back so soon? The wheel did not even have time to miss you. | Approved |
| 2 | You left. You returned. How predictable. | Approved |

*No comeback from Ryan for this event.*

### `greet_golf_win`
*When:* First visit after a new tournament win.  
*Can happen in:* Any  
*Monique's portrait:* neutral

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | A tournament win, I hear. Let us see if luck travels. | Approved |
| 2 | Champion of the fairway. Here you are merely a guest. | Approved |

| Ryan's phase | Ryan's comeback | Status |
|---|---|---|
| 1 | Winners win. Everywhere. Probably. | Approved |
| 2 | Won something for once. Let me enjoy it. | Approved |
| 3 | Luck had nothing to do with it. | Approved |

### `greet_missed_cut`
*When:* First visit after a missed cut.  
*Can happen in:* Any  
*Monique's portrait:* neutral

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | A missed cut. The wheel is kinder than the leaderboard. Occasionally. | Approved |
| 2 | Rough week on the course, darling? Sit. | Approved |

| Ryan's phase | Ryan's comeback | Status |
|---|---|---|
| 1 | The course was rigged. | Approved |
| 2 | Do not start. | Approved |
| 3 | Happens. Spin. | Approved |

### `greet_phase_change`
*When:* First visit after Ryan's story act changed.  
*Can happen in:* Act II+ only  
*Monique's portrait:* neutral

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | A new look. The wheel does not care, but I noticed. | Approved |
| 2 | Different, yet somehow the same bets. Fascinating. | Approved |

*No comeback from Ryan for this event.*

### `greet_repeat`
*When:* Any other arrival.  
*Can happen in:* Any  
*Monique's portrait:* smirk

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | Ah. You again. | Approved |
| 2 | Good evening. Your usual seat is free. It always is. | Approved |
| 3 | The wheel remembers, darling. | Approved |

*No comeback from Ryan for this event.*

## At the table (never during a spin)

### `banter`
*When:* Routine: every 3–5 spins, after the wheel stops.  
*Can happen in:* Any  
*Monique's portrait:* smirk

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | Bold choice. Not wise. But bold. | Approved |
| 2 | Do you pick numbers, or do numbers pick you? | Approved |
| 3 | Every chip tells a story. Yours are mostly tragedies. | Approved |
| 4 | I have seen that bet before. I have seen it lose before. | Approved |
| 5 | The wheel remembers, darling. | Approved |

| Ryan's phase | Ryan's comeback | Status |
|---|---|---|
| 1 | That is called strategy. | Approved |
| 2 | Story of my life. | Approved |
| 3 | Keep talking. I will keep winning. | Approved |

### `win_streak`
*When:* After the 3rd, 5th and 8th winning spin in a row.  
*Can happen in:* Any  
*Monique's portrait:* neutral

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | Another win. Do not get comfortable. | Approved |
| 2 | Three in a row. The house is taking notes. | Approved |

| Ryan's phase | Ryan's comeback | Status |
|---|---|---|
| 1 | Told you. System. | Approved |
| 2 | Something finally went right. | Approved |
| 3 | Get used to it. | Approved |

### `loss_streak`
*When:* After the 3rd/5th/7th/10th losing spin in a row. Line and portrait sharpen: 3 → line 1 neutral, 5 → line 2 raised eyebrow, 7+ → line 3 faint smirk.  
*Can happen in:* Any  
*Monique's portrait:* neutral → raised → smirk with the streak

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | Unlucky. | Approved |
| 2 | Again? How consistent of you. | Approved |
| 3 | At this point I should thank you personally. | Approved |

| Ryan's phase | Ryan's comeback | Status |
|---|---|---|
| 1 | Warming up. | Approved |
| 2 | Naturally. | Approved |
| 3 | The wheel owes me one. | Approved |

### `extraordinary`
*When:* A spin paying 10× or more of the stake (e.g. a straight-up hit). Portrait: surprised, then neutral.  
*Can happen in:* Any  
*Monique's portrait:* surprised

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | Oh. Well. That does not happen often. | Approved |
| 2 | ...Congratulations. Do not tell anyone I said that. | Approved |

| Ryan's phase | Ryan's comeback | Status |
|---|---|---|
| 1 | Who is the genius now? | Approved |
| 2 | Wait, that actually worked? | Approved |
| 3 | Pay the lady. I mean, pay me. | Approved |

### `reckless`
*When:* A spin with $1,000+ on the table, or half the bank or more.  
*Can happen in:* Any  
*Monique's portrait:* raised

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | That is a great deal of money, darling. Are we feeling brave or foolish? | Approved |
| 2 | Bold. The wheel loves a generous guest. | Approved |

*No comeback from Ryan for this event.*

### `insufficient_funds`
*When:* Placing a chip bigger than the bank.  
*Can happen in:* Any  
*Monique's portrait:* smirk

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | The table requires chips, darling. Imagination is not accepted. | Approved |
| 2 | Your wallet appears to have left before you did. | Approved |

*No comeback from Ryan for this event.*

## Leaving the table

### `farewell_ahead`
*When:* Leaving ahead this casino visit.  
*Can happen in:* Any  
*Monique's portrait:* neutral

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | Leaving ahead. Enjoy it. The wheel will be waiting. | Approved |
| 2 | Go, before it notices. | Approved |

*No comeback from Ryan for this event.*

### `farewell_behind`
*When:* Leaving behind this casino visit.  
*Can happen in:* Any  
*Monique's portrait:* neutral

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | Better luck next time. Or simply better judgement. | Approved |
| 2 | Until next time. Bring more chips. | Approved |

*No comeback from Ryan for this event.*

### `farewell_broke`
*When:* Leaving with under $5.  
*Can happen in:* Any  
*Monique's portrait:* smirk

| # | Monique (all phases) | Status |
|---|---|---|
| 1 | Empty pockets. A classic ending. | Approved |
| 2 | Do come back when you are solvent, darling. | Approved |

*No comeback from Ryan for this event.*

---

# Part 2: by Ryan's career phase

Monique's lines don't change with the phase. These are Ryan's comebacks as each phase hears them.

## Phase 1 (natural hair, he/him): cocky

| Event | Ryan | Status |
|---|---|---|
| `pink_jacket` | Wait, you watch golf? | Approved |
| `greet_first` | Relax, I have a system. | Approved |
| `greet_golf_win` | Winners win. Everywhere. Probably. | Approved |
| `greet_missed_cut` | The course was rigged. | Approved |
| `banter` | That is called strategy. | Approved |
| `win_streak` | Told you. System. | Approved |
| `loss_streak` | Warming up. | Approved |
| `extraordinary` | Who is the genius now? | Approved |

## Phase 2 (bald, he/him): bitter

| Event | Ryan | Status |
|---|---|---|
| `pink_jacket` | Careful. That almost sounded nice. | Approved |
| `greet_first` | Just here to lose money with dignity. | Approved |
| `greet_golf_win` | Won something for once. Let me enjoy it. | Approved |
| `greet_missed_cut` | Do not start. | Approved |
| `banter` | Story of my life. | Approved |
| `win_streak` | Something finally went right. | Approved |
| `loss_streak` | Naturally. | Approved |
| `extraordinary` | Wait, that actually worked? | Approved |

## Phase 3 (wig and visor, she/her): sharp

| Event | Ryan | Status |
|---|---|---|
| `pink_jacket` | Thank you, Monique. I mean it. | Approved |
| `greet_first` | Spin it. I am not scared of you. | Approved |
| `greet_golf_win` | Luck had nothing to do with it. | Approved |
| `greet_missed_cut` | Happens. Spin. | Approved |
| `banter` | Keep talking. I will keep winning. | Approved |
| `win_streak` | Get used to it. | Approved |
| `loss_streak` | The wheel owes me one. | Approved |
| `extraordinary` | Pay the lady. I mean, pay me. | Approved |

**Note:** `pink_jacket` can only fire in Act III or later, but Ryan can still choose any look he has unlocked. That's why phase 1 and 2 comebacks exist for it.
