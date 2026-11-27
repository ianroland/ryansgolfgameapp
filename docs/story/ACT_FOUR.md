# Act IV: The Major (phase 3, she/her)

Built in 0.24.0. Act IV plays on the LPGA Tour itself (`story.act === 4` and an LPGA Tour card).

| Id | Title | Cast | Opens when |
|---|---|---|---|
| `act4_big_leagues` | The Big Leagues | Jordan, Reporter Kim | 1+ week after The Card, on tour. Jordan's towel-per-day system and Ryan's first national TV moment. |
| `act4_corkboard` | The Corkboard | Kayla | 2+ weeks later. Red string, a hospital called about twins, a hypnotist theory. |
| `act4_desert_rose` | The Desert Rose | Biff, Commissioner Clipboard | Weeks 4–6, the run-up to the first major. Biff's pre-ordered Pink Jacket. |
| `act4_kayla_knows` | Kayla Knows | Kayla | 3+ weeks after The Corkboard. Ryan tells her. The player picks what they become (`flags.kayla`: friends, rivals or dinner). |

| `act4_baba_at_the_major` | Baba at the Major | Baba, Jordan | Between rounds 2 and 3 of the National Open Championship (`during`). Baba watches his first major from behind the ninth (owner: "change mom to Baba"). |
| `act4_reading_the_green` | Reading the Green | Baba | The night before the final round of the Tour Championship (`during`). |
| `act4_championship_sunday` | Championship Sunday | Baba, Jordan, Kayla | Straight after winning the Tour Championship. The putt is three feet; Baba hands over the RYAN — PRO can (broken tees). Sets `flags.storyComplete`. |
| `act4_championship_sunday_next_year` | Championship Sunday | Baba, Jordan, Kayla | After the Tour Championship if Ryan didn't win it. The can stays on the shelf; a later win still opens it. Sets `flags.storyComplete`. |

## Between-rounds scenes

An encounter with `during: true` is offered when a round finishes (CareerService.finishRound → engine.offerStoryNow) and plays from the tournament screen's "Between rounds" card. Missed, it goes away with the tournament and can come back the next time its conditions hold.

## After the story

Once `flags.storyComplete` is set, the Career hub offers Rytirement (with a confirm). It locks the career record and the casino all-time, closes the tour, and opens Dry Creek Muni for casual rounds that are never counted.
