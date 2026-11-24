"""
Reconciles the v0.4 sports-history draft into the game's compact history dataset (Phase B input).

Usage: python3 scripts/history/reconcile_v04.py <path to unzipped sports-lore-v04> 

Applies the owner's decisions of 2026-11-23 (docs/sports-lore/PHASE_A_AUDIT_v04.md §6 and Phase B):
  D3  1978 CCL: Los Angeles champion, Las Vegas runner-up (keeps 1996 as Las Vegas's first title)
  D4  Andre Bellamy's career ends 2014; other profiles' debut/final years widened to their segments
  D5  every duplicated name renamed deterministically (anchors and the earliest holder keep theirs)
  D8  birth years generated deterministically from a sport's debut-age range
  B1  today's top-4 playoff format kept; team records adjusted with the fewest win moves so each
      ledger champion and runner-up qualify on opposite sides of the bracket, plus anchor seeding
      (1996 Las Vegas the 4th seed; 1989 Anchorage and Buffalo meet in a semifinal).
      Fixed records: 1985 Cleveland 14-0, 2015 Asheville 2-12.
Deterministic: same input, same output. Every change is written to changes.json.
"""
import hashlib, itertools, json, sys, collections
SRC = sys.argv[1]
OUT = 'src/sports/history/data'
J = lambda f: json.load(open(f'{SRC}/{f}.json'))['records']
h = lambda *p: int(hashlib.sha256('|'.join(map(str, p)).encode()).hexdigest()[:12], 16)
changes = {'renames': [], 'career_fixes': [], 'record_adjustments': [], 'championship_changes': [], 'notes': []}

champs = {(c['league_id'], c['season']): c for c in J('championships')}
c78 = champs[('ccl', 1978)]
c78['champion_team_id'], c78['runner_up_team_id'] = 'ccl_voltage', 'ccl_dustdevils'
changes['championship_changes'].append({'season': 'ccl-1978', 'champion': ['ccl_dustdevils', 'ccl_voltage'], 'runner_up': ['ccl_voltage', 'ccl_dustdevils'], 'why': 'D3: 1996 is Las Vegas\'s first title'})

# ── players ──
players = J('players')
for p in players:
    for s in p['career_segments']:
        if s['from'] > s['through'] and s['from'] == 2026:
            # v0.4 created these as 2026 debuts with an empty career; 2026 is simulated (D7), so they are its rookies
            changes['career_fixes'].append({'player': p['id'], 'segment': [s['team_id'], s['from'], s['through']], 'to': [s['team_id'], 2026, 2026], 'why': '2026 rookie'})
            s['through'] = 2026
            p['final_year'] = max(p['final_year'], 2026)
    lo = min(s['from'] for s in p['career_segments']); hi = max(s['through'] for s in p['career_segments'])
    if p['debut_year'] > lo or p['final_year'] < hi:
        changes['career_fixes'].append({'player': p['id'], 'from': [p['debut_year'], p['final_year']], 'to': [min(lo, p['debut_year']), max(hi, p['final_year'])]})
        p['debut_year'], p['final_year'] = min(lo, p['debut_year']), max(hi, p['final_year'])
# names
firsts = sorted({p['name'].split(' ', 1)[0] for p in players})
lasts = sorted({p['name'].split(' ', 1)[1] for p in players if ' ' in p['name']})
taken = set()
by_name = collections.defaultdict(list)
for p in players: by_name[p['name']].append(p)
keep = set()
for name, group in by_name.items():
    group.sort(key=lambda p: (not p.get('historical_anchor'), p['debut_year'], p['id']))
    keep.add(group[0]['id']); taken.add(name)
for name, group in sorted(by_name.items()):
    for p in group[1:]:
        k = 0
        while True:
            cand = f"{firsts[h('first', p['id'], k) % len(firsts)]} {lasts[h('last', p['id'], k) % len(lasts)]}"
            if cand not in taken: break
            k += 1
        taken.add(cand); changes['renames'].append({'player': p['id'], 'from': p['name'], 'to': cand}); p['name'] = cand
DEBUT_AGE = {'gdc': (21, 25), 'ccl': (19, 23), 'igl': (21, 24), 'fhl': (19, 23)}
for p in players:
    lo, hi = DEBUT_AGE[p['league_id']]
    p['birth_year'] = p['debut_year'] - (lo + h('age', p['id']) % (hi - lo + 1))
pidx = {p['id']: i for i, p in enumerate(players)}

# ── records ──
recs = collections.defaultdict(dict)
for t in J('team_season_records'): recs[t['season_id']][t['team_id']] = [t['wins'], t['losses']]
ro = collections.defaultdict(dict)
for r in J('rosters'): ro[r['season_id']][r['team_id']] = r['player_ids']
FIXED = {('igl-1985', 'igl_ironclads'), ('igl-2015', 'igl_highlanders')}
MEET = {'gdc': 6, 'ccl': 4, 'igl': 2, 'fhl': 4}
HALVES = [{1, 4}, {2, 3}]

def realizable(w, k):
    teams = list(w)
    for n in range(1, len(teams) + 1):
        for S in itertools.combinations(teams, n):
            if sum(w[t] for t in S) < k * n * (n - 1) // 2: return False
    return sum(w.values()) == k * len(teams) * (len(teams) - 1) // 2

