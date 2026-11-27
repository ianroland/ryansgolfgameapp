/**
 * Composition root. Every screen and test gets its services from here, so
 * there is exactly one economy, one pipeline and one database per game.
 */
import type { DexieOptions } from 'dexie';
import { AppDB, DB_NAME } from '../persistence/db';
import { CareerService } from './careerService';
import { CasinoService } from './casinoService';
import { EconomyService } from './economyService';
import { Notifier } from './notifier';
import { RoomService } from './roomService';
import { SaveService } from './saveService';
import { StoreService } from './storeService';
import { TournamentPipeline } from './tournamentPipeline';
import { TrophyDisplayService } from './trophyDisplayService';
import { registerTrophyAwards } from './trophyAwardService';
import { RecordsService, registerAlbatrossRecords } from './recordsService';
import { LegacyService, registerLegacyAwards } from './legacyService';
import { ExpansionService } from './expansionService';
import { NpcService } from './npcService';
import { PokerService } from './pokerService';
import { DrinkService } from './drinkService';
import { SportsbookService } from './sportsbookService';
import { SportsUniverseService } from './sportsUniverseService';

export interface GameServices {
  db: AppDB;
  notifier: Notifier;
  economy: EconomyService;
  store: StoreService;
  room: RoomService;
  trophyDisplay: TrophyDisplayService;
  career: CareerService;
  casino: CasinoService;
  pipeline: TournamentPipeline;
  saves: SaveService;
  records: RecordsService;
  legacy: LegacyService;
  expansion: ExpansionService;
  npc: NpcService;
  poker: PokerService;
  drinks: DrinkService;
  sportsbook: SportsbookService;
  sportsUniverse: SportsUniverseService;
}

export function createServices(dbName: string = DB_NAME, dexieOptions?: DexieOptions): GameServices {
  const db = new AppDB(dbName, dexieOptions);
  const notifier = new Notifier();
  const economy = new EconomyService(db);
  const pipeline = new TournamentPipeline(db, economy, notifier);
  registerTrophyAwards(pipeline);
  registerAlbatrossRecords(pipeline);
  // Career Legacy: after trophies, so a Pink Jacket's trophy already exists.
  registerLegacyAwards(pipeline);
  const career = new CareerService(db, economy, notifier, pipeline);
  const sportsbook = new SportsbookService(db, economy, notifier);
  return {
    db,
    notifier,
    economy,
    store: new StoreService(db, economy),
    room: new RoomService(db),
    trophyDisplay: new TrophyDisplayService(db),
    career,
    casino: new CasinoService(db, economy, career, notifier),
    pipeline,
    saves: new SaveService(db),
    records: new RecordsService(db),
    legacy: new LegacyService(db),
    expansion: new ExpansionService(db),
    npc: new NpcService(db, economy),
    poker: new PokerService(db, economy),
    drinks: new DrinkService(db, economy),
    sportsbook,
    sportsUniverse: new SportsUniverseService(db, sportsbook, notifier),
  };
}
