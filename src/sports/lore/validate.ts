/**
 * Validation for sports-lore/1 packs: schema, versioning, references, chronology, trophies and
 * championship consistency. Incomplete records are flagged, never filled in.
 */
import { LORE_FILE_NAMES, LORE_FILES, PACK_KEY, SCHEMA_VERSION, type LorePack } from './schema';

export interface LoreIssue {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
}

/** Parse raw file contents (already JSON-decoded) into a typed pack. Schema errors are returned, not thrown. */
export function parsePack(raw: Partial<Record<string, unknown>>): { pack: LorePack | null; issues: LoreIssue[] } {
  const issues: LoreIssue[] = [];
  const out: Partial<Record<keyof LorePack, unknown>> = {};
  for (const name of LORE_FILE_NAMES) {
    if (raw[name] === undefined) {
      issues.push({ severity: 'error', code: 'FILE_MISSING', path: name, message: `${name} is missing.` });
      continue;
    }
    const r = LORE_FILES[name].safeParse(raw[name]);
    if (!r.success) {
      for (const e of r.error.issues.slice(0, 20)) issues.push({ severity: 'error', code: 'SCHEMA', path: `${name}:${e.path.join('.')}`, message: e.message });
    } else out[PACK_KEY[name]] = r.data;
  }
  return { pack: issues.length ? null : (out as unknown as LorePack), issues };
}

export interface ValidateOptions {
  /** The game's own team registry. When given, the pack's teams must match it exactly. */
  registry?: readonly { id: string; league: string; city: string; displayName: string }[];
}

