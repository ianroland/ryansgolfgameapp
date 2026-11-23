# Baba: continuity and conflict report, and what's already in the game

Compared:

- **[FC]** the Family Canon proposal;
- **[SD]** the Second Draft;
- your 22 Nov brief and your 22 Nov decisions;
- the game code (v0.13.2).

The frozen Story Bible, the locked Rejection script and the Script Room drafts are **not** in the project. Anything that depends on them is marked *unverifiable*.

## 1. Baba content already in the game

**None.** There's no Baba character, scene, line, relationship, flag or prop in the code.

His three art sheets are filed unchanged in `art/source_sheets/cast/` and haven't been cut or shipped. Two of them, the character reference and the retro character sheet, are the same image.

Related content that **is** in the game:

| In game | Where | Relevance |
|---|---|---|
| Biff Fairway III: cast entry, "The Gold-Plated Driver", "The Gold-Plated Putter" (Act I) | `src/story/cast.ts`, `encounters.ts` | Biff's personality ("expensive equipment = talent", calls Ryan "muni kid") matches Scene 2. The driver encounter is the one [FC] links to Baba's hand-me-down driver. |
| Jordan (caddie), Marty Mulligan, Kayla, Avery | cast | Jordan is used by the straw gag ([FC]). Marty speaks in The Rejection. |
| Mom: People panel, starting relationship 70, "Call Mom", several story events | see §2 | The family-canon conflict |
| "Hand-me-down Driver" starter item | `src/career/shop.ts` | Conflicts with [FC] (see §3) |
| Encounter engine, story bonds, phase-based Ryan portraits | `src/story/*`, `EncounterScene.tsx` | Reused by the plan |

**Not in the game at all:**

- The Rejection; Commissioner Fairchild; the Pinnacle Tour;
- the coffee can; BOBO MILKY; Aurum-X;
- Heat, inner circle, knowledge levels, caper clues and close calls;
- the Script Room;
- act transitions (see §6);
- `mom_coffee_can`, `baba_coffee_can`, `lpga_joke`, `fridge_letter`.

## 2. Mom in the game against the "distant Mom" canon

Your brief and decisions say Ryan's relationship with Mom is distant. The shipped game portrays a warm, involved Mom.

[FC] lists five places to change. I found **five more** it doesn't list (marked ★).

Nothing has been changed: the family amendment is pending, and your brief says to preserve existing Mom content until it's authorized.

| # | Game text / system | File | In [FC] list? |
|---|---|---|---|
| 1 | People panel: "Mom, Biggest fan. Keeps you grounded. She worries about money." | `src/ui/career/PeoplePanel.tsx` | Yes |
| 2 | Starting relationship Mom 70 | `src/career/engine.ts` | Yes |
| 3 | "Call Mom" life action: "She always knows what to say." | `engine.ts` | Yes |
| 4 | Story: "Mom's car broke down" ("She cries a little on the phone") | `src/career/stories.ts` | Yes |
| 5 | Story: college letter (accepting gives Mom ♥♥; declining gives Mom ♥−) | `stories.ts` | Yes |
| 6 | Story: "Mom flies in" | `stories.ts` | Yes |
| 7 | Story: "Mom heard about the casino" ("Honey, Jess says…"), which sets a 6-week casino ban | `stories.ts` | Yes |
| 8 | Casino ban message: "You promised Mom you'd stay away for a while" | `engine.ts` | ★ |
| 9 | Missed rent: "Mom spotted you, but she's worried." (Mom ♥ −2) | `engine.ts` | ★ |
| 10 | Interview result: "Mom buys ten copies." | `stories.ts` | ★ |
| 11 | Starter driver: "Mom found it at a garage sale. It works." | `src/career/shop.ts` | ★ (and see §3) |
| 12 | Sofa: "Room for Jess, Mom and the trophy-room tour." | `src/catalog/items.ts` | Yes |

## 3. Conflicts between the sources and the game

