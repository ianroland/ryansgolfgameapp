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

## Step 2 (next)

- **Hardways:** hard 4 and 10 pay 7:1; hard 6 and 8 pay 9:1.
- **One-roll bets:** Any 7 4:1, Any Craps 7:1, Yo 15:1, 2 or 12 30:1, 3 15:1, and Horn.
- **Covering wrong art:** several painted payouts are wrong and will be covered with the correct ones. Desert Palms prints 9:1 on every hardway, and White Buffalo prints 9:1 and 7:1 the wrong way round.
- **Big 6 / 8:** left out on purpose. It's a strictly worse version of placing the 6 or 8.
