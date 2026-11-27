import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sound } from '../../audio/sound';
import { appearanceOf } from '../../story/appearance';
import { characterById, RYAN_ID } from '../../story/cast';
import { encounterById, localizeEncounter, type EncounterNode, type Line } from '../../story/encounters';
import { phaseOf } from '../../story/phase';
import { poseFrames, portraitKey } from '../../story/sprites';
import type { Expression, Pose } from '../../story/types';
import drivingRange from '../../assets/scenes/driving_range.webp';
import clubhouseLounge from '../../assets/scenes/clubhouse_lounge.webp';
import courseSunset from '../../assets/backgrounds/bg_city_sunset.webp';
import { useBlocking } from '../blocking';
import { useGame } from '../GameContext';
import { DriveChallenge, PuttChallenge } from './Challenge';
import { SpriteFrame } from './Sprite';

const BACKGROUNDS = { driving_range: drivingRange, clubhouse_lounge: clubhouseLounge, course_sunset: courseSunset };
const TYPE_MS = 22;

type Phase = 'lines' | 'choice' | 'challenge' | 'summary';

/** A full-body character on the stage, animated by pose. */
function Actor({ who, pose, talking, side, height, look }: { who: string; pose: Pose; talking: boolean; side: 'left' | 'right'; height: number; look: ReturnType<typeof appearanceOf> }) {
  const frames = poseFrames(who, talking && pose === 'idle' ? 'talk' : pose, look);
  const [i, setI] = useState(0);
  useEffect(() => {
    const ms = talking ? 170 : pose === 'idle' ? 700 : 260;
    const t = window.setInterval(() => setI((x) => x + 1), ms);
    return () => window.clearInterval(t);
  }, [talking, pose]);
  // Poses that "land" (celebrate, disappointed) play once and hold the last frame.
  const holds = pose === 'celebrate' || pose === 'disappointed' || pose === 'sad';
  const idx = frames.length ? (holds ? Math.min(i, frames.length - 1) : i % frames.length) : 0;
  if (!frames.length) return null;
  return (
    <div className={`actor ${side} ${talking ? 'talking' : ''}`} data-testid={`actor-${who}`} data-pose={pose}>
      <SpriteFrame who={who} frame={frames[idx]} height={height} />
    </div>
  );
}

/** Pose → expression for Ryan on stage (only approved portraits are drawn for Ryan). */
const RYAN_POSE_EXPR: Partial<Record<Pose, Expression>> = {
  celebrate: 'laughing', laugh: 'laughing', disappointed: 'disappointed', sad: 'worried', angry: 'angry', surprised: 'surprised', confident: 'confident',
};

/** Ryan on the stage: the approved portrait of the current phase (no unapproved body art). */
function RyanActor({ pose, talking, expr, height, look }: { pose: Pose; talking: boolean; expr?: Expression; height: number; look: ReturnType<typeof appearanceOf> }) {
  const e = (talking && expr) || RYAN_POSE_EXPR[pose] || 'neutral';
  return (
    <div className={`actor left ryan-portrait ${talking ? 'talking' : ''}`} data-testid={`actor-${RYAN_ID}`} data-pose={pose}>
      <SpriteFrame who={RYAN_ID} frame={portraitKey(RYAN_ID, e, look)} height={height} />
    </div>
  );
}

