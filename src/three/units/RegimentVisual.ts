import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Nation, Regiment, UnitType } from '../../game/types';
import { NATION_CSS, TILE, WATER_LEVEL, angleDelta, clamp, facingToHeading, smoothstep } from '../core/constants';
import { hashString } from '../core/noise';
import {
  FLAG_ANCHOR, FootKind, FootPose, GUIDON_ANCHOR, HIP_Y, HORSE_LEGS, HORSE_LEG_TOP, LEG_X, MUZZLE, RIDER_SHOULDER, RiderPose,
  WHEEL_R, WHEEL_X, buildEarthworks, buildFootArms, buildFootBody, buildFootLeg, buildGun, buildHorseBody, buildHorseLeg,
  buildPalisade, buildRider, buildRiderArm, buildWheel,
} from '../models/unitModels';
import { disposeFlagMesh, makeFlagMesh, makeFlagTexture } from '../models/flags';
import { Effects } from '../scene/effects';
import { BattleAudio } from '../scene/audio';
import { Obstacles } from '../world/obstacles';
import { TerrainModel } from '../world/TerrainModel';
import { Batch, BatchSet } from './batches';
import { FormationMode, RANK_FIGURES, Slot, modeFor, rankSlots, specialSlot } from './formations';

type Role = 'rank' | 'bearer' | 'officer' | 'drummer' | 'gun' | 'guidon';
type RiderBody = 'hussar' | 'chasseur';

export interface Figure {
  role: Role;
  foot: FootKind | null;
  rider: RiderBody | null;
  horse: number;
  gun: boolean;
  x: number;
  z: number;
  heading: number;
  slot: number;
  phase: number;
  speed: number;
  rnd: number;
  aimFrom: number;
  aimTo: number;
  fireAt: number;
  poseUntil: number;
  slashAt: number;
  doomed: boolean;
  dying: boolean;
  deathStart: number;
  fall: number;
  twist: number;
  recoil: number;
  wheel: number;
}

/** Shared services every regiment needs. */
export interface UnitContext {
  model: TerrainModel;
  obstacles: Obstacles;
  batches: BatchSet;
  effects: Effects;
  audio: BattleAudio;
  group: THREE.Group;
  corpses: Corpses;
  onLabelClick: (x: number, y: number) => void;
  shake: (pos: THREE.Vector3, amount: number) => void;
}

/** Fallen figures stay on the field for the rest of the battle. */
export class Corpses {
  private list: { batch: Batch; m: Float32Array }[] = [];
  constructor(private cap = 4000) {}
  add(batch: Batch, m: THREE.Matrix4) {
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push({ batch, m: new Float32Array(m.elements) });
  }
  push() {
    for (const c of this.list) c.batch.pushArray(c.m);
  }
  clear() {
    this.list.length = 0;
  }
}

const RANK_KIND: Record<UnitType, FootKind | RiderBody> = {
  line_infantry: 'line',
  light_infantry: 'light',
  cannon: 'gunner',
  hussars: 'hussar',
  chasseurs: 'chasseur',
};

const SPEED: Record<UnitType, number> = {
  line_infantry: 1.7,
  light_infantry: 2.1,
  cannon: 1.4,
  hussars: 3.4,
  chasseurs: 3.4,
};

const GLYPH: Record<UnitType, string> = {
  line_infantry: '▬',
  light_infantry: '⋯',
  cannon: '●',
  hussars: '⚔',
  chasseurs: '➶',
};

/** Reinforcements get long ids (`1-hussars-1712345678901`); abbreviate unless hovered/selected. */
const idHtml = (id: string) => {
  if (id.length <= 10) return `<span class="rg-id">${id}</span>`;
  const parts = id.split('-');
  const short = `${parts[0]}-${(parts[1] ?? '').slice(0, 4)}…${id.slice(-3)}`;
  return `<span class="rg-id rg-short">${short}</span><span class="rg-id rg-full">${id}</span>`;
};

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _m3 = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _p = { x: 0, z: 0 };
const ease = (t: number) => t * t * (3 - 2 * t);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Charge {
  start: number;
  contact: number;
  hold: number;
  back: number;
  dx: number;
  dz: number;
  target: THREE.Vector3;
}

interface Timed { at: number; fn: () => void }

export class RegimentVisual {
  data: Regiment;
  readonly id: string;
  readonly type: UnitType;
  readonly nation: Nation;
  readonly anchor = new THREE.Vector2();
  heading: number;
  readonly figures: Figure[] = [];
  destroyed = false;
  impactAt = 0;
  private path: THREE.Vector2[] = [];
  private mode: FormationMode;
  private slots: Slot[] = [];
  private slotSig = '';
  private aimHeading: number | null = null;
  private aimUntil = 0;
  private charge: Charge | null = null;
  private timeline: Timed[] = [];
  private flag: THREE.Mesh | null = null;
  private works: THREE.Mesh | null = null;
  private worksT = 0;
  private pal: THREE.Mesh | null = null;
  private palT = 0;
  private label: CSS2DObject;
  private labelEl: HTMLDivElement;
  private labelSig = '';
  private selected = false;
  private hovered = false;
  private prevAnchor = new THREE.Vector2();
  private vel = new THREE.Vector2();
  private seed: number;
  private gone = false;
  private destroyedAt = 0;
  private now = 0;

