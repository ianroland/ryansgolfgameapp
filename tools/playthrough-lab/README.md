# Playthrough lab

A bot that plays whole careers through the real services (fake IndexedDB) and reports pacing:
when each Act starts, which scenes play when, money by season, Q-School results, the VIP
invitation, skins and poker results, errors and stuck states.

    npx vite-node tools/playthrough-lab/run.ts [careers=4] [maxSeasons=10]

Writes `playthrough-lab-output/report.json`. Not part of the game build. Re-run it after any
change to story gates, prices, or the tour ladder.