def seeding(w, sid, ch, ru):
    """Choose an order consistent with wins (ties free) meeting the constraints, or None."""
    lg, y = sid.split('-'); y = int(y)
    groups = collections.defaultdict(list)
    for t, v in w.items(): groups[v].append(t)
    keys = sorted(groups, reverse=True)
    def orders(i):
        if i == len(keys): yield []; return
        for perm in itertools.permutations(sorted(groups[keys[i]])):
            for rest in orders(i + 1): yield list(perm) + rest
    best = None
    for order in orders(0):
        s = {t: order.index(t) + 1 for t in order}
        if s[ch] > 4 or s[ru] > 4: continue
        if any(s[ch] in hv and s[ru] in hv for hv in HALVES): continue
        if sid == 'ccl-1996' and not (s['ccl_dustdevils'] == 4 and s['ccl_jackrabbits'] in (2, 3)): continue
        if sid == 'fhl-1989' and not ({s['fhl_polars'], s['fhl_sawblades']} == {2, 3}): continue
        # deterministic preference among valid orders: fewest tie flips from a seeded draw
        key = [h('tie', sid, t) for t in order]
        if best is None or key < best[0]: best = (key, order)
    return best[1] if best else None

out_seasons = []
for (lg, y), c in sorted(champs.items(), key=lambda x: (x[0][1], x[0][0])):
    sid = f'{lg}-{y}'; ch, ru = c['champion_team_id'], c['runner_up_team_id']
    w = {t: v[0] for t, v in recs[sid].items()}
    games = recs[sid][ch][0] + recs[sid][ch][1]
    orig = dict(w); moves = 0
    order = seeding(w, sid, ch, ru)
    need = {ch, ru} | ({'ccl_dustdevils', 'ccl_jackrabbits'} if sid == 'ccl-1996' else set()) | ({'fhl_polars', 'fhl_sawblades'} if sid == 'fhl-1989' else set())
    while order is None:
        # lift the worst-placed required team by one win, taken from the weakest team ranked above it
        ranked = sorted(w, key=lambda t: (-w[t], h('tie', sid, t)))
        tgt = max(need, key=lambda t: (ranked.index(t), t))
        donors = [t for t in ranked[:ranked.index(tgt)] if t not in need and (sid, t) not in FIXED and w[t] > 0]
        if not donors:
            # all teams above are required (e.g. both finalists in one half): lift the lower finalist past a non-required team
            donors = [t for t in ranked if t not in need and (sid, t) not in FIXED and w[t] > 0 and w[t] >= w[tgt]]
        if not donors: raise SystemExit(f'cannot reconcile {sid}')
        d = donors[-1]
        w[d] -= 1; w[tgt] += 1; moves += 1
        if not realizable(w, MEET[lg]): w[d] += 1; w[tgt] -= 1; raise SystemExit(f'unrealizable {sid}')
        if moves > 30: raise SystemExit(f'too many moves {sid}')
        order = seeding(w, sid, ch, ru)
    assert realizable(w, MEET[lg]), sid
    if moves:
        changes['record_adjustments'].append({'season': sid, 'wins_moved': moves, 'from': {t: orig[t] for t in w if orig[t] != w[t]}, 'to': {t: w[t] for t in w if orig[t] != w[t]}})
    out_seasons.append({
        'id': sid, 'league': lg, 'year': y, 'games': games,
        'records': {t: [w[t], games - w[t]] for t in order},
        'seeds': order[:4], 'champion': ch, 'runnerUp': ru,
        'origin': c['origin'] if sid != 'ccl-1978' else 'owner_decision',
        'adjusted': bool(moves),
        'rosters': {t: [pidx[x] for x in ro[sid][t]] for t in order},
    })

# Bellamy: confirm he's rostered through 2014 (D4)
bel = players[pidx['ccl_andre_bellamy']]; assert bel['final_year'] == 2014, bel
changes['notes'] += [
    'D1: v0.4 player statistics and career totals are not imported; Phase C derives them from simulated games.',
    'Voss 1983 becomes 13-1 with three no-hitters (owner decision); applied as a Phase C constraint.',
    'v0.4 football rosters have no kickers: field goals and extra points count for the team, credited to no player.',
]
compact_players = [{'i': p['id'], 'n': p['name'], 'l': p['league_id'], 'p': p['position'], 'd': p['debut_year'], 'f': p['final_year'], 'b': p['birth_year'],
                    **({'a': 1} if p.get('historical_anchor') else {}), 's': [[s['team_id'], s['from'], s['through']] for s in p['career_segments']]} for p in players]
dump = lambda name, o: (json.dump(o, open(f'{OUT}/{name}', 'w'), separators=(',', ':'), ensure_ascii=False), open(f'{OUT}/{name}', 'a').write('\n'))
dump('players.json', {'source': 'sports-lore v0.4 draft, reconciled', 'players': compact_players})
dump('seasons.json', {'source': 'sports-lore v0.4 draft, reconciled', 'seasons': out_seasons})
json.dump(changes, open(f'{OUT}/changes.json', 'w'), indent=1, ensure_ascii=False)
adj = changes['record_adjustments']
print(f"seasons {len(out_seasons)} | adjusted {len(adj)} | wins moved {sum(a['wins_moved'] for a in adj)} (max {max(a['wins_moved'] for a in adj)}) | renames {len(changes['renames'])} | career fixes {len(changes['career_fixes'])}")