| # | Conflict | Detail | Needs |
|---|---|---|---|
| C1 | **The hand-me-down driver** | [FC] says Baba gave it to Ryan (already referenced in the Dossier: "You beat my gold driver with a hand-me-down"). The game says Mom found it at a garage sale. | Your call. Fixing it is a one-line text change, part of the family amendment. |
| C2 | **The Commissioner's name** | The Rejection and other briefs use Commissioner (Sterling P.) Fairchild III. The game's cast has "Commissioner Clipboard", and Biff's encounter says "Commissioner Clipboard has a form for it". Scene 3's "The Commissioner" works either way. | Which name is canon? |
| C3 | **Pinnacle Tour** | Scene 1 and the Rejection refer to a Pinnacle Tour qualifier, Act I's men's-tour path. The game's tours are Amateur, Mini, Q-School, Epson and LPGA. | Decide how Act I's tour path appears in the game. This links to §6. |
| C4 | **Act I pronouns in existing text** | Found during the review, though not Baba's: the Act I interview story's headline reads "Hometown Girl Chasing the Tour". Canon has phase-1 Ryan as he/him. | A text fix, for your approval |
| C5 | **Two best friends** | The People panel's best friend is Jess. The story cast has Avery ("Friend"). [FC] and the casino story mention both. | Confirm whether they're both canon |
| C6 | **"The Championship" / "encounter 31"** | Scene 3's placement refers to 31 core encounters that aren't in the game (it has 2). | Placement decision (plan B3) |
| C7 | **BOBO MILKY effects** | [SD] says the story concept *and* a modest one-round Nerve bonus are approved. Your 22 Nov brief says: no gameplay bonuses or consumable without approval. Your 22 Nov decisions call it established character only. | Which stands. I've followed 22 Nov: story prop only. |
| C8 | **Baba's view of the transition** | [FC] guardrail 2 says he struggles to understand but never withholds respect. Your 22 Nov decisions say he "may not fully understand **or approve of**" the transition but stays present and caring. Both rule out cruelty, and the [SD] scenes satisfy both. | Confirm whether "may not approve" should show up in future scenes. The three scenes don't show disapproval, only incomprehension. |
| C9 | **Pronoun for Ryan in your decisions** | Your 22 Nov decisions say "loves Ryan and wants **him** to be the best". The scenes follow canon: he/him in phase 1, she/her in phase 3, and Baba says "You're my daughter". | Assumed: the phase rule stands, and the "him" refers to Ryan generally |
| C10 | **Scene 2 and Biff's suspicion** | Canon says Biff recognizes Ryan from the earlier circuit and is obsessed with exposing her. In Scene 2, Baba introduces himself to Biff as "Her father". Biff met "the muni kid" in Act I and might connect the two. [SD] states no knowledge change. | Confirm that's intended, or whether this should be a deliberate close call later |
| C11 | **`lpga_joke`, `fridge_letter`** | Your brief says existing proposals mention them. They're in neither source document, no other brief, and not in the code. | Their source, if they matter |
| C12 | **The Rejection text** | Patch P1–P15 quotes the "current (exact)" text, but the locked script isn't in the project. | *Unverifiable.* Supply the locked script to check it word for word. |

## 4. Consistency checks between the source documents

The Second Draft supersedes the first drafts in [FC]. The checks below confirm the newest version is consistent with your direction.

