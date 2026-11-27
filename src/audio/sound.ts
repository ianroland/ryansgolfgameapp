/**
 * Sound for Ryan's Road to the LPGA.
 *
 * Every sound has a built-in retro synth version, so the game has audio with
 * no files at all. To use your own, drop a file with the sound's name into
 *   src/assets/audio/sfx/<name>.mp3|ogg|wav     (sound effects)
 *   src/assets/audio/music/<name>.mp3|ogg|wav   (looping music)
 * and rebuild; files are picked up automatically and replace the synth.
 *
 * Browsers only allow audio after the player's first click/key/tap, so the
 * engine unlocks itself on the first gesture.
 */

export const SFX_NAMES = [
  'ui_click', 'ui_confirm', 'ui_back', 'error',
  'start', 'week', 'story', 'cash', 'buy', 'trophy', 'achievement', 'win', 'missed_cut',
  'meter_start', 'meter_set', 'swing', 'hit_driver', 'hit_iron', 'hit_wedge', 'hit_putt',
  'bounce_fairway', 'bounce_green', 'bounce_rough', 'bounce_bunker', 'bounce_hard', 'tree', 'splash', 'cup',
  'cheer', 'clap', 'groan', 'albatross',
  // Poker (and the private rooms)
  'card_deal', 'card_flip', 'chip', 'chips_bet', 'chips_pot', 'knock', 'fold', 'all_in', 'shuffle', 'clock_tick', 'clock_warn', 'throw', 'splat', 'squeak',
] as const;
export type Sfx = (typeof SFX_NAMES)[number];

export const MUSIC_NAMES = ['title', 'menu', 'course', 'victory'] as const;
export type Music = (typeof MUSIC_NAMES)[number];

// Your audio files, found at build time.
const SFX_FILES = import.meta.glob('../assets/audio/sfx/*.{mp3,ogg,wav,m4a}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const MUSIC_FILES = import.meta.glob('../assets/audio/music/*.{mp3,ogg,wav,m4a}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const byName = (files: Record<string, string>) =>
  Object.fromEntries(Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace(/\.[^.]+$/, ''), url]));
const sfxUrls: Record<string, string> = byName(SFX_FILES);
const musicUrls: Record<string, string> = byName(MUSIC_FILES);

export interface SoundSettings {
  sfx: number; // 0..1
  music: number; // 0..1
  muted: boolean;
}

const SETTINGS_KEY = 'ryans-road-sound';
const DEFAULTS: SoundSettings = { sfx: 0.8, music: 0.45, muted: false };

function loadSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* storage may be blocked */
  }
  return { ...DEFAULTS };
}

type Ctx = AudioContext;

