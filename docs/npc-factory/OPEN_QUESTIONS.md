# NPC Factory integration: open questions

## Needing an author decision

1. **Canonical names for the career People.**
   - The inbox stories call the friend "Jess" and Ryan's family member "Baba" (relationship slot `mom`).
   - The cast's friend character is "Avery" (`friend_avery`).
   - Which are canonical? Are Jess and Avery different people?
2. **Kayla's id.** OK to keep `kayla_brooks` as the character and `golfer_kayla_brooks` as an alias, rather than renaming saved ids?
3. **Pack approval workflow.** Should `approved` lines come only from NPC Factory, or can the game's Script Room still approve lines locally?
4. **Effects authority.** May encounter outcomes from packs move money or stats (as current encounters do), or should packs be limited to social effects only?
5. **Schedules.** Is "per casino visit" and "per career week" enough, or do you want time of day inside a casino visit (needs a new game clock)?
6. **Mood and decay.** Current rule: no decay and no penalty for not tipping. Keep that for all NPCs, or allow opt-in decay per category?
7. **Monique.** Move her memory system into the shared NPC runtime (a save migration), or keep it as a special case permanently?
8. **Competitors as NPCs.** Should notable golfers (top-10 regulars, rivals) become full NPCs with dialogue? If so, how are generated pool golfers linked to authored characters?
9. **Romance edges.** Allowed in content, and if so, any limits (no romance involving dealers or staff while on duty, for example)?
10. **Volume target.** About how many NPCs in the first year (50? 500?), and how many expressions for background characters?

## Needing NPC Factory's answers

11. JSON Schema dialect and versioning approach.
12. Sprite export: individual files or sheet + frames?
13. Whether NPC Factory can validate against the game's published predicate and event lists before export.
14. Line length limits and localisation plans (single language for now?).

## Technical items for the game (when approved)

15. Save schema v4 migration (open NPC ids, `npcRuntime`, `npcEdges`, `rumors`).
16. The `GameEvents` emitter in existing services.
17. Moving big-win tiers from UI into a service so `casino.big_win` is a fact.
18. Stable ids for Velvet's and Stick Lady's inline lines.
