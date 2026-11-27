/**
 * Pro Shop item icons: small flat drawings, one per item kind, in the game's chunky-outline
 * style. Original art drawn in code (no brands, no logos).
 */
import type { ReactNode } from 'react';

const INK = '#1a1426';
const S = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

function Frame({ children, bg }: { children: ReactNode; bg: string }) {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" className="ps-icon" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="12" fill={bg} stroke={INK} strokeWidth="3" />
      <ellipse cx="32" cy="54" rx="18" ry="3.5" fill="#0002" />
      {children}
    </svg>
  );
}

/** A club: shaft and grip, plus the head drawn by `head`. */
const shaft = (tip: [number, number]) => (
  <>
    <line x1="44" y1="8" x2={tip[0]} y2={tip[1]} stroke={INK} strokeWidth="5" strokeLinecap="round" />
    <line x1="44" y1="8" x2={tip[0]} y2={tip[1]} stroke="#cfd6de" strokeWidth="2.4" strokeLinecap="round" />
    <line x1="44" y1="8" x2="40.5" y2="19" stroke={INK} strokeWidth="7" strokeLinecap="round" />
    <line x1="44" y1="8" x2="40.5" y2="19" stroke="#2b2b2b" strokeWidth="4" strokeLinecap="round" />
  </>
);

type Tint = { a: string; b: string };
const TIERS: Tint[] = [
  { a: '#9aa4ae', b: '#e9edf1' }, // starter
  { a: '#3e7bd6', b: '#cfe0ff' },
  { a: '#2a9d6a', b: '#c9f2dc' },
  { a: '#c8941c', b: '#ffeaa6' }, // gold
];

export function ClubIcon({ slot, tier }: { slot: 'driver' | 'irons' | 'wedges' | 'putter'; tier: number }) {
  const t = TIERS[Math.max(0, Math.min(3, tier))];
  const bg = ['#e8eef3', '#e4ecfb', '#e2f5ea', '#fff4d0'][Math.max(0, Math.min(3, tier))];
  if (slot === 'driver') return (
    <Frame bg={bg}>
      {shaft([27, 42])}
      <path d="M12 44 C10 36 20 32 30 38 C36 41 34 50 26 51 C18 52 13 50 12 44 Z" fill={t.a} {...S} />
      <path d="M16 44 C16 39 23 37 28 40" fill="none" stroke={t.b} strokeWidth="2.5" strokeLinecap="round" />
    </Frame>
  );
  if (slot === 'irons') return (
    <Frame bg={bg}>
      {shaft([30, 41])}
      <path d="M30 39 L33 43 L31 51 L13 51 C11 51 11 47 13 46 Z" fill={t.b} {...S} />
      <path d="M16 48 L29 48" stroke={t.a} strokeWidth="2.5" />
      <path d="M18 45 L30 44" stroke={t.a} strokeWidth="1.6" />
    </Frame>
  );
  if (slot === 'wedges') return (
    <Frame bg={bg}>
      {shaft([31, 40])}
      <path d="M31 38 L34 42 L30 52 C24 53 15 51 13 47 C12 44 20 41 31 38 Z" fill={t.b} {...S} />
      {[0, 1, 2, 3].map((k) => <line key={k} x1={17 + k * 3} y1={48 - k * 1.5} x2={27 + k} y2={45 - k * 1.5} stroke={t.a} strokeWidth="1.4" />)}
    </Frame>
  );
  return (
    <Frame bg={bg}>
      {shaft([31, 43])}
      <rect x="12" y="43" width="26" height="9" rx="3" fill={t.a} {...S} />
      <line x1="18" y1="47.5" x2="32" y2="47.5" stroke={t.b} strokeWidth="2.4" />
    </Frame>
  );
}

