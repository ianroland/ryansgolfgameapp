import { useEffect, useState } from 'react';
import { sound } from '../../audio/sound';
import { storyChoiceBlocker } from '../../career/engine';
import { useBlocking } from '../blocking';
import { useGame } from '../GameContext';

/** New Star Soccer-style life event: pick one choice, see what happens. */
export function StoryDialog() {
  const { state, services, run } = useGame();
  const story = state.career.pendingStory;
  const [result, setResult] = useState<{ title: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const storyId = story?.storyId;
  // The result screen outlives pendingStory: it must still block other screens.
  useBlocking('story', !!story || !!result);
  useEffect(() => {
    if (storyId) sound.play('story');
  }, [storyId]);
  if (!story && !result) return null;

  const choose = async (i: number) => {
    setBusy(true);
    const title = story!.title;
    const o = await run(() => services.career.resolveStory(i));
    setBusy(false);
    if (o) setResult({ title, text: (o as { result?: string }).result ?? o.message ?? '' });
  };

  return (
    <div className="backdrop story-backdrop">
      <div className="dialog story" role="dialog" aria-modal="true" aria-label={result?.title ?? story!.title}>
        <div className="dialog-head">
          <h2 className="dialog-title">{result?.title ?? story!.title}</h2>
        </div>
        <div className="dialog-body">
          {result ? (
            <>
              <p className="story-body">{result.text}</p>
              <div className="btn-row">
                <button className="btn primary" autoFocus onClick={() => setResult(null)} data-testid="story-continue">Continue</button>
              </div>
            </>
          ) : (
            <>
              <p className="story-body">{story!.body}</p>
              <div className="btn-col">
                {story!.choices.map((ch, i) => {
                  const block = storyChoiceBlocker(state.career, i, state.balance);
                  return (
                    <button key={i} className="choice" disabled={busy || !!block} onClick={() => choose(i)} data-testid={`story-choice-${i}`}>
                      <span className="choice-label">{ch.label}</span>
                      {(block || ch.hint) && <span className="choice-hint">{block ?? ch.hint}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
