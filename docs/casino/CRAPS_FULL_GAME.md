# Craps: the full game

## Step 1 (0.20.2), done

**Bets:**
- Pass Line and Don't Pass, with odds.
- Come and Don't Come, each with its own point and odds.
- Place 4, 5, 6, 8, 9 and 10.
- The Field.

The rules are in `src/casino/craps.ts`; the header comment there has every rule and payout. The house edges in the table below are computed exactly by following every roll through the engine (`tests/craps.test.ts`):

| Bet | House edge |
|---|---|
| Pass / Come | 1.414% |
| Don't Pass / Don't Come | 1.364% |
| Odds and lay odds (2× max) | 0% |
| Place 6 / 8 (7:6) | 1.515% |
| Place 5 / 9 (7:5) | 4.0% |
| Place 4 / 10 (9:5) | 6.667% |
| Field (2 pays 2:1, 12 pays 3:1) | 2.778% |

**Table rules:**
- Bets ride from roll to roll.
- The whole table is saved on the career (the `crapsTable` flag), so a reload or leaving the casino keeps every bet.
- Each bet, take-down and roll is a single transaction, and each roll is paid once.
- Place bets and any odds can be taken down; flat line and Come bets stay until they're decided.
- Place bets are off on the come-out roll unless you turn them on with the toggle.
- Odds on Come bets are off on the come-out roll: they're returned, not paid.

**Saves:** a save from before 0.20.2 had any craps bets only in memory, so it opens on an empty table.

**On the felt:**
- Come, Don't Come and the place numbers are now uncovered.
- Chips on a number show at its box: Come on the left, Don't Come on the right, Place below.
- Stick Lady's calls for Come bets moving and Place wins are **draft lines**, awaiting approval.

## Step 2 (0.20.3), done

**Hardways and one-roll bets:**
- Hardways pay as a pair: hard 4 and 10 pay 7:1, hard 6 and 8 pay 9:1. A hardway loses on the easy way or a 7, stays up after a win, and is off on the come-out roll unless you turn it on with the same toggle as Place bets.
- One-roll bets: Any Seven 4:1, Any Craps 7:1, Aces (2) 30:1, Ace-Deuce (3) 15:1, Yo (11) 15:1, Twelve 30:1.
- Horn puts the chip on each of 2, 3, 11 and 12, so one tap costs four chips.
- Limits: $1 to $100 on each bet.
- Big 6/8 is left out on purpose: it's a strictly worse version of placing the 6 or 8.

**Exact house edges** (from `tests/craps.test.ts`):

| Bet | House edge |
|---|---|
| Hard 6 / 8 | 9.09% |
| Hard 4 / 10 | 11.11% |
| Any Seven | 16.67% |
| Any Craps, 3, 11 | 11.11% |
| 2, 12 | 13.89% |

**On the felt:** the centre of every table is drawn over the art with the correct payouts and your bets on it, because several painted payouts were wrong.

**Betting section, rebuilt like one side of the table:**
- The Don't Come bar and the numbers run across the top. Each number box shows the point puck, your Place bet, and any Come or Don't Come bet that moved there, with + Odds and + Lay buttons.
- Below the numbers: Come, Field, the Don't Pass bar with Lay Odds, and the Pass Line with Odds.
- A centre panel holds the hardways and the one-roll bets.
- Felt colours follow the casino.
- Tapping a bet the rules don't allow yet explains why in the log.

**Drafts:** new Stick Lady calls for hardway and one-roll wins are draft lines, awaiting approval.

## Next (proposed)

Table regulars, a rotating shooter (with turns for Ryan), and hot and cold table moods built from real streaks. The dice stay fair: streaks come from the dice, never from changing the odds.
