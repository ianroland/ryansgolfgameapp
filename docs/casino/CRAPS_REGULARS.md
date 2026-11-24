# Craps regulars: APPROVED

Version 0.20.4. These are the nine craps regulars (three per casino), with their lines and Stick Lady's streak calls. The owner **approved** all of them on 2026-11-24, and the game shows the lines without a draft tag. Portraits: see Status below. The code is in `src/ui/casino/crapsRegulars.ts` (shooter and mood: `src/casino/crapsShooter.ts`); the lines below are generated from that file, so they match exactly.

## How the table works

- **Fair dice.** Everyone at the table shares the same fair dice, which `CasinoService` rolls. The regulars, the shooter and the hot/cold meter never change a roll, a payout or Ryan's money.
- **Pretend money.** The regulars bet with pretend money under the real rules: every bet they make passes the same checks as Ryan's. Their money never touches the ledger, and they buy another stack when they run out. Their tables reset when the game reloads.
- **Shooter.** The dice go round the rail in seat order: two regulars, then Ryan (seat 3), then the third regular. They pass to the next seat on every seven-out. When it's Ryan's turn the button reads **Shoot the dice**; otherwise it reads **Roll · {name} shooting**. Who's shooting and how their hand is going is saved with the game (the `crapsShooter` flag).
- **Hot and cold.** These come from what the dice actually did:
  - **Hot:** this shooter has made 10 or more rolls, or 2 or more points.
  - **On fire:** 20 or more rolls, or 3 or more points.
  - **Cold:** the last three shooters each sevened out within 5 rolls without making a point.

  On a hot table the regulars press their bets (Dee doubles hers when the table is cold), the dice glow on the felt, and the meter lights up.
- **Who talks.** After each roll at most one regular speaks. The biggest moment that roll wins: a change in mood, the dice passing, a seven-out, a point made, then the smaller moments, which get remarked on only some of the time. Which regular and which line is chosen from the roll itself, so the same roll always gets the same line.
- **Where it sits.** The rail goes in the space under the table, as you suggested, together with the chip rack and the Roll button.

## Status

- **Characters, betting styles and lines:** approved (2026-11-24).
- **Stick Lady's streak calls:** approved (2026-11-24). Her other new craps calls (a Come bet moving, a Place win, a hardway win, a one-roll win) are still drafts.
- **Portraits:** in the game (0.20.6), from the CRAPS_REGULARS_ASSET_PACK, with three faces each. The face follows the regular's last roll: happy after a win, groan after a loss. Ryan's seat shows her own portrait, which follows her current look.

## Desert Palms

### Gus Pettibone

Retired neon-sign painter. Painted half the signs on the Strip, never bets the don’t, and believes dice that miss the back wall are cursed.

**Plays:** Pass + odds. Pretend stack $1,500, base bet $10.

| When | Lines |
|---|---|
| Arriving | Pull up a rail, kid. Right side only at this end of the table.<br>Evening! I painted that sign out front, you know. Lit it myself in ’88. |
| Natural on the come-out | Front line winner! Now that’s how you open a show. |
| Point made | Paid the line! Leave the odds working, sweetheart.<br>There it is! Like a fresh coat of paint. |
| Seven-out | Seven. Like a busted transformer, every time.<br>Dice didn’t hit the back wall. I said it. Nobody listens. |
| A hardway rolls | Hard way! Somebody tell the hardway lady. |
| Table turns hot | Don’t touch anything. Don’t change a thing. This shooter’s got the glow. |
| Shooter on fire | I haven’t seen a roll like this since the old Starlite closed! Keep ’em coming! |
| Table turns cold | These dice are colder than a sign with the power cut. |
| Dice pass to Ryan | Your dice, Ryan. Both dice, back wall, nice and easy.<br>Golfer’s hands! Give ’em a little backspin, ha! |
| Their own turn to shoot | My turn. Watch the wrist. Thirty years of brushwork. |
| Buying another stack | Well, that’s the paint budget. I’ll grab another rack. |

### Dolores “Dee” Ruiz

Deals blackjack across town and spends her nights off on the other side of a different table. Bets the don’t, wins quietly, never gloats out loud.

