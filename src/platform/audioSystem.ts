/**
 * Tiny procedural WebAudio manager. No audio files → zero asset weight.
 * Audio unlocks only after the first user gesture and always respects the
 * YouTube Playables audio state.
 */
import { sdk } from './playablesSdk';

type SfxName =
  | 'tap'
  | 'coin'
  | 'material'
  | 'build'
  | 'complete'
  | 'upgrade'
  | 'level'
  | 'error'
  | 'siren'
  | 'water'
  | 'power'
  | 'celebrate'
  | 'bus';

class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private platformEnabled = true;
  private musicOn = true;
  private sfxOn = true;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private paused = false;

  init(): void {
    this.platformEnabled = sdk.isAudioEnabled();
    sdk.onAudioEnabledChange((enabled) => {
      this.platformEnabled = enabled;
      this.applyGain();
    });
  }

  /** Call from the first pointer event — browsers require a gesture. */
  unlock(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.applyGain();
      this.startMusic();
    } catch {
      this.ctx = null;
    }
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    this.applyGain();
  }
  setSfx(on: boolean): void {
    this.sfxOn = on;
  }
  get musicEnabled(): boolean {
    return this.musicOn;
  }
  get sfxEnabled(): boolean {
    return this.sfxOn;
  }

  pause(): void {
    this.paused = true;
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }
  resume(): void {
    this.paused = false;
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  private get audible(): boolean {
    return !!this.ctx && this.platformEnabled && !this.paused;
  }

  private applyGain(): void {
    if (!this.master || !this.musicGain || !this.ctx) return;
    this.master.gain.setTargetAtTime(this.platformEnabled ? 0.5 : 0, this.ctx.currentTime, 0.05);
    this.musicGain.gain.setTargetAtTime(this.musicOn ? 0.16 : 0, this.ctx.currentTime, 0.1);
  }

  play(name: SfxName): void {
    if (!this.audible || !this.sfxOn || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const spec: Record<SfxName, [number, number, number, OscillatorType]> = {
      tap: [520, 0.05, 0.12, 'triangle'],
      coin: [880, 0.09, 0.16, 'sine'],
      material: [420, 0.09, 0.14, 'square'],
      build: [180, 0.25, 0.14, 'sawtooth'],
      complete: [660, 0.3, 0.18, 'triangle'],
      upgrade: [540, 0.22, 0.16, 'triangle'],
      level: [523, 0.5, 0.2, 'sine'],
      error: [160, 0.18, 0.14, 'square'],
      siren: [700, 0.5, 0.12, 'sawtooth'],
      water: [340, 0.3, 0.12, 'sine'],
      power: [220, 0.35, 0.14, 'triangle'],
      celebrate: [784, 0.6, 0.2, 'sine'],
      bus: [260, 0.2, 0.12, 'triangle'],
    };
    const [freq, dur, vol, type] = spec[name];
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (name === 'coin' || name === 'complete' || name === 'upgrade') {
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    } else if (name === 'level' || name === 'celebrate') {
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.setValueAtTime(freq * 1.25, t + dur * 0.33);
      osc.frequency.setValueAtTime(freq * 1.5, t + dur * 0.66);
    } else if (name === 'siren') {
      osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    } else if (name === 'error') {
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + dur);
    }
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Gentle generative pad loop — calm chord tones, expands with city level. */
  private startMusic(): void {
    if (this.musicTimer !== null || !this.ctx) return;
    const chords = [
      [261.6, 329.6, 392.0],
      [220.0, 261.6, 329.6],
      [174.6, 220.0, 261.6],
      [196.0, 246.9, 293.7],
    ];
    const step = () => {
      if (this.audible && this.musicOn && this.ctx && this.musicGain) {
        const chord = chords[this.musicStep % chords.length];
        const t = this.ctx.currentTime;
        for (const f of chord) {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.09, t + 0.8);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
          osc.connect(g).connect(this.musicGain);
          osc.start(t);
          osc.stop(t + 3.8);
        }
        this.musicStep++;
      }
      this.musicTimer = window.setTimeout(step, 3600);
    };
    step();
  }
}

export const audio = new AudioSystem();