  constructor(private ctx: UnitContext, data: Regiment, opts: { nation: Nation; spawnFrom?: { x: number; z: number } }) {
    this.data = data;
    this.id = data.id;
    this.type = data.type;
    this.nation = opts.nation;
    this.seed = hashString(data.id);
    this.anchor.set((data.x + 0.5) * TILE, (data.y + 0.5) * TILE);
    this.prevAnchor.copy(this.anchor);
    this.heading = facingToHeading(data.facing);
    this.mode = modeFor(data.type, data.isBoxFormation);

    const n = this.targetRankCount();
    for (let i = 0; i < n; i++) this.figures.push(this.makeFigure('rank'));
    for (const role of this.specialRoles()) this.figures.push(this.makeFigure(role));
    this.refreshSlots(true);
    // Place figures: directly in formation, or streaming out of the command centre.
    for (const f of this.figures) {
      const t = this.slotWorld(f);
      if (opts.spawnFrom) {
        f.x = opts.spawnFrom.x + rand(-0.4, 0.4);
        f.z = opts.spawnFrom.z + rand(-0.4, 0.4);
      } else {
        f.x = t.x;
        f.z = t.z;
      }
      f.heading = this.heading + this.slotOf(f).h;
    }

    this.labelEl = document.createElement('div');
    this.labelEl.className = 'rg-label';
    this.labelEl.addEventListener('pointerdown', e => e.stopPropagation());
    this.labelEl.addEventListener('click', e => {
      e.stopPropagation();
      ctx.onLabelClick(this.data.x, this.data.y);
    });
    this.label = new CSS2DObject(this.labelEl);
    this.label.center.set(0.5, 1);
    ctx.group.add(this.label);
    this.updateLabel();

    if (data.type === 'line_infantry' || data.type === 'hussars' || data.type === 'chasseurs') {
      const num = parseInt(data.name, 10) || 1;
      const guidon = data.type !== 'line_infantry';
      const tex = makeFlagTexture(this.nation, data.standardColor, num, guidon);
      this.flag = guidon ? makeFlagMesh(tex, 0.2, 0.14, true) : makeFlagMesh(tex, 0.3, 0.21);
      ctx.group.add(this.flag);
    }
  }

  // -- setup -----------------------------------------------------------------

  private specialRoles(): Role[] {
    switch (this.type) {
      case 'line_infantry': return ['bearer', 'officer', 'drummer'];
      case 'light_infantry': return ['officer'];
      case 'cannon': return ['gun'];
      default: return ['guidon'];
    }
  }

  private makeFigure(role: Role): Figure {
    const kind = RANK_KIND[this.type];
    const mounted = this.type === 'hussars' || this.type === 'chasseurs';
    let foot: FootKind | null = null;
    if (!mounted && role !== 'gun') {
      foot = role === 'rank' ? (kind as FootKind) : role === 'guidon' ? 'bearer' : (role as FootKind);
      if (foot === 'officer' && this.type === 'light_infantry') foot = 'lightOfficer';
    }
    return {
      role,
      foot,
      rider: mounted ? (kind as RiderBody) : null,
      horse: Math.floor(Math.random() * 3),
      gun: role === 'gun',
      x: 0, z: 0, heading: 0, slot: 0,
      phase: Math.random() * Math.PI * 2,
      speed: 0,
      rnd: Math.random(),
      aimFrom: -1, aimTo: -1, fireAt: -1, poseUntil: -1, slashAt: -1,
      doomed: false, dying: false, deathStart: 0, fall: 1, twist: 0,
      recoil: 0, wheel: 0,
    };
  }

  private targetRankCount() {
    const d = this.data;
    if (d.men <= 0) return 0;
    return Math.max(1, Math.ceil((d.men / d.maxMen) * RANK_FIGURES[d.type]));
  }

  private rankFigures() {
    return this.figures.filter(f => f.role === 'rank' && !f.dying);
  }

  private slotOf(f: Figure): Slot {
    if (f.role === 'rank') return this.slots[f.slot] ?? { x: 0, z: 0, h: 0 };
    return specialSlot(this.mode, f.role as 'bearer', this.rankFigures().length);
  }

  private slotWorld(f: Figure) {
    const s = this.slotOf(f);
    const c = Math.cos(this.heading), sn = Math.sin(this.heading);
    let x = this.anchor.x + s.x * c + s.z * sn;
    let z = this.anchor.y - s.x * sn + s.z * c;
    if (this.charge) {
      const off = this.chargeOffset(this.now);
      x += off.x;
      z += off.z;
    }
    return { x, z };
  }

