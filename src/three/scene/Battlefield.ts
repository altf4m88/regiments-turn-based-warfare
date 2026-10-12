import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { GameState } from '../../game/types';
import { nationOf } from '../../game/engine';
import { MAP_N, TILE, inMap, tileCenter } from '../core/constants';
import { flagUniforms } from '../models/flags';
import { ActionEvent, UnitManager } from '../units/UnitManager';
import { Environment, SUN_DIR } from '../world/environment';
import { Obstacles } from '../world/obstacles';
import { Scenery } from '../world/scenery';
import { TerrainModel } from '../world/TerrainModel';
import { buildTerrainMesh, buildWater, createOverlay } from '../world/terrainMesh';
import { BattleAudio } from './audio';
import { CameraRig } from './CameraRig';
import { Effects } from './effects';
import { HoverInfo, Reach, paintOverlay } from './highlights';

export interface BattlefieldOptions {
  labels: boolean;
  grid: boolean;
  follow: boolean;
  sound: boolean;
  quality: 'high' | 'low';
}

export interface CameraView {
  target: { x: number; z: number };
  corners: { x: number; z: number }[];
}

export interface BattlefieldCallbacks {
  onTileClick: (x: number, y: number) => void;
  onHover: (info: HoverInfo | null, screen: { x: number; y: number } | null) => void;
  onCamera?: (view: CameraView) => void;
  onReady?: () => void;
}

const signature = (state: GameState) =>
  `${nationOf(state, 1)}:${nationOf(state, 2)}|` + state.map.map(r => r.map(t => t.terrain.slice(0, 3)).join('')).join('/');

/**
 * Owns the WebGL renderer and the whole 3D battlefield. React feeds it game
 * state; it reports clicks and hovers back in tile coordinates.
 */
export class Battlefield {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private rig: CameraRig;
  private env: Environment;
  private audio: BattleAudio;
  private effects: Effects;
  private overlay = createOverlay();
  private model: TerrainModel | null = null;
  private obstacles = new Obstacles();
  private terrain: THREE.Mesh | null = null;
  private water: { mesh: THREE.Mesh; heightTex: THREE.Texture } | null = null;
  private scenery: Scenery | null = null;
  private units: UnitManager | null = null;
  private sig = '';
  private state: GameState | null = null;
  private hover: { x: number; y: number } | null = null;
  private mouse: { x: number; y: number } | null = null;
  private mouseDirty = false;
  private overlayDirty = true;
  private reachCache: { id: string; sig: string; reach: Reach } | null = null;
  private down: { x: number; y: number; button: number; t: number } | null = null;
  private raf = 0;
  private last = performance.now();
  private time = 0;
  private rotationDeg: number | null = null;
  private cameraTick = 0;
  private lastFollow = 0;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private resizeObs: ResizeObserver;
  private disposed = false;
  private opts: BattlefieldOptions;

  constructor(private container: HTMLElement, private cb: BattlefieldCallbacks, opts: BattlefieldOptions) {
    this.opts = { ...opts };
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'bf-canvas';
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'bf-labels';
    container.appendChild(this.labels.domElement);

    this.rig = new CameraRig(this.renderer.domElement);
    this.audio = new BattleAudio(this.rig.camera);
    this.env = new Environment(this.scene, 2048);
    this.effects = new Effects(this.scene, (x, z) => (this.model ? this.model.ground(x, z) : 0));
    this.applyQuality();

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('dblclick', this.onDblClick);
    window.addEventListener('keydown', this.onKey);

    // Handy for debugging and scripted screenshots during development.
    if (import.meta.env.DEV) (window as unknown as { __bf: Battlefield }).__bf = this;

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.raf = requestAnimationFrame(this.loop);
  }

  // -- public API --------------------------------------------------------------

  update(state: GameState) {
    const sig = signature(state);
    const reset = this.state && state.turn < this.state.turn;
    const rebuilt = sig !== this.sig || !!reset;
    if (rebuilt) {
      this.sig = sig;
      this.buildWorld(state);
      this.focusOnPlayer(state.currentPlayer, false);
    } else if (this.state && state.currentPlayer !== this.state.currentPlayer && !state.winner) {
      this.turnCamera(state);
    }
    const prev = rebuilt ? null : this.state;
    this.state = state;
    this.units!.sync(state);
    this.units!.applySelection(state, this.hover);
    const changes = this.scenery!.updateOwners(state.map, state.capturePointOwner);
    if (prev) this.playCues(prev, state, changes);
    this.overlayDirty = true;
  }