class SoundEngine {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private buffers = new Map<string, AudioBuffer | 'loading' | 'failed'>();
  private noise: AudioBuffer | null = null;
  private settings = loadSettings();
  private listeners = new Set<(s: SoundSettings) => void>();
  private wantedMusic: Music | null = null;
  private music: { name: Music; stop: () => void } | null = null;
  private lastPlayed = new Map<string, number>();

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
      if (this.wantedMusic && !this.music) this.playMusic(this.wantedMusic);
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  // ── Settings ──
  getSettings() {
    return { ...this.settings };
  }
  setSettings(patch: Partial<SoundSettings>) {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
    this.applyVolumes();
    for (const l of this.listeners) l(this.getSettings());
  }
  subscribe(fn: (s: SoundSettings) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /** Which sounds come from your files (for the settings panel). */
  customFiles() {
    return { sfx: Object.keys(sfxUrls), music: Object.keys(musicUrls) };
  }

  private ensure(): Ctx | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
    } catch {
      return null;
    }
    this.master = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyVolumes();
    return this.ctx;
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.settings.music * 0.6, t, 0.05);
  }

  private async load(url: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(url);
    if (cached && cached !== 'loading' && cached !== 'failed') return cached;
    if (cached) return null;
    this.buffers.set(url, 'loading');
    try {
      const data = await (await fetch(url)).arrayBuffer();
      const buf = await this.ctx!.decodeAudioData(data);
      this.buffers.set(url, buf);
      return buf;
    } catch {
      this.buffers.set(url, 'failed');
      return null;
    }
  }

  /** Play a sound effect. `rate` varies pitch for file-based sounds. */
  play(name: Sfx, opts: { volume?: number; rate?: number } = {}) {
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running' || this.settings.muted || this.settings.sfx <= 0) return;
    // Don't machine-gun the same sound.
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < 0.03) return;
    this.lastPlayed.set(name, now);
    const url = sfxUrls[name];
    if (url) {
      const buf = this.buffers.get(url);
      if (buf && buf !== 'loading' && buf !== 'failed') return this.playBuffer(buf, opts.volume ?? 1, opts.rate ?? 1, this.sfxBus);
      void this.load(url).then((b) => b && this.playBuffer(b, opts.volume ?? 1, opts.rate ?? 1, this.sfxBus));
      if (buf !== 'failed') return;
    }
    this.synth(name, opts.volume ?? 1);
  }

  private playBuffer(buf: AudioBuffer, volume: number, rate: number, bus: GainNode, loop = false) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.loop = loop;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(bus);
    src.start();
    return src;
  }

  // ── Music ──
  /** Switch the background music (null for silence). Safe to call often. */
  playMusic(name: Music | null) {
    this.wantedMusic = name;
    if (this.music?.name === name) return;
    this.music?.stop();
    this.music = null;
    const ctx = this.ensure();
    if (!name || !ctx || ctx.state !== 'running') return;
    const url = musicUrls[name];
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, ctx.currentTime);
    fade.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
    fade.connect(this.musicBus);
    let stopInner: () => void = () => {};
    let stopped = false;
    if (url) {
      void this.load(url).then((buf) => {
        if (!buf || stopped) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = name !== 'victory';
        src.connect(fade);
        src.start();
        stopInner = () => src.stop();
      });
    } else {
      stopInner = this.synthMusic(name, fade);
    }
    this.music = {
      name,
      stop: () => {
        stopped = true;
        const t = ctx.currentTime;
        fade.gain.cancelScheduledValues(t);
        fade.gain.setValueAtTime(fade.gain.value, t);
        fade.gain.linearRampToValueAtTime(0, t + 0.6);
        window.setTimeout(() => {
          stopInner();
          fade.disconnect();
        }, 700);
      },
    };
  }

  // ───────────────────────── Built-in synth ─────────────────────────

  private noiseBuffer() {
    if (this.noise) return this.noise;
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  }

  /** One enveloped oscillator note. */
  private tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; vol?: number; slideTo?: number; attack?: number; bus?: AudioNode } = {}) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type ?? 'square';
    o.frequency.setValueAtTime(freq, start);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, start + dur);
    const v = (opts.vol ?? 0.2) * 0.5;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(v, start + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(opts.bus ?? this.sfxBus);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  /** Filtered noise burst (swishes, thuds, splashes, crowds). */
  private hiss(start: number, dur: number, opts: { freq?: number; q?: number; type?: BiquadFilterType; vol?: number; sweepTo?: number; attack?: number } = {}) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, start);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, start + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const v = opts.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(v, start + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  private arp(notes: number[], start: number, step: number, opts: { type?: OscillatorType; vol?: number; len?: number } = {}) {
    notes.forEach((n, i) => this.tone(n, start + i * step, opts.len ?? step * 1.6, { type: opts.type, vol: opts.vol }));
  }

  private synth(name: Sfx, volume: number) {
    const t = this.ctx!.currentTime + 0.005;
    const V = volume;
    const N = (semi: number) => 440 * 2 ** ((semi - 9) / 12); // semitones from C4… (0 = C4)
    switch (name) {
      case 'ui_click': return this.tone(1400, t, 0.04, { vol: 0.12 * V, type: 'square' });
      case 'ui_confirm': return this.arp([N(12), N(19)], t, 0.05, { vol: 0.14 * V });
      case 'ui_back': return this.arp([N(19), N(12)], t, 0.05, { vol: 0.12 * V });
      case 'error': return this.arp([N(3), N(2)], t, 0.09, { vol: 0.16 * V, type: 'sawtooth' });
      case 'start':
        this.arp([N(12), N(16), N(19), N(24)], t, 0.07, { vol: 0.18 * V });
        return this.tone(N(28), t + 0.28, 0.4, { vol: 0.16 * V, type: 'triangle' });
      case 'week': return this.arp([N(7), N(12)], t, 0.08, { vol: 0.13 * V, type: 'triangle' });
      case 'story': return this.arp([N(9), N(14), N(21)], t, 0.07, { vol: 0.12 * V, type: 'triangle' });
      case 'cash':
        this.tone(N(23), t, 0.07, { vol: 0.15 * V });
        return this.tone(N(28), t + 0.07, 0.35, { vol: 0.15 * V });
      case 'buy': return this.arp([N(16), N(23), N(28)], t, 0.05, { vol: 0.13 * V });
      case 'achievement': return this.arp([N(12), N(16), N(19), N(24), N(28)], t, 0.06, { vol: 0.14 * V, type: 'triangle' });
      case 'albatross':
        // A rising two-octave run, then a held major chord: unmistakable, and rare.
        this.arp([N(0), N(4), N(7), N(12), N(16), N(19), N(24)], t, 0.055, { vol: 0.15 * V, type: 'square', len: 0.08 });
        for (const [semi, type] of [[24, 'square'], [28, 'square'], [31, 'triangle'], [36, 'triangle']] as const) this.tone(N(semi), t + 0.42, 1.1, { vol: 0.09 * V, type });
        return this.crowd(t + 0.35, 2.8, 0.34 * V);
      case 'trophy':
      case 'win':
        this.arp([N(12), N(12), N(12), N(16)], t, 0.11, { vol: 0.17 * V, len: 0.1 });
        this.tone(N(19), t + 0.44, 0.22, { vol: 0.17 * V });
        this.tone(N(16), t + 0.66, 0.11, { vol: 0.17 * V });
        this.tone(N(24), t + 0.77, 0.7, { vol: 0.18 * V });
        this.tone(N(12), t + 0.77, 0.7, { vol: 0.12 * V, type: 'triangle' });
        return name === 'win' ? this.crowd(t + 0.3, 2.4, 0.3 * V) : undefined;
      case 'missed_cut':
        return this.arp([N(7), N(6), N(5), N(4)], t, 0.18, { vol: 0.14 * V, type: 'triangle', len: 0.3 });
      case 'meter_start': return this.tone(N(19), t, 0.05, { vol: 0.1 * V });
      case 'meter_set': return this.tone(N(24), t, 0.06, { vol: 0.12 * V });
      case 'swing': return this.hiss(t, 0.28, { freq: 600, sweepTo: 3000, q: 2, vol: 0.18 * V, attack: 0.12 });
      case 'hit_driver':
        this.hiss(t, 0.06, { freq: 2500, q: 0.8, vol: 0.5 * V, type: 'highpass' });
        this.tone(2100, t, 0.18, { vol: 0.22 * V, type: 'triangle', slideTo: 1600 });
        return this.tone(180, t, 0.08, { vol: 0.3 * V, type: 'sine', slideTo: 80 });
      case 'hit_iron':
        this.hiss(t, 0.05, { freq: 3000, q: 1, vol: 0.45 * V });
        return this.tone(140, t, 0.07, { vol: 0.3 * V, type: 'sine', slideTo: 70 });
      case 'hit_wedge':
        this.hiss(t, 0.05, { freq: 2200, q: 1.2, vol: 0.35 * V });
        return this.hiss(t + 0.01, 0.18, { freq: 400, q: 0.7, vol: 0.12 * V, type: 'lowpass' });
      case 'hit_putt':
        return this.tone(900, t, 0.05, { vol: 0.2 * V, type: 'triangle', slideTo: 700 });
      case 'bounce_fairway': return this.hiss(t, 0.09, { freq: 260, q: 0.8, vol: 0.35 * V, type: 'lowpass' });
      case 'bounce_green': return this.hiss(t, 0.07, { freq: 380, q: 0.8, vol: 0.28 * V, type: 'lowpass' });
      case 'bounce_rough': return this.hiss(t, 0.16, { freq: 1600, q: 0.5, vol: 0.18 * V });
      case 'bounce_bunker': return this.hiss(t, 0.22, { freq: 3500, q: 0.4, vol: 0.2 * V, sweepTo: 1200 });
      case 'bounce_hard': return this.tone(1200, t, 0.05, { vol: 0.15 * V, type: 'triangle' });
      case 'tree':
        this.tone(220, t, 0.12, { vol: 0.25 * V, type: 'triangle', slideTo: 120 });
        return this.hiss(t + 0.02, 0.4, { freq: 2500, q: 0.4, vol: 0.12 * V });
      case 'splash':
        this.hiss(t, 0.5, { freq: 1500, q: 0.5, vol: 0.35 * V, sweepTo: 400 });
        return this.tone(500, t, 0.25, { vol: 0.12 * V, type: 'sine', slideTo: 1400 });
      case 'cup':
        this.tone(N(26), t, 0.06, { vol: 0.2 * V, type: 'triangle' });
        this.tone(N(31), t + 0.07, 0.06, { vol: 0.2 * V, type: 'triangle' });
        return this.tone(160, t + 0.12, 0.12, { vol: 0.25 * V, type: 'sine', slideTo: 90 });
      case 'cheer': return this.crowd(t, 2.2, 0.32 * V);
      case 'clap': return this.claps(t, 1.4, 0.25 * V);
      case 'groan':
        this.hiss(t, 0.9, { freq: 420, sweepTo: 240, q: 3, vol: 0.18 * V, attack: 0.15 });
        return this.hiss(t, 0.9, { freq: 650, sweepTo: 330, q: 3, vol: 0.12 * V, attack: 0.15 });
      // ── Poker ──
      case 'card_deal': return this.hiss(t, 0.07, { freq: 2600, sweepTo: 5200, q: 0.9, vol: 0.22 * V });
      case 'card_flip':
        this.hiss(t, 0.05, { freq: 3200, q: 1.2, vol: 0.2 * V });
        return this.tone(900, t + 0.03, 0.03, { vol: 0.06 * V, type: 'triangle' });
      case 'chip': return this.chipClack(t, 1, V);
      case 'chips_bet': return this.chipClack(t, 3, V);
      case 'chips_pot': return this.chipClack(t, 7, V, 0.03);
      case 'knock':
        this.tone(140, t, 0.08, { vol: 0.5 * V, type: 'sine', slideTo: 90 });
        return this.tone(140, t + 0.13, 0.08, { vol: 0.45 * V, type: 'sine', slideTo: 90 });
      case 'fold': return this.hiss(t, 0.18, { freq: 1800, sweepTo: 700, q: 0.7, vol: 0.18 * V, attack: 0.02 });
      case 'all_in':
        this.chipClack(t, 10, V, 0.018);
        return this.arp([N(7), N(12), N(19)], t + 0.2, 0.07, { vol: 0.12 * V, type: 'triangle' });
      case 'shuffle':
        for (let i = 0; i < 10; i++) this.hiss(t + i * 0.035, 0.03, { freq: 2200 + (i % 3) * 400, q: 1, vol: 0.12 * V });
        return;
      case 'clock_tick': return this.tone(2400, t, 0.02, { vol: 0.08 * V, type: 'square' });
      case 'clock_warn': return this.arp([N(24), N(24)], t, 0.12, { vol: 0.12 * V, type: 'square' });
      case 'throw': return this.hiss(t, 0.4, { freq: 500, sweepTo: 2600, q: 2.5, vol: 0.14 * V, attack: 0.05 });
      case 'splat':
        this.hiss(t, 0.16, { freq: 300, q: 0.6, vol: 0.4 * V, type: 'lowpass' });
        return this.tone(180, t, 0.1, { vol: 0.2 * V, type: 'sine', slideTo: 60 });
      case 'squeak': return this.tone(1200, t, 0.22, { vol: 0.14 * V, type: 'square', slideTo: 1900 });
    }
  }

  /** Clay chips: short bright clicks, `n` of them `gap` apart (a stack sliding in). */
  private chipClack(t: number, n: number, V: number, gap = 0.045) {
    for (let i = 0; i < n; i++) {
      const at = t + i * gap + Math.random() * 0.01;
      this.tone(2900 + Math.random() * 900, at, 0.025, { vol: 0.12 * V, type: 'triangle' });
      this.hiss(at, 0.02, { freq: 5200, q: 2, vol: 0.12 * V });
    }
  }

  private claps(t: number, dur: number, vol: number) {
    for (let i = 0; i < dur * 22; i++) {
      const at = t + Math.random() * dur;
      const fall = 1 - (at - t) / dur;
      this.hiss(at, 0.04, { freq: 1200 + Math.random() * 1500, q: 1.2, vol: vol * (0.4 + 0.6 * fall) * (0.5 + Math.random() * 0.5) });
    }
  }

  private crowd(t: number, dur: number, vol: number) {
    this.hiss(t, dur, { freq: 900, q: 0.6, vol: vol * 0.8, attack: 0.25 });
    this.hiss(t, dur * 0.8, { freq: 1800, q: 0.9, vol: vol * 0.4, attack: 0.2 });
    this.claps(t + 0.2, dur * 0.9, vol * 0.7);
  }

  /** Tiny chiptune sequencer for the built-in music. Returns a stop fn. */
  private synthMusic(name: Music, out: AudioNode): () => void {
    const ctx = this.ctx!;
    const N = (semi: number) => 261.63 * 2 ** (semi / 12);
    // Bright I–vi–IV–V (C major) for title/menu; a calmer loop on course.
    const songs: Record<Music, { bpm: number; chords: number[][]; lead: (number | null)[]; leadType: OscillatorType; bass: boolean; loop: boolean }> = {
      title: {
        bpm: 132,
        chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]],
        lead: [12, null, 16, 19, 21, 19, 16, null, 12, null, 14, 16, 12, null, null, null, 9, null, 12, 16, 17, 16, 12, null, 11, null, 12, 14, 11, null, 7, null],
        leadType: 'square', bass: true, loop: true,
      },
      menu: {
        bpm: 104,
        chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]],
        lead: [16, null, null, 19, null, 16, 14, null, 12, null, null, null, 9, null, 12, null, 17, null, null, 16, null, 14, 12, null, 11, null, 14, null, 12, null, null, null],
        leadType: 'triangle', bass: true, loop: true,
      },
      course: {
        bpm: 84,
        chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 5]],
        lead: [],
        leadType: 'triangle', bass: false, loop: true,
      },
      victory: {
        bpm: 150,
        chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19]],
        lead: [12, 12, 12, 16, null, 19, null, 24, null, null, null, null, null, null, null, null],
        leadType: 'square', bass: true, loop: false,
      },
    };
    const song = songs[name];
    const eighth = 60 / song.bpm / 2;
    const barLen = eighth * 8;
    let next = ctx.currentTime + 0.1;
    let step = 0;
    let stopped = false;
    const schedule = () => {
      if (stopped) return;
      while (next < ctx.currentTime + 0.4) {
        const bar = Math.floor(step / 8) % song.chords.length;
        const chord = song.chords[bar];
        const s = step % 8;
        // Arpeggiated chord (soft), bass on beats, lead melody.
        const arpNote = chord[s % chord.length] + (name === 'course' ? 12 : 12);
        this.tone(N(arpNote), next, eighth * 0.9, { type: name === 'course' ? 'sine' : 'square', vol: name === 'course' ? 0.07 : 0.035, bus: out });
        if (song.bass && s % 2 === 0) this.tone(N(chord[0] - 12), next, eighth * 1.7, { type: 'triangle', vol: 0.16, bus: out });
        const lead = song.lead.length ? song.lead[step % song.lead.length] : null;
        if (lead !== null && lead !== undefined) this.tone(N(lead + 12), next, eighth * 1.5, { type: song.leadType, vol: 0.06, bus: out });
        next += eighth;
        step++;
        if (!song.loop && step >= song.chords.length * 8) {
          stopped = true;
          return;
        }
      }
      timer = window.setTimeout(schedule, 120);
    };
    let timer = window.setTimeout(schedule, 0);
    void barLen;
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }
}

export const sound = new SoundEngine();