  /** Re-assigns rank figures to slots when the formation or its size changes. */
  private refreshSlots(initial = false) {
    const ranks = this.rankFigures();
    const sig = `${this.mode}:${ranks.length}`;
    if (sig === this.slotSig) return;
    this.slotSig = sig;
    this.slots = rankSlots(this.mode, ranks.length, this.seed);
    if (initial) {
      ranks.forEach((f, i) => (f.slot = i));
      return;
    }
    // Greedy nearest assignment keeps figures from criss-crossing.
    const c = Math.cos(this.heading), sn = Math.sin(this.heading);
    const free = new Set(ranks);
    this.slots.forEach((s, j) => {
      const wx = this.anchor.x + s.x * c + s.z * sn;
      const wz = this.anchor.y - s.x * sn + s.z * c;
      let best: Figure | null = null;
      let bd = Infinity;
      for (const f of free) {
        const d = (f.x - wx) ** 2 + (f.z - wz) ** 2;
        if (d < bd) { bd = d; best = f; }
      }
      if (best) { best.slot = j; free.delete(best); }
    });
  }

  // -- state from the game -----------------------------------------------------

  setData(r: Regiment, path: { x: number; y: number }[] | null) {
    const old = this.data;
    this.data = r;
    if (old.x !== r.x || old.y !== r.y) {
      const steps = path && path.length ? path : [{ x: r.x, y: r.y }];
      for (const s of steps) this.path.push(new THREE.Vector2((s.x + 0.5) * TILE, (s.y + 0.5) * TILE));
      this.marchSound();
    }
    const n = this.targetRankCount();
    const alive = this.rankFigures().filter(f => !f.doomed).length;
    if (n < alive) this.scheduleKills(alive - n, Math.max(this.now, this.impactAt));
    else if (n > alive) for (let i = alive; i < n; i++) this.figures.push(this.reinforce());
    if (old.isEntrenched !== r.isEntrenched && r.isEntrenched) {
      this.ctx.effects.digging(this.pos3(), this.formationWidth(), this.heading);
    }
    if (old.isPalisaded !== r.isPalisaded && r.isPalisaded) {
      this.ctx.effects.digging(this.pos3(), 0.8, this.heading);
    }
    this.updateLabel();
  }

  /** Boots, horns, hooves or wheels for the march just ordered, lasting as long as it will take. */
  private marchSound() {
    let dist = 0;
    let px = this.anchor.x, pz = this.anchor.y;
    let mx = px, mz = pz;
    for (const p of this.path) {
      dist += Math.hypot(p.x - px, p.y - pz);
      px = p.x;
      pz = p.y;
    }
    if (this.path.length) {
      const mid = this.path[Math.floor((this.path.length - 1) / 2)];
      mx = (this.anchor.x + mid.x) / 2;
      mz = (this.anchor.y + mid.y) / 2;
    }
    const pos = new THREE.Vector3(mx, this.ctx.model.ground(mx, mz), mz);
    const dur = dist / SPEED[this.type] + 0.4;
    const audio = this.ctx.audio;
    switch (this.type) {
      case 'line_infantry': audio.march(pos, dur, 'line'); break;
      case 'light_infantry': audio.march(pos, dur, 'light'); break;
      case 'cannon': audio.wheels(pos, dur); break;
      default: audio.hooves(pos, dur, 0, dist > TILE * 1.5);
    }
  }

  private reinforce() {
    const f = this.makeFigure('rank');
    const back = this.slotWorld({ ...f, role: 'bearer' } as Figure);
    f.x = back.x;
    f.z = back.z;
    f.heading = this.heading;
    return f;
  }

  setSelected(sel: boolean, hover: boolean) {
    if (sel === this.selected && hover === this.hovered) return;
    this.selected = sel;
    this.hovered = hover;
    this.labelSig = '';
    this.updateLabel();
  }

  pos3(out = new THREE.Vector3()) {
    return out.set(this.anchor.x, this.ctx.model.ground(this.anchor.x, this.anchor.y), this.anchor.y);
  }

  private formationWidth() {
    if (this.type === 'line_infantry') return Math.max(0.7, Math.ceil(this.rankFigures().length / 3) * 0.17 + 0.25);
    if (this.type === 'cannon') return 0.8;
    return 1.3;
  }

  // -- combat ------------------------------------------------------------------

  private scheduleKills(count: number, at: number) {
    const pool = this.rankFigures().filter(f => !f.doomed);
    // Front-rank men are more exposed.
    pool.sort((a, b) => (this.slotOf(b).z + Math.random() * 0.5) - (this.slotOf(a).z + Math.random() * 0.5));
    const spread = this.type === 'cannon' ? 0.15 : 0.45;
    for (let i = 0; i < count && i < pool.length; i++) {
      const f = pool[i];
      f.doomed = true;
      this.timeline.push({ at: at + Math.random() * spread, fn: () => this.kill(f) });
    }
  }

  private kill(f: Figure) {
    if (f.dying) return;
    f.dying = true;
    f.doomed = true;
    f.deathStart = this.now;
    f.fall = Math.random() < 0.65 ? -1 : 1;
    f.twist = rand(-0.6, 0.6);
    f.aimFrom = f.aimTo = f.fireAt = -1;
  }

