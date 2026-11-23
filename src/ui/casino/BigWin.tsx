/**
 * Big-win celebration for every casino game: gold coins raining down, confetti,
 * and a banner that counts the win up. Presentation only: it fires after a win
 * has already been settled and never touches money, odds or the save.
 *
 * Any game calls `celebrateWin(net, staked)` after settling; it decides the tier
 * and, if the win is big enough, shows the overlay (mounted once in CasinoPanel).
 * Clicks pass straight through it. Reduced motion: the banner only, no particles.
 */
import { useEffect, useRef, useState } from 'react';
import { sound } from '../../audio/sound';
import { formatMoney } from '../format';

export type WinTier = 'big' | 'mega';

/** Which celebration a win earns: by profit, or by how many times the stake it paid. */
export function bigWinTier(net: number, staked: number): WinTier | null {
  if (net <= 0) return null;
  const multiple = staked > 0 ? (net + staked) / staked : 0;
  if (net >= 1000 || (multiple >= 25 && net >= 100)) return 'mega';
  if (net >= 250 || (multiple >= 10 && net >= 50)) return 'big';
  return null;
}

const EVENT = 'wtg-bigwin';
interface WinDetail { net: number; tier: WinTier }

/** Celebrate a settled win if it's big enough. Returns the tier shown (or null). */
export function celebrateWin(net: number, staked: number, opts: { jackpot?: boolean } = {}): WinTier | null {
  const tier = opts.jackpot && net > 0 ? 'mega' : bigWinTier(net, staked);
  if (tier && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<WinDetail>(EVENT, { detail: { net, tier } }));
  return tier;
}

export const DURATION_MS: Record<WinTier, number> = { big: 3400, mega: 5200 };
const CONFETTI = ['#ff3fa4', '#ffd84a', '#3fd0ff', '#7dff6a', '#b56bff', '#ff7a2f'];

interface Particle {
  kind: 'coin' | 'confetti';
  x: number; y: number; vx: number; vy: number;
  spin: number; phase: number; size: number; color: string; delay: number;
}

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function spawn(tier: WinTier, w: number, h: number): Particle[] {
  const out: Particle[] = [];
  const coins = tier === 'mega' ? 140 : 70;
  const bits = tier === 'mega' ? 160 : 90;
  const r = Math.random;
  for (let i = 0; i < coins; i++) {
    out.push({ kind: 'coin', x: r() * w, y: -40 - r() * h * 0.6, vx: (r() - 0.5) * 60, vy: 140 + r() * 220, spin: 4 + r() * 6, phase: r() * 6.28, size: 16 + r() * 14, color: '#ffd84a', delay: r() * (tier === 'mega' ? 2200 : 1200) });
  }
  // Confetti bursts up from two cannons at the bottom corners, then flutters down.
  for (let i = 0; i < bits; i++) {
    const left = i % 2 === 0;
    out.push({
      kind: 'confetti', x: left ? 0 : w, y: h,
      vx: (left ? 1 : -1) * (180 + r() * 420), vy: -(520 + r() * 520),
      spin: (r() - 0.5) * 16, phase: r() * 6.28, size: 6 + r() * 6, color: CONFETTI[i % CONFETTI.length], delay: r() * 350 + (tier === 'mega' && i % 3 === 0 ? 1400 : 0),
    });
  }
  return out;
}

function drawCoin(g: CanvasRenderingContext2D, p: Particle, t: number) {
  const s = Math.round(p.size);
  const wob = Math.abs(Math.cos(p.phase + t * p.spin)); // the coin turning
  const w = Math.max(2, Math.round(s * wob));
  const x = Math.round(p.x - w / 2), y = Math.round(p.y - s / 2);
  g.fillStyle = '#7a4a00'; g.fillRect(x - 1, y - 1, w + 2, s + 2);   // dark rim
  g.fillStyle = '#f2b51c'; g.fillRect(x, y, w, s);                  // gold
  g.fillStyle = '#ffe98a'; g.fillRect(x, y, Math.max(1, Math.round(w * 0.35)), Math.max(1, Math.round(s * 0.45))); // shine
  if (w > s * 0.55) { g.fillStyle = '#b9780a'; g.fillRect(Math.round(p.x - 1), Math.round(p.y - s * 0.25), 2, Math.round(s * 0.5)); } // "$" stroke
}

function drawConfetti(g: CanvasRenderingContext2D, p: Particle, t: number) {
  g.save();
  g.translate(Math.round(p.x), Math.round(p.y));
  g.rotate(p.phase + t * p.spin);
  g.fillStyle = p.color;
  const flip = Math.abs(Math.sin(p.phase + t * p.spin * 1.3));
  g.fillRect(-p.size / 2, (-p.size / 4) * flip, p.size, Math.max(1, (p.size / 2) * flip));
  g.restore();
}

/** The overlay. Mount once; it listens for celebrateWin(). */
export function BigWinOverlay() {
  const [win, setWin] = useState<(WinDetail & { id: number }) | null>(null);
  const [shown, setShown] = useState(0);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<WinDetail>).detail;
      setWin({ ...d, id: Date.now() });
      sound.play('win', { volume: 0.8 });
      window.setTimeout(() => sound.play('cheer', { volume: 0.7 }), 350);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  // Count-up, particles, and auto-dismiss.
  useEffect(() => {
    if (!win) return;
    const dur = DURATION_MS[win.tier];
    const start = performance.now();
    const cv = canvas.current;
    const g = cv?.getContext('2d') ?? null;
    const still = reduced();
    let parts: Particle[] = [];
    if (cv && g && !still) {
      cv.width = window.innerWidth; cv.height = window.innerHeight;
      g.imageSmoothingEnabled = false;
      parts = spawn(win.tier, cv.width, cv.height);
    }
    let raf = 0, last = start;
    const frame = (now: number) => {
      const el = now - start;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setShown(Math.round(win.net * Math.min(1, el / (dur * 0.45))));
      if (cv && g && !still) {
        g.clearRect(0, 0, cv.width, cv.height);
        const fade = el > dur - 600 ? Math.max(0, (dur - el) / 600) : 1;
        g.globalAlpha = fade;
        for (const p of parts) {
          if (el < p.delay) continue;
          if (p.kind === 'coin') { p.vy += 380 * dt; p.y += p.vy * dt; p.x += p.vx * dt; if (p.y > cv.height + 30 && el < dur - 1600) { p.y = -30; p.vy = 160 + Math.random() * 200; } }
          else { p.vy += 900 * dt; p.vx *= 0.985; p.vy = Math.min(p.vy, 140); p.x += p.vx * dt + Math.sin(el / 180 + p.phase) * 0.8; p.y += p.vy * dt; }
          if (p.kind === 'coin') drawCoin(g, p, el / 1000); else drawConfetti(g, p, el / 1000);
        }
        g.globalAlpha = 1;
      }
      if (el < dur) raf = requestAnimationFrame(frame);
      else setWin(null);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [win]);

  if (!win) return null;
  return (
    <div className={`bigwin ${win.tier}`} aria-live="polite" data-testid="bigwin" data-tier={win.tier}>
      <canvas ref={canvas} className="bigwin-fx" aria-hidden />
      <div className="bigwin-banner" key={win.id}>
        <span className="bigwin-title">{win.tier === 'mega' ? 'MEGA WIN!' : 'BIG WIN!'}</span>
        <span className="bigwin-amount" data-testid="bigwin-amount">+{formatMoney(shown)}</span>
      </div>
    </div>
  );
}