**Plays:** Don’t side. Pretend stack $1,200, base bet $10.

| When | Lines |
|---|---|
| Arriving | I’m on the don’t, so I’ll be the quiet one. No offense.<br>Night off. Somebody else can do the shuffling. |
| Craps on the come-out | Little craps. I’ll take it. Quietly. |
| Point made | Good for you all. Really. |
| Seven-out | …I’m not saying anything.<br>Pays the don’t. Sorry, Gus. |
| Table turns hot | I’m paying for everyone’s good mood tonight, apparently. |
| Table turns cold | Cold dice. Don’t look at me, I don’t make the rules. |
| Dice pass to Ryan | Your roll, Ryan. I’ll be rooting for you. Mostly. |
| Their own turn to shoot | Shooting on the don’t. Yes, people hate this. Yes, it’s legal. |
| Buying another stack | Even the don’t loses sometimes. One more stack. |

### Wendell Fry

Retired chemistry teacher. Knows exactly what the hardways cost him and bets them anyway, because a hard eight is the most beautiful thing in Nevada.

**Plays:** Hardways + Field. Pretend stack $800, base bet $5.

| When | Lines |
|---|---|
| Arriving | Hard eight, always hard eight. I know the odds. I taught the odds. |
| A hardway rolls | HARD WAY! Do you see that? Both fours! Textbook!<br>A pair! Nine to one! Somebody write this down! |
| Point made | Easy way, but I’ll take the line. |
| Seven-out | The seven: the most common outcome and the least loved. |
| Yo (11) | Eleven, prime number, lovely. |
| Table turns hot | Statistically unusual. Personally delightful. |
| Table turns cold | Regression to the mean, folks. It comes for us all. |
| Dice pass to Ryan | Dealer, a dollar on the hard eight for the golfer! |
| Their own turn to shoot | Gentle toss. Equal and opposite reaction. |
| Buying another stack | A controlled experiment in losing. Restocking. |

## The White Buffalo

### Walt Greer

Cattle rancher, three hours’ drive away. Places the six and the eight, presses when they hit, and says about eleven words a night.

**Plays:** Place 6 & 8. Pretend stack $4,000, base bet $30.

| When | Lines |
|---|---|
| Arriving | Evenin’.<br>Six and eight. Same as always. |
| Point made | Mm. Good. |
| Seven-out | Huh.<br>Well. Rain’ll come. |
| Table turns hot | Press it.<br>Shooter’s ridin’ a good horse. |
| Shooter on fire | Lord. |
| Table turns cold | Dry spell. |
| Dice pass to Ryan | Your dice, son. Take your time. |
| Their own turn to shoot | Alright then. |
| Buying another stack | Sold a steer for less. Another rack. |

### Corinne Bales

Sells lake houses and keeps score of everything, including you. Pass, Come and full odds, and she knows exactly how far up she is.

**Plays:** Pass + Come. Pretend stack $5,000, base bet $25.

| When | Lines |
|---|---|
| Arriving | Corinne Bales, Lakeside Realty. You golf? I sell the houses on the fifteenth hole. |
| Natural on the come-out | Seven! That’s a closing! |
| Point made | Point! I’m up four hundred tonight, not that I’m counting. I’m counting. |
| Seven-out | Seven out. Fine. The market corrects.<br>Down two-twenty. Still ahead on the week. |
| Table turns hot | Hot market! Everybody get your come bets in! |
| Table turns cold | Buyer’s market, people. Small bets. |
| Dice pass to Ryan | The golfer! Ryan, I sell houses on courses, call me. |
| Their own turn to shoot | Shooter’s motivated to sell. |
| Buying another stack | Bridge loan. Back in a second. |

### Tobias “Toby” Fenn

Drove trucks coast to coast for thirty years and now drives his RV between casinos. Lives for the yo-leven and the horn, loudly.

**Plays:** Horn & Yo. Pretend stack $3,000, base bet $20.

