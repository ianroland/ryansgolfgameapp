import { useEffect, useRef } from 'react';
import { destroyGame } from '../../game/destroyGame';
import type * as Phaser from 'phaser';
import { ClubhouseScene, createClubhouseGame, type SceneCallbacks, type SceneViewModel } from '../../game/ClubhouseScene';

interface Props extends SceneCallbacks {
  vm: SceneViewModel;
  label: string;
}

/** Hosts the Phaser clubhouse scene and bridges React state ⇄ scene. */
export function ClubhouseCanvas({ vm, label, ...callbacks }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ClubhouseScene | null>(null);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    const scene = new ClubhouseScene();
    scene.setCallbacks({
      onZoneClick: (z) => cbRef.current.onZoneClick?.(z),
      onFurnitureClick: (f) => cbRef.current.onFurnitureClick?.(f),
      onTrophyClick: (t) => cbRef.current.onTrophyClick?.(t),
      onSlotClick: (f, i) => cbRef.current.onSlotClick?.(f, i),
    });
    sceneRef.current = scene;
    const game: Phaser.Game = createClubhouseGame(hostRef.current!, scene);
    return () => {
      sceneRef.current = null;
      destroyGame(game);
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setViewModel(vm);
  }, [vm]);

  return <div className="stage" ref={hostRef} role="img" aria-label={label} data-testid="clubhouse-canvas" />;
}
