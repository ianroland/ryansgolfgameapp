/**
 * Original player names for the fictional leagues: generic first names and surnames combined
 * at random, never a real athlete's identity by design. Unique within a world.
 */
import type { Rng } from './rng';

const FIRST = [
  'Aaron', 'Adrian', 'Ahmad', 'Alec', 'Andre', 'Ansel', 'Arlo', 'Bastian', 'Beau', 'Bram', 'Brennan', 'Caleb', 'Cass', 'Cedric', 'Colm', 'Corey',
  'Dalton', 'Damon', 'Darnell', 'Declan', 'Desmond', 'Dominic', 'Eamon', 'Elias', 'Emeka', 'Enzo', 'Ezra', 'Felix', 'Femi', 'Gage', 'Gideon', 'Grady',
  'Hollis', 'Idris', 'Isaiah', 'Jalen', 'Jasper', 'Jonah', 'Jovan', 'Kai', 'Keaton', 'Kenji', 'Kofi', 'Lachlan', 'Lamar', 'Landon', 'Leon', 'Luca',
  'Malik', 'Marcus', 'Mateo', 'Micah', 'Milo', 'Nico', 'Nolan', 'Omari', 'Orion', 'Otis', 'Pablo', 'Quentin', 'Rafael', 'Reggie', 'Remy', 'Rhys',
  'Rollo', 'Rowan', 'Sami', 'Santiago', 'Silas', 'Soren', 'Tadeo', 'Tariq', 'Teo', 'Theron', 'Tobias', 'Trey', 'Uriel', 'Vance', 'Wendell', 'Xavier',
];

const LAST = [
  'Abernathy', 'Achterberg', 'Adeyemi', 'Ashgrove', 'Balderrama', 'Barrowclough', 'Beauchamp', 'Birchfield', 'Blackwood', 'Brightwater', 'Calloway',
  'Castellano', 'Chukwu', 'Coldwell', 'Corriveau', 'Crestwood', 'Dandridge', 'Delacroix', 'Draycott', 'Easterly', 'Ellingsworth', 'Fairweather',
  'Falconer', 'Faraday', 'Fenwick', 'Galloway', 'Garrowby', 'Goldthwaite', 'Greaves', 'Halloran', 'Harrowgate', 'Haverford', 'Hollinger',
  'Ironside', 'Jaramillo', 'Kettleworth', 'Kingsley', 'Lachance', 'Langridge', 'Larkspur', 'Lindqvist', 'Lockhart', 'Mabry', 'Marchetti',
  'Merriweather', 'Montague', 'Navarre', 'Northcott', 'Nwosu', 'Oakhurst', 'Odegaard', 'Okonkwo', 'Ortolani', 'Pemberton', 'Pennington',
  'Quarrington', 'Ravensworth', 'Redfern', 'Rockwell', 'Rosewood', 'Saltonstall', 'Sandoval', 'Silverthorne', 'Stonebridge', 'Sutherland',
  'Tallis', 'Thistlewood', 'Thornbury', 'Underhill', 'Valcourt', 'Vanterpool', 'Wainwright', 'Westbrook', 'Whitcombe', 'Whitlock', 'Yarborough',
];

export function makeNameGen(r: Rng) {
  const used = new Set<string>();
  return (): string => {
    for (let i = 0; i < 1000; i++) {
      const n = `${r.pick(FIRST)} ${r.pick(LAST)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    throw new Error('Name space exhausted');
  };
}