| When | Lines |
|---|---|
| Arriving | Horn high yo, dealer! Hey, new face. Toby. I’m the loud one. |
| Yo (11) | YO-LEVEN! What’d I tell ya! Fifteen to one, baby!<br>YO! Breaker breaker, we got an eleven! |
| Craps on the come-out | Craps! Horn pays! Don’t cry for me! |
| Natural on the come-out | Eleven or seven, either way it’s Christmas. |
| Seven-out | Seven out. Ten-four, rubber duck. Next shooter. |
| Table turns hot | Keep on truckin’, shooter! Don’t stop for fuel! |
| Shooter on fire | THIS TABLE IS ON FIRE! Somebody call the convoy! |
| Table turns cold | Cold dice. Like the Donner Pass in January. |
| Dice pass to Ryan | Golfer’s shooting! Yo on the golfer, dealer! |
| Their own turn to shoot | Ten-four, comin’ out! |
| Buying another stack | Outta gas. Fillin’ up! |

## Morongo Sky

### Victor Sloane

Owns three restaurants and a superstition for each. Bets big on the pass with full odds and refuses to say the word “seven” at a dice table.

**Plays:** Pass + odds. Pretend stack $30,000, base bet $200.

| When | Lines |
|---|---|
| Arriving | Victor Sloane. Please don’t say the s-word at this table. You know the one. |
| Natural on the come-out | The big red on the come-out. That one I like. |
| Point made | Exquisite. Leave everything up. |
| Seven-out | …The big red. Lovely. Next shooter, please.<br>Somebody said it. I heard somebody say it. |
| Table turns hot | Nobody move. Nobody touch the dice but the shooter. |
| Shooter on fire | Waiter, a round for the shooter’s side of the table. This is art. |
| Table turns cold | This table needs a palate cleanser. |
| Dice pass to Ryan | The golfer. Take a breath first. A real one. |
| Their own turn to shoot | A soft landing, please. Like a soufflé. |
| Buying another stack | A modest setback. Another rack, thank you. |

### Anika Raman

Poker pro on a night off. Plays the don’t side with lay odds because the edge is smaller, and will tell you the exact number if you ask. Or don’t.

**Plays:** Don’t side. Pretend stack $20,000, base bet $100.

| When | Lines |
|---|---|
| Arriving | Don’t pass with lay odds: one point three six percent. Just so you know what you’re looking at. |
| Craps on the come-out | Craps on the come-out. One in nine. Thank you. |
| Point made | The point is a 40% event for a six. Congratulations, everyone. |
| Seven-out | Seven. Most likely number. Every time. |
| Table turns hot | Streaks are just math with good lighting. |
| Table turns cold | Cold tables don’t exist. But I’ll take it. |
| Dice pass to Ryan | Your roll. It makes no difference how you throw them. Throw them anyway. |
| Their own turn to shoot | Rolling. Expect nothing. |
| Buying another stack | Variance. Reloading. |

### Rosalind Crane

Old desert money, older pearls. Places all the inside numbers, calls everybody darling, and has been coming to this room since before it had windows.

**Plays:** Inside numbers. Pretend stack $25,000, base bet $120.

| When | Lines |
|---|---|
| Arriving | Darling, you’re standing in Harold’s spot. Harold’s been gone since ’07. Stay. |
| Point made | Lovely, lovely. Pay my inside, would you, dear? |
| Seven-out | Oh, bother.<br>Down they come. Like the market in ’87. |
| A hardway rolls | A hard way! How marvellously old-fashioned. |
| Table turns hot | Darling, you’re absolutely glowing. Keep rolling. |
| Shooter on fire | I haven’t had this much fun since Palm Springs in ’74. |
| Table turns cold | These dice need a holiday, darling. |
| Dice pass to Ryan | Our golfer! Throw them like you putt, darling. |
| Their own turn to shoot | My turn? How thrilling. |
| Buying another stack | Do bring another rack, dear. And a fresh napkin. |

## Stick Lady: streak calls

- **Hot:** We've got a hot shooter, folks! {shooter} has the dice working!
- **On fire:** {shooter} is ON FIRE! Get your bets down while the dice are hot!
- **Cold:** Cold dice, cold table. New shooter coming out, let’s turn it around.
- **Dice pass to Ryan:** Dice to the golfer! Ryan, pick two, and hit the back wall.
- **New shooter:** New shooter coming out! Dice to {shooter}.

