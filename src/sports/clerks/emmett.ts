/**
 * Emmett Okafor, Desert Palms sportsbook clerk: a sports historian with terrible puns.
 * Voice from his NPC Factory bible: loyal, warm, easygoing, casual, nicknames for everyone.
 * Short one-liners (owner: "they don't have to be lengthy").
 *
 * DRAFT dialogue (new lines are drafts until the owner approves them). Every history line cites
 * the sports-lore event ids it rests on and says nothing those events don't support. Rules
 * honoured: never that New Orleans officially won in 1994; never that Charleston players were
 * proven to have known; never a team for Darius King or Leon Mercer.
 */
import type { ClerkLine } from './lines';

export const EMMETT_LINES: ClerkLine[] = [
  // ── Baseball (GDL) ──
  { id: 'em.gdc.founding', league: 'gdc', events: ['gdc-1972-001'], mood: 'friendly', text: "Eight owners, one charter, St. Louis, 1972. Workingman's League, Fairway." },
  { id: 'em.gdc.founders-cup', league: 'gdc', events: ['gdc-1972-001'], mood: 'playful', text: "The Founders Cup's been around since '72. Older than my knees." },
  { id: 'em.gdc.voss', league: 'gdc', events: ['gdc-1983-001'], mood: 'impressed', text: "Voss, '83 Millers: 13–1, three no-hitters. Glove at first sight." },
  { id: 'em.gdc.voss-fans', league: 'gdc', events: ['gdc-1983-001'], mood: 'playful', text: 'Ask a Millers fan about Voss and cancel your afternoon.' },
  { id: 'em.gdc.long-october', league: 'gdc', events: ['gdc-1998-001'], mood: 'concerned', text: "'98: Boston up 3–1 on Phoenix, then lost three straight. The Long October." },
  { id: 'em.gdc.boston-leads', league: 'gdc', events: ['gdc-1998-001'], mood: 'playful', text: 'Never tell a Boston fan a late lead is safe, slugger.' },
  { id: 'em.gdc.charleston', league: 'gdc', events: ['gdc-2011-001'], mood: 'firm', text: 'Charleston, 2011: two coaches suspended for stealing signs. No proof the players knew.' },

  // ── Basketball (CBL) ──
  { id: 'em.ccl.founding', league: 'ccl', events: ['ccl-1974-001'], mood: 'friendly', text: "Crown Ball League, '74. Shot clock, three-point arc, and a trophy called the Crown." },
  { id: 'em.ccl.trilogy', league: 'ccl', events: ['ccl-1987-001'], mood: 'impressed', text: "Comets and Voltage, three straight finals, '87 to '89. Chicago took two." },
  { id: 'em.ccl.king-mercer', league: 'ccl', events: ['ccl-1987-001'], mood: 'playful', text: 'King or Mercer? Pick a side, kid. Quietly.' },
  { id: 'em.ccl.vegas-1996', league: 'ccl', events: ['ccl-1996-001'], mood: 'impressed', text: "'96 Vegas: lowest seed, first Crown. Calvin Redd dropped 31. A Redd-letter day." },
  { id: 'em.ccl.vegas-home', league: 'ccl', events: ['ccl-1996-001'], mood: 'friendly', text: 'Mention Calvin Redd in this town and somebody buys a round.' },
  { id: 'em.ccl.bellamy', league: 'ccl', events: ['ccl-2008-001'], mood: 'friendly', text: "Detroit dealt Bellamy to Miami in '08. Miami won in '09, Detroit in '12. Everybody won." },

  // ── Football (ALF) ──
  { id: 'em.igl.founding', league: 'igl', events: ['igl-1976-001'], mood: 'friendly', text: 'Amigo League Football, 1976. Saturday football since day one, partner.' },
  { id: 'em.igl.cleveland', league: 'igl', events: ['igl-1985-001'], mood: 'impressed', text: "'85 Cleveland went 14–0. You didn't score on that Wall, you apologized." },
  { id: 'em.igl.phantom', league: 'igl', events: ['igl-1994-001'], mood: 'firm', text: "'94 Iron Bowl: Oklahoma City 24, New Orleans 20. Argue the call all you want, boss." },
  { id: 'em.igl.asheville', league: 'igl', events: ['igl-2016-001'], mood: 'impressed', text: 'Asheville: 2–12 in 2015, champs in 2016. Worst to first. Highland fling.' },

  // ── Hockey (FHL) ──
  { id: 'em.fhl.founding', league: 'fhl', events: ['fhl-1978-001'], mood: 'friendly', text: "Federal Hockey League, '78. Eight northern clubs, one Frost Cup." },
  { id: 'em.fhl.soren', league: 'fhl', events: ['fhl-1989-001'], mood: 'impressed', text: "Soren, '89: 71 saves in triple overtime. The arena ran out of food. Save-ory." },
  { id: 'em.fhl.soren-standard', league: 'fhl', events: ['fhl-1989-001'], mood: 'playful', text: 'Anchorage fans judge every goalie against Soren. Every single one, chief.' },
  { id: 'em.fhl.border', league: 'fhl', events: ['fhl-2002-001'], mood: 'impressed', text: 'Bozeman and Duluth, 2002: seven games, four overtimes. Still no hugs.' },
  { id: 'em.fhl.burlington', league: 'fhl', events: ['fhl-2019-001'], mood: 'impressed', text: 'Burlington, 2019: first Frost Cup in 23 years. Not a dry eye in Vermont.' },
];
