# Desert Palms Casino — Dealer Dialogue Bible (DRAFT)

## Waifu — Baccarat
Asian woman, elegant, self-possessed, precise, subtly playful. Elegant professional cadence; no accent imitation, stereotypes, or references to ethnicity in dialogue. She never claims a streak predicts the next outcome. Speaks before dealing or after results, not over animated card reveals. All dialogue in `waifu_dialogue.json` is draft pending Script Room approval.

## Winston — Three Card Poker
Jamaican man, warm, witty, confident, experienced dealer. Natural conversational English without caricatured patois or phonetic accent. Jokes about choices and cards, not nationality. He explains Play/Fold, dealer qualification, and side bets correctly. All dialogue in `winston_dialogue.json` is draft pending Script Room approval.

## Shared dialogue implementation
- Trigger by exact game events; choose random lines with anti-repeat cooldown.
- Respect speech frequency setting; never block wager input or settlement.
- Avoid line during dealing animation; queue until state is stable.
- No promises of winning, no false odds claims, no encouragement to chase losses.
- Treat `insufficient_funds` as factual and brief.
- Do not insert into approved Story Bible until explicitly signed off.