/** Plays one encounter: dialogue, choices, challenge, consequences (applied exactly once). */
export function EncounterScene({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, services, run, refresh } = useGame();
  const c = state.career;
  // Ryan's pronouns and Baba's pet name follow the phase the scene plays in.
  const def = useMemo(() => localizeEncounter(encounterById(id)!, phaseOf(c)), [id, c]);
  const look = appearanceOf(c);
  const [nodeId, setNodeId] = useState(def.start);
  const [lineIdx, setLineIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<Phase>('lines');
  const [path, setPath] = useState<string[]>([]);
  const [poses, setPoses] = useState<Record<string, Pose>>({});
  const [result, setResult] = useState<{ summary: string; changes: string; tone: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolving = useRef(false);
  useBlocking('encounter');
  const opponent = def.cast[0];
  const node: EncounterNode = def.nodes[nodeId];
  const line: Line | undefined = node.lines[lineIdx];
  const full = line ? line.text.length : 0;
  const typing = phase === 'lines' && !!line && typed < full;

  useEffect(() => {
    sound.play('story');
  }, []);

  // Typewriter.
  useEffect(() => {
    if (!typing) return;
    const t = window.setTimeout(() => setTyped((n) => Math.min(full, n + 2)), TYPE_MS);
    return () => window.clearTimeout(t);
  }, [typing, typed, full]);

  // Lines set a character's standing pose.
  useEffect(() => {
    if (line?.pose && line.who !== 'narrator') setPoses((p) => ({ ...p, [line.who]: line.pose! === 'talk' ? 'idle' : line.pose! }));
  }, [line]);

  const resolve = useCallback(
    async (finalPath: string[]) => {
      if (resolving.current) return;
      resolving.current = true;
      const out = await run(() => services.career.resolveEncounter(id, finalPath));
      if (!out?.outcomeId) {
        setError('That encounter could not be completed. Nothing was changed.');
        return;
      }
      const o = def.outcomes[out.outcomeId];
      setResult({ summary: o.summary, changes: o.changes, tone: o.tone });
      if ((o.effects.money ?? 0) > 0) sound.play('cash');
    },
    [def, id, run, services],
  );

  const enterNode = useCallback(
    (next: string, nextPath: string[]) => {
      setNodeId(next);
      setLineIdx(0);
      setTyped(0);
      setPhase('lines');
      // Reaching an ending applies it right away, so replaying the scene can't re-roll it.
      const n = def.nodes[next];
      if ('outcome' in n) void resolve(nextPath);
    },
    [def, resolve],
  );

  /** After a node's last line. */
  const afterLines = useCallback(() => {
    if ('choice' in node) setPhase('choice');
    else if ('challenge' in node) setPhase('challenge');
    else if ('next' in node) enterNode(node.next, path);
    else setPhase('summary');
  }, [node, enterNode, path]);

  const advance = useCallback(() => {
    if (phase !== 'lines') return;
    if (typing) return setTyped(full);
    sound.play('ui_click', { volume: 0.4 });
    if (lineIdx < node.lines.length - 1) {
      setLineIdx((i) => i + 1);
      setTyped(0);
    } else afterLines();
  }, [phase, typing, full, lineIdx, node, afterLines]);

  /** Skip: straight to the next decision (or the end). Never decides anything. */
  const skip = useCallback(() => {
    let id2 = nodeId;
    let n = def.nodes[id2];
    while ('next' in n) {
      id2 = n.next;
      n = def.nodes[id2];
    }
    if (id2 !== nodeId) setNodeId(id2);
    setLineIdx(Math.max(0, n.lines.length - 1));
    setTyped(Number.MAX_SAFE_INTEGER);
    if ('choice' in n) setPhase('choice');
    else if ('challenge' in n) setPhase('challenge');
    else setPhase('summary');
  }, [def, nodeId]);

  useEffect(() => {
    if (phase !== 'lines') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        advance();
      } else if (e.key === 'Escape' || e.key.toLowerCase() === 's') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, advance, skip]);

  const choose = (opt: string, next: string) => {
    sound.play('ui_confirm');
    const p = [...path, opt];
    setPath(p);
    enterNode(next, p);
  };
  const challengeDone = (win: boolean) => {
    if (!('challenge' in node)) return;
    const p = [...path, win ? 'win' : 'lose'];
    setPath(p);
    enterNode(win ? node.win : node.lose, p);
  };
  const close = async () => {
    await refresh();
    onClose();
  };

  const speaker = line?.who ?? 'narrator';
  // With two cast members, whoever speaks steps in opposite Ryan (the first one otherwise).
  const [onStage, setOnStage] = useState(opponent);
  useEffect(() => {
    if (def.cast.includes(speaker) && speaker !== onStage) setOnStage(speaker);
  }, [speaker, onStage, def.cast]);
  const speakerDef = speaker === RYAN_ID ? { short: 'Ryan', color: '#1d3f8a' } : characterById(speaker);
  const balance = state.balance;
  const ending = 'outcome' in node;
  const canLater = path.length === 0 && !ending;
  const stage = useMemo(() => ({ backgroundImage: `url(${BACKGROUNDS[def.location]})` }), [def.location]);

  return (
    <div className="enc-backdrop" role="dialog" aria-modal="true" aria-label={def.title} data-testid="encounter">
      <div className={`enc ${phase === 'challenge' ? 'zoom' : ''}`}>
        <header className="enc-head">
          <span className="enc-kicker">Encounter</span>
          <h2 className="enc-title">{def.title}</h2>
          <div className="enc-tools">
            {phase === 'lines' && <button className="btn small" onClick={skip} data-testid="enc-skip" title="Skip to the next decision (S)">Skip ▸▸</button>}
            {canLater && <button className="btn small" onClick={onClose} data-testid="enc-later">Later</button>}
          </div>
        </header>
        <div className="enc-stage" style={stage}>
          <RyanActor pose={poses[RYAN_ID] ?? 'idle'} talking={typing && speaker === RYAN_ID} expr={speaker === RYAN_ID ? line?.expr : undefined} height={130} look={look} />
          <Actor key={onStage} who={onStage} side="right" pose={poses[onStage] ?? 'idle'} talking={typing && speaker === onStage} height={128} look={look} />
        </div>
        <div className="enc-box">
          {error ? (
            <div className="enc-summary">
              <p className="warn-text">{error}</p>
              <button className="btn primary" onClick={close}>Close</button>
            </div>
          ) : phase === 'challenge' && 'challenge' in node ? (
            node.challenge.kind === 'drive' ? (
              <DriveChallenge c={c} encounterId={id} opponent={characterById(opponent)?.short ?? 'them'} onDone={challengeDone} />
            ) : (
              <PuttChallenge c={c} encounterId={id} opponent={characterById(opponent)?.short ?? 'them'} onDone={challengeDone} />
            )
          ) : phase === 'summary' ? (
            <div className="enc-summary" data-testid="enc-summary">
              {result ? (
                <>
                  <p className={`enc-result ${result.tone}`}>{result.summary}</p>
                  <p className="enc-changes" data-testid="enc-changes">{result.changes}</p>
                </>
              ) : (
                <p className="muted">Saving…</p>
              )}
              <button className="btn primary" onClick={close} disabled={!result} data-testid="enc-done" autoFocus>Continue</button>
            </div>
          ) : (
            <div className={`enc-line ${speaker === 'narrator' ? 'narration' : ''}`} onClick={advance} data-testid="enc-line">
              {speaker !== 'narrator' && (
                <div className="enc-portrait">
                  <SpriteFrame who={speaker} frame={portraitKey(speaker, line?.expr ?? 'neutral', look)} height={96} title={speakerDef?.short} />
                </div>
              )}
              <div className="enc-text">
                {speaker !== 'narrator' && <span className="enc-name" style={{ background: speakerDef?.color }}>{speakerDef?.short}</span>}
                <p>{line?.text.slice(0, typed)}<span className="enc-caret" aria-hidden>{typing ? '' : ' ▼'}</span></p>
                {phase === 'choice' && 'choice' in node && (
                  <div className="enc-choices" onClick={(e) => e.stopPropagation()}>
                    <p className="enc-prompt">{node.choice.prompt}</p>
                    {node.choice.options.map((o) => {
                      const short = (o.stake ?? 0) > balance;
                      return (
                        <button key={o.id} className="choice" onClick={() => choose(o.id, o.next)} disabled={short} data-testid={`enc-choice-${o.id}`}>
                          <b>{o.label}</b>
                          <span>{short ? `Needs $${o.stake!.toLocaleString()}` : o.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