  /** Regiment wiped out: everybody left falls, the colours go down. */
  destroy(at: number) {
    if (this.destroyed) return;
    this.destroyed = true;
    this.destroyedAt = Math.max(at, this.now);
    this.path.length = 0;
    for (const f of this.figures) {
      if (f.dying) continue;
      f.doomed = true;
      this.timeline.push({ at: this.destroyedAt + Math.random() * 0.7, fn: () => this.kill(f) });
    }
    this.labelEl.classList.add('dead');
    this.labelSig = '';
    this.updateLabel();
  }

  /** True once every figure has fallen and the visual can be dropped. */
  get finished() {
    return this.destroyed && this.figures.length === 0 && this.now > this.destroyedAt + 1.5;
  }

  /**
   * Plays this regiment's attack on a target point and returns the sim time at
   * which the damage lands (so casualties drop when the shot arrives).
   */
  attack(target: THREE.Vector3, now: number, delay = 0, opts: { intoSquare?: boolean } = {}): number {
    const t0 = now + delay;
    const me = this.pos3();
    const dx = target.x - me.x, dz = target.z - me.z;
    const dist = Math.hypot(dx, dz);
    const toward = Math.atan2(dx, dz);
    const fx = dx / (dist || 1), fz = dz / (dist || 1);

    if (this.type === 'hussars') {
      this.aimHeading = toward;
      this.aimUntil = t0 + 3.2;
      // Horses balk at a hedge of bayonets: against a square the charge pulls up short.
      const reach = Math.max(0, dist - (opts.intoSquare ? 1.2 : 0.75));
      const dur = 0.35 + reach / 3.6;
      this.charge = { start: t0 + 0.15, contact: t0 + 0.15 + dur, hold: 0.55, back: 1.3, dx: fx * reach, dz: fz * reach, target: target.clone() };
      for (const f of this.figures) if (f.rider) f.poseUntil = t0 + 0.15 + dur + 0.55;
      const contact = t0 + 0.15 + dur;
      this.ctx.audio.bugle(me, 'charge', delay);
      this.ctx.audio.hooves(me, dur + 0.6, delay + 0.1);
      this.timeline.push({
        at: contact,
        fn: () => {
          this.ctx.effects.sparks(new THREE.Vector3(target.x, target.y + 0.4, target.z), 14);
          this.ctx.effects.hoofDust(target, 2);
          this.ctx.audio.melee(target, 0.55 + 0.6);
          for (const f of this.figures) if (f.rider && !f.dying) f.slashAt = this.now + Math.random() * 0.35;
        },
      });
      return contact;
    }

    if (this.type === 'cannon') {
      if (!this.data.isPalisaded) {
        this.aimHeading = toward;
        this.aimUntil = t0 + 3.5;
      }
      const fireAt = t0 + 0.55;
      const flight = Effects.flightTime(dist);
      this.timeline.push({
        at: fireAt,
        fn: () => {
          const g = this.figures.find(f => f.gun && !f.dying);
          const src = g ? this.muzzleWorld(g, MUZZLE.gun) : me.clone().setY(me.y + 0.2);
          const h = g ? g.heading : toward;
          this.ctx.effects.cannonBlast(src, Math.sin(h), Math.cos(h));
          const aim = target.clone().add(new THREE.Vector3(rand(-0.3, 0.3), 0, rand(-0.3, 0.3)));
          aim.y = this.ctx.model.ground(aim.x, aim.z);
          this.ctx.effects.cannonball(src, aim, p => this.ctx.audio.impact(p));
          this.ctx.audio.cannon(src);
          this.ctx.shake(src, 0.12);
          if (g) g.recoil = 1;
        },
      });
      return fireAt + flight;
    }

    // Musketry: line volley, skirmish fire or carbines from the saddle.
    const ranks = this.figures.filter(f => f.role === 'rank' && !f.dying);
    let shooters = ranks;
    if (this.type === 'line_infantry' && this.data.isBoxFormation) {
      shooters = ranks.filter(f => {
        const h = this.heading + this.slotOf(f).h;
        return Math.sin(h) * fx + Math.cos(h) * fz > 0.3;
      });
    } else if (this.type !== 'line_infantry') {
      this.aimHeading = toward;
      this.aimUntil = t0 + 3.0;
    }
    const volley = this.type === 'line_infantry';
    const base = volley ? 0.42 : 0.35;
    let last = t0 + base;
    for (const f of shooters) {
      f.aimFrom = t0 + rand(0, 0.12);
      f.fireAt = volley ? t0 + base + rand(0, 0.12) : t0 + base + rand(0, 0.9);
      f.aimTo = f.fireAt + rand(0.6, 0.9);
      last = Math.max(last, f.fireAt);
    }
    const officer = this.figures.find(f => f.role === 'officer' && !f.dying);
    if (officer) officer.poseUntil = t0 + base + 0.1;
    this.ctx.audio.volley(me, shooters.length, volley ? 0.14 : 0.9, delay + base);
    const kicks = Math.min(14, shooters.length);
    for (let i = 0; i < kicks; i++) {
      this.timeline.push({
        at: t0 + base + 0.05 + (volley ? rand(0, 0.15) : rand(0, 1.0)),
        fn: () => {
          const x = target.x + rand(-0.8, 0.8), z = target.z + rand(-0.8, 0.8);
          this.ctx.effects.dustKick(_v.set(x, this.ctx.model.ground(x, z), z));
        },
      });
    }
    return volley ? t0 + base + 0.08 : t0 + base + 0.3;
  }