  /** Bugle calls for captures, a flare-up as each capture-point brazier is lit, a fanfare for victory. */
  private playCues(prev: GameState, state: GameState, changes: { terrain: string; owner: number; pos: THREE.Vector3 }[]) {
    for (const c of changes) {
      if (c.owner === 0) continue;
      if (c.terrain === 'capture_point') this.audio.bugle(c.pos, 'capture');
      else if (c.terrain === 'supply_node') this.audio.bugle(c.pos, 'depot');
    }
    const held = (s: GameState) => (s.capturePointOwner ? s.capturePointTurns : 0);
    const before = held(prev), now = held(state);
    if (now > before && this.scenery) {
      const p = this.scenery.braziers[Math.min(now, this.scenery.braziers.length) - 1];
      if (p) {
        this.audio.ignite(p);
        for (let i = 0; i < 14; i++) this.effects.fire(p, 1.6);
        this.effects.sparks(p, 12);
      }
    }
    if (state.winner && !prev.winner) this.audio.bugle(null, 'victory', 0.4);
  }

  setOptions(opts: Partial<BattlefieldOptions>) {
    const prevQuality = this.opts.quality;
    this.opts = { ...this.opts, ...opts };
    this.overlay.uniforms.uGrid.value = this.opts.grid ? 0.55 : 0;
    this.units?.setLabelsVisible(this.opts.labels);
    this.labels.domElement.style.display = this.opts.labels ? '' : 'none';
    this.audio.setEnabled(this.opts.sound);
    if (prevQuality !== this.opts.quality) this.applyQuality();
  }

  /**
   * Mirrors the 2D view's map rotation. A ±90° step is the "Rotate View" button
   * and turns the camera relative to where it is; any other change is the AI
   * mode switching sides (0 = player 1, 180 = player 2), applied absolutely.
   */
  setRotation(deg: number) {
    const prev = this.rotationDeg;
    if (prev === deg) return;
    this.rotationDeg = deg;
    if (prev === null) return;
    const delta = ((((deg - prev) % 360) + 540) % 360) - 180;
    if (Math.abs(Math.abs(delta) - 90) < 1) this.rig.rotateBy((delta * Math.PI) / 180);
    else this.rig.rotateTo((deg * Math.PI) / 180);
  }

  /** New turn: swing round behind the army whose turn it is, looking towards the enemy. */
  private turnCamera(state: GameState) {
    const player = state.currentPlayer;
    const mine = state.regiments.filter(r => r.owner === player);
    let cx = (MAP_N * TILE) / 2, cz = player === 2 ? TILE * 4 : MAP_N * TILE - TILE * 4;
    if (mine.length) {
      cx = mine.reduce((a, r) => a + (r.x + 0.5) * TILE, 0) / mine.length;
      cz = mine.reduce((a, r) => a + (r.y + 0.5) * TILE, 0) / mine.length;
    }
    const ahead = player === 2 ? 1 : -1;
    const lo = TILE * 2, hi = MAP_N * TILE - TILE * 2;
    const x = Math.min(hi, Math.max(lo, cx));
    const z = Math.min(hi, Math.max(lo, cz + ahead * TILE * 3));
    const y = this.model ? this.model.ground(x, z) : 0;
    this.rig.flyTo(new THREE.Vector3(x, y, z), { azimuth: player === 2 ? Math.PI : 0, distance: 30, polar: 0.9, duration: 1.5 });
  }

  focusTile(tx: number, ty: number, opts: { distance?: number; polar?: number; azimuth?: number; duration?: number } = {}) {
    const c = tileCenter(tx, ty);
    const y = this.model ? this.model.ground(c.x, c.z) : 0;
    this.rig.flyTo(new THREE.Vector3(c.x, y, c.z), { distance: Math.min(this.rig.distance, 18), duration: 0.9, ...opts });
  }

  focusWorld(x: number, z: number) {
    this.rig.flyTo(new THREE.Vector3(x, this.model ? this.model.ground(x, z) : 0, z), { duration: 0.6 });
  }

  overview() {
    const az = ((this.rotationDeg ?? 0) * Math.PI) / 180;
    this.rig.flyTo(new THREE.Vector3(MAP_N * TILE / 2, 0, MAP_N * TILE / 2), { distance: 52, polar: 0.78, azimuth: az, duration: 1.2 });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('dblclick', this.onDblClick);
    window.removeEventListener('keydown', this.onKey);
    this.disposeWorld();
    this.effects.dispose();
    this.env.dispose();
    this.audio.dispose();
    this.rig.dispose();
    this.overlay.tex.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    el.remove();
    this.labels.domElement.remove();
  }

