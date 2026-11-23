/** A small original pixel-art albatross in flight (seen from above). */
const ROWS = [
  '............y............',
  '...........ooo...........',
  '..........ooooo..........',
  '###.....##ooooo##.....###',
  '.########ooooooo########.',
  '...######ooooooo######...',
  '..........ooooo..........',
  '...........ooo...........',
  '..........o.o.o..........',
];
const FILL: Record<string, string> = { '#': '#2b2d3c', o: '#ffffff', y: '#ffd84a' };

export function PixelBird({ className, title }: { className?: string; title?: string }) {
  const w = ROWS[0].length;
  return (
    <svg className={className} viewBox={`-1 -1 ${w + 2} ${ROWS.length + 2}`} shapeRendering="crispEdges" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {ROWS.flatMap((row, y) =>
        [...row].map((ch, x) =>
          FILL[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={FILL[ch]} /> : null,
        ),
      )}
    </svg>
  );
}
