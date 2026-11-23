/**
 * DEV frame-time instrumentation for Phase 0/1 measurements. Off unless a
 * harness attaches a probe to the scene; it never changes what a frame does.
 */

export interface PerfSample {
  /** Scene phase plus broadcast sub-state, e.g. "flight", "flight:green", "result:replay". */
  state: string;
  /** CPU time inside RoundScene.update (logic + ground raster + draw prep), ms. */
  cpuMs: number;
  /** CPU time inside GroundRenderer.render, ms. */
  groundMs: number;
  /** Frame-to-frame delta Phaser reported, ms. */
  deltaMs: number;
}

export class PerfProbe {
  samples: PerfSample[] = [];
  groundMs = 0;

  add(s: PerfSample) {
    this.samples.push(s);
  }

  summary() {
    const by = new Map<string, PerfSample[]>();
    for (const s of this.samples) {
      if (!by.has(s.state)) by.set(s.state, []);
      by.get(s.state)!.push(s);
    }
    const pct = (xs: number[], p: number) => {
      const a = [...xs].sort((x, y) => x - y);
      return a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0;
    };
    return [...by.entries()].map(([state, ss]) => {
      const cpu = ss.map((s) => s.cpuMs);
      const gr = ss.map((s) => s.groundMs);
      const dl = ss.map((s) => s.deltaMs);
      return {
        state,
        frames: ss.length,
        cpuP50: pct(cpu, 50),
        cpuP95: pct(cpu, 95),
        cpuP99: pct(cpu, 99),
        groundP50: pct(gr, 50),
        groundP95: pct(gr, 95),
        deltaP95: pct(dl, 95),
        over25ms: dl.filter((d) => d > 25).length,
      };
    });
  }
}
