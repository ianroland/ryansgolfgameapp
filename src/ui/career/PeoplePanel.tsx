import { lifestyleById } from '../../career/shop';
import { RIVAL } from '../../career/field';
import { TOURS } from '../../career/config';
import type { PersonId } from '../../career/types';
import { useGame } from '../GameContext';
import { formatMoney } from '../format';
import { Hearts } from './bits';

interface Person {
  id: PersonId;
  name: string;
  role: string;
  about: string;
  show: boolean;
}

export function PeoplePanel() {
  const { state } = useGame();
  const c = state.career;
  const rival = Object.values(c.pools).flat().find((g) => g.id === c.rivalId);
  const caddie = c.owned.map(lifestyleById).find((l) => l?.kind === 'caddie');
  const people: Person[] = [
    { id: 'coach', name: 'Coach Dana', role: 'Swing coach', about: 'A better relationship means bigger training gains.', show: true },
    { id: 'mom', name: 'Mom', role: 'Biggest fan', about: 'Keeps you grounded. She worries about money.', show: true },
    { id: 'friend', name: 'Jess', role: 'Best friend', about: "Drags you out when you need it. Films your trick shots.", show: true },
    { id: 'rival', name: RIVAL.name, role: 'Rival', about: rival ? `Currently on the ${TOURS[rival.tour].name}. Head-to-head: ${Number(c.flags.h2hWins ?? 0)}–${Number(c.flags.h2hLosses ?? 0)}.` : '', show: true },
    { id: 'caddie', name: caddie?.name.replace(/^Hire .*\((.*)\)$/, '$1') ?? 'Caddie', role: 'Caddie', about: 'Reads greens and keeps you calm.', show: !!caddie },
    { id: 'agent', name: 'Marty Klein', role: 'Agent', about: 'Talks fast, finds sponsors.', show: c.flags.agent === true },
    { id: 'sponsor', name: c.sponsor?.name ?? 'Sponsor', role: 'Sponsor', about: c.sponsor ? `${formatMoney(c.sponsor.weekly)}/week, ${formatMoney(c.sponsor.winBonus)} per win, through season ${c.sponsor.untilSeason}.` : '', show: !!c.sponsor },
    { id: 'fans', name: 'Fans', role: 'Following', about: 'Grow with wins, videos and clinics.', show: true },
  ];
  return (
    <main className="people">
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
    </main>
  );
}