| Item | [FC] first draft | [SD] (kept) | Consistent with your direction? |
|---|---|---|---|
| Cap | Scene 1: "takes his cap off and puts it back on" | Removed | Yes: no cap |
| Watch | "checks his gold watch" | "checks his watch"; times things with it | Yes: no stopwatch |
| Employment | 30 years head groundskeeper (past tense) | Working in Act I; retired from Act III but still mows the practice green | Yes (your brief §2) |
| The can | On the kitchen counter in the patch voiceover | On a shelf in his maintenance shed (P5) | Yes; [SD] records it as your decision |
| Scene 1 joke | "Forty-nine. You talked." Ends on "Fifty." | "Fifty-one. Talking is a putt." Ends on "Again." | — |
| Scene 1 effects | Putting-practice gain, Energy cost | Relationship only | Yes: no invented gameplay |
| Scene 2 | One velvet case; Biff walks off to fix the marks | Gold repair tool folds; pitchfork; a broken tee becomes a relic | Biff's personality unchanged |
| Scene 2 ball-mark count | — | Five named (6, 11, two on 14, plus "that one"). One is fixed, so "four ball marks *still* on his conscience". | Internally consistent ✓ |
| Scene 3 | Includes the "breaks to the lake" green tip | Tip removed; guard and sprinkler gags added | Yes: no usable golf information |
| Scene 3 timing | — | Opens 10:55 p.m.; sprinklers at exactly 11:00 | Matches your brief ("sprinkler timing at eleven") ✓ |
| Patch | Includes the optional "Don't three-putt." | Excluded (minimal patch) | — |
| Age | "about 60" | "I'm sixty-one" (Scene 3) | Fine |

## 5. Art versus the scripts

**Supplied** (`Baba_Pixel_Art_Animation_Sprite_Sheet.png`):

- 5 portraits;
- 15 body animations;
- a carton illustration on the character sheet.

**Production issues found in the supplied art:**

- The frame numbers printed under several strips are out of order. [FC] flagged this; it's confirmed on the sheet.
- Some frames have a red fringe (keying residue), most visibly around the BOBO MILKY give and drink strips.
- The engine uses 8 portrait expressions; Baba has 5. Proposed mapping, for your OK:
  - neutral → unimpressed;
  - confident → unimpressed;
  - happy → proud;
  - laughing → laughing;
  - worried → concerned;
  - disappointed → concerned;
  - angry → unimpressed;
  - surprised → unimpressed.
  An angry portrait and a surprised portrait would be better.
- The carton illustration has partial text along its bottom edge. Check it before cutting a carton sprite from it.
- Rights: [FC] asks you to confirm the sheets are cleared for use in the game. That's still open.

**Missing art the three scenes need:**

| Kind | Item | Scene |
|---|---|---|
| Background | Muni practice green at 6 a.m. (mist, mower stripes) | 1 |
| Background | Maintenance shed interior (high shelf) | 1 |
| Background | Tour-stop practice green, mid-morning | 2 |
| Background | Championship 18th green at night: half moon, lake. Torch-only and moon-only lighting. | 3 |
| Baba animation | Pushing the reel mower | 1 |
| Baba animation | Watch check (used in every scene) | 1, 2, 3 |
| Baba animation | Lying flat reading the grain with a torch | 3 |
| Baba animation | Holding up the badge; opening the umbrella; sitting on the fringe under it; torch off and on | 3 |
| Ryan animation | Sitting on the fringe; soaked; leaning on Baba's shoulder (phase 3, approved look only) | 3 |
| Biff animation | Kneeling with the tool; standing on it; raising the pitchfork; carrying the case | 2 |
| New minor character | Biff's assistant (silent) | 2 |
| New minor character | Security guard (one line) | 3 |
| Props | Reel mower; coffee can "RYAN — PRO"; shed fridge | 1 |
| Props | BOBO MILKY carton sprite, including straw and masking-tape note | 1, 2, 3 |
| Props | Cooler "NOT FOR THE PUBLIC"; Aurum-X vial; two velvet cases; gold repair tool (3 states); gold pitchfork; broken tee; ball mark before and after; gold flake on Biff's tooth | 2 |
| Props and effects | Torch beams (two sizes); expired badge; umbrella; sprinkler burst | 3 |
| Still | Memory flash: young Ryan at the muni and Baba handing over a carton | 2 |
| Sound | Baba's 4-note theme ([FC], draft); mower squeak, clonk, "aaah", "bwoing", sprinkler hiss, knee cracks | all |

## 6. Wider finding: story progression (blocker)

Nothing in the game moves Ryan past Act I. In the shipped build:

- the bald and wig looks stay locked;
- phases 2 and 3, the Pink Jacket and Monique's phase lines can't be reached;
- Baba's Scenes 2 and 3 can't be reached.

This needs a decision before launch. It's set out in the implementation plan, blocker B1.
