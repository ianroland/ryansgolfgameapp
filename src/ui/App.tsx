import { useEffect, useMemo, useRef, useState } from 'react';
import { GAME_TITLE, fameLevel } from '../career/config';
import type { TournamentDef } from '../career/tournament';
import { getCatalogItem } from '../catalog/items';
import { trophyLook } from '../catalog/trophies';
import type { PlacedFurnitureVM, SceneViewModel, ZoneHighlight } from '../game/ClubhouseScene';
import { zoneAccepts } from '../services/roomService';
import { ClubhouseCanvas } from './components/ClubhouseCanvas';
import { Toasts } from './components/Toasts';
import { SaveMenu } from './components/SaveMenu';
import { SoundMenu } from './components/SoundMenu';
import { sound } from '../audio/sound';
import { useGame } from './GameContext';
import { HomePanel } from './screens/HomePanel';
import { StorePanel } from './screens/StorePanel';
import { EditRoomPanel, type EditSession } from './screens/EditRoomPanel';
import { TrophyPanel } from './screens/TrophyPanel';
import { TrophyDetails } from './screens/TrophyDetails';
import { CareerHub } from './career/CareerHub';
import { SchedulePanel } from './career/SchedulePanel';
import { ListingsPanel, MuniFundPanel, ShopPanel } from './career/ShopPanel';
import { MUNI_EVENT, MuniRound } from './tournament/MuniRound';
import { PeoplePanel } from './career/PeoplePanel';
import { StoryDialog } from './career/StoryDialog';
import { EnterDialog } from './career/EnterDialog';
import { TournamentView } from './tournament/TournamentView';
import { TitleScreen } from './TitleScreen';
import { HeaderBackdrop, PageBackdrop, useSceneRotation } from './SceneBackdrop';
import { CasinoPanel } from './casino/CasinoPanel';
import { LegacyHub, type LegacySection } from './legacy/LegacyHub';
import { AlbatrossCelebration } from './records/AlbatrossCelebration';
import { LegacyCelebration } from './legacy/LegacyCelebration';
import { EncounterScene } from './story/EncounterScene';
import { encounterMayShow, encounterShouldAutoOpen, useOpenBlockingScreens, type ScreenState } from './blocking';
import { storyOf } from '../story/appearance';
import logoUrl from '../assets/logo_ryans_road.webp';
import { ShownBalance } from './casino/ShownBalance';

/** The Sports History Board loads on first open (its archive is several MB). */

/** Clubhouse sub-screens. */
export type Screen = 'home' | 'listings' | 'muni' | 'store' | 'edit' | 'trophies';
type Tab = 'career' | 'schedule' | 'legacy' | 'shop' | 'people' | 'clubhouse' | 'casino';

const TABS: { id: Tab; label: string }[] = [
  { id: 'career', label: 'Career' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'legacy', label: 'Legacy' },
  { id: 'shop', label: 'Pro Shop' },
  { id: 'people', label: 'People' },
  { id: 'clubhouse', label: 'Real Estate' },
  { id: 'casino', label: 'Casino' },
];

const SUBSCREENS: { id: Screen; label: string }[] = [
  { id: 'home', label: 'Overview' },
  { id: 'listings', label: 'Listings' },
  { id: 'muni', label: 'Muni Fund' },
  { id: 'store', label: 'Furniture' },
  { id: 'edit', label: 'Edit Room' },
  { id: 'trophies', label: 'Trophies' },
];