  private chargeOffset(now: number) {
    const c = this.charge;
    if (!c) return { x: 0, z: 0 };
    let k = 0;
    if (now < c.start) k = 0;
    else if (now < c.contact) k = Math.pow((now - c.start) / (c.contact - c.start), 1.6);
    else if (now < c.contact + c.hold) k = 1 + Math.sin((now - c.contact) * 18) * 0.03;
    else if (now < c.contact + c.hold + c.back) k = 1 - ease((now - c.contact - c.hold) / c.back);
    else k = 0;
    return { x: c.dx * k, z: c.dz * k };
  }

  private muzzleWorld(f: Figure, local: THREE.Vector3) {
    this.figureMatrix(f, _m, this.now);
    return local.clone().applyMatrix4(_m);
  }

  // -- per-frame ---------------------------------------------------------------

  update(dt: number, now: number) {
    this.now = now;
    const ctx = this.ctx;

    // Timed events (deaths, impacts, dust kicks...)
    if (this.timeline.length) {
      const due = this.timeline.filter(t => t.at <= now);
      if (due.length) {
        this.timeline = this.timeline.filter(t => t.at > now);
        for (const t of due) t.fn();
      }
    }

    // March along the path.
    this.prevAnchor.copy(this.anchor);
    let travelHeading: number | null = null;
    if (this.path.length && !this.destroyed) {
      const tgt = this.path[0];
      const dx = tgt.x - this.anchor.x, dz = tgt.y - this.anchor.y;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.02) {
        this.path.shift();
      } else {
        travelHeading = Math.atan2(dx, dz);
        const terrain = this.terrainFactor();
        const turnLag = Math.abs(angleDelta(this.heading, travelHeading)) > 1.2 ? 0.35 : 1;
        const step = Math.min(dist, SPEED[this.type] * terrain * turnLag * dt);
        this.anchor.x += (dx / dist) * step;
        this.anchor.y += (dz / dist) * step;
      }
    }
    this.vel.set((this.anchor.x - this.prevAnchor.x) / Math.max(dt, 1e-4), (this.anchor.y - this.prevAnchor.y) / Math.max(dt, 1e-4));

    // Formation & heading
    const moving = this.path.length > 0;
    const wantMode: FormationMode = this.type === 'line_infantry' && moving ? 'column' : modeFor(this.type, this.data.isBoxFormation);
    if (wantMode !== this.mode) this.mode = wantMode;
    this.refreshSlots();

    let wantHeading = facingToHeading(this.data.facing);
    if (travelHeading !== null) wantHeading = travelHeading;
    else if (this.aimHeading !== null && now < this.aimUntil) wantHeading = this.aimHeading;
    else this.aimHeading = null;
    const turnRate = this.type === 'hussars' || this.type === 'chasseurs' ? 3.5 : 2.4;
    const dh = angleDelta(this.heading, wantHeading);
    this.heading += clamp(dh, -turnRate * dt, turnRate * dt);
    if (this.charge && now > this.charge.contact + this.charge.hold + this.charge.back) this.charge = null;