  // -- world ---------------------------------------------------------------------

  private disposeWorld() {
    this.units?.dispose();
    this.units = null;
    this.scenery?.dispose();
    this.scenery = null;
    if (this.terrain) {
      this.terrain.removeFromParent();
      this.terrain.geometry.dispose();
      (this.terrain.material as THREE.Material).dispose();
      this.terrain = null;
    }
    if (this.water) {
      this.water.mesh.removeFromParent();
      this.water.mesh.geometry.dispose();
      (this.water.mesh.material as THREE.Material).dispose();
      this.water.heightTex.dispose();
      this.water = null;
    }
    this.effects.clear();
    this.obstacles.clear();
  }

  private buildWorld(state: GameState) {
    this.disposeWorld();
    this.model = new TerrainModel(state.map);
    this.terrain = buildTerrainMesh(this.model, this.overlay.uniforms);
    this.scene.add(this.terrain);
    this.water = buildWater(this.model, this.overlay.uniforms, SUN_DIR);
    this.scene.add(this.water.mesh);
    this.scenery = new Scenery(this.model, this.obstacles, { 1: nationOf(state, 1), 2: nationOf(state, 2) });
    this.scene.add(this.scenery.group);
    this.units = new UnitManager(
      this.scene,
      this.model,
      this.obstacles,
      this.effects,
      this.audio,
      e => this.onAction(e),
      (x, y) => this.cb.onTileClick(x, y),
      (pos, amount) => {
        const d = this.rig.camera.position.distanceTo(pos);
        this.rig.addShake(amount * Math.max(0, 1 - d / 40));
      },
    );
    this.units.setLabelsVisible(this.opts.labels);
    this.reachCache = null;
    this.cb.onReady?.();
  }

  private focusOnPlayer(player: number, animate: boolean) {
    const az = player === 2 ? Math.PI : 0;
    const target = new THREE.Vector3(MAP_N * TILE / 2, 0, MAP_N * TILE / 2 + (player === 2 ? -8 : 8));
    if (animate) this.rig.flyTo(target, { azimuth: az, distance: 34, polar: 0.86 });
    else this.rig.flyTo(target, { azimuth: az, distance: 34, polar: 0.86, duration: 0.01 });
  }

  private onAction(e: ActionEvent) {
    if (!this.opts.follow) return;
    if (this.rig.idleMs < 4000) return;
    const now = this.time;
    if (now - this.lastFollow < 1.0 && e.kind === 'move') return;
    this.lastFollow = now;
    const mid = e.from.clone().lerp(e.to, 0.5);
    const span = e.from.distanceTo(e.to);
    const dist = Math.min(Math.max(14, span * 1.6 + 10), 30);
    this.rig.flyTo(mid, { distance: Math.min(this.rig.distance, dist) < 10 ? 12 : dist, duration: 0.9 });
  }

