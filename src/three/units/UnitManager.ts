import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { GameAnimation, GameState, Regiment } from '../../game/types';
import { findPath } from '../../game/engine';
import { TILE, tileCenter } from '../core/constants';
import { BattleAudio } from '../scene/audio';
import { Effects } from '../scene/effects';
import { Obstacles } from '../world/obstacles';
import { TerrainModel } from '../world/TerrainModel';
import { BatchSet } from './batches';
import { Corpses, RegimentVisual, UnitContext } from './RegimentVisual';

export interface ActionEvent {
  kind: 'attack' | 'move' | 'spawn' | 'destroyed';
  from: THREE.Vector3;
  to: THREE.Vector3;
}

interface Popup { obj: CSS2DObject; until: number }

/**
 * Keeps one RegimentVisual per regiment in the game state, turns the engine's
 * animation events into volleys / charges / cannon fire, and schedules the
 * casualties so men fall when the shot actually lands.
 */
export class UnitManager {
  readonly group = new THREE.Group();
  private regs = new Map<string, RegimentVisual>();
  private fading: RegimentVisual[] = [];
  private batches: BatchSet;
  private corpses = new Corpses();
  private seen = new Set<string>();
  private time = 0;
  private initialized = false;
  private popups: Popup[] = [];
  private pending: { at: number; fn: () => void }[] = [];
  private ctx: UnitContext;
  private box = new THREE.Box3();
  private hit = new THREE.Vector3();
  private labelsVisible = true;

  constructor(
    scene: THREE.Scene,
    private model: TerrainModel,
    obstacles: Obstacles,
    private effects: Effects,
    private audio: BattleAudio,
    private onAction: (e: ActionEvent) => void,
    onLabelClick: (x: number, y: number) => void,
    shake: (pos: THREE.Vector3, amount: number) => void,
  ) {
    this.batches = new BatchSet(this.group);
    this.ctx = { model, obstacles, batches: this.batches, effects, audio, group: this.group, corpses: this.corpses, onLabelClick, shake };
    scene.add(this.group);
  }

  get now() {
    return this.time;
  }

  private at(x: number, y: number, list: Iterable<RegimentVisual>) {
    for (const v of list) if (!v.destroyed && v.data.x === x && v.data.y === y) return v;
    return undefined;
  }

  sync(state: GameState) {
    const now = this.time;
    if (!this.initialized) {
      this.initialized = true;
      for (const a of state.animations) this.seen.add(a.id);
      for (const r of state.regiments) this.regs.set(r.id, new RegimentVisual(this.ctx, r));
      this.applySelection(state, null);
      return;
    }

    // 1. Battle events. Attack events refer to tiles; resolve them against the
    // visuals' last-known positions (targets may have just been destroyed).
    const fresh: GameAnimation[] = [];
    for (const a of state.animations) {
      if (this.seen.has(a.id)) continue;
      this.seen.add(a.id);
      fresh.push(a);
    }
    if (this.seen.size > 600) this.seen = new Set([...this.seen].slice(-300));

    const damages = fresh.filter(a => a.type === 'damage');
    const ids = new Set(state.regiments.map(r => r.id));
    for (const a of fresh) {
      if (a.type !== 'attack' || a.toX === undefined || a.toY === undefined) continue;
      const attacker = this.at(a.fromX, a.fromY, this.regs.values());
      const target = this.at(a.toX, a.toY, this.regs.values());
      if (!attacker) continue;
      const tc = tileCenter(a.toX, a.toY);
      const tpos = target ? target.pos3() : new THREE.Vector3(tc.x, this.model.ground(tc.x, tc.z), tc.z);
      const impact = attacker.attack(tpos, now);
      if (target) target.impactAt = Math.max(target.impactAt, impact);
      const counter = damages.some(d => d.fromX === a.fromX && d.fromY === a.fromY);
      if (counter && target && ids.has(target.id)) {
        const back = target.attack(attacker.pos3(), now, Math.max(0, impact - now) + 0.25);
        attacker.impactAt = Math.max(attacker.impactAt, back);
      }
      this.onAction({ kind: 'attack', from: attacker.pos3(), to: tpos });
    }
    for (const d of damages) {
      const v = this.at(d.fromX, d.fromY, this.regs.values());
      const when = Math.max(now, v ? v.impactAt : now);
      const c = tileCenter(d.fromX, d.fromY);
      const pos = new THREE.Vector3(c.x, this.model.ground(c.x, c.z) + 0.75, c.z);
      this.pending.push({ at: when, fn: () => this.popup(pos, `−${d.damage ?? 0}`, 'dmg') });
    }
    for (const a of fresh) {
      if (a.type === 'box_formation') {
        const v = this.at(a.fromX, a.fromY, this.regs.values());
        if (v) this.audio.drum(v.pos3());
      }
    }

    // 2. Regiments: create, update, destroy.
    for (const r of state.regiments) {
      const v = this.regs.get(r.id);
      if (!v) {
        const cc = this.findCommandCentre(state, r.owner);
        const nv = new RegimentVisual(this.ctx, r, { spawnFrom: cc ?? undefined });
        nv.setLabelVisible(this.labelsVisible);
        this.regs.set(r.id, nv);
        this.audio.bugle(nv.pos3());
        this.onAction({ kind: 'spawn', from: nv.pos3(), to: nv.pos3() });
        continue;
      }
      const old = v.data;
      let path: { x: number; y: number }[] | null = null;
      if (old.x !== r.x || old.y !== r.y) {
        path = this.pathFor(old, r, state);
        const c = tileCenter(r.x, r.y);
        this.onAction({ kind: 'move', from: v.pos3(), to: new THREE.Vector3(c.x, this.model.ground(c.x, c.z), c.z) });
      }
      v.setData(r, path);
    }
    for (const [id, v] of this.regs) {
      if (ids.has(id)) continue;
      v.destroy(Math.max(now, v.impactAt));
      this.regs.delete(id);
      this.fading.push(v);
      const p = v.pos3();
      this.pending.push({ at: Math.max(now, v.impactAt) + 0.2, fn: () => this.popup(p.clone().setY(p.y + 1.0), 'ROUTED', 'routed') });
      this.onAction({ kind: 'destroyed', from: p, to: p });
    }
  }