export function validatePack(pack: LorePack, opts: ValidateOptions = {}): LoreIssue[] {
  const issues: LoreIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ severity: 'error', code, path, message });
  const warn = (code: string, path: string, message: string) => issues.push({ severity: 'warning', code, path, message });
  const { manifest: m } = pack;

  // ── Versioning ──
  if (m.schema_version !== SCHEMA_VERSION) err('SCHEMA_VERSION', 'manifest.schema_version', `Expected ${SCHEMA_VERSION}, got ${m.schema_version}.`);
  const draftRevision = /-draft/.test(m.canon_revision);
  if (m.canon_status === 'approved' && draftRevision) err('CANON_STATUS', 'manifest', 'An approved canon cannot carry a -draft revision.');
  if (m.canon_status === 'approved' && pack.events.some((e) => e.status === 'draft')) err('CANON_STATUS', 'manifest', 'An approved canon cannot contain draft events.');
  if (m.historical_scope.from > m.historical_scope.to) err('CHRONOLOGY', 'manifest.historical_scope', 'Scope starts after it ends.');
  if (m.game_start_year <= m.historical_scope.to) err('CHRONOLOGY', 'manifest.game_start_year', 'Game-simulated seasons must start after the historical scope.');
  for (const f of LORE_FILE_NAMES.slice(1)) if (!m.files.includes(f)) err('FILE_LIST', 'manifest.files', `${f} is not listed.`);

  // ── Unique ids ──
  const seen = new Map<string, string>();
  const reg = (kind: string, id: string) => {
    if (seen.has(id)) err('DUPLICATE_ID', `${kind}:${id}`, `Id ${id} is used by ${seen.get(id)} and ${kind}.`);
    else seen.set(id, kind);
  };
  pack.leagues.forEach((l) => reg('league', l.id));
  pack.teams.forEach((t) => reg('team', t.id));
  pack.people.forEach((p) => reg('person', p.id));
  pack.events.forEach((e) => reg('event', e.id));
  pack.rivalries.forEach((r) => reg('rivalry', r.id));
  pack.championships.forEach((c) => reg('championship', c.id));
  for (const e of pack.events) {
    const fids = new Set<string>();
    for (const f of e.facts) {
      if (fids.has(f.id)) err('DUPLICATE_ID', `event:${e.id}.facts`, `Fact id ${f.id} repeats.`);
      fids.add(f.id);
    }
  }

  const league = new Map(pack.leagues.map((l) => [l.id, l]));
  const team = new Map(pack.teams.map((t) => [t.id, t]));
  const person = new Map(pack.people.map((p) => [p.id, p]));
  const event = new Map(pack.events.map((e) => [e.id, e]));
  const sources = new Set(m.sources.map((s) => s.id));
  const scopeTo = m.historical_scope.to;

  const teamRef = (path: string, id: string | null, inLeague?: string) => {
    if (id === null) return;
    const t = team.get(id);
    if (!t) return err('UNKNOWN_TEAM', path, `Unknown team ${id}.`);
    if (inLeague && t.league !== inLeague) err('TEAM_LEAGUE', path, `${id} is not in ${inLeague}.`);
  };
  const eventRef = (path: string, id: string) => !event.has(id) && err('UNKNOWN_EVENT', path, `Unknown event ${id}.`);
  const cites = (path: string, c: { source: string }[]) => c.forEach((x) => !sources.has(x.source) && err('UNKNOWN_SOURCE', path, `Unknown source ${x.source}.`));

  // ── Leagues ──
  for (const l of pack.leagues) {
    cites(`league:${l.id}`, l.cite);
    eventRef(`league:${l.id}.founding_event`, l.founding.founding_event);
    if (l.founded < m.historical_scope.from || l.founded > scopeTo) err('CHRONOLOGY', `league:${l.id}`, 'Founded outside the historical scope.');
    if (event.get(l.founding.founding_event)?.year !== l.founded) err('CHRONOLOGY', `league:${l.id}`, 'The founding event is not in the founding year.');
    l.founding.founding_franchise_ids?.forEach((t) => teamRef(`league:${l.id}.founding`, t, l.id));
    for (const h of l.known_historic_formats) {
      eventRef(`league:${l.id}.known_historic_formats`, h.event);
      if (h.season < l.founded || h.season > scopeTo) err('CHRONOLOGY', `league:${l.id}.known_historic_formats`, `${h.season} is outside the league's history.`);
    }
  }

  // ── Teams, against the game's registry ──
  for (const t of pack.teams) {
    cites(`team:${t.id}`, t.cite);
    if (!league.has(t.league)) err('UNKNOWN_LEAGUE', `team:${t.id}`, `Unknown league ${t.league}.`);
    if (!t.id.startsWith(`${t.league}_`)) err('TEAM_LEAGUE', `team:${t.id}`, 'Team id does not carry its league prefix.');
  }
  if (opts.registry) {
    const r = new Map(opts.registry.map((x) => [x.id, x]));
    for (const t of pack.teams) {
      const g = r.get(t.id);
      if (!g) err('REGISTRY', `team:${t.id}`, 'Not in the game registry. Map it to an existing id rather than renaming.');
      else if (g.league !== t.league || g.city !== t.city) err('REGISTRY', `team:${t.id}`, `Registry has ${g.league} / ${g.city}.`);
    }
    for (const g of opts.registry) if (!team.has(g.id)) err('REGISTRY', `team:${g.id}`, 'Registry team missing from the lore pack.');
  }
  for (const l of pack.leagues) {
    const n = pack.teams.filter((t) => t.league === l.id).length;
    if (n !== l.current_format.teams) err('TEAM_COUNT', `league:${l.id}`, `${n} teams, format says ${l.current_format.teams}.`);
  }

  // ── People ──
  for (const p of pack.people) {
    cites(`person:${p.id}`, p.cite);
    p.events.forEach((e) => eventRef(`person:${p.id}.events`, e));
    for (const a of p.affiliations) {
      teamRef(`person:${p.id}.affiliations`, a.team, p.league);
      if (a.from !== null && a.to !== null && a.from > a.to) err('CHRONOLOGY', `person:${p.id}`, 'Affiliation ends before it starts.');
    }
  }

  // ── Events ──
  for (const e of pack.events) {
    const path = `event:${e.id}`;
    cites(path, e.cite);
    const l = league.get(e.league);
    if (!e.id.startsWith(`${e.league}-${e.year}-`)) err('EVENT_ID', path, 'The id must be <league>-<anchor year>-NNN.');
    if (e.span.start > e.span.end) err('CHRONOLOGY', path, 'Span ends before it starts.');
    if (e.year < e.span.start || e.year > e.span.end) err('CHRONOLOGY', path, 'Anchor year is outside the span.');
    if (l && e.span.start < l.founded) err('CHRONOLOGY', path, `Starts before ${l.name} was founded (${l.founded}).`);
    if (e.span.end > scopeTo) err('CHRONOLOGY', path, `Ends after the historical scope (${scopeTo}).`);
    e.teams.forEach((t) => teamRef(`${path}.teams`, t, e.league));
    e.people.forEach((p) => {
      if (!person.has(p)) err('UNKNOWN_PERSON', `${path}.people`, `Unknown person ${p}.`);
      else if (!person.get(p)!.events.includes(e.id)) warn('BACKREF', `${path}.people`, `${p} does not list this event.`);
    });
    for (const f of e.facts) if (f.year < e.span.start || f.year > e.span.end) err('CHRONOLOGY', `${path}.facts.${f.id}`, 'Fact year is outside the event span.');
    for (const o of e.outcomes) {
      if (o.league !== e.league) err('TEAM_LEAGUE', `${path}.outcomes`, 'Outcome league differs from the event league.');
      if (o.season < e.span.start || o.season > e.span.end) err('CHRONOLOGY', `${path}.outcomes`, `Outcome season ${o.season} is outside the span.`);
      teamRef(`${path}.outcomes`, o.champion, e.league);
      teamRef(`${path}.outcomes`, o.runner_up, e.league);
    }
    for (const c of e.claims) teamRef(`${path}.claims`, c.team, e.league);
  }

  // ── Rivalries ──
  for (const r of pack.rivalries) {
    cites(`rivalry:${r.id}`, r.cite);
    r.teams.forEach((t) => teamRef(`rivalry:${r.id}`, t, r.league));
    if (r.teams[0] === r.teams[1]) err('CONTRADICTION', `rivalry:${r.id}`, 'A team cannot be its own rival.');
    r.events.forEach((e) => eventRef(`rivalry:${r.id}`, e));
  }

  // ── Championships ──
  const established = pack.championships.filter((c) => c.status === 'established');
  for (const c of pack.championships) {
    const path = `championship:${c.id}`;
    cites(path, c.cite);
    const l = league.get(c.league);
    if (l && c.trophy !== l.trophy) err('TROPHY', path, `Trophy ${c.trophy} differs from the league's ${l.trophy}.`);
    teamRef(path, c.champion, c.league);
    teamRef(path, c.runner_up, c.league);
    c.finalists?.forEach((t) => teamRef(path, t, c.league));
    c.events.forEach((e) => eventRef(path, e));
    if (c.champion && c.champion === c.runner_up) err('CONTRADICTION', path, 'Champion and runner-up are the same team.');
    if (c.season !== null && l && (c.season < l.founded || c.season > scopeTo)) err('CHRONOLOGY', path, `Season ${c.season} is outside the league's history.`);
    if (c.status === 'established' && (c.season === null || c.champion === null)) err('INCOMPLETE', path, 'An established title needs a season and a champion. Mark it unknown instead of inventing one.');
    if (c.status === 'winner_unknown' && (c.champion !== null || c.runner_up !== null)) err('CONTRADICTION', path, 'A winner_unknown final cannot name a champion or runner-up.');
    if (c.status === 'year_unknown') {
      if (c.season !== null || !c.window || !c.champion) err('INCOMPLETE', path, 'A year_unknown title needs a champion and a window, and no season.');
    }
    if (c.status === 'inference_pending_approval' && (c.season === null || c.champion === null)) err('INCOMPLETE', path, 'An inference needs the season and champion it proposes.');
  }
  // One established result per league season.
  const bySeason = new Map<string, string>();
  for (const c of established) {
    const k = `${c.league}:${c.season}`;
    if (bySeason.has(k)) err('DUPLICATE_CHAMPIONSHIP', `championship:${c.id}`, `${k} is already recorded by ${bySeason.get(k)}.`);
    bySeason.set(k, c.id);
  }
  const titleIn = (league: string, season: number) => established.find((c) => c.league === league && c.season === season);
  for (const c of pack.championships.filter((x) => x.status !== 'established' && x.season !== null)) {
    const e = titleIn(c.league, c.season!);
    if (e && c.status === 'winner_unknown') err('CONTRADICTION', `championship:${c.id}`, `${c.league} ${c.season} is both unknown and established (${e.id}).`);
    if (e && c.status === 'inference_pending_approval' && e.champion !== c.champion) warn('INFERENCE_CONFLICT', `championship:${c.id}`, `Established ${e.id} contradicts this inference.`);
  }
  // Event outcomes must agree with the ledger.
  for (const e of pack.events) {
    for (const o of e.outcomes) {
      const c = titleIn(o.league, o.season);
      if (!c) err('LEDGER', `event:${e.id}`, `${o.league} ${o.season} has no established championship record.`);
      else if (c.champion !== o.champion) err('CONTRADICTION', `event:${e.id}`, `Event says ${o.champion} won ${o.season}; ledger says ${c.champion}.`);
      else if (o.runner_up !== null && c.runner_up !== null && c.runner_up !== o.runner_up) err('CONTRADICTION', `event:${e.id}`, `Runner-up differs from ${c.id}.`);
      else if (o.runner_up !== null && c.runner_up === null) warn('LEDGER', `championship:${c.id}`, `Event ${e.id} names runner-up ${o.runner_up}; the ledger leaves it blank.`);
    }
    for (const cl of e.claims) {
      if (cl.kind === 'first_title') {
        const earlier = established.find((c) => c.champion === cl.team && c.season! < cl.season);
        if (earlier) err('CONTRADICTION', `event:${e.id}`, `${cl.team}'s ${cl.season} title is called its first, but ${earlier.id} is earlier.`);
      } else {
        const inDrought = established.find((c) => c.champion === cl.team && c.season! >= cl.from && c.season! <= cl.to);
        if (inDrought) err('CONTRADICTION', `event:${e.id}`, `${cl.team} has a title (${inDrought.id}) inside its ${cl.from}-${cl.to} drought.`);
      }
    }
  }
  // A title known to fall somewhere in a window: the window must still have room for it.
  for (const c of pack.championships.filter((x) => x.status === 'year_unknown' && x.window)) {
    const w = c.window!;
    const open: number[] = [];
    for (let y = w.from; y <= w.to; y++) if (!w.exclude.includes(y)) open.push(y);
    const taken = open.filter((y) => {
      const t = titleIn(c.league, y);
      return t && t.champion !== c.champion;
    }).length;
    if (open.length - taken < w.count) err('CONTRADICTION', `championship:${c.id}`, `Only ${open.length - taken} seasons left in ${w.from}-${w.to} for ${w.count} ${c.champion} titles.`);
  }

  // ── Franchise history ──
  const fh = new Set(pack.franchiseHistory.map((f) => f.team));
  for (const t of pack.teams) if (!fh.has(t.id)) err('INCOMPLETE', `franchise_history:${t.id}`, 'No franchise-history record.');
  for (const f of pack.franchiseHistory) {
    const path = `franchise_history:${f.team}`;
    teamRef(path, f.team);
    const t = team.get(f.team);
    if (t && (t.city !== f.current_city || t.state !== f.current_state)) err('CONTRADICTION', path, 'Current city differs from teams.json.');
    if (f.status === 'retired' && f.retired_year === null) err('INCOMPLETE', path, 'A retired franchise needs its retired year.');
    for (const a of f.attested_in_current_city) {
      const e = event.get(a.event);
      if (!e) err('UNKNOWN_EVENT', path, `Unknown event ${a.event}.`);
      else if (!e.teams.includes(f.team) || a.year < e.span.start || a.year > e.span.end) err('CONTRADICTION', path, `Attestation ${a.year} does not match event ${a.event}.`);
      if (f.current_since !== null && a.year < f.current_since) err('CHRONOLOGY', path, `Attested in ${f.current_city} in ${a.year}, before current_since ${f.current_since}.`);
    }
  }

  // ── Dialogue rules ──
  const r = pack.dialogueRules;
  cites('dialogue_rules', r.cite);
  const orders = r.tiers.map((t) => t.order);
  if (new Set(r.tiers.map((t) => t.id)).size !== 4 || new Set(orders).size !== 4) err('TIERS', 'dialogue_rules.tiers', 'Tiers must be four distinct ids and orders.');
  for (const p of r.team_perspectives) {
    teamRef('dialogue_rules.team_perspectives', p.team);
    for (const e of p.events) {
      eventRef('dialogue_rules.team_perspectives', e);
      if (event.get(e) && !event.get(e)!.teams.includes(p.team)) warn('PERSPECTIVE', 'dialogue_rules.team_perspectives', `${p.team} is not involved in ${e}.`);
    }
  }
  return issues;
}

export const errorsOf = (issues: LoreIssue[]) => issues.filter((i) => i.severity === 'error');
