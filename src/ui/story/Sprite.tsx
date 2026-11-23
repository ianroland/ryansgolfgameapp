import { useEffect, useState, type CSSProperties } from 'react';
import { sheetFor, sheetManifest, sheetUrl } from '../../story/sprites';

/** Draws one atlas frame, scaled to a height, crisp (no smoothing). */
export function SpriteFrame({ who, frame, height, className, style, title }: { who: string; frame: string; height: number; className?: string; style?: CSSProperties; title?: string }) {
  const sheet = sheetFor(who);
  const m = sheetManifest(sheet);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void sheetUrl(sheet).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [sheet]);
  const f = m?.frames[frame];
  if (!m || !f) return <span className={`sprite missing ${className ?? ''}`} style={{ height, ...style }} title={`Missing art: ${sheet} ${frame}`} />;
  const k = height / f.h;
  return (
    <span
      className={`sprite ${className ?? ''}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-frame={frame}
      style={{
        width: Math.round(f.w * k),
        height: Math.round(height),
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundSize: `${m.w * k}px ${m.h * k}px`,
        backgroundPosition: `${-f.x * k}px ${-f.y * k}px`,
        // Crisp pixels when enlarging; smooth when shrinking (avoids dropped pixels).
        imageRendering: k >= 1 ? 'pixelated' : 'auto',
        ...style,
      }}
    />
  );
}