    // Figures
    const fast = this.charge !== null;
    const limit = (SPEED[this.type] * 1.35 + 0.35) * (fast ? 1.7 : 1);
    const alive: Figure[] = [];
    for (const f of this.figures) {
      if (f.dying) {
        if (now - f.deathStart > 0.75) {
          this.toCorpse(f);
          continue;
        }
        this.emit(f, now);
        alive.push(f);
        continue;
      }
      const t = this.slotWorld(f);
      ctx.obstacles.resolve(t, f.rider ? 0.1 : 0.05);
      ctx.model.confine(t.x, t.z, _p);
      const dx = _p.x - f.x, dz = _p.z - f.z;
      const dist = Math.hypot(dx, dz);
      let step = 0;
      if (dist > 0.004) {
        step = Math.min(dist, (limit + dist * 0.8) * dt);
        f.x += (dx / dist) * step;
        f.z += (dz / dist) * step;
      }
      const spd = step / Math.max(dt, 1e-4);
      f.speed += (spd - f.speed) * Math.min(1, dt * 8);
      f.phase += step * (f.rider ? 8.5 : f.gun ? 0 : 21);
      if (f.gun) f.wheel += step / WHEEL_R;

      const slotH = this.heading + this.slotOf(f).h;
      let wantH = dist > 0.12 ? Math.atan2(dx, dz) : slotH;
      if (moving && dist < 0.4) wantH = this.heading;
      if (f.aimFrom >= 0 && now >= f.aimFrom && now <= f.aimTo && this.aimHeading !== null) wantH = this.aimHeading + this.slotOf(f).h * 0.3;
      if (!moving && dist <= 0.12) wantH += Math.sin(now * 0.4 + f.rnd * 20) * 0.06;
      const fh = angleDelta(f.heading, wantH);
      f.heading += clamp(fh, -5 * dt, 5 * dt);

      if (f.fireAt >= 0 && now >= f.fireAt) {
        f.fireAt = -1;
        if (!f.gun) {
          const local = f.rider ? MUZZLE.rider : MUZZLE.infantry;
          const mz = this.muzzleWorld(f, local);
          ctx.effects.muzzle(mz, Math.sin(f.heading), Math.cos(f.heading), f.rider ? 0.9 : 1);
        }
      }
      if (f.recoil > 0) f.recoil = Math.max(0, f.recoil - dt * 0.9);

      // Splashing through fords and dust under hooves.
      if (step > 0.002) {
        const gy = ctx.model.ground(f.x, f.z);
        if (gy < WATER_LEVEL - 0.04 && Math.random() < 0.08) ctx.effects.splash(_v.set(f.x, WATER_LEVEL, f.z), 3);
        else if (f.rider && f.speed > 1.5) ctx.effects.hoofDust(_v.set(f.x, gy, f.z), 1);
      }
      this.emit(f, now);
      alive.push(f);
    }
    this.figures.length = 0;
    this.figures.push(...alive);

