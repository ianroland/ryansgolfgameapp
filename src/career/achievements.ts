/** Career achievements (separate from display trophies). */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_event', name: 'Teeing It Up', description: 'Finish your first tournament.' },
  { id: 'first_top10', name: 'In the Mix', description: 'Finish in the top 10.' },
  { id: 'first_cut', name: 'Weekend Golfer', description: 'Make your first cut in a professional event.' },
  { id: 'sub_par_round', name: 'Red Numbers', description: 'Shoot a round under par.' },
  { id: 'eagle', name: 'Soaring', description: 'Make an eagle in a tournament.' },
  { id: 'hole_in_one', name: 'Ace!', description: 'Make a hole-in-one in a tournament.' },
  { id: 'albatross', name: 'Albatross!', description: 'Finish a hole three under par: a par 5 in 2 or a par 4 in 1.' },
  { id: 'albatross_5', name: 'Rare Bird', description: 'Make five career albatrosses.' },
  { id: 'first_win', name: 'Winner', description: 'Win a tournament.' },
  { id: 'turned_pro', name: 'Paid to Play', description: 'Turn professional.' },
  { id: 'epson_card', name: 'Developmental Tour', description: 'Earn Korn Ferry Tour status.' },
  { id: 'lpga_card', name: 'Tour Card', description: 'Earn your PGA Tour card.' },
  { id: 'kept_card', name: 'Here to Stay', description: 'Keep your PGA Tour card for another season.' },
  { id: 'earnings_100k', name: 'Six Figures', description: 'Earn $100,000 in career prize money.' },
  { id: 'earnings_1m', name: 'Millionaire', description: 'Earn $1,000,000 in career prize money.' },
  { id: 'star', name: 'Household Name', description: 'Reach Star fame.' },
  { id: 'stat_80', name: 'World Class', description: 'Raise any skill to 80.' },
  { id: 'new_home', name: 'Moving Up', description: 'Buy a new home.' },
  { id: 'jackpot', name: 'Jackpot!', description: 'Hit three trophies on the Fairway Fortune slots.' },
  { id: 'high_roller', name: 'High Roller', description: 'Win $10,000 or more on a single casino bet.' },
];

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);
