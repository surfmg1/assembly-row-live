// Synthesised sound, no samples. One noise source feeds surface-tuned filters; one-shots are tiny envelopes.
import { Ev, Player } from './sim/player';

const BAND: Record<string, number> = { concrete: 950, steel: 2600, wood: 520, water: 380, grass: 600 };

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode; private roll!: GainNode; private rollF!: BiquadFilterNode;
  private wind!: GainNode; private grind!: GainNode; private rattle!: GainNode;
  muted = false;

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext; if (!AC) return;
    const c: AudioContext = new AC(); this.ctx = c;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.7; this.master.connect(c.destination);
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = buf.getChannelData(0);
    let s = 1; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.start();
    const chain = (type: BiquadFilterType, f: number, q: number) => {
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = 0; src.connect(fl); fl.connect(g); g.connect(this.master); return [fl, g] as const;
    };
    [this.rollF, this.roll] = chain('bandpass', 950, 0.8);
    [, this.wind] = chain('lowpass', 420, 0.3);
    [, this.grind] = chain('bandpass', 3800, 6);
    [, this.rattle] = chain('highpass', 5200, 0.7);
  }
  setMuted(m: boolean) { this.muted = m; if (this.ctx) this.master.gain.value = m ? 0 : 0.7; }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  private burst(freq: number, q: number, dur: number, vol: number) {
    const c = this.ctx; if (!c) return;
    const len = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(this.master); s.start();
  }

  /** Two-tone door chime for a train pulling in. */
  chime() { this.tone('sine', 784, 784, 0.35, 0.12); this.tone('sine', 587, 587, 0.5, 0.12, 0.32); }

  frame(p: Player) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, sp = Math.hypot(p.vx, p.vz), k = Math.min(1, sp / 16);
    const wheels = p.mode !== 'foot' && p.grounded && p.state !== 'bail';
    const sliding = p.mode === 'foot' && p.state === 'slide';
    this.rollF.frequency.setTargetAtTime((BAND[p.surf] || 950) * (0.7 + k * 0.8), t, 0.05);
    this.roll.gain.setTargetAtTime(wheels ? 0.05 + k * 0.32 : sliding ? 0.25 : 0, t, 0.04);
    this.rattle.gain.setTargetAtTime(wheels && p.mode === 'cart' ? k * 0.16 * (0.6 + 0.4 * Math.sin(p.time * 31)) : 0, t, 0.02);
    this.wind.gain.setTargetAtTime(p.state === 'bail' ? 0 : k * k * 0.5, t, 0.1);
    this.grind.gain.setTargetAtTime(p.state === 'grind' ? 0.22 : 0, t, 0.02);
  }

  events(evs: Ev[]) {
    if (!this.ctx) return;
    for (const e of evs) {
      switch (e.type) {
        case 'step': this.burst(BAND[e.surf || 'concrete'] * 0.6, 1.2, 0.06, 0.18); break;
        case 'jump': this.tone('triangle', 240, 520, 0.12, 0.12); break;
        case 'land': this.tone('sine', 110, 45, 0.16, Math.min(0.6, 0.08 + e.v * 0.035)); this.burst(BAND[e.surf || 'concrete'], 0.8, 0.09, Math.min(0.5, e.v * 0.03)); break;
        case 'vault': case 'mantle': this.burst(700, 0.7, 0.16, 0.25); break;
        case 'wallrun': this.burst(1400, 1.5, 0.3, 0.22); break;
        case 'walljump': this.tone('triangle', 300, 700, 0.14, 0.14); break;
        case 'grindStart': this.tone('square', 1900, 1500, 0.07, 0.05); break;
        case 'trick': this.tone('triangle', 880, 990, 0.1, 0.1); break;
        case 'bank': this.tone('triangle', 660, 660, 0.12, 0.14); this.tone('triangle', 990, 990, 0.2, 0.14, 0.1); break;
        case 'bail': this.tone('sawtooth', 700, 90, 0.7, 0.12); break;
        case 'respawn': this.tone('sine', 300, 600, 0.18, 0.1); break;
        case 'switch': this.tone('square', 520, 780, 0.07, 0.05); break;
        case 'bobsled': this.tone('triangle', 500, 1200, 0.25, 0.14); break;
        case 'hopOn': this.burst(3200, 2, 0.14, 0.3); break;
        case 'ram': this.burst(900 + Math.random() * 1400, 1.2, 0.2, 0.4); break;
        case 'splash': this.burst(500, 0.5, 0.5, 0.6); break;
        case 'train': this.tone('sawtooth', 311, 300, 0.6, 0.2); this.tone('sawtooth', 370, 360, 0.6, 0.2); break;
        case 'zap': this.tone('square', 90, 1800, 0.25, 0.14); break;
        case 'rivet': this.tone('triangle', 880, 880, 0.1, 0.14); this.tone('triangle', 1320, 1320, 0.25, 0.14, 0.09); break;
        case 'finish': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.14, i * 0.12)); break;
        case 'goose': this.tone('square', 420, 300, 0.16, 0.12); this.tone('square', 440, 310, 0.18, 0.12, 0.2); break;
        case 'busted': this.tone('square', 1500, 1900, 0.12, 0.08); this.tone('square', 1500, 1900, 0.12, 0.08, 0.16); break;
        case 'bump': this.tone('triangle', 330, 260, 0.12, 0.08); break;
        case 'dock': this.burst(450, 0.6, 0.3, 0.4); break;
        case 'impact': this.tone('sine', 90, 40, 0.14, Math.min(0.5, e.v * 0.04)); break;
      }
    }
  }
}
