import * as THREE from 'three';
import { Tile } from '../../game/types';
import { BORDER, BRIDGE_WIDTH, MAP_N, NATION_CSS, TILE, WATER_LEVEL, WIND, inMap, tileCenter } from '../core/constants';
import { Nation } from '../../game/types';
import { ARMY_COAT } from '../models/uniforms';
import { hash2, makeRng } from '../core/noise';
import * as P from '../models/propModels';
import { buildGun, buildHorseBody, buildHorseLeg, buildWheel, HORSE_LEGS, HORSE_LEG_TOP, WHEEL_R, WHEEL_X } from '../models/unitModels';
import { makeBannerTexture, makeFlagMesh } from '../models/flags';
import { Obstacles } from './obstacles';
import { TerrainModel } from './TerrainModel';

export const swayUniforms = { uTime: { value: 0 } };

const makeSwayMaterial = (strength: number, minY: number, key: string) => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = swayUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #else
          vec2 ip = vec2(0.0);
        #endif
        float sw = max(position.y - ${minY.toFixed(3)}, 0.0);
        sw *= sw;
        transformed.x += (sin(uTime * 1.5 + ip.x * 0.8 + ip.y * 0.3) * 0.7 + 0.5) * ${strength.toFixed(4)} * sw;
        transformed.z += cos(uTime * 1.13 + ip.y * 0.7 + ip.x * 0.2) * ${(strength * 0.6).toFixed(4)} * sw;`);
  };
  m.customProgramCacheKey = () => key;
  return m;
};

interface InstanceSet {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  mats: THREE.Matrix4[];
  colors: THREE.Color[];
  cast: boolean;
}

export interface Banner {
  mesh: THREE.Mesh;
  pole: THREE.Vector3;
  height: number;
  owner: number;
  raise: number;
  tx: number;
  ty: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/** Everything that is not a soldier: forests, villages, camps, depots, bridges, mills. */
export class Scenery {
  readonly group = new THREE.Group();
  readonly banners: Banner[] = [];
  readonly braziers: THREE.Vector3[] = [];
  readonly campfires: THREE.Vector3[] = [];
  private captureRing: THREE.Mesh | null = null;
  private sails: THREE.Mesh[] = [];
  private sets = new Map<string, InstanceSet>();
  private geos = new Map<string, THREE.BufferGeometry>();
  private disposables: { dispose(): void }[] = [];
  private bannerTex: Record<number, THREE.Texture> = {};
  private propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 });
  private treeMat = makeSwayMaterial(0.035, 0.3, 'tree-sway');
  private grassMat = makeSwayMaterial(2.2, 0.0, 'grass-sway');

  constructor(private model: TerrainModel, private obstacles: Obstacles, private nations: { [player: number]: Nation }) {
    this.disposables.push(this.propMat, this.treeMat, this.grassMat);
    for (const o of [0, 1, 2]) {
      this.bannerTex[o] = makeBannerTexture(o === 0 ? null : nations[o]);
      this.disposables.push(this.bannerTex[o]);
    }
    this.placeVegetation();
    this.placeVillages();
    this.placeStrategicSites();
    this.placeCamps();
    this.placeBridges();
    this.placeRoadside();
    this.placeWindmills();
    this.flush();
  }

  // -- helpers ---------------------------------------------------------------

  private geo(key: string, make: () => THREE.BufferGeometry) {
    let g = this.geos.get(key);
    if (!g) { g = make(); this.geos.set(key, g); this.disposables.push(g); }
    return g;
  }

  private put(key: string, geo: () => THREE.BufferGeometry, x: number, z: number, rotY = 0, scale = 1, opts: { mat?: THREE.Material; cast?: boolean; y?: number; color?: THREE.Color; tilt?: number } = {}) {
    let set = this.sets.get(key);
    if (!set) {
      set = { geo: this.geo(key, geo), mat: opts.mat ?? this.propMat, mats: [], colors: [], cast: opts.cast ?? true };
      this.sets.set(key, set);
    }
    const y = opts.y ?? this.model.ground(x, z);
    _e.set(opts.tilt ?? 0, rotY, 0);
    _q.setFromEuler(_e);
    set.mats.push(new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(scale, scale, scale)));
    if (opts.color) set.colors.push(opts.color);
  }

  private flush() {
    for (const [key, set] of this.sets) {
      if (set.mats.length === 0) continue;
      const mesh = new THREE.InstancedMesh(set.geo, set.mat, set.mats.length);
      set.mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      if (set.colors.length === set.mats.length) set.colors.forEach((c, i) => mesh.setColorAt(i, c));
      mesh.castShadow = set.cast;
      mesh.receiveShadow = true;
      mesh.name = key;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.disposables.push(mesh);
    }
    this.sets.clear();
  }

  private single(geo: THREE.BufferGeometry, x: number, y: number, z: number, rotY = 0, cast = true) {
    const mesh = new THREE.Mesh(geo, this.propMat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.disposables.push(geo);
    return mesh;
  }

  private nearMap(tx: number, ty: number, d: number) {
    return tx >= -d && ty >= -d && tx < MAP_N + d && ty < MAP_N + d;
  }

  private gridValue(arr: Float32Array, x: number, z: number) {
    const m = this.model;
    const gx = Math.round((x - m.gridX(0)) / m.step), gz = Math.round((z - m.gridX(0)) / m.step);
    if (gx < 0 || gz < 0 || gx >= m.vn || gz >= m.vn) return 0;
    return arr[gz * m.vn + gx];
  }

  private dry(x: number, z: number, margin = 0.05) {
    return this.model.height(x, z) > WATER_LEVEL + margin;
  }

  // -- vegetation ------------------------------------------------------------

  private placeVegetation() {
    const m = this.model;
    const tree = (kind: number, x: number, z: number, scale: number, rng: () => number, cast: boolean) => {
      const geo = kind === 0 ? P.buildConifer : kind === 1 ? () => P.buildOak(cast ? 1 : 0) : P.buildPoplar;
      const key = `tree${kind}${cast ? '' : '-far'}`;
      this.put(key, geo, x, z, rng() * Math.PI * 2, scale, { mat: this.treeMat, cast, y: m.height(x, z) - 0.03, tilt: (rng() - 0.5) * 0.08 });
    };

    for (let ty = -BORDER; ty < MAP_N + BORDER; ty++) {
      for (let tx = -BORDER; tx < MAP_N + BORDER; tx++) {
        const t = m.terrainAt(tx, ty);
        const rng = makeRng(Math.floor(hash2(tx, ty, m.seed) * 1e9));
        const { x: cx, z: cz } = tileCenter(tx, ty);
        const play = inMap(tx, ty);
        const near = this.nearMap(tx, ty, 4);
        const rnd = (spread = 0.88) => ({ x: cx + (rng() - 0.5) * TILE * spread, z: cz + (rng() - 0.5) * TILE * spread });

        if (t === 'forest') {
          const n = play ? 7 : 9 + Math.floor(rng() * 4);
          for (let i = 0; i < n; i++) {
            let p = rnd(0.92);
            if (play && Math.hypot(p.x - cx, p.z - cz) < 0.45 && rng() < 0.75) p = rnd(0.92);
            if (!this.dry(p.x, p.z, 0.08)) continue;
            const kind = rng() < 0.45 ? 0 : rng() < 0.88 ? 1 : 2;
            const s = play ? 0.85 + rng() * 0.4 : 1.0 + rng() * 0.75;
            tree(kind, p.x, p.z, s, rng, near);
            if (play) this.obstacles.add(p.x, p.z, 0.06 * s);
          }
          const nb = play ? 3 : 2;
          for (let i = 0; i < nb; i++) {
            const p = rnd(0.95);
            if (this.dry(p.x, p.z)) this.put('bush', P.buildBush, p.x, p.z, rng() * 6, 0.8 + rng() * 0.8, { mat: this.treeMat, cast: near });
          }
        } else if (t === 'mountain') {
          const n = play ? 3 + Math.floor(rng() * 3) : 4 + Math.floor(rng() * 5);
          for (let i = 0; i < n; i++) {
            const p = rnd(0.9);
            this.put('rock', P.buildRock, p.x, p.z, rng() * 6, 0.7 + rng() * (play ? 0.9 : 1.6), { cast: near, y: m.height(p.x, p.z) - 0.02 });
          }
          if (!play && rng() < 0.6) {
            for (let i = 0; i < 3; i++) {
              const p = rnd(0.9);
              tree(0, p.x, p.z, 1.0 + rng() * 0.6, rng, near);
            }
          }
          if (play && rng() < 0.5) {
            const p = rnd(0.8);
            this.put('bush', P.buildBush, p.x, p.z, rng() * 6, 0.7 + rng() * 0.6, { mat: this.treeMat, cast: true });
          }
        } else if (t === 'grass' && !play) {
          if (rng() < 0.12) {
            const p = rnd(0.8);
            if (this.dry(p.x, p.z, 0.08)) tree(rng() < 0.7 ? 1 : 0, p.x, p.z, 1.1 + rng() * 0.6, rng, near);
          }
          if (rng() < 0.3) {
            const p = rnd(0.9);
            if (this.dry(p.x, p.z)) this.put('bush', P.buildBush, p.x, p.z, rng() * 6, 0.9 + rng() * 0.6, { mat: this.treeMat, cast: near });
          }
        } else if (t === 'field' && rng() < 0.25) {
          const p = rnd(0.7);
          this.put('haystack', P.buildHaystack, p.x, p.z, rng() * 6, 0.9 + rng() * 0.4, { cast: near });
        }

        // Grass tufts and wildflowers near and on the battlefield.
        if ((t === 'grass' || t === 'field' || t === 'mountain' || t === 'camp') && this.nearMap(tx, ty, 5)) {
          const n = play ? (t === 'grass' ? 16 : 7) : t === 'field' ? 3 : 9;
          for (let i = 0; i < n; i++) {
            const p = rnd(1.0);
            if (!this.dry(p.x, p.z, 0.04)) continue;
            if (this.gridValue(m.road, p.x, p.z) > 0.25 || this.gridValue(m.plaza, p.x, p.z) > 0.6) continue;
            const tint = new THREE.Color().setHSL(0.2 + rng() * 0.08, 0.35 + rng() * 0.2, 0.42 + rng() * 0.2).multiplyScalar(2.1);
            this.put('grass', P.buildGrassTuft, p.x, p.z, rng() * 6, 0.45 + rng() * 0.45, { mat: this.grassMat, cast: false, color: tint, y: m.height(p.x, p.z) - 0.005 });
            if (rng() < 0.08) {
              const fc = [new THREE.Color('#f2efe2'), new THREE.Color('#f0d34c'), new THREE.Color('#c0392b'), new THREE.Color('#8e6bbf')][Math.floor(rng() * 4)];
              this.put('flower', buildFlowers, p.x + 0.05, p.z, rng() * 6, 0.55 + rng() * 0.3, { cast: false, color: fc });
            }
          }
        }
      }
    }
  }

  // -- villages --------------------------------------------------------------

  private placeVillages() {
    const m = this.model;
    const seen = new Set<string>();
    for (let ty = -BORDER; ty < MAP_N + BORDER; ty++) {
      for (let tx = -BORDER; tx < MAP_N + BORDER; tx++) {
        if (m.terrainAt(tx, ty) !== 'buildings' || seen.has(`${tx},${ty}`)) continue;
        // Flood fill a cluster of village tiles.
        const cluster: [number, number][] = [];
        const stack: [number, number][] = [[tx, ty]];
        seen.add(`${tx},${ty}`);
        while (stack.length) {
          const [x, y] = stack.pop()!;
          cluster.push([x, y]);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const k = `${x + dx},${y + dy}`;
            if (!seen.has(k) && m.terrainAt(x + dx, y + dy) === 'buildings') { seen.add(k); stack.push([x + dx, y + dy]); }
          }
        }
        this.buildVillage(cluster);
      }
    }
  }

  private buildVillage(cluster: [number, number][]) {
    const m = this.model;
    const cxs = cluster.reduce((a, c) => a + c[0], 0) / cluster.length;
    const cys = cluster.reduce((a, c) => a + c[1], 0) / cluster.length;
    const churchIdx = cluster.length >= 3 ? Math.floor(hash2(cluster[0][0], cluster[0][1], m.seed) * cluster.length) : -1;
    cluster.forEach(([tx, ty], idx) => {
      const rng = makeRng(Math.floor(hash2(tx, ty, m.seed + 99) * 1e9));
      const { x: cx, z: cz } = tileCenter(tx, ty);
      const play = inMap(tx, ty);
      // Corners furthest from the cluster centre first, so the middle stays a village square.
      const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
        .map(([sx, sz]) => ({ sx, sz, d: -((tx + sx * 0.3 - cxs) ** 2 + (ty + sz * 0.3 - cys) ** 2) + rng() * 0.3 }))
        .sort((a, b) => a.d - b.d);
      let used = 0;
      if (idx === churchIdx) {
        const c = corners[0];
        const x = cx + c.sx * 0.5, z = cz + c.sz * 0.42;
        const rot = c.sz > 0 ? Math.PI : 0;
        this.put('church', P.buildChurch, x, z, rot, 1.0, { y: m.ground(x, z) - 0.02 });
        this.obstacles.add(x, z - 0.1 * Math.cos(rot), 0.32);
        this.obstacles.add(x, z + 0.32 * Math.cos(rot), 0.2);
        used = 2;
        corners.splice(0, 2);
        corners.splice(0, 0, corners[corners.length - 1]);
      }
      const n = (play ? 2 : 3) + (rng() < 0.35 ? 1 : 0) - used;
      for (let i = 0; i < n && i < corners.length; i++) {
        const c = corners[i];
        const x = cx + c.sx * 0.55 + (rng() - 0.5) * 0.08, z = cz + c.sz * 0.55 + (rng() - 0.5) * 0.08;
        const faceZ = rng() < 0.5;
        const rot = faceZ ? (c.sz < 0 ? 0 : Math.PI) : (c.sx < 0 ? Math.PI / 2 : -Math.PI / 2);
        const r = rng();
        if (r < 0.5) this.put(`cottage${i % 3}`, () => P.buildCottage(i), x, z, rot, 1, { y: m.ground(x, z) - 0.02 });
        else if (r < 0.8) this.put('townhouse', P.buildTownhouse, x, z, rot, 1, { y: m.ground(x, z) - 0.02 });
        else {
          this.put('barn', P.buildBarn, x, z, rot, 1, { y: m.ground(x, z) - 0.02 });
          const hx = cx + c.sx * 0.2, hz = cz + c.sz * 0.85;
          this.put('haystack', P.buildHaystack, hx, hz, rng() * 6, 0.8);
        }
        this.obstacles.add(x, z, 0.32);
      }
      if (rng() < 0.4) {
        const x = cx + (rng() - 0.5) * 0.3, z = cz + (rng() - 0.5) * 0.3;
        if (!play) this.put('well', P.buildWell, x, z, rng() * 6, 1);
      }
      // Garden walls / fences on the outside edges of the village.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (m.terrainAt(tx + dx, ty + dy) === 'buildings' || rng() < 0.45) continue;
        const ex = cx + dx * TILE * 0.47, ez = cz + dy * TILE * 0.47;
        const rot = dx !== 0 ? Math.PI / 2 : 0;
        const off = (rng() - 0.5) * 0.6;
        const x = ex + (dx === 0 ? off : 0), z = ez + (dy === 0 ? off : 0);
        if (!this.dry(x, z)) continue;
        if (rng() < 0.5) this.put('wall', () => P.buildStoneWall(0.8), x, z, rot, 1);
        else this.put('fence', () => P.buildFence(0.8), x, z, rot, 1);
      }
    });
  }

  // -- command centres, depots, capture point ---------------------------------

  private makeBanner(x: number, z: number, height: number, owner: number, size: number, tx: number, ty: number) {
    const y = this.model.ground(x, z);
    this.put(`pole${height}`, () => P.buildFlagpole(height), x, z, 0, 1, { y });
    const flag = makeFlagMesh(this.bannerTex[owner], size, size * 0.66);
    // The banner textures are shared; only dispose the mesh-specific bits.
    this.disposables.push(flag.geometry, flag.material as THREE.Material);
    this.group.add(flag);
    const b: Banner = { mesh: flag, pole: new THREE.Vector3(x, y, z), height, owner, raise: 1, tx, ty };
    this.banners.push(b);
    this.placeBanner(b, 0);
    return b;
  }

  private placeBanner(b: Banner, time: number) {
    const top = b.pole.y + b.height - 0.02;
    const bottom = b.pole.y + 0.35;
    const y = bottom + (top - bottom) * b.raise;
    b.mesh.position.set(b.pole.x + 0.015, y, b.pole.z);
    b.mesh.rotation.y = Math.atan2(-WIND.z, WIND.x) + Math.sin(time * 0.5 + b.pole.x) * 0.25;
  }

  private placeStrategicSites() {
    const m = this.model;
    const map = m.map;
    for (let ty = 0; ty < MAP_N; ty++) {
      for (let tx = 0; tx < MAP_N; tx++) {
        const tile = map[ty][tx];
        const { x: cx, z: cz } = tileCenter(tx, ty);
        const rng = makeRng(Math.floor(hash2(tx, ty, m.seed + 7) * 1e9));
        if (tile.terrain === 'supply_node') {
          this.put('crates', P.buildCrates, cx - 0.62, cz - 0.6, rng() * 6, 1);
          this.obstacles.add(cx - 0.6, cz - 0.6, 0.22);
          this.put('wagon', P.buildWagon, cx + 0.6, cz + 0.6, 0.6 + rng() * 0.4, 1);
          this.obstacles.add(cx + 0.6, cz + 0.6, 0.24);
          this.put('tent', () => P.buildTent(), cx - 0.62, cz + 0.62, Math.PI / 4, 1);
          this.obstacles.add(cx - 0.62, cz + 0.62, 0.2);
          this.put('crates', P.buildCrates, cx + 0.66, cz - 0.3, rng() * 6, 0.8);
          this.makeBanner(cx + 0.72, cz - 0.74, 1.1, tile.owner ?? 0, 0.32, tx, ty);
          this.obstacles.add(cx + 0.72, cz - 0.74, 0.06);
        } else if (tile.terrain === 'capture_point') {
          const y = m.ground(cx, cz);
          this.single(P.buildPlaza(), cx, y - 0.02, cz, 0, false);
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
            const bx = cx + Math.cos(a) * 0.86, bz = cz + Math.sin(a) * 0.86;
            this.put('brazier', P.buildBrazier, bx, bz, a, 1);
            this.obstacles.add(bx, bz, 0.07);
            this.braziers.push(new THREE.Vector3(bx, m.ground(bx, bz) + 0.24, bz));
          }
          this.makeBanner(cx + 0.82, cz + 0.82, 1.5, tile.owner ?? 0, 0.42, tx, ty);
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.66, 0.74, 48).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, depthWrite: false }),
          );
          ring.position.set(cx, y + 0.06, cz);
          this.group.add(ring);
          this.disposables.push(ring.geometry, ring.material as THREE.Material);
          this.captureRing = ring;
        } else if (tile.terrain === 'command_center') {
          const owner = tile.owner ?? (ty < MAP_N / 2 ? 2 : 1);
          const dir = ty < MAP_N / 2 ? -1 : 1;
          this.makeBanner(cx, cz + dir * 0.82, 2.0, owner, 0.55, tx, ty);
          const nation = this.nations[owner];
          this.put(`marquee-${nation}`, () => P.buildMarquee(ARMY_COAT[nation]), cx - 0.66, cz + dir * 0.62, 0, 1);
          this.obstacles.add(cx - 0.66, cz + dir * 0.62, 0.28);
          this.put('tent', () => P.buildTent(), cx + 0.62, cz + dir * 0.68, dir > 0 ? Math.PI : 0, 1);
          this.obstacles.add(cx + 0.62, cz + dir * 0.68, 0.2);
          this.put('crates', P.buildCrates, cx + 0.75, cz + dir * 0.15, 0.4, 0.8);
        }
      }
    }
  }

  private placeCamps() {
    const m = this.model;
    for (const owner of [1, 2] as const) {
      const ccY = owner === 1 ? MAP_N - 1 : 0;
      const dir = owner === 1 ? 1 : -1;
      const { x: cx, z: ccz } = tileCenter(10, ccY);
      const rng = makeRng(owner * 1337 + m.seed);
      const nation = this.nations[owner];
      // Manor house used as headquarters, courtyard facing the battlefield.
      const mz = ccz + dir * TILE * 3.4;
      this.single(P.buildManor(), cx, m.ground(cx, mz) - 0.04, mz, dir > 0 ? Math.PI : 0);
      // Avenue of tents either side.
      for (const side of [-1, 1]) {
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 5; col++) {
            const x = cx + side * (2.4 + col * 0.62);
            const z = ccz + dir * (1.7 + row * 0.75);
            const stripe = col === 0 && row === 0 ? ARMY_COAT[nation] : undefined;
            this.put(stripe ? `tent-${nation}` : 'tent', () => P.buildTent(stripe), x, z, dir > 0 ? Math.PI : 0, 1);
          }
        }
        // Campfires between the rows.
        const fz = ccz + dir * 2.08;
        for (let i = 0; i < 2; i++) this.campfires.push(new THREE.Vector3(cx + side * (2.7 + i * 1.3), m.ground(cx + side * (2.7 + i * 1.3), fz) + 0.03, fz));
      }
      // Artillery park
      const gunGeo = this.geo(`gun-${nation}`, () => buildGun(nation));
      const wheelGeo = this.geo(`wheel-${nation}`, () => buildWheel(nation));
      for (let i = 0; i < 3; i++) {
        const x = cx - 6.4 - i * 0.55, z = ccz + dir * 3.2;
        const y = m.ground(x, z);
        const rot = dir > 0 ? Math.PI : 0;
        this.put(`gun-${nation}`, () => gunGeo, x, z, rot, 1, { y });
        for (const s of [-1, 1]) {
          _m.makeRotationY(rot);
          _v.set(s * WHEEL_X, 0, 0).applyMatrix4(_m);
          this.put(`wheel-${nation}`, () => wheelGeo, x + _v.x, z + _v.z, rot, 1, { y: y + WHEEL_R });
        }
      }
      // Horse lines
      for (let i = 0; i < 5; i++) {
        const v = Math.floor(rng() * 4);
        const x = cx + 5.6 + i * 0.32, z = ccz + dir * 3.3;
        const y = m.ground(x, z);
        const rot = (dir > 0 ? Math.PI : 0) + (rng() - 0.5) * 0.4;
        this.put(`horse-${nation}-${v}`, () => buildHorseBody(v, nation, 'hussar'), x, z, rot, 1, { y });
        for (const leg of HORSE_LEGS) {
          _m.makeRotationY(rot);
          _v.set(leg.x, 0, leg.z).applyMatrix4(_m);
          this.put(`hleg-${v}`, () => buildHorseLeg(v), x + _v.x, z + _v.z, rot, 1, { y: y + HORSE_LEG_TOP });
        }
      }
      this.put('fence', () => P.buildFence(0.8), cx + 6.2, ccz + dir * 3.62, 0, 1);
      this.put('fence', () => P.buildFence(0.8), cx + 7.0, ccz + dir * 3.62, 0, 1);
      this.put('wagon', P.buildWagon, cx + 4.3, ccz + dir * 2.4, 0.3, 1);
      this.put('wagon', P.buildWagon, cx + 4.7, ccz + dir * 2.7, -0.2, 1);
      this.put('crates', P.buildCrates, cx - 4.6, ccz + dir * 2.6, 0.2, 1);
      this.put('crates', P.buildCrates, cx - 5.0, ccz + dir * 2.2, 1.2, 1);
      this.makeBanner(cx, mz - dir * 1.0, 2.4, owner, 0.6, -1, -1);
      for (const side of [-1, 1]) this.put('wall', () => P.buildStoneWall(0.8), cx + side * 1.6, mz - dir * 0.9, 0, 1.4);
    }
  }

  private placeBridges() {
    const m = this.model;
    for (const b of m.bridges) {
      const { x, z } = tileCenter(b.tx, b.ty);
      const geo = P.buildStoneBridge(TILE, BRIDGE_WIDTH, b.deck);
      this.single(geo, x, 0, z, b.axis === 'x' ? 0 : Math.PI / 2);
    }
  }

  private placeRoadside() {
    const m = this.model;
    const pts = m.roadPolyline;
    const rng = makeRng(m.seed ^ 0x9091);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
      for (let d = 0; d < len; d += 0.2) {
        acc += 0.2;
        if (acc < 1.5) continue;
        acc = 0;
        const px = a.x + dx * d, pz = a.z + dz * d;
        for (const s of [-1, 1]) {
          const x = px - dz * s * TILE * 0.62, z = pz + dx * s * TILE * 0.62;
          const tx = Math.floor(x / TILE), ty = Math.floor(z / TILE);
          if (this.nearMap(tx, ty, 0)) continue;
          const t = m.terrainAt(tx, ty);
          if (t === 'river' || t === 'buildings' || t === 'camp' || !this.dry(x, z, 0.1)) continue;
          this.put(this.nearMap(tx, ty, 4) ? 'tree2' : 'tree2-far', P.buildPoplar, x, z, rng() * 6, 1.25 + rng() * 0.3, {
            mat: this.treeMat, cast: this.nearMap(tx, ty, 4), y: m.height(x, z) - 0.03,
          });
        }
      }
    }
  }

  private placeWindmills() {
    const m = this.model;
    const rng = makeRng(m.seed ^ 0x3311);
    let placed = 0;
    for (let tries = 0; tries < 300 && placed < 2; tries++) {
      const tx = Math.floor(rng() * (MAP_N + 10)) - 5;
      const ty = Math.floor(rng() * (MAP_N + 10)) - 5;
      if (this.nearMap(tx, ty, 1) || !this.nearMap(tx, ty, 5)) continue;
      const t = m.terrainAt(tx, ty);
      if (t !== 'grass' && t !== 'mountain' && t !== 'field') continue;
      if (Math.abs(tx - 10) < 7) continue;
      const { x, z } = tileCenter(tx, ty);
      if (!this.dry(x, z, 0.2)) continue;
      const y = m.ground(x, z) - 0.05;
      const facing = Math.atan2(-WIND.x, -WIND.z);
      this.single(P.buildWindmillBody(), x, y, z, facing);
      const sails = new THREE.Mesh(P.buildWindmillSails(), this.propMat);
      sails.castShadow = true;
      const hub = new THREE.Object3D();
      hub.position.set(x, y + 1.1, z);
      hub.rotation.y = facing;
      sails.position.set(0, 0, 0.4);
      hub.add(sails);
      this.group.add(hub);
      this.disposables.push(sails.geometry);
      this.sails.push(sails);
      placed++;
    }
  }

  // -- dynamic state ---------------------------------------------------------

  /**
   * Syncs banner colours and the capture-point ring with ownership in the game
   * state, and reports which strategic sites just changed hands.
   */
  updateOwners(map: Tile[][], capturePointOwner: number | null) {
    const changes: { terrain: Tile['terrain']; owner: number; pos: THREE.Vector3 }[] = [];
    for (const b of this.banners) {
      if (b.tx < 0) continue;
      const tile = map[b.ty]?.[b.tx];
      const owner = tile?.owner ?? 0;
      if (owner !== b.owner) {
        if (tile) changes.push({ terrain: tile.terrain, owner, pos: b.pole.clone() });
        b.owner = owner;
        b.raise = 0;
        (b.mesh.material as THREE.MeshStandardMaterial).map = this.bannerTex[owner] ?? this.bannerTex[0];
        (b.mesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
      }
    }
    if (this.captureRing) {
      const mat = this.captureRing.material as THREE.MeshBasicMaterial;
      mat.color.set(capturePointOwner ? NATION_CSS[this.nations[capturePointOwner]] : '#ffffff');
      this.captureRing.userData.owner = capturePointOwner;
    }
    return changes;
  }

  update(dt: number, time: number) {
    swayUniforms.uTime.value = time;
    for (const s of this.sails) s.rotation.z -= dt * 0.9;
    for (const b of this.banners) {
      if (b.raise < 1) b.raise = Math.min(1, b.raise + dt * 0.6);
      this.placeBanner(b, time);
    }
    if (this.captureRing) {
      const mat = this.captureRing.material as THREE.MeshBasicMaterial;
      mat.opacity = this.captureRing.userData.owner ? 0.45 + Math.sin(time * 3) * 0.25 : 0.12;
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

const buildFlowers = () => {
  const g = new THREE.BufferGeometry();
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.IcosahedronGeometry(0.014, 0);
    s.translate(Math.cos(i * 2.1) * 0.03, 0.05 + (i % 2) * 0.02, Math.sin(i * 2.1) * 0.03);
    parts.push(s);
  }
  const n = parts.reduce((a, p) => a + p.getAttribute('position').count, 0);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.getAttribute('position').array as Float32Array, o * 3);
    nor.set(p.getAttribute('normal').array as Float32Array, o * 3);
    o += p.getAttribute('position').count;
    p.dispose();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const col = new Float32Array(n * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
};