  /** Mirrors the route the engine's `mv` took so units march the real path. */
  private pathFor(old: Regiment, r: Regiment, state: GameState) {
    if (Math.abs(old.x - r.x) <= 1 && Math.abs(old.y - r.y) <= 1) return [{ x: r.x, y: r.y }];
    const others = state.regiments.filter(o => o.id !== r.id);
    const res = findPath({ x: old.x, y: old.y }, { x: r.x, y: r.y }, { ...r, x: old.x, y: old.y }, others, state.map);
    return res && res.path.length ? res.path : [{ x: r.x, y: r.y }];
  }

  private findCommandCentre(state: GameState, owner: number) {
    for (const row of state.map) for (const t of row) {
      if (t.terrain === 'command_center' && t.owner === owner) return tileCenter(t.x, t.y);
    }
    return null;
  }

  applySelection(state: GameState, hover: { x: number; y: number } | null) {
    for (const v of this.regs.values()) {
      v.setSelected(v.id === state.selectedUnitId, !!hover && v.data.x === hover.x && v.data.y === hover.y);
    }
  }

  private popup(pos: THREE.Vector3, text: string, cls: string) {
    // CSS2DRenderer positions the outer element with an inline transform, so
    // the rise animation lives on an inner element.
    const el = document.createElement('div');
    const inner = document.createElement('div');
    inner.className = `rg-pop ${cls}`;
    inner.textContent = text;
    el.appendChild(inner);
    el.style.pointerEvents = 'none';
    const obj = new CSS2DObject(el);
    obj.position.copy(pos);
    this.group.add(obj);
    this.popups.push({ obj, until: this.time + 1.9 });
  }

  setLabelsVisible(v: boolean) {
    this.labelsVisible = v;
    for (const r of this.regs.values()) r.setLabelVisible(v);
  }

  update(dt: number) {
    this.time += dt;
    const now = this.time;
    if (this.pending.length) {
      const due = this.pending.filter(p => p.at <= now);
      if (due.length) {
        this.pending = this.pending.filter(p => p.at > now);
        for (const p of due) p.fn();
      }
    }
    for (const v of this.regs.values()) v.update(dt, now);
    for (const v of this.fading) v.update(dt, now);
    this.fading = this.fading.filter(v => {
      if (!v.finished) return true;
      v.dispose();
      return false;
    });
    this.corpses.push();
    this.batches.commit();
    this.popups = this.popups.filter(p => {
      if (p.until > now) return true;
      p.obj.removeFromParent();
      p.obj.element.remove();
      return false;
    });
  }

  /** Regiment id under a ray, if any. */
  pick(ray: THREE.Ray): Regiment | null {
    let best: RegimentVisual | null = null;
    let bd = Infinity;
    for (const v of this.regs.values()) {
      if (!ray.intersectBox(v.hitBox(this.box), this.hit)) continue;
      const d = this.hit.distanceTo(ray.origin);
      if (d < bd) { bd = d; best = v; }
    }
    return best ? best.data : null;
  }

  positionOf(id: string) {
    const v = this.regs.get(id);
    return v ? v.pos3() : null;
  }

  dispose() {
    for (const v of this.regs.values()) v.dispose();
    for (const v of this.fading) v.dispose();
    for (const p of this.popups) { p.obj.removeFromParent(); p.obj.element.remove(); }
    this.regs.clear();
    this.batches.dispose();
    this.group.removeFromParent();
  }

  get labelsOn() {
    return this.labelsVisible;
  }

  static tileOf(x: number, z: number) {
    return { x: Math.floor(x / TILE), y: Math.floor(z / TILE) };
  }
}