  private applyQuality() {
    const high = this.opts.quality === 'high';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1));
    this.env.sun.castShadow = high;
    this.effects.density = high ? 1 : 0.5;
    this.resize();
  }

  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.labels.setSize(w, h);
    this.rig.resize(w, h);
  }

  // -- input -----------------------------------------------------------------------

  private onPointerDown = (e: PointerEvent) => {
    this.audio.unlock();
    this.down = { x: e.clientX, y: e.clientY, button: e.button, t: performance.now() };
  };

  private onPointerMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    this.mouseDirty = true;
  };

  private onPointerLeave = () => {
    this.mouse = null;
    this.mouseDirty = true;
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || d.button !== e.button) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
    if (e.button !== 0 && e.button !== 2) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const tile = this.pickTile(e.clientX - r.left, e.clientY - r.top);
    if (tile && inMap(tile.x, tile.y)) this.cb.onTileClick(tile.x, tile.y);
  };

  private onDblClick = (e: MouseEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    const tile = this.pickTile(e.clientX - r.left, e.clientY - r.top);
    if (tile) this.focusTile(tile.x, tile.y);
  };

  private onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (e.key === 'f' || e.key === 'F') {
      const sel = this.state?.regiments.find(r => r.id === this.state?.selectedUnitId);
      if (sel) this.focusTile(sel.x, sel.y);
    } else if (e.key === 'Home') {
      this.overview();
    }
  };

  private pickTile(px: number, py: number) {
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    this.ndc.set((px / w) * 2 - 1, -(py / h) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.rig.camera);
    const reg = this.units?.pick(this.raycaster.ray);
    if (reg) return { x: reg.x, y: reg.y };
    const p = this.rayGround(this.raycaster.ray);
    if (!p) return null;
    return { x: Math.floor(p.x / TILE), y: Math.floor(p.z / TILE) };
  }

  /** Ray-marches the height field (much cheaper than triangle raycasts). */
  private rayGround(ray: THREE.Ray) {
    if (!this.model) return null;
    const o = ray.origin, d = ray.direction;
    if (d.y > -0.001) return null;
    let t = Math.max(0, (o.y - 4) / -d.y);
    const step = 0.2;
    let prev = t;
    for (let i = 0; i < 1500; i++) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y <= this.model.ground(x, z)) {
        let lo = prev, hi = t;
        for (let k = 0; k < 8; k++) {
          const m = (lo + hi) / 2;
          const yy = o.y + d.y * m;
          if (yy <= this.model.ground(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m;
        }
        return new THREE.Vector3(o.x + d.x * hi, o.y + d.y * hi, o.z + d.z * hi);
      }
      prev = t;
      t += step;
    }
    return null;
  }

  // -- frame loop ----------------------------------------------------------------------

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const nowMs = performance.now();
    const dt = Math.min(0.05, (nowMs - this.last) / 1000);
    this.last = nowMs;
    if (this.paused) return;
    this.simulate(dt);
    this.render();
  };

  /** Dev/testing: freeze the real-time loop and step the simulation explicitly. */
  paused = false;

  advance(seconds: number, fps = 30) {
    const steps = Math.max(1, Math.round(seconds * fps));
    for (let i = 0; i < steps; i++) this.simulate(1 / fps);
    this.render();
  }

  private render() {
    this.renderer.render(this.scene, this.rig.camera);
    if (this.opts.labels && this.model) this.labels.render(this.scene, this.rig.camera);
  }

  private simulate(dt: number) {
    this.time += dt;
    const t = this.time;
    const model = this.model;
    if (!model || !this.units || !this.scenery || !this.state) return;

    this.rig.update(dt, (x, z) => model.ground(x, z));
    this.env.fitShadow(this.rig.controls.target, this.rig.distance * 0.8 + 6);
    this.env.update(dt);

    if (this.mouseDirty) {
      this.mouseDirty = false;
      const tile = this.mouse ? this.pickTile(this.mouse.x, this.mouse.y) : null;
      const next = tile && inMap(tile.x, tile.y) ? tile : null;
      if (next?.x !== this.hover?.x || next?.y !== this.hover?.y) {
        this.hover = next;
        this.overlayDirty = true;
        this.units.applySelection(this.state, this.hover);
      }
    }
    if (this.overlayDirty) {
      this.overlayDirty = false;
      const res = paintOverlay(this.overlay.data, this.state, this.hover, this.reachCache);
      this.reachCache = res.reachCache;
      this.overlay.tex.needsUpdate = true;
      const sel = this.state.regiments.find(r => r.id === this.state!.selectedUnitId);
      this.overlay.uniforms.uSelected.value.set(sel ? sel.x : -99, sel ? sel.y : -99);
      this.overlay.uniforms.uHover.value.set(this.hover ? this.hover.x : -99, this.hover ? this.hover.y : -99);
      this.cb.onHover(res.hover, this.mouse);
    }

    this.overlay.uniforms.uTime.value = t;
    flagUniforms.uTime.value = t;
    this.scenery.update(dt, t);

    // Capture point braziers: one lit per turn held.
    const held = this.state.capturePointOwner ? this.state.capturePointTurns : 0;
    this.scenery.braziers.forEach((p, i) => {
      if (i < held && Math.random() < 0.7) this.effects.fire(p, 1);
    });
    this.effects.campfires(this.scenery.campfires, dt);

    this.units.update(dt);
    this.effects.update(dt);

    this.cameraTick += dt;
    if (this.cameraTick > 0.12 && this.cb.onCamera) {
      this.cameraTick = 0;
      this.cb.onCamera(this.cameraView());
    }
  }

  private cameraView(): CameraView {
    const cam = this.rig.camera;
    const corners: { x: number; z: number }[] = [];
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.ndc.set(x, y);
      this.raycaster.setFromCamera(this.ndc, cam);
      const r = this.raycaster.ray;
      let t = r.direction.y < -0.02 ? (0 - r.origin.y) / r.direction.y : 120;
      t = Math.min(t, 120);
      corners.push({ x: r.origin.x + r.direction.x * t, z: r.origin.z + r.direction.z * t });
    }
    const tg = this.rig.controls.target;
    return { target: { x: tg.x, z: tg.z }, corners };
  }
}
