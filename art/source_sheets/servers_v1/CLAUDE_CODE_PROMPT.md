# CLAUDE CODE — CASINO COCKTAIL SERVERS / DIALOGUE V1

Implement the supplied `RYANS_CASINO_SERVERS_DIALOGUE_V1` package in Ryan’s Road to the LPGA. Inspect the existing codebase first; reuse the current NPC, dialogue, tipping, casino, alcohol, time/shift, sponsor, and save systems. This is an implementation task.

## Assets
I have separately downloaded the three 3×2 server portrait sheets. Ask me for their local paths only if they cannot be located. Do not claim they are in this ZIP. Inspect and split each sheet into six individual portraits without distorting or cutting off the artwork; verify actual grid spacing and each expression visually. Map to `friendly`, `playful`, `impressed`, `concerned`, `annoyed`, `firm` using the expression semantics, even if image positions differ. Preserve the game's Neo Geo-style presentation. If sprites are missing, implement data/UI with placeholders and report missing art, not fabricated artwork.

## Data
Read `servers.json`, `system_config.json`, and `DIALOGUE_REVIEW.csv`. Dialogue and NPC names are draft; do not silently rewrite them. Use the exact event IDs and stable line IDs. Make a reusable casino NPC portrait/speech-bubble component that supports expression changes and choices. No permanent full-body cocktail server at the table.

## NPC interactions
Three distinct servers, one per casino (Desert Palms, White Buffalo, Morongo Sky), with persistent relationship and tip history. Show server encounters between completed rounds only (Blackjack, Baccarat, Three Card Poker, Roulette, Craps); add a manual Request Service action. Offer Order Tito’s Double, Water, Chat, Tip, Decline/Leave, and Apologize only when contextually relevant. Respect shift systems if present; do not invent unapproved schedules. Server relationship changes can unlock rumors and social access, but cannot guarantee secret poker entry.

## Alcohol
The only alcoholic drink Ryan may order is **Tito’s Double**. Water is the nonalcoholic option. Use the existing bankroll ledger. After multiple drinks, draw bounded, weighted temporary RPG effects; worse outcomes become more likely with intoxication. Keep the weights configurable and clearly identify proposed values. Effects must never change cards, dice, roulette, slots, poker odds, payout math, or casino RNG. Persist buzz, visit count, active effects, recovery timing, and random draw outcomes to prevent save-scumming.

## Refusal and responsible service
When impairment crosses the configured threshold or serious behavior warrants it, server expresses concern and then firmly refuses additional alcohol. This must be an enforced gameplay state, not just a line. Disable alcoholic orders until sufficient recovery; water, dialogue, and leaving remain available. No tipping, relationship score, or dialogue choice can override the refusal. Do not make drinking mandatory to access story content.

## Sponsor integration
Repeated serious incidents can contribute to existing sponsor concern and warning emails. A single drink or normal visit must not trigger termination. New sponsor messages are drafts pending approval.

## QA
Verify all 18 expressions render and correspond to dialogue events; each casino loads the correct server; tips affect the right NPC and deduct correctly; Tito’s Double is the sole alcoholic menu item; refusals cannot be bypassed; dialogue never covers active wagers; save/load and migrations preserve existing data; casino math is unchanged. Run build/tests and capture actual in-game screenshots of normal, concerned, and refused states. Report files changed, test results, missing sprites, and proposed tuning values.

Do not redesign the casino tables or alter other casino game rules.