export function App() {
  const { state, services, playerId, run, notify, setInspectTrophyId, inspectTrophyId, ephemeral } = useGame();
  const c = state.career;
  const [tab, setTab] = useState<Tab>('career');
  const [encounter, setEncounter] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [edit, setEdit] = useState<EditSession | null>(null);
  const [pickTrophyId, setPickTrophyId] = useState<string | null>(null);
  const [zoneHint, setZoneHint] = useState<string>('');
  const [entering, setEntering] = useState<TournamentDef | null>(null);
  const [inTournament, setInTournament] = useState<boolean>(!!c.active);
  const showTournament = inTournament || !!c.active;
  // One blocking screen at a time: a newly offered encounter opens by itself
  // once, but only when no story, dialog or tournament screen is up. "Later"
  // leaves it on the hub.
  const offered = storyOf(c).available;
  const autoOpened = useRef<string | null>(null);
  const blockingScreens = useOpenBlockingScreens();
  const screens: ScreenState = { tournamentScreen: showTournament, storyPending: !!c.pendingStory, openScreens: blockingScreens.filter((id) => id !== 'encounter') };
  useEffect(() => {
    if (encounterShouldAutoOpen(screens, offered, autoOpened.current) && !encounter) {
      autoOpened.current = offered;
      setEncounter(offered);
    }
  });
  const [started, setStarted] = useState(false);
  const [muni, setMuni] = useState(false);
  useEffect(() => {
    const on = () => setMuni(true);
    window.addEventListener(MUNI_EVENT, on);
    return () => window.removeEventListener(MUNI_EVENT, on);
  }, []);
  const [legacySection, setLegacySection] = useState<LegacySection>('overview');
  // Rotating scenery for the game shell (one timer for page and header; not saved).
  const scenery = useSceneRotation();

  const go = (s: Screen) => {
    setTab('clubhouse');
    if (s !== 'edit') setEdit(null);
    if (s === 'edit' && !edit) {
      setEdit({ baseVersion: state.property.layoutVersion, draft: {}, selectedFurnitureId: null, dirty: false });
    }
    if (s !== 'trophies') setPickTrophyId(null);
    setScreen(s);
  };

  const goTab = (t: Tab) => {
    if (t !== 'clubhouse') {
      setEdit(null);
      setPickTrophyId(null);
    }
    setTab(t);
  };

  // Effective zone for each furniture item (draft overrides saved state while editing).
  const effectiveZone = (id: string, saved?: string) => (edit && id in edit.draft ? edit.draft[id] ?? undefined : saved);

  const vm: SceneViewModel = useMemo(() => {
    const def = state.propertyDef;
    const latestJacket = state.trophies
      .filter((t) => trophyLook(t).style === 'pink_jacket')
      .sort((a, b) => a.sourceTournamentId.localeCompare(b.sourceTournamentId, undefined, { numeric: true }))
      .pop();
    const placed: PlacedFurnitureVM[] = state.furniture
      .map((f) => ({ f, zone: effectiveZone(f.id, f.propertyId === state.property.id ? f.placementZoneId : undefined) }))
      .filter((x): x is { f: typeof x.f; zone: string } => !!x.zone)
      .map(({ f, zone }) => {
        const item = getCatalogItem(f.catalogItemId);
        const slots: PlacedFurnitureVM['slots'] = Array.from({ length: item.displayCapacity }, () => null);
        for (const p of state.placements) {
          if (p.furnitureInstanceId !== f.id) continue;
          const t = state.trophies.find((tr) => tr.id === p.trophyInstanceId);
          if (t) slots[p.slotIndex] = { trophyId: t.id, style: trophyLook(t).style };
        }
        return { furnitureId: f.id, zoneId: zone, catalogItemId: f.catalogItemId, slots };
      });

    const highlight: Record<string, ZoneHighlight> = {};
    if (edit) {
      const sel = state.furniture.find((f) => f.id === edit.selectedFurnitureId);
      for (const z of def.zones) {
        const occupant = placed.find((p) => p.zoneId === z.id);
        if (occupant && occupant.furnitureId === sel?.id) highlight[z.id] = 'selected';
        else if (occupant) highlight[z.id] = 'occupied';
        else if (sel && zoneAccepts(def, z, sel.catalogItemId)) highlight[z.id] = 'compatible';
        else highlight[z.id] = 'unavailable';
      }
    }
    return {
      mode: edit ? 'edit' : 'view',
      home: def,
      placed,
      highlight,
      selectedFurnitureId: edit?.selectedFurnitureId ?? null,
      selectedTrophyId: pickTrophyId ?? inspectTrophyId,
      slotPicking: !!pickTrophyId,
      pinkJacketCase: latestJacket ? { trophyId: latestJacket.id } : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, edit, pickTrophyId, inspectTrophyId]);

  const onZoneClick = (zoneId: string) => {
    if (!edit) return;
    const sel = state.furniture.find((f) => f.id === edit.selectedFurnitureId);
    const zone = state.propertyDef.zones.find((z) => z.id === zoneId)!;
    if (!sel) return setZoneHint('Select an item from your inventory first.');
    if (!zoneAccepts(state.propertyDef, zone, sel.catalogItemId)) {
      return setZoneHint(zone.reserved ? `${zone.label} unlocks with a bigger home.` : `That item doesn't fit in ${zone.label}.`);
    }
    if (vm.placed.some((p) => p.zoneId === zoneId && p.furnitureId !== sel.id)) return setZoneHint(`${zone.label} is occupied.`);
    setZoneHint(`Moved to ${zone.label}. Save to keep this layout.`);
    setEdit({ ...edit, draft: { ...edit.draft, [sel.id]: zoneId }, dirty: true });
  };

  const displayInSlot = async (furnitureId: string, slot: number) => {
    if (!pickTrophyId) return;
    const placed = await run(() => services.trophyDisplay.display(playerId, pickTrophyId, furnitureId, slot));
    if (placed) {
      const t = state.trophies.find((tr) => tr.id === pickTrophyId);
      notify({ kind: 'info', title: `${t ? trophyLook(t).name : 'Trophy'} placed on shelf ${slot + 1}` });
      setPickTrophyId(null);
    }
  };

  // Background music follows the screen.
  useEffect(() => {
    if (started) sound.playMusic(showTournament ? 'course' : 'menu');
  }, [started, showTournament]);

  if (!started) return <TitleScreen onStart={() => setStarted(true)} />;

  return (
    <div className={`app ${showTournament ? 'in-round' : ''}`}>
      <PageBackdrop scene={scenery.scene} leaving={scenery.leaving} />
      <header className="topbar">
        <HeaderBackdrop scene={scenery.scene} leaving={scenery.leaving} />
        <div className="brand">
          <h1 className="title-logo">
            <img src={logoUrl} alt={GAME_TITLE} className="logo-img" />
          </h1>
        </div>
        <div className="topbar-right">
          <div className="player">
            <span className="player-name">Ryan · {fameLevel(c.fame).name}</span>
            <span className="player-prop">Season {c.season} · Week {c.week} · {state.propertyDef.name}</span>
          </div>
          <div className="balance" aria-live="polite" data-testid="balance">
            <span className="balance-label">Bank</span>
            <span className="balance-value"><ShownBalance real={state.balance} /></span>
          </div>
          <SoundMenu />
          <SaveMenu />
        </div>
      </header>

      {ephemeral && <p className="ephemeral-note" role="status">This browser view can&rsquo;t keep saves, so progress resets when you close it. Use Save → Export to keep your career, or run the game locally.</p>}

      {showTournament ? (
        <TournamentView onExit={() => { setInTournament(false); setTab('career'); }} />
      ) : muni ? (
        <MuniRound onExit={() => setMuni(false)} />
      ) : (
        <>
          <nav className="tabs" aria-label="Game screens">
            {TABS.map((t) => (
              <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => goTab(t.id)} data-testid={`tab-${t.id}`}>
                {t.label}
              </button>
            ))}
          </nav>

          {tab === 'career' && <CareerHub onEnter={setEntering} onEncounter={setEncounter} />}
          {tab === 'schedule' && <SchedulePanel onEnter={setEntering} />}
          {tab === 'legacy' && <LegacyHub section={legacySection} onSection={setLegacySection} onOpenTrophies={() => go('trophies')} />}
          {tab === 'shop' && <ShopPanel />}
          {tab === 'people' && <PeoplePanel />}
          <div hidden={tab !== 'casino'}>
            <CasinoPanel />
          </div>
          {tab === 'clubhouse' && (
            <main className="layout">
              <section className="stage-wrap" aria-label="Ryan's home">
                <ClubhouseCanvas
                  vm={vm}
                  label={`Ryan's ${state.propertyDef.name}: ${vm.placed.length} item(s) placed`}
                  onZoneClick={onZoneClick}
                  onFurnitureClick={(id) => edit && setEdit({ ...edit, selectedFurnitureId: id })}
                  onTrophyClick={(id) => !edit && setInspectTrophyId(id)}
                  onSlotClick={displayInSlot}
                />
                {edit && <p className="stage-hint" aria-live="polite">{zoneHint || 'Select furniture, then click a highlighted zone.'}</p>}
                {pickTrophyId && <p className="stage-hint" aria-live="polite">Choose a cabinet shelf for the trophy (or use the slot buttons).</p>}
              </section>

              <aside className="panel">
                <nav className="subtabs inpanel" aria-label="Home">
                  {SUBSCREENS.map((s) => (
                    <button key={s.id} className={screen === s.id ? 'on' : ''} onClick={() => go(s.id)} data-testid={`sub-${s.id}`}>{s.label}</button>
                  ))}
                </nav>
                {screen === 'home' && <HomePanel go={go} />}
                {screen === 'listings' && <ListingsPanel />}
                {screen === 'muni' && <MuniFundPanel />}
                {screen === 'store' && <StorePanel go={go} />}
                {screen === 'edit' && edit && (
                  <EditRoomPanel
                    session={edit}
                    setSession={setEdit}
                    effectiveZone={effectiveZone}
                    onDone={() => {
                      setEdit(null);
                      setZoneHint('');
                      setScreen('home');
                    }}
                    onHint={setZoneHint}
                    onZoneClick={onZoneClick}
                  />
                )}
                {screen === 'trophies' && (
                  <p className="legacy-link">
                    <button className="btn small ghost" onClick={() => { setLegacySection('overview'); goTab('legacy'); }} data-testid="open-legacy">Career Legacy</button>
                  </p>
                )}
                {screen === 'trophies' && <TrophyPanel pickTrophyId={pickTrophyId} setPickTrophyId={setPickTrophyId} displayInSlot={displayInSlot} go={go} />}
              </aside>
            </main>
          )}
        </>
      )}

      {entering && (
        <EnterDialog
          def={entering}
          onClose={() => setEntering(null)}
          onEntered={() => {
            setEntering(null);
            setInTournament(true);
          }}
        />
      )}
      {!showTournament && <StoryDialog />}
      {encounter && encounterMayShow(screens) && <EncounterScene id={encounter} onClose={() => setEncounter(null)} />}
      {inspectTrophyId && <TrophyDetails trophyId={inspectTrophyId} onClose={() => setInspectTrophyId(null)} />}
      <Toasts />
      <AlbatrossCelebration />
      <LegacyCelebration />
    </div>
  );
}
