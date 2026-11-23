# Save schema and migration proposal (revision 2)

Status: **PROPOSAL.** No save, schema or migration has been changed.
Revision 2 adds:
- Bankroll unlocks for both casinos.
- Tipping, hospitality, conduct, sponsors and mail.

## Principles

1. **Additive only.** No existing table, field or flag is renamed, recalculated or removed.
2. **History comes from ledger facts.** Both unlocks are peak-bankroll rules [CONFIRMED], and each ledger row stores `balanceAfter`. The historical peak is `max(balanceAfter)`, which is exact.
3. **One upgrade function for both ways in.** The same pure, idempotent `upgradeToV3(tables)` runs from Dexie `version(3).upgrade()` and from `migrateSaveFile()`.
4. **Validated.** Every new table has a zod schema behind `installValidationHooks`.
5. **Compatibility mirrors.** Where existing code reads a field (`career.sponsor`, `career.inbox`), that field keeps being written. The new tables hold the richer state.

## Schema v3 (proposed)

| Table | Key / indexes | Holds | Source system |
|---|---|---|---|
| `unlocks` | `id` | `{id, at, trigger:'live'\|'backfill', txnId?, value}`. **Never deleted.** Ids: `unlock:white_buffalo`, `unlock:morongo_sky`, `unlock:room:<id>`, `unlock:course:<id>` | Unlocks |
| `milestones` | `ownerId` | `{peakBalance, peakTxnId, peakAt}` | Unlocks |
| `npcState` | `npcId` | Relationship (base + goodwill), tier, tip totals, drink totals, visits, memories, cooldowns, flags | NPCs, tipping, bar |
| `relationshipLog` | `id`, `[npcId+seq]` | `{npcId, seq, at, kind:'tip'\|'drink'\|'talk'\|'event'\|'gift', delta, amount?, txnId?, ref}`. Append-only history. | NPCs |
| `locationState` | `locationId` | `{reputation, visits, firstVisitAt?, introSeen}` | Locations |
| `condition` | `ownerId` (single row) | `{units, peakUnits, sessionKey, drinksThisVisit, fatigueWeek?, fatigueLevel?}` | Hospitality |
| `conductLog` | `id`, `at`, `kind` | Conduct events (architecture §4) | Conduct |
| `sponsorDeals` | `sponsorId`, `status` | Deal, confidence, obligations, warning level, probation, history | Sponsors |
| `mailThreads` | `id`, `status`, `source` | Actionable threads, options, deadline, outcome | Mail |
| `pokerSessions` | `id`, `status` | Buy-in, stacks, seed, hand journal | Poker |
| `skinsMatches` | `id`, `status` | Course, players, per-hole scores, carries, awards | Skins |
| `sportTickets` | `id`, `status` | Server ticket mirror | Sportsbook |

- **Rows stay small.** Each log is append-only and capped where it feeds the UI:
  - `relationshipLog` keeps everything. At about 40 bytes a row, it's tiny.
  - Each `sponsorDeals.history` keeps its last 100 entries.
- **`TransactionType` additions:** `tip`, `hospitality`, `keno`, `poker`, `skins`, `sportsbook`. These widen the enum in `src/core/types.ts` and `src/persistence/schemas.ts`. Old rows stay valid.

## `upgradeToV3(tables)`: steps

1. Create the empty new tables.
2. **Peak bankroll:** `peak = max(ledger.balanceAfter)` for the player. Write a `milestones` row with the transaction id and timestamp where the peak happened.
3. **Unlocks** [CONFIRMED rules]:
   - If `peak >= 100_000`, write `unlock:white_buffalo` with `trigger:'backfill'`, using the **first** ledger row whose `balanceAfter >= 100_000` for `at` and `txnId`.
   - If `peak >= 1_000_000`, do the same for `unlock:morongo_sky`.
4. **NPCs:** seed `npcState` for Velvet Vega, Stick Lady, Madame Monique, Waifu and Winston.
   - Relationship 50 (neutral base), goodwill 0, no tips.
   - Monique's `visits` come from `flags.moniqueMemory.visits` when it parses. The other dealers start at 0; nothing is invented.
5. **Locations:** `locationState.desert_palms`:
   - `introSeen = true` if `flags.casinoVisit` exists.
   - `visits` from Monique's count if present, otherwise 1 if visited, otherwise 0.
   - Reputation 50.
6. **Sponsor:** if `career.sponsor` exists, create a `sponsorDeals` row:
   - `status:'active'`, with terms copied.
   - `confidence = clamp(relationships.sponsor, 30, 100)`. The floor of 30 makes sure **no existing save starts on probation**.
   - `warningLevel 0`, no obligations, history `[{reason:'migrated'}]`.
7. **Condition:** a sober row (`units 0`).
8. **Untouched:**
   - `career.flags`, including the greyhound, baccarat and Three Card pending state.
   - `career.inbox`, `career.relationships`, `story.bonds`, all ledger rows.
   - Balances are rebuilt from the ledger as today.

**Idempotency:** each step upserts by key and only writes when the row is missing, so running it twice changes nothing.

## Idempotency keys (proposed)

| Flow | Keys |
|---|---|
| Tip | `tip:<npcId>:<tipId>`. `tipId` is generated once per button press and reused on retry. |
| Drink | `drink:<orderId>` |
| Keno | `keno:<round>:bet` / `keno:<round>:pay` |
| Poker | `poker:<session>:buyin`, `:rebuy:<n>`, `:cashout` |
| Skins | `skins:<match>:buyin`, `:award`, `:refund` |
| Sportsbook | `sport:<ticket>:stake`, `:settle:<v>`, `:reverse:<v>` |
| Sponsor mail response | Not money. `mailThreads.status` flips once in the transaction; a repeat call is a no-op. |
| Sponsor penalties | Not money. Future payments simply stop; nothing is debited. |

## Regression checklist (Gate 3)

- [ ] v1 and v2 files import, migrate and pass `verifyIntegrity`. A v3 export round-trips identically.
- [ ] A save that peaked at $150K and now holds $20K: White Buffalo unlocked after migration, Morongo not.
- [ ] A save that peaked at $1.2M: both unlocked, and the stored `at` points to the first crossing.
- [ ] A save that never reached $100K: neither unlocked. Crossing $100K through each money path (prize, sponsor, wage, story, casino payout, skins, sportsbook mirror) unlocks in the same transaction.
- [ ] An existing sponsor is migrated with confidence ≥ 30, status active, and the same weekly pay next week.
- [ ] Pending casino state survives. Monique's memory is untouched.
- [ ] Running the upgrade twice gives the same result.
- [ ] An older build refuses a v3 file with the existing "newer version" error. Needs a release note.
