import * as THREE from 'three';

export type BugleCall = 'reinforce' | 'capture' | 'depot' | 'victory' | 'charge';

type Note = [freq: number, start: number, dur: number];

// Natural notes of a bugle pitched in C: the only notes it can play.
const C4 = 261.6, G4 = 392, C5 = 523.3, E5 = 659.3, G5 = 784, C6 = 1046.5;

const CALLS: Record<BugleCall, Note[]> = {
  reinforce: [[G4, 0, 0.16], [C5, 0.18, 0.16], [E5, 0.36, 0.16], [G5, 0.54, 0.5]],
  depot: [[G4, 0, 0.14], [C5, 0.16, 0.14], [E5, 0.32, 0.45]],
  capture: [
    [C5, 0, 0.16], [C5, 0.2, 0.1], [C5, 0.33, 0.1], [E5, 0.46, 0.22], [G5, 0.72, 0.36],
    [E5, 1.12, 0.16], [G5, 1.32, 0.16], [C6, 1.52, 0.85],
  ],
  charge: [[G4, 0, 0.1], [C5, 0.12, 0.1], [E5, 0.24, 0.1], [G5, 0.36, 0.1], [E5, 0.48, 0.1], [G5, 0.6, 0.4]],
  victory: [
    [C4, 0, 0.3], [G4, 0.34, 0.3], [C5, 0.68, 0.3], [E5, 1.02, 0.3], [G5, 1.36, 0.5],
    [E5, 1.92, 0.22], [G5, 2.18, 0.22], [C6, 2.44, 1.4],
  ],
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Procedurally synthesised battle sounds; there are no audio files. Every
 * sound runs through a per-event bus with distance attenuation, air
 * absorption (distant fire sounds dull, close fire sharp), stereo panning and
 * a shared field reverb.
 */
export class BattleAudio {
  private ctx: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private crackle: AudioBuffer | null = null;
  private driveCurve: Float32Array<ArrayBuffer> | null = null;
  private wind: GainNode | null = null;
  private enabled = true;
  private v = new THREE.Vector3();

  constructor(private camera: THREE.Camera) {}

  /** Must be called from a user gesture before anything is audible. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.attach(new Ctor());
    }
    if (this.ctx instanceof AudioContext && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Builds the mixing graph on a context (an OfflineAudioContext renders sounds to a buffer). */
  attach(ctx: BaseAudioContext, ambience = true) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.7 : 0;
    this.master.connect(comp);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Sparse random impulses: the sizzle of burning powder and the rattle of a volley.
    this.crackle = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const c = this.crackle.getChannelData(0);
    for (let i = 0; i < c.length; i++) if (Math.random() < 0.006) c[i] = (Math.random() < 0.5 ? -1 : 1) * rand(0.4, 1);

    const n = 2048, k = 24;
    this.driveCurve = new Float32Array(new ArrayBuffer(n * 4));
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      this.driveCurve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    if (ambience) this.startWind();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05);
  }

  private get ready() {
    const c = this.ctx;
    if (!c || !this.master || !this.noise || !this.enabled) return false;
    return c.state === 'running' || (typeof OfflineAudioContext !== 'undefined' && c instanceof OfflineAudioContext);
  }

  /** Decaying stereo noise with a few early reflections: an open battlefield with tree lines. */
  private makeImpulse(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.5) * (t < 0.01 ? t / 0.01 : 1);
      }
      for (const ms of [23, 41, 67, 97, 131]) {
        const i = Math.floor((ms + ch * 7) * ctx.sampleRate / 1000);
        if (i < len) d[i] += rand(0.3, 0.6) * (Math.random() < 0.5 ? -1 : 1);
      }
    }
    return buf;
  }

  /**
   * One sound event's bus: distance gain, air absorption, panning and a
   * distance-dependent reverb send. Torn down after `life` seconds.
   */
  private bus(pos: THREE.Vector3 | null, gain: number, life: number, minGain = 0.06) {
    const ctx = this.ctx!;
    const d = pos ? this.camera.position.distanceTo(pos) : 12;
    const input = ctx.createGain();
    input.gain.value = Math.max(minGain, 1 / (1 + Math.pow(d / 32, 2))) * gain;
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = Math.min(20000, Math.max(1400, 22000 / (1 + d / 14)));
    const pan = ctx.createStereoPanner();
    if (pos) {
      this.v.copy(pos).project(this.camera);
      pan.pan.value = THREE.MathUtils.clamp(this.v.x, -1, 1) * 0.8;
    }
    const send = ctx.createGain();
    send.gain.value = 0.16 + Math.min(0.5, d / 90);
    input.connect(air).connect(pan).connect(this.master!);
    air.connect(send).connect(this.reverb!);
    setTimeout(() => {
      input.disconnect();
      air.disconnect();
      pan.disconnect();
      send.disconnect();
    }, (life + 3) * 1000);
    return input;
  }

  private drive(dest: AudioNode) {
    const ws = this.ctx!.createWaveShaper();
    ws.curve = this.driveCurve;
    ws.oversample = '2x';
    const trim = this.ctx!.createGain();
    trim.gain.value = 0.55;
    ws.connect(trim).connect(dest);
    return ws;
  }

  private burst(dest: AudioNode, at: number, dur: number, filter: BiquadFilterType, freq: number, q: number, peak: number, attack = 0.002) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rand(0.85, 1.15);
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(at, Math.random() * 1.2, dur + 0.05);
  }

  /** Noise swept through a band-pass: blade whoosh, flame whump. */
  private sweep(dest: AudioNode, at: number, dur: number, f0: number, f1: number, q: number, peak: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(at, Math.random() * 1.2, dur + 0.05);
  }

  private crackleBurst(dest: AudioNode, at: number, dur: number, peak: number, hp = 1800) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.crackle;
    src.playbackRate.value = rand(0.7, 1.3);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(at, Math.random() * 0.6, dur + 0.05);
  }

  private tone(dest: AudioNode, at: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.005) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private startWind() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(f).connect(g).connect(this.master!);
    src.start();
    lfo.start();
    this.wind = g;
  }

  // -- weapons -------------------------------------------------------------------

  /**
   * A single flintlock discharge: supersonic crack, the overdriven report, the
   * low body of the charge and the crackle of burning powder.
   */
  private shot(dest: AudioNode, gritty: AudioNode, at: number, power: number) {
    this.burst(dest, at, 0.006, 'highpass', 1200, 0.5, 1.3 * power, 0.0003); // snap
    this.burst(dest, at, 0.03, 'highpass', 3200, 0.7, 1.8 * power, 0.0006); // crack
    this.burst(gritty, at, 0.16, 'bandpass', rand(900, 1600), 0.7, 1.0 * power, 0.001); // report
    this.burst(dest, at + 0.002, 0.3, 'lowpass', 320, 0.8, 0.55 * power, 0.003); // body
    this.tone(dest, at, 'sine', rand(110, 135), 42, 0.15, 0.4 * power, 0.001);
    this.crackleBurst(dest, at + 0.006, rand(0.14, 0.24), 0.8 * power, 2500); // burning powder
  }

  /**
   * Musketry: a tight crash for a line volley (small spread) or ragged
   * skirmish fire (large spread), with a rolling tail echoing off the field.
   */
  volley(pos: THREE.Vector3, shots: number, spread = 0.18, delay = 0) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const n = Math.min(22, Math.max(2, shots));
    const bus = this.bus(pos, 1.35, delay + spread * 2.5 + 2);
    const lanes = [-0.3, 0, 0.3].map(p => {
      const pan = ctx.createStereoPanner();
      pan.pan.value = p;
      pan.connect(bus);
      return { dry: pan, gritty: this.drive(pan) };
    });
    const power = n > 10 ? 0.75 : 1;
    for (let i = 0; i < n; i++) {
      const straggler = Math.random() < 0.18;
      const at = t0 + (straggler ? rand(spread, spread * 2.5) : rand(0, spread));
      const lane = lanes[i % 3];
      this.shot(lane.dry, lane.gritty, at, power * rand(0.8, 1.1));
    }
    // The whole line going off together: a deep thump and a rolling rumble.
    if (n > 6) this.tone(bus, t0 + spread * 0.3, 'sine', 90, 30, 0.5, 0.5, 0.004);
    this.burst(bus, t0 + 0.04, 1.4 + spread, 'lowpass', 240, 0.5, n > 6 ? 0.45 : 0.25, 0.02);
    this.crackleBurst(bus, t0 + 0.05, 0.6 + spread, n > 6 ? 0.35 : 0.2, 900);
  }

  cannon(pos: THREE.Vector3, delay = 0) {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime + delay;
    const bus = this.bus(pos, 1.7, delay + 4, 0.12);
    const gritty = this.drive(bus);
    this.burst(bus, t0, 0.05, 'highpass', 2200, 0.7, 1.5, 0.0005);
    this.tone(bus, t0, 'sine', 78, 27, 1.1, 1.0, 0.002);
    this.burst(gritty, t0, 0.5, 'lowpass', 900, 0.6, 1.0, 0.002);
    this.burst(gritty, t0, 0.35, 'bandpass', 600, 0.8, 0.9, 0.002);
    this.burst(bus, t0, 2.0, 'lowpass', 240, 0.6, 0.9, 0.004);
    this.crackleBurst(bus, t0 + 0.01, 0.4, 0.5, 1200);
    this.burst(bus, t0 + 0.1, 3.0, 'lowpass', 110, 0.4, 0.45, 0.15); // rolling echo
  }

  impact(pos: THREE.Vector3, delay = 0) {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime + delay;
    const bus = this.bus(pos, 1.0, delay + 2);
    this.tone(bus, t0, 'sine', 64, 28, 0.4, 0.6);
    this.burst(this.drive(bus), t0, 0.35, 'lowpass', 700, 0.6, 0.8);
    this.burst(bus, t0 + 0.08, 0.9, 'bandpass', 2400, 0.5, 0.18, 0.05); // earth raining down
    this.crackleBurst(bus, t0 + 0.1, 0.7, 0.25, 2500);
  }

  // -- movement ------------------------------------------------------------------

  private footsteps(dest: AudioNode, t0: number, duration: number, pace: number, feet: number, jitter: number, peak: number) {
    for (let t = 0; t < duration; t += pace) {
      for (let k = 0; k < feet; k++) {
        const at = t0 + t + rand(0, jitter);
        this.burst(dest, at, 0.09, 'bandpass', rand(650, 1200), 0.9, peak); // gravel crunch
        this.burst(dest, at, 0.07, 'lowpass', 140, 0.7, peak * 1.1); // boot heel
      }
      if (Math.random() < 0.3) this.tone(dest, t0 + t + rand(0, pace), 'triangle', rand(2600, 3400), 2500, 0.05, peak * 0.25, 0.001); // kit rattling
    }
  }

  /** Infantry on the march: boots in step behind the drum, or a rifle company's horn and looser steps. */
  march(pos: THREE.Vector3, duration: number, style: 'line' | 'light') {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime;
    const dur = Math.min(8, Math.max(0.8, duration));
    const bus = this.bus(pos, 0.9, dur + 2);
    if (style === 'line') {
      this.footsteps(bus, t0, dur, 0.55, 4, 0.03, 0.32);
      for (let t = 0; t < dur; t += 1.1) {
        // Left-foot beat with a flam, then a lighter off-beat.
        this.burst(bus, t0 + t, 0.12, 'bandpass', 190, 1.1, 0.38);
        this.burst(bus, t0 + t, 0.08, 'highpass', 2600, 0.6, 0.24);
        this.burst(bus, t0 + t + 0.55, 0.08, 'bandpass', 210, 1.1, 0.22);
        this.burst(bus, t0 + t + 0.55, 0.05, 'highpass', 2800, 0.6, 0.14);
      }
    } else {
      this.footsteps(bus, t0, dur, 0.36, 3, 0.16, 0.28);
      // Light infantry were signalled by bugle-horn rather than drum.
      this.brass(bus, t0, G4, 0.18, 0.18, 1.5);
      this.brass(bus, t0 + 0.2, C5, 0.32, 0.18, 1.5);
    }
  }

  /** Hooves at the gallop (or a trot), with harness jingle and the odd snort. */
  hooves(pos: THREE.Vector3, duration: number, delay = 0, gallop = true) {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime + delay;
    const dur = Math.min(8, Math.max(0.6, duration));
    const bus = this.bus(pos, 1.6, delay + dur + 2);
    const stride = gallop ? 0.36 : 0.5;
    const pattern = gallop ? [0, 0.07, 0.15, 0.29] : [0, 0.25];
    const riders = gallop ? 3 : 2;
    for (let s = 0; s < dur / stride; s++) {
      for (const p of pattern) {
        for (let r = 0; r < riders; r++) {
          const at = t0 + s * stride + p + rand(0, 0.05);
          this.burst(bus, at, 0.08, 'lowpass', rand(220, 320), 1, rand(0.35, 0.55)); // weight landing
          this.burst(bus, at, 0.05, 'bandpass', rand(700, 1100), 1.4, rand(0.3, 0.42)); // clop
          this.burst(bus, at, 0.03, 'bandpass', rand(1500, 2500), 1.2, 0.2); // hoof on hard ground
        }
      }
      if (Math.random() < 0.6) this.tone(bus, t0 + s * stride + rand(0, stride), 'triangle', rand(4200, 6200), 4000, 0.06, 0.06, 0.001);
    }
    if (dur > 1.2) this.burst(bus, t0 + rand(0.3, dur - 0.5), 0.3, 'bandpass', 700, 3, 0.25, 0.05); // snort
  }

  /** Field gun manhandled across the ground: wheel rumble, creaking axle, crew footsteps. */
  wheels(pos: THREE.Vector3, duration: number) {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime;
    const dur = Math.min(8, Math.max(0.8, duration));
    const bus = this.bus(pos, 1.3, dur + 2);
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.3);
    g.gain.setValueAtTime(0.5, t0 + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t0);
    src.stop(t0 + dur + 0.1);
    for (let t = 0.2; t < dur; t += rand(0.6, 1.2)) {
      this.tone(bus, t0 + t, 'sawtooth', rand(150, 210), rand(120, 170), 0.18, 0.09, 0.03); // creak
    }
    for (let t = 0; t < dur; t += rand(0.12, 0.2)) this.burst(bus, t0 + t, 0.05, 'bandpass', rand(380, 620), 1.6, 0.14); // wheels over ruts
    this.footsteps(bus, t0, dur, 0.5, 2, 0.12, 0.14);
  }

  // -- melee ---------------------------------------------------------------------

  private swish(dest: AudioNode, at: number) {
    this.sweep(dest, at, rand(0.13, 0.2), rand(450, 700), rand(2800, 4200), 1.4, rand(0.35, 0.55));
  }

  /** Steel on steel: inharmonic partials ringing off a sharp transient. */
  private steel(dest: AudioNode, at: number, power = 1) {
    const base = rand(1900, 2600);
    const partials: [number, number, number][] = [[1, 0.5, 0.5], [1.48, 0.35, 0.35], [2.13, 0.25, 0.28], [2.97, 0.16, 0.2], [4.1, 0.1, 0.14]];
    for (const [ratio, amp, decay] of partials) {
      this.tone(dest, at, 'sine', base * ratio, base * ratio * 0.995, decay * rand(0.8, 1.3), amp * power, 0.0008);
    }
    this.burst(dest, at, 0.035, 'highpass', 4500, 0.7, 0.6 * power, 0.0005);
  }

  /** Cavalry at close quarters: sabres whistling and clashing, horses milling, a scuffle. */
  melee(pos: THREE.Vector3, duration: number, delay = 0) {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime + delay;
    const dur = Math.min(4, Math.max(0.5, duration));
    const bus = this.bus(pos, 1.1, delay + dur + 2);
    let t = 0;
    while (t < dur) {
      const at = t0 + t;
      if (Math.random() < 0.55) {
        this.swish(bus, at);
        if (Math.random() < 0.6) this.steel(bus, at + rand(0.08, 0.14), rand(0.6, 1));
      } else {
        this.steel(bus, at, rand(0.5, 0.9));
      }
      t += rand(0.07, 0.2);
    }
    this.burst(bus, t0, dur + 0.4, 'bandpass', 420, 0.5, 0.18, 0.08); // shouting, trampling
    this.hooves(pos, dur, delay, false);
  }

  // -- signals -------------------------------------------------------------------

  /** A brass note: lip slur up to pitch, filter "blat" on the attack, late vibrato. */
  private brass(dest: AudioNode, at: number, freq: number, dur: number, peak: number, brightness = 1) {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.6;
    filter.frequency.setValueAtTime(500, at);
    filter.frequency.exponentialRampToValueAtTime(3400 * brightness, at + 0.045);
    filter.frequency.exponentialRampToValueAtTime(2200 * brightness, at + Math.max(0.06, dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.03);
    g.gain.setValueAtTime(peak * 0.85, at + Math.max(0.04, dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.06);
    filter.connect(g).connect(dest);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.6;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(freq * 0.006, at + Math.min(0.25, dur));
    lfo.connect(depth);
    for (const [type, mul, lvl] of [['sawtooth', 1, 0.7], ['square', 1.003, 0.3]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq * 0.965, at);
      o.frequency.exponentialRampToValueAtTime(freq * mul, at + 0.035);
      depth.connect(o.frequency);
      const lv = ctx.createGain();
      lv.gain.value = lvl;
      o.connect(lv).connect(filter);
      o.start(at);
      o.stop(at + dur + 0.1);
    }
    lfo.start(at);
    lfo.stop(at + dur + 0.1);
  }

  /**
   * Bugle calls. Game events such as captures and victory stay audible from
   * anywhere on the field.
   */
  bugle(pos: THREE.Vector3 | null, call: BugleCall, delay = 0) {
    if (!this.ready) return;
    const notes = CALLS[call];
    const t0 = this.ctx!.currentTime + delay;
    const end = notes.reduce((a, n) => Math.max(a, n[1] + n[2]), 0);
    const important = call === 'capture' || call === 'victory' || call === 'depot';
    const bus = this.bus(pos, important ? 0.75 : 0.5, delay + end + 2, important ? 0.45 : 0.1);
    for (const [f, start, dur] of notes) this.brass(bus, t0 + start, f, dur, 0.5);
    if (call === 'victory' || call === 'capture') this.drumRoll(bus, t0 + end - 0.2, call === 'victory' ? 1.6 : 0.9);
  }

  private drumRoll(dest: AudioNode, at: number, dur: number) {
    for (let t = 0; t < dur; t += 0.045) {
      const p = 0.12 + 0.25 * (t / dur);
      this.burst(dest, at + t, 0.06, 'bandpass', 220, 1.1, p);
      this.burst(dest, at + t, 0.04, 'highpass', 2600, 0.6, p * 0.6);
    }
    this.burst(dest, at + dur, 0.35, 'bandpass', 160, 1, 0.6); // final stroke
  }

  /** Square forming: a quick roll on the drums. */
  drum(pos: THREE.Vector3) {
    if (!this.ready) return;
    const bus = this.bus(pos, 0.7, 2);
    this.drumRoll(bus, this.ctx!.currentTime, 0.6);
  }

  /** A brazier at the capture point bursting into flame. */
  ignite(pos: THREE.Vector3) {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime;
    const bus = this.bus(pos, 1.6, 3, 0.3);
    this.sweep(bus, t0, 0.7, 180, 1400, 0.8, 0.6);
    this.burst(bus, t0, 0.5, 'lowpass', 160, 0.7, 0.5, 0.05);
    this.crackleBurst(bus, t0 + 0.1, 1.6, 0.35, 1400);
  }

  dispose() {
    this.wind?.disconnect();
    if (this.ctx instanceof AudioContext) void this.ctx.close();
    this.ctx = null;
  }
}