const ICONS: Record<string, () => ReactNode> = {
  car: () => (
    <Frame bg="#e5f0ff">
      <path d="M10 42 L14 32 C15 29 18 27 22 27 L40 27 C44 27 46 29 48 32 L54 42 Z" fill="#d0443b" {...S} />
      <rect x="8" y="40" width="48" height="9" rx="4" fill="#d0443b" {...S} />
      <path d="M19 30 L23 37 L41 37 L44 30 Z" fill="#bfe6ff" {...S} strokeWidth="2" />
      <circle cx="19" cy="50" r="5.5" fill="#333" {...S} /><circle cx="45" cy="50" r="5.5" fill="#333" {...S} />
    </Frame>
  ),
  caddie: () => (
    <Frame bg="#eaf6e6">
      <path d="M22 50 L20 22 C20 18 26 16 30 18 L34 20 L36 50 Z" fill="#1f6f43" {...S} />
      <rect x="21" y="30" width="14" height="6" fill="#f2c94c" {...S} strokeWidth="2" />
      <line x1="24" y1="18" x2="20" y2="7" {...S} /><line x1="28" y1="17" x2="30" y2="6" {...S} /><line x1="32" y1="19" x2="38" y2="9" {...S} />
      <circle cx="20" cy="7" r="3" fill="#9aa4ae" {...S} strokeWidth="2" /><circle cx="30" cy="6" r="3" fill="#9aa4ae" {...S} strokeWidth="2" /><circle cx="38" cy="9" r="3" fill="#9aa4ae" {...S} strokeWidth="2" />
      <path d="M34 22 C44 24 46 34 42 46" fill="none" {...S} />
    </Frame>
  ),
  coach: () => (
    <Frame bg="#fff1e0">
      <rect x="12" y="14" width="40" height="28" rx="3" fill="#2b5d3a" {...S} />
      <path d="M18 34 C24 22 30 22 34 28 S44 30 46 20" fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="3 3" />
      <circle cx="46" cy="20" r="2.5" fill="#fff" />
      <line x1="24" y1="42" x2="20" y2="52" {...S} /><line x1="40" y1="42" x2="44" y2="52" {...S} />
    </Frame>
  ),
  acc_glove: () => (
    <Frame bg="#f4f4f4">
      <path d="M20 52 L20 30 L17 18 C16 15 20 14 21 17 L24 27 L24 14 C24 11 28 11 28 14 L28 27 L30 13 C30 10 34 10 34 13 L33 28 L36 17 C37 14 41 15 40 18 L37 33 L42 30 C45 28 47 31 45 33 L36 44 L36 52 Z" fill="#fff" {...S} />
      <rect x="20" y="46" width="16" height="6" fill="#2a6fd6" {...S} strokeWidth="2" />
    </Frame>
  ),
  acc_shoes: () => (
    <Frame bg="#eef0f6">
      <path d="M10 44 L12 32 C18 32 22 30 26 26 L32 26 C34 32 42 34 50 36 C54 37 55 42 54 46 L10 46 Z" fill="#fff" {...S} />
      <path d="M10 46 L54 46" {...S} />
      <path d="M26 30 L30 36 M29 28 L33 34" stroke="#2a6fd6" strokeWidth="2" />
      {[14, 22, 30, 38, 46].map((x) => <line key={x} x1={x} y1="47" x2={x} y2="51" stroke={INK} strokeWidth="2.5" />)}
    </Frame>
  ),
  acc_sticks: () => (
    <Frame bg="#fff4e6">
      <line x1="12" y1="48" x2="50" y2="14" stroke={INK} strokeWidth="7" strokeLinecap="round" /><line x1="12" y1="48" x2="50" y2="14" stroke="#ff8a1f" strokeWidth="4" strokeLinecap="round" />
      <line x1="16" y1="52" x2="54" y2="20" stroke={INK} strokeWidth="7" strokeLinecap="round" /><line x1="16" y1="52" x2="54" y2="20" stroke="#ff8a1f" strokeWidth="4" strokeLinecap="round" />
      <circle cx="44" cy="44" r="5" fill="#fff" {...S} strokeWidth="2" />
    </Frame>
  ),
  acc_rangefinder: () => (
    <Frame bg="#e6eef5">
      <rect x="10" y="22" width="38" height="22" rx="5" fill="#2f3640" {...S} />
      <circle cx="44" cy="33" r="8" fill="#6fb3ff" {...S} /><circle cx="44" cy="33" r="3" fill="#dff0ff" />
      <rect x="14" y="17" width="10" height="6" rx="2" fill="#e84b3c" {...S} strokeWidth="2" />
      <text x="22" y="37" fontSize="9" fontFamily="monospace" fill="#7dff9b" textAnchor="middle">152</text>
    </Frame>
  ),
  acc_greenbook: () => (
    <Frame bg="#eaf6ea">
      <rect x="14" y="10" width="34" height="44" rx="3" fill="#2a8a4a" {...S} />
      <ellipse cx="31" cy="30" rx="11" ry="9" fill="#7fd18e" {...S} strokeWidth="2" />
      <path d="M24 30 L36 30 M33 27 L36 30 L33 33" stroke="#fff" strokeWidth="2" fill="none" />
      <line x1="18" y1="46" x2="44" y2="46" stroke="#cfeed6" strokeWidth="2" />
    </Frame>
  ),
  acc_launch: () => (
    <Frame bg="#ecebfb">
      <rect x="12" y="18" width="40" height="26" rx="4" fill="#2b2a45" {...S} />
      <polyline points="17,38 24,32 30,34 37,25 46,22" fill="none" stroke="#7dff9b" strokeWidth="2.5" />
      <path d="M24 44 L22 52 M40 44 L42 52" {...S} />
    </Frame>
  ),
  acc_massage: () => (
    <Frame bg="#fdeef0">
      <path d="M14 22 L42 22 C46 22 48 25 48 28 C48 31 46 34 42 34 L32 34 L30 52 L22 52 L22 34 L14 34 Z" fill="#e05a7a" {...S} />
      <circle cx="51" cy="28" r="5" fill="#333" {...S} />
      <path d="M56 22 L59 20 M57 28 L60 28 M56 34 L59 36" stroke={INK} strokeWidth="2" />
    </Frame>
  ),
  bobo_milky: () => (
    <Frame bg="#e8f3ff">
      <path d="M20 22 L32 12 L44 22 Z" fill="#fff" {...S} />
      <rect x="20" y="22" width="24" height="30" fill="#fff" {...S} />
      <path d="M32 12 L32 22" stroke={INK} strokeWidth="2" />
      <rect x="20" y="30" width="24" height="12" fill="#3c7be0" stroke={INK} strokeWidth="2" />
      <text x="32" y="39.5" fontSize="7.5" fontWeight="bold" fontFamily="sans-serif" fill="#fff" textAnchor="middle">BOBO</text>
      <circle cx="27" cy="47" r="1.6" fill="#3c7be0" /><circle cx="37" cy="47" r="1.6" fill="#3c7be0" />
    </Frame>
  ),
  bobo_six: () => (
    <Frame bg="#e8f3ff">
      {[0, 1, 2].map((k) => (
        <g key={k} transform={`translate(${k * 13 - 13} 4)`}>
          <path d="M26 22 L32 16 L38 22 Z" fill="#fff" {...S} strokeWidth="2" />
          <rect x="26" y="22" width="12" height="24" fill="#fff" {...S} strokeWidth="2" />
          <rect x="26" y="29" width="12" height="7" fill="#3c7be0" stroke={INK} strokeWidth="1.5" />
        </g>
      ))}
      <rect x="11" y="40" width="42" height="12" rx="2" fill="#c9a26a" {...S} />
      <text x="32" y="49" fontSize="7" fontWeight="bold" fontFamily="sans-serif" fill={INK} textAnchor="middle">×6</text>
    </Frame>
  ),
  turn_dog: () => (
    <Frame bg="#fff5e2">
      <path d="M10 38 C10 30 54 30 54 38 C54 46 10 46 10 38 Z" fill="#f3c27a" {...S} />
      <path d="M12 37 C12 33 52 33 52 37 C52 41 12 41 12 37 Z" fill="#c3432f" {...S} strokeWidth="2.5" />
      <path d="M16 36 Q20 33 24 36 T32 36 T40 36 T48 36" fill="none" stroke="#f5d33b" strokeWidth="2.5" />
    </Frame>
  ),
  fairway_fizz: () => (
    <Frame bg="#eafbe9">
      <rect x="25" y="8" width="14" height="6" rx="2" fill="#2a9d6a" {...S} strokeWidth="2" />
      <path d="M24 14 L40 14 L42 22 L42 50 C42 53 40 54 38 54 L26 54 C24 54 22 53 22 50 L22 22 Z" fill="#9df25a" {...S} />
      <rect x="22" y="28" width="20" height="12" fill="#ffffff" stroke={INK} strokeWidth="2" />
      <path d="M28 31 L36 31 L30 37 L37 37" stroke="#2a9d6a" strokeWidth="2" fill="none" />
    </Frame>
  ),
  grind_bar: () => (
    <Frame bg="#f6efe6">
      <g transform="rotate(-18 32 32)">
        <rect x="10" y="25" width="44" height="15" rx="3" fill="#7a4a24" {...S} />
        <rect x="18" y="25" width="28" height="15" fill="#f2c94c" stroke={INK} strokeWidth="2" />
        <text x="32" y="36" fontSize="7" fontWeight="bold" fontFamily="sans-serif" fill={INK} textAnchor="middle">GRIND</text>
      </g>
    </Frame>
  ),
  banana: () => (
    <Frame bg="#fffbe0">
      <path d="M14 22 C14 40 30 50 50 44 C46 42 46 40 48 38 C34 42 22 36 20 20 Z" fill="#ffd93b" {...S} />
      <path d="M14 22 L12 17" {...S} strokeWidth="4" stroke="#6b4b1a" />
      <path d="M22 26 C24 34 32 39 42 40" fill="none" stroke="#e0b21a" strokeWidth="2" />
    </Frame>
  ),
  home: () => (
    <Frame bg="#eef4ff">
      <path d="M12 30 L32 14 L52 30" fill="none" {...S} strokeWidth="4" />
      <rect x="17" y="28" width="30" height="24" fill="#f3e3c3" {...S} />
      <path d="M12 30 L32 14 L52 30 Z" fill="#c0503c" {...S} />
      <rect x="28" y="38" width="8" height="14" fill="#7a4a24" {...S} strokeWidth="2" />
      <rect x="20" y="33" width="6" height="6" fill="#bfe6ff" stroke={INK} strokeWidth="2" /><rect x="38" y="33" width="6" height="6" fill="#bfe6ff" stroke={INK} strokeWidth="2" />
    </Frame>
  ),
};

/** The icon for an item id (falls back by kind). */
export function ItemIcon({ id, kind }: { id: string; kind?: string }) {
  const f = ICONS[id] ?? (kind ? ICONS[kind] : undefined) ?? ICONS.home;
  return <>{f()}</>;
}