    this.updateFlag(now);
    this.updateWorks(dt);
    const gy = ctx.model.ground(this.anchor.x, this.anchor.y);
    const lift = this.type === 'hussars' || this.type === 'chasseurs' ? 1.12 : this.type === 'cannon' ? 0.62 : 0.92;
    this.label.position.set(this.anchor.x, gy + lift, this.anchor.y);
    this.label.visible = !this.destroyed || now < this.destroyedAt + 1.2;
  }

  private terrainFactor() {
    const tx = Math.floor(this.anchor.x / TILE), ty = Math.floor(this.anchor.y / TILE);
    const t = this.ctx.model.terrainAt(tx, ty);
    if (this.ctx.model.bridgeAt(tx, ty)) return 1;
    switch (t) {
      case 'river': return 0.55;
      case 'forest': return 0.75;
      case 'mountain': return 0.7;
      case 'road': return 1.15;
      default: return 1;
    }
  }

  // -- rendering -----------------------------------------------------------------

  /** Root transform of a figure (feet / hooves / wheels on the ground). */
  private figureMatrix(f: Figure, out: THREE.Matrix4, now: number) {
    const gy = this.ctx.model.ground(f.x, f.z);
    const amp = clamp(f.speed / (f.rider ? 1.4 : 0.5), 0, 1);
    let y = gy;
    if (f.rider) y += Math.abs(Math.sin(f.phase)) * 0.025 * amp;
    else if (!f.gun) y += Math.abs(Math.cos(f.phase)) * 0.012 * amp;
    let x = f.x, z = f.z;
    if (f.gun && f.recoil > 0) {
      const k = f.recoil > 0.85 ? (1 - f.recoil) / 0.15 : f.recoil / 0.85;
      x -= Math.sin(f.heading) * 0.2 * k;
      z -= Math.cos(f.heading) * 0.2 * k;
    }
    out.makeRotationY(f.heading);
    if (f.dying) {
      const d = smoothstep(0, 1, (now - f.deathStart) / 0.55);
      const k = d * d;
      if (f.rider) {
        _m2.makeRotationZ(k * (Math.PI / 2 - 0.12) * f.fall);
        out.multiply(_m2);
        y += Math.sin(k * Math.PI / 2) * 0.07;
      } else if (f.gun) {
        _m2.makeRotationZ(k * 0.35 * f.fall);
        out.multiply(_m2);
        y -= 0.03 * k;
      } else {
        _m2.makeRotationY(f.twist * k);
        out.multiply(_m2);
        _m2.makeRotationX(k * (Math.PI / 2 - 0.04) * f.fall);
        out.multiply(_m2);
        y += Math.sin(k * Math.PI / 2) * 0.035;
      }
    } else if (f.rider) {
      _m2.makeRotationX(Math.sin(f.phase) * 0.05 * amp);
      out.multiply(_m2);
    }
    out.setPosition(x, y, z);
    return out;
  }

  private footPose(f: Figure, now: number): FootPose {
    switch (f.foot) {
      case 'line':
      case 'light':
        return f.aimFrom >= 0 && now >= f.aimFrom && now <= f.aimTo ? 'aim' : 'carry';
      case 'officer':
      case 'lightOfficer':
        return now < f.poseUntil ? 'up' : 'down';
      case 'drummer':
        return 'beat';
      case 'bearer':
        return 'hold';
      default:
        return 'carry';
    }
  }

  private emit(f: Figure, now: number, sink?: (b: Batch, m: THREE.Matrix4) => void) {
    const B = this.ctx.batches;
    const nation = this.nation;
    const push = sink ?? ((b: Batch, m: THREE.Matrix4) => b.push(m));
    const root = this.figureMatrix(f, _m, now);
    const amp = f.dying ? 0 : clamp(f.speed / (f.rider ? 1.4 : 0.45), 0, 1);

    if (f.gun) {
      push(B.get(`gb:${nation}`, () => buildGun(nation), 16), root);
      for (const s of [-1, 1]) {
        _m2.makeRotationX(f.wheel);
        _m2.setPosition(s * WHEEL_X, WHEEL_R, 0);
        push(B.get(`gw:${nation}`, () => buildWheel(nation), 32), _m3.multiplyMatrices(root, _m2));
      }
      return;
    }

    if (f.rider) {
      const v = f.horse;
      const rk = f.rider;
      push(B.get(`hb:${v}:${nation}:${rk}`, () => buildHorseBody(v, nation, rk), 32), root);
      const gallop = amp > 0.55;
      HORSE_LEGS.forEach((leg, i) => {
        const off = leg.front ? (i % 2) * 0.5 : Math.PI + (i % 2) * 0.5;
        const a = f.dying ? 0.25 : Math.sin(f.phase + off) * (gallop ? 0.75 : 0.45) * amp;
        _m2.makeRotationX(a);
        _m2.setPosition(leg.x, HORSE_LEG_TOP, leg.z);
        push(B.get(`hl:${v}`, () => buildHorseLeg(v), 128), _m3.multiplyMatrices(root, _m2));
      });
      push(B.get(`rb:${rk}:${nation}`, () => buildRider(rk, nation), 32), root);
      let pose: RiderPose = 'rest';
      let armKind: 'hussar' | 'chasseur' | 'guidon' = rk;
      if (f.role === 'guidon') { armKind = 'guidon'; pose = 'carry'; }
      else if (rk === 'hussar') pose = now < f.poseUntil ? 'charge' : 'rest';
      else pose = f.aimFrom >= 0 && now >= f.aimFrom && now <= f.aimTo ? 'aim' : 'rest';
      const armBatch = B.get(`ra:${armKind}:${pose}:${nation}:${rk}`, () => buildRiderArm(armKind, pose, nation, rk), 32);
      if (f.slashAt >= 0 && now >= f.slashAt && now < f.slashAt + 0.45 && !f.dying) {
        const t = (now - f.slashAt) / 0.45;
        const ang = Math.sin(t * Math.PI) * 1.7;
        _m2.makeTranslation(RIDER_SHOULDER.x, RIDER_SHOULDER.y, RIDER_SHOULDER.z);
        _m2.multiply(_m3.makeRotationX(ang));
        _m2.multiply(_m3.makeTranslation(-RIDER_SHOULDER.x, -RIDER_SHOULDER.y, -RIDER_SHOULDER.z));
        push(armBatch, _m3.multiplyMatrices(root, _m2));
      } else {
        push(armBatch, root);
      }
      return;
    }

    const kind = f.foot!;
    push(B.get(`fb:${kind}:${nation}`, () => buildFootBody(kind, nation), kind === 'line' ? 192 : 48), root);
    const swing = f.dying ? 0 : Math.sin(f.phase) * 0.55 * amp;
    for (const s of [-1, 1]) {
      _m2.makeRotationX(swing * s);
      _m2.setPosition(s * LEG_X, HIP_Y, 0);
      push(B.get(`fl:${kind}:${nation}`, () => buildFootLeg(kind, nation), kind === 'line' ? 384 : 96), _m3.multiplyMatrices(root, _m2));
    }
    const pose = this.footPose(f, now);
    const armBatch = B.get(`fa:${kind}:${pose}:${nation}`, () => buildFootArms(kind, pose, nation), kind === 'line' ? 192 : 48);
    if (kind === 'drummer' && !f.dying) {
      const beat = Math.sin(now * (amp > 0.2 ? 14 : 4) + f.rnd * 6) * (amp > 0.2 ? 0.12 : 0.03);
      _m2.makeTranslation(0, 0.3, 0);
      _m2.multiply(_m3.makeRotationX(beat));
      _m2.multiply(_m3.makeTranslation(0, -0.3, 0));
      push(armBatch, _m3.multiplyMatrices(root, _m2));
    } else {
      push(armBatch, root);
    }
  }

  private toCorpse(f: Figure) {
    this.emit(f, f.deathStart + 1, (b, m) => this.ctx.corpses.add(b, m));
  }

  private updateFlag(now: number) {
    if (!this.flag) return;
    const bearer = this.figures.find(f => f.role === 'bearer' || f.role === 'guidon');
    if (!bearer || bearer.dying) {
      this.flag.visible = false;
      return;
    }
    this.flag.visible = true;
    this.figureMatrix(bearer, _m, now);
    const anchor = bearer.rider ? GUIDON_ANCHOR : FLAG_ANCHOR;
    _v.copy(anchor).applyMatrix4(_m);
    this.flag.position.copy(_v);
    // Streams with the wind, and behind the bearer when on the move.
    const wx = 0.9 - this.vel.x * 0.6, wz = 0.35 - this.vel.y * 0.6;
    this.flag.rotation.set(0, Math.atan2(-wz, wx) + Math.sin(now * 0.7 + this.seed) * 0.2, 0);
  }

  private updateWorks(dt: number) {
    const d = this.data;
    const wantWorks = d.isEntrenched && !this.destroyed;
    if (wantWorks && !this.works) {
      this.works = new THREE.Mesh(buildEarthworks(this.formationWidth()), this.ctx.batches.material);
      this.works.castShadow = true;
      this.works.receiveShadow = true;
      this.ctx.group.add(this.works);
      this.worksT = 0;
    }
    if (this.works) {
      this.worksT = clamp(this.worksT + (wantWorks ? dt * 0.8 : -dt * 1.2), 0, 1);
      const h = this.heading;
      this.works.position.set(this.anchor.x, this.ctx.model.ground(this.anchor.x + Math.sin(h) * 0.36, this.anchor.y + Math.cos(h) * 0.36) - 0.03, this.anchor.y);
      this.works.rotation.y = h;
      this.works.scale.set(1, Math.max(0.001, ease(this.worksT)), 1);
      if (!wantWorks && this.worksT <= 0) {
        this.works.geometry.dispose();
        this.works.removeFromParent();
        this.works = null;
      }
    }
    const wantPal = d.isPalisaded && !this.destroyed;
    if (wantPal && !this.pal) {
      this.pal = new THREE.Mesh(buildPalisade(), this.ctx.batches.material);
      this.pal.castShadow = true;
      this.ctx.group.add(this.pal);
      this.palT = 0;
    }
    if (this.pal) {
      this.palT = clamp(this.palT + (wantPal ? dt * 0.9 : -dt * 1.2), 0, 1);
      const gun = this.figures.find(f => f.gun);
      const cx = gun ? gun.x : this.anchor.x, cz = gun ? gun.z : this.anchor.y;
      this.pal.position.set(cx, this.ctx.model.ground(cx, cz) - 0.02, cz);
      this.pal.rotation.y = facingToHeading(d.facing);
      this.pal.scale.set(1, Math.max(0.001, ease(this.palT)), 1);
      if (!wantPal && this.palT <= 0) {
        this.pal.geometry.dispose();
        this.pal.removeFromParent();
        this.pal = null;
      }
    }
  }

  private updateLabel() {
    const d = this.data;
    const spent = d.mp <= 0 && d.hasAttacked;
    const sig = `${d.men}|${d.mp}|${d.maxMp}|${d.hasAttacked}|${d.isEntrenched}|${d.isBoxFormation}|${d.isPalisaded}|${this.selected}|${this.hovered}|${this.destroyed}`;
    if (sig === this.labelSig) return;
    this.labelSig = sig;
    const pct = Math.round((d.men / d.maxMen) * 100);
    const status = [d.isEntrenched ? '⛨' : '', d.isBoxFormation ? '◻' : '', d.isPalisaded ? '⋔' : ''].join('');
    const mp = Math.max(0, Math.round(d.mp * 2) / 2);
    this.labelEl.className = `rg-label${this.selected ? ' sel' : ''}${this.hovered ? ' hov' : ''}${spent ? ' spent' : ''}${this.destroyed ? ' dead' : ''}`;
    this.labelEl.style.setProperty('--team', NATION_CSS[this.nation]);
    this.labelEl.innerHTML = this.destroyed
      ? `<div class="rg-row"><span class="rg-id">${d.id}</span><span class="rg-st">routed</span></div>`
      : `<div class="rg-row"><span class="rg-ico">${GLYPH[d.type]}</span>${idHtml(d.id)}${status ? `<span class="rg-st">${status}</span>` : ''}</div>` +
        `<div class="rg-bar"><i style="width:${pct}%"></i></div>` +
        `<div class="rg-sub"><span>${d.men}</span><span>${mp}/${d.maxMp} MP${d.hasAttacked ? ' · fired' : ''}</span></div>`;
    this.labelEl.title = `${d.name} — ${d.type.replace('_', ' ')}`;
  }

  /** Axis-aligned pick box around the formation. */
  hitBox(out: THREE.Box3) {
    const gy = this.ctx.model.ground(this.anchor.x, this.anchor.y);
    out.min.set(this.anchor.x - 0.9, gy - 0.2, this.anchor.y - 0.9);
    out.max.set(this.anchor.x + 0.9, gy + 0.85, this.anchor.y + 0.9);
    return out;
  }

  setLabelVisible(v: boolean) {
    this.labelEl.style.display = v ? '' : 'none';
  }

  dispose() {
    this.label.removeFromParent();
    this.labelEl.remove();
    if (this.flag) {
      this.flag.removeFromParent();
      disposeFlagMesh(this.flag);
    }
    if (this.works) { this.works.geometry.dispose(); this.works.removeFromParent(); }
    if (this.pal) { this.pal.geometry.dispose(); this.pal.removeFromParent(); }
  }
}
