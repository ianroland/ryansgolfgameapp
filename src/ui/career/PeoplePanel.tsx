import { lifestyleById } from '../../career/shop';
import { RIVAL } from '../../career/field';
import { rivalTourName } from '../../career/config';
import type { PersonId } from '../../career/types';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import { Hearts } from './bits';
import { useEffect, useState, type ReactNode } from 'react';
import type { NpcState } from '../../npc/types';
import { SpriteFrame } from '../story/Sprite';
import { portraitKey } from '../../story/sprites';
import { regularPortrait } from '../casino/regularPortraits';
import { serverPortrait, serverById } from '../../casino/servers/registry';
import { casinoRegulars, casinoStaff, courseChallengers, FAMILIARITY_STATUS } from './peopleGroups';

interface Person {
  id: PersonId;
  name: string;
  role: string;
  about: string;
  show: boolean;
}

export function PeoplePanel() {
  const { state, services } = useGame();
  const c = state.career;
  const rival = Object.values(c.pools).flat().find((g) => g.id === c.rivalId);
  const caddie = c.owned.map(lifestyleById).find((l) => l?.kind === 'caddie');
  const people: Person[] = [
    { id: 'coach', name: 'Coach Dana', role: 'Swing coach', about: 'A better relationship means bigger training gains.', show: true },
    // Baba, Ryan's father. The relationship keeps its original save key ('mom') so existing careers keep their hearts.
    { id: 'mom', name: 'Baba (Dad)', role: 'Biggest fan, harshest critic', about: 'Blunt, loving, always on time. He worries about your putting.', show: true },
    { id: 'friend', name: 'Jess', role: 'Best friend', about: "Drags you out when you need it. Films your trick shots.", show: true },
    { id: 'rival', name: RIVAL.name, role: 'Rival', about: rival ? `Currently on the ${rivalTourName(rival.tour)}. Head-to-head: ${Number(c.flags.h2hWins ?? 0)}–${Number(c.flags.h2hLosses ?? 0)}.` : '', show: true },
    { id: 'caddie', name: caddie?.name.replace(/^Hire .*\((.*)\)$/, '$1') ?? 'Caddie', role: 'Caddie', about: 'Reads greens and keeps you calm.', show: !!caddie },
    { id: 'agent', name: 'Marty Klein', role: 'Agent', about: 'Talks fast, finds sponsors.', show: c.flags.agent === true },
    { id: 'sponsor', name: c.sponsor?.name ?? 'Sponsor', role: 'Sponsor', about: c.sponsor ? `${formatMoney(c.sponsor.weekly)}/week, ${formatMoney(c.sponsor.winBonus)} per win, through season ${c.sponsor.untilSeason}.` : '', show: !!c.sponsor },
    { id: 'fans', name: 'Fans', role: 'Following', about: 'Grow with wins, videos and clinics.', show: true },
  ];
  const [npcs, setNpcs] = useState<NpcState[]>([]);
  useEffect(() => {
    let live = true;
    void services.npc.states().then((s) => live && setNpcs(s)).catch(() => {});
    return () => { live = false; };
  }, [services]);
  const challengers = courseChallengers(c.story);
  const staff = casinoStaff(npcs);
  const regulars = casinoRegulars(c);
  return (
    <main className="people-page" data-testid="people">
      <Group title="Inner circle">
        {people
          .filter((p) => p.show)
          .map((p) => (
            <section key={p.id} className={`hub-card person ${p.id}`}>
              <div className={`avatar ${p.id}`} aria-hidden="true">{p.name[0]}</div>
              <div>
                <h2 className="hub-title">{p.name}</h2>
                <p className="muted">{p.role}</p>
                <Hearts value={c.relationships[p.id] ?? 0} />
                <p className="person-about">{p.about}</p>
              </div>
            </section>
          ))}
      </Group>

      <Group title="On the course" empty={challengers.length === 0 && 'Nobody has challenged you yet. Keep an eye out at the range and the clubhouse lounge.'} testId="people-course">
        {challengers.map((p) => (
          <section key={p.id} className="hub-card person challenger">
            <div className="avatar portrait" aria-hidden="true"><SpriteFrame who={p.id} frame={portraitKey(p.id, 'neutral')} height={64} /></div>
            <div>
              <h2 className="hub-title">{p.name}</h2>
              <p className="muted">{p.role}</p>
              <Hearts value={p.bond} />
              <p className="person-stat">
                {p.wins + p.losses > 0 ? <>Challenges: <b>{p.wins}–{p.losses}</b> · </> : null}
                {p.meetings} {p.meetings === 1 ? 'run-in' : 'run-ins'}
              </p>
              {p.last && <p className="person-about">Last time: {p.last}</p>}
            </div>
          </section>
        ))}
      </Group>

      <Group title="Casino staff" empty={staff.length === 0 && "You haven't met the casino staff yet. Sit down at a table or order a drink."} testId="people-staff">
        {staff.map((p) => {
          const server = serverById(p.id);
          const face = server ? serverPortrait(server.location, 'friendly') : undefined;
          return (
            <section key={p.id} className="hub-card person staff">
              <div className="avatar portrait" aria-hidden="true">{face ? <img src={face} alt="" /> : p.name[0]}</div>
              <div>
                <h2 className="hub-title">{p.name}</h2>
                <p className="muted">{p.job} · {p.where}</p>
                <Hearts value={p.relationship} />
                <p className="person-stat"><b>{p.tier}</b> · {p.visits} {p.visits === 1 ? 'visit' : 'visits'}{p.tips > 0 ? <> · tipped {formatMoney(p.tipped)}</> : null}</p>
              </div>
            </section>
          );
        })}
      </Group>

      <Group title="Casino regulars" draft={FAMILIARITY_STATUS === 'draft'} empty={regulars.length === 0 && 'The craps regulars will remember you once you roll at their table.'} testId="people-regulars">
        {regulars.map((p) => {
          const face = regularPortrait(p.id, 'neutral');
          return (
            <section key={p.id} className="hub-card person regular">
              <div className="avatar portrait" aria-hidden="true">{face ? <img src={face} alt="" /> : p.name[0]}</div>
              <div>
                <h2 className="hub-title">{p.name}</h2>
                <p className="muted">Craps regular · {p.where}</p>
                <p className="person-stat"><b>{p.label}</b> · {p.rolls} {p.rolls === 1 ? 'roll' : 'rolls'} at their table</p>
                <p className="person-about">{p.bio}</p>
              </div>
            </section>
          );
        })}
      </Group>
    </main>
  );
}

function Group({ title, children, empty, draft, testId }: { title: string; children: ReactNode; empty?: string | false; draft?: boolean; testId?: string }) {
  return (
    <section className="people-group" aria-label={title} data-testid={testId}>
      <h2 className="people-head">{title}{draft && <span className="rpg-draft">Draft labels</span>}</h2>
      {empty ? <p className="people-empty muted">{empty}</p> : <div className="people">{children}</div>}
    </section>
  );
}
