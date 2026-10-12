import * as THREE from 'three';

/**
 * Procedurally synthesised battle sounds (no audio files): musket volleys,
 * cannon, impacts, hooves, sabre clashes, drums and a bugle call. Sounds are
 * attenuated and panned relative to the camera.
 */
export class BattleAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private wind: GainNode | null = null;
  private enabled = true;
  private v = new THREE.Vector3();

  constructor(private camera: THREE.Camera) {}

  /** Must be called from a user gesture before anything is audible. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.55 : 0;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startWind();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
  }

  private get ready() {
    return !!(this.ctx && this.master && this.noise && this.enabled && this.ctx.state === 'running');
  }

  private spatial(pos: THREE.Vector3) {
    const d = this.camera.position.distanceTo(pos);
    const gain = 1 / (1 + Math.pow(d / 20, 2));
    this.v.copy(pos).project(this.camera);
    const pan = THREE.MathUtils.clamp(this.v.x, -1, 1) * 0.75;
    return { gain, pan, dist: d };
  }

  private out(pos: THREE.Vector3, gainMul: number, at: number) {
    const ctx = this.ctx!;
    const { gain, pan } = this.spatial(pos);
    const g = ctx.createGain();
    g.gain.value = gain * gainMul;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.master!);
    // Disconnect after the sound has finished to let the graph be collected.
    setTimeout(() => { g.disconnect(); p.disconnect(); }, Math.max(0, (at - ctx.currentTime) * 1000) + 4000);
    return g;
  }

  private burst(dest: AudioNode, at: number, dur: number, filter: BiquadFilterType, freq: number, q: number, peak: number, attack = 0.002) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(at, Math.random() * 1.5, dur + 0.05);
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

  /** A ragged volley: many musket cracks over a fraction of a second. */
  volley(pos: THREE.Vector3, shots: number, spread = 0.22, delay = 0) {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime + delay;
    const g = this.out(pos, 1, t0);
    const n = Math.min(16, Math.max(2, shots));
    for (let i = 0; i < n; i++) {
      const at = t0 + Math.random() * spread;
      this.burst(g, at, 0.12, 'bandpass', 1400 + Math.random() * 1200, 0.9, 0.5);
      this.burst(g, at, 0.35, 'lowpass', 420, 0.7, 0.35);
    }
    this.burst(g, t0 + 0.04, 1.1, 'lowpass', 300, 0.5, 0.28, 0.03);
  }

  cannon(pos: THREE.Vector3, delay = 0) {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime + delay;
    const g = this.out(pos, 1.5, t0);
    this.tone(g, t0, 'sine', 85, 32, 0.9, 0.9);
    this.burst(g, t0, 1.8, 'lowpass', 240, 0.6, 0.9, 0.004);
    this.burst(g, t0, 0.18, 'bandpass', 900, 0.7, 0.6);
    this.burst(g, t0 + 0.08, 2.4, 'lowpass', 140, 0.4, 0.35, 0.1);
  }

  impact(pos: THREE.Vector3, delay = 0) {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime + delay;
    const g = this.out(pos, 0.9, t0);
    this.tone(g, t0, 'sine', 60, 30, 0.35, 0.5);
    this.burst(g, t0, 0.5, 'lowpass', 500, 0.6, 0.6);
    this.burst(g, t0 + 0.05, 0.6, 'bandpass', 1800, 0.5, 0.18);
  }

  hooves(pos: THREE.Vector3, duration: number, delay = 0) {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime + delay;
    const g = this.out(pos, 0.9, t0);
    const pattern = [0, 0.07, 0.15, 0.29];
    for (let bar = 0; bar < duration / 0.36; bar++) {
      for (const p of pattern) {
        const at = t0 + bar * 0.36 + p + Math.random() * 0.02;
        this.burst(g, at, 0.07, 'lowpass', 190 + Math.random() * 60, 1, 0.5 + Math.random() * 0.3);
      }
    }
  }

  clash(pos: THREE.Vector3, delay = 0) {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime + delay;
    const g = this.out(pos, 0.6, t0);
    for (let i = 0; i < 6; i++) {
      const at = t0 + Math.random() * 0.7;
      const base = 1500 + Math.random() * 900;
      this.tone(g, at, 'triangle', base, base * 0.98, 0.25, 0.22, 0.002);
      this.tone(g, at, 'sine', base * 1.47, base * 1.45, 0.18, 0.12, 0.002);
      this.burst(g, at, 0.05, 'highpass', 3000, 0.7, 0.2);
    }
    this.burst(g, t0, 0.9, 'bandpass', 600, 0.4, 0.15, 0.05); // shouting & scuffle
  }

  drum(pos: THREE.Vector3) {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime;
    const g = this.out(pos, 0.5, t0);
    const beats = [0, 0.18, 0.27, 0.36, 0.54];
    for (const b of beats) {
      this.burst(g, t0 + b, 0.09, 'bandpass', 210, 1.2, 0.5);
      this.burst(g, t0 + b, 0.06, 'highpass', 2500, 0.5, 0.25);
    }
  }

  bugle(pos: THREE.Vector3) {
    if (!this.ready) return;
    const t0 = this.ctx!.currentTime;
    const g = this.out(pos, 0.25, t0);
    const notes: [number, number, number][] = [[392, 0, 0.18], [523, 0.2, 0.18], [659, 0.4, 0.18], [784, 0.6, 0.45]];
    for (const [f, at, d] of notes) {
      this.tone(g, t0 + at, 'triangle', f, f * 1.002, d, 0.3, 0.02);
      this.tone(g, t0 + at, 'sawtooth', f, f, d, 0.04, 0.02);
    }
  }

  dispose() {
    this.wind?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
  }
}
