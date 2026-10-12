import { Tile } from '../../game/types';
import {
  BORDER, BRIDGE_WIDTH, MAP_N, RES, RIVER_BED, TILE, WORLD_MIN, WORLD_SIZE,
  clamp, inMap, lerp, smoothstep,
} from '../core/constants';
import { Simplex, hash2, hashString, makeRng } from '../core/noise';

/** Terrain kinds used for decoration; the playable map uses the game's own terrain values. */
export type WorldTerrain = Tile['terrain'] | 'field' | 'camp';

export interface Bridge {
  tx: number;
  ty: number;
  /** World axis the deck runs along (the direction you walk across). */
  axis: 'x' | 'z';
  deck: number;
}

interface Seg { ax: number; az: number; bx: number; bz: number; minx: number; maxx: number; minz: number; maxz: number }

const makeSeg = (ax: number, az: number, bx: number, bz: number, pad: number): Seg => ({
  ax, az, bx, bz,
  minx: Math.min(ax, bx) - pad, maxx: Math.max(ax, bx) + pad,
  minz: Math.min(az, bz) - pad, maxz: Math.max(az, bz) + pad,
});

const segDist = (s: Seg, x: number, z: number) => {
  const vx = s.bx - s.ax, vz = s.bz - s.az;
  const wx = x - s.ax, wz = z - s.az;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? clamp((wx * vx + wz * vz) / len2, 0, 1) : 0;
  const dx = wx - vx * t, dz = wz - vz * t;
  return Math.sqrt(dx * dx + dz * dz);
};

const TOTAL = MAP_N + BORDER * 2;
const bridgeKey = (tx: number, ty: number) => (ty + 1000) * 4096 + (tx + 1000);

/**
 * Turns the 20x20 game map into a continuous landscape: a height field with
 * hills, a carved river (with bridges where the game overwrote river tiles),
 * flattened roads, and procedurally generated surroundings.
 */
export class TerrainModel {
  readonly seed: number;
  readonly noise: Simplex;
  readonly noise2: Simplex;
  /** Terrain for every tile including the decorative border; index [ty + BORDER][tx + BORDER]. */
  readonly ext: WorldTerrain[][] = [];
  readonly hillScale: number[][] = [];
  readonly bridges: Bridge[] = [];
  readonly riverPolylines: { x: number; z: number }[][] = [];
  readonly roadPolyline: { x: number; z: number }[] = [];

  /** Vertices per side of the height grid. */
  readonly vn = TOTAL * RES + 1;
  readonly step = TILE / RES;
  readonly heights: Float32Array;
  readonly river: Float32Array;
  readonly road: Float32Array;
  readonly hill: Float32Array;
  readonly forest: Float32Array;
  readonly village: Float32Array;
  readonly plaza: Float32Array;
  readonly camp: Float32Array;
  readonly field: Float32Array;
  readonly border: Float32Array;

  private riverSegs: Seg[] = [];
  private roadSegs: Seg[] = [];
  private riverTileCenters: { x: number; z: number }[] = [];
  private bridgeMap = new Map<number, Bridge>();

  constructor(readonly map: Tile[][]) {
    this.seed = hashString(map.map(r => r.map(t => t.terrain[0] + t.terrain[1]).join('')).join('|'));
    this.noise = new Simplex(this.seed);
    this.noise2 = new Simplex(this.seed ^ 0x9e3779b9);

    this.buildExtendedTerrain();
    this.buildRiver();
    this.buildRoad();

    const n = this.vn * this.vn;
    this.heights = new Float32Array(n);
    this.river = new Float32Array(n);
    this.road = new Float32Array(n);
    this.hill = new Float32Array(n);
    this.forest = new Float32Array(n);
    this.village = new Float32Array(n);
    this.plaza = new Float32Array(n);
    this.camp = new Float32Array(n);
    this.field = new Float32Array(n);
    this.border = new Float32Array(n);
    this.buildHeights();
    this.findBridges();
  }

  /** Terrain of any tile, including the generated surroundings. */
  terrainAt(tx: number, ty: number): WorldTerrain {
    const ix = clamp(tx + BORDER, 0, TOTAL - 1);
    const iy = clamp(ty + BORDER, 0, TOTAL - 1);
    return this.ext[iy][ix];
  }

  bridgeAt(tx: number, ty: number) {
    return this.bridgeMap.get(bridgeKey(tx, ty));
  }

  /** Bilinear sample of the terrain surface. */
  height(x: number, z: number): number {
    const gx = clamp((x - WORLD_MIN) / this.step, 0, this.vn - 1.001);
    const gz = clamp((z - WORLD_MIN) / this.step, 0, this.vn - 1.001);
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const i = iz * this.vn + ix;
    const h = this.heights;
    const a = h[i], b = h[i + 1], c = h[i + this.vn], d = h[i + this.vn + 1];
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  }

  /** Walkable height: bridge decks override the river bed beneath them. */
  ground(x: number, z: number): number {
    const tx = Math.floor(x / TILE), ty = Math.floor(z / TILE);
    const b = this.bridgeMap.get(bridgeKey(tx, ty));
    const h = this.height(x, z);
    if (!b) return h;
    const lx = x - (tx + 0.5) * TILE, lz = z - (ty + 0.5) * TILE;
    const across = b.axis === 'x' ? lz : lx;
    if (Math.abs(across) > BRIDGE_WIDTH / 2) return h;
    const along = (b.axis === 'x' ? lx : lz) / (TILE * 0.5);
    return Math.max(h, b.deck + 0.05 * (1 - along * along));
  }

  /** Keeps a point on a bridge deck from stepping off the side into the river. */
  confine(x: number, z: number, out: { x: number; z: number }) {
    out.x = x; out.z = z;
    const tx = Math.floor(x / TILE), ty = Math.floor(z / TILE);
    const b = this.bridgeMap.get(bridgeKey(tx, ty));
    if (!b) return out;
    const cx = (tx + 0.5) * TILE, cz = (ty + 0.5) * TILE;
    const lim = BRIDGE_WIDTH / 2 - 0.1;
    if (b.axis === 'x') out.z = clamp(z, cz - lim, cz + lim);
    else out.x = clamp(x, cx - lim, cx + lim);
    return out;
  }

  /** River depth factor (0 = dry, 1 = channel core) at a world point. */
  riverDepthAt(x: number, z: number) {
    const gx = Math.round(clamp((x - WORLD_MIN) / this.step, 0, this.vn - 1));
    const gz = Math.round(clamp((z - WORLD_MIN) / this.step, 0, this.vn - 1));
    return this.river[gz * this.vn + gx];
  }

  /** Index helpers for the height grid. */
  gridX(i: number) { return WORLD_MIN + i * this.step; }

  // ---------------------------------------------------------------------------

  private buildExtendedTerrain() {
    const rng = makeRng(this.seed ^ 0x51ed);
    const n = this.noise, n2 = this.noise2;
    for (let iy = 0; iy < TOTAL; iy++) {
      const row: WorldTerrain[] = [];
      const hs: number[] = [];
      for (let ix = 0; ix < TOTAL; ix++) {
        const tx = ix - BORDER, ty = iy - BORDER;
        if (inMap(tx, ty)) {
          row.push(this.map[ty][tx].terrain);
          hs.push(1);
          continue;
        }
        const dOut = Math.max(-tx, tx - (MAP_N - 1), -ty, ty - (MAP_N - 1));
        let t: WorldTerrain = 'grass';
        const f = n.fbm(tx * 0.13 + 3.1, ty * 0.13 - 1.7, 3);
        const h = n2.fbm(tx * 0.09 - 5.3, ty * 0.09 + 2.2, 3);
        const fieldN = n.noise(tx * 0.21 + 40, ty * 0.21 - 40);
        if (h > 0.22 && dOut > 1) t = 'mountain';
        else if (f > 0.08 + (dOut <= 2 ? 0.2 : 0)) t = 'forest';
        else if (fieldN > 0.15) t = 'field';
        row.push(t);
        hs.push(t === 'mountain' ? 1.2 + clamp((dOut - 2) / 6, 0, 1) * (1.4 + rng() * 1.2) : 1);
      }
      this.ext.push(row);
      this.hillScale.push(hs);
    }

    // Headquarters camps behind each command centre stay open.
    for (const cc of [{ y: -1, dir: -1 }, { y: MAP_N, dir: 1 }]) {
      for (let dy = 0; dy < 5; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          this.setExt(10 + dx, cc.y + dy * cc.dir, Math.abs(dx) <= 3 && dy <= 3 ? 'camp' : 'grass');
        }
      }
    }

    // A few hamlets in the countryside.
    let placed = 0;
    for (let tries = 0; tries < 200 && placed < 5; tries++) {
      const side = Math.floor(rng() * 4);
      const along = Math.floor(rng() * (MAP_N + 6)) - 3;
      const depth = 2 + Math.floor(rng() * (BORDER - 5));
      let tx = 0, ty = 0;
      if (side === 0) { tx = along; ty = -depth - 1; }
      else if (side === 1) { tx = along; ty = MAP_N + depth; }
      else if (side === 2) { tx = -depth - 1; ty = along; }
      else { tx = MAP_N + depth; ty = along; }
      if (Math.abs(tx - 10) < 6 && (ty < -1 && ty > -7 || ty > MAP_N && ty < MAP_N + 6)) continue;
      let ok = true;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const t = this.terrainAt(tx + dx, ty + dy);
        if (inMap(tx + dx, ty + dy) || (t !== 'grass' && t !== 'field' && t !== 'forest')) ok = false;
      }
      if (!ok) continue;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) this.setExt(tx + dx, ty + dy, 'buildings');
      placed++;
    }
  }

  private setExt(tx: number, ty: number, t: WorldTerrain) {
    if (inMap(tx, ty)) return;
    const ix = tx + BORDER, iy = ty + BORDER;
    if (ix < 0 || iy < 0 || ix >= TOTAL || iy >= TOTAL) return;
    this.ext[iy][ix] = t;
    this.hillScale[iy][ix] = 1;
  }

  private buildRiver() {
    const map = this.map;
    const isRiver = (x: number, y: number) => inMap(x, y) && map[y][x].terrain === 'river';
    const c = (x: number, y: number) => ({ x: (x + 0.5) * TILE, z: (y + 0.5) * TILE });
    const pad = TILE * 0.7;
    const rows: number[][] = [];
    for (let y = 0; y < MAP_N; y++) {
      rows.push([]);
      for (let x = 0; x < MAP_N; x++) {
        if (isRiver(x, y)) {
          rows[y].push(x);
          this.riverTileCenters.push(c(x, y));
        }
      }
    }
    if (this.riverTileCenters.length === 0) return;

    const addSeg = (ax: number, ay: number, bx: number, by: number) => {
      const a = c(ax, ay), b = c(bx, by);
      this.riverSegs.push(makeSeg(a.x, a.z, b.x, b.z, pad));
    };

    for (let y = 0; y < MAP_N; y++) {
      for (const x of rows[y]) {
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
          if (!isRiver(x + dx, y + dy)) continue;
          // Skip a diagonal when an orthogonal path already joins the two tiles.
          if (dx !== 0 && dy !== 0 && (isRiver(x + dx, y) || isRiver(x, y + dy))) continue;
          addSeg(x, y, x + dx, y + dy);
        }
      }
    }

    // Bridge gaps where another feature overwrote the river tiles.
    for (let y = 0; y < MAP_N; y++) {
      if (rows[y].length > 0) continue;
      let ya = y - 1;
      while (ya >= 0 && rows[ya].length === 0) ya--;
      let yb = y + 1;
      while (yb < MAP_N && rows[yb].length === 0) yb++;
      if (ya < 0 || yb >= MAP_N || yb - ya > 4) continue;
      if (ya !== y - 1) continue; // only connect once per gap
      let best: [number, number] | null = null;
      for (const xa of rows[ya]) for (const xb of rows[yb]) {
        if (!best || Math.abs(xa - xb) < Math.abs(best[0] - best[1])) best = [xa, xb];
      }
      if (best) addSeg(best[0], ya, best[1], yb);
    }
    // Same-row gaps (rare): connect horizontally separated river tiles of consecutive rows handled above.

    // Extend the river beyond the map in both directions.
    const rng = makeRng(this.seed ^ 0xa11ce);
    const extend = (startRow: number, dir: number, firstRowAtEdge: number) => {
      const xs = rows[startRow];
      let x = xs.reduce((a, b) => a + b, 0) / xs.length;
      let y = startRow;
      const pts = [c(x, y)];
      const steps = Math.abs(firstRowAtEdge - startRow) + BORDER + 2;
      for (let k = 0; k < steps; k++) {
        y += dir;
        x += (rng() - 0.5) * 0.9;
        pts.push(c(x, y));
        const tx = Math.round(x), ty = y;
        if (!inMap(tx, ty)) {
          this.setExt(tx, ty, 'river');
          if (rng() > 0.5) this.setExt(tx + (rng() > 0.5 ? 1 : -1), ty, 'grass');
        }
      }
      for (let i = 1; i < pts.length; i++) {
        this.riverSegs.push(makeSeg(pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z, pad));
      }
      this.riverPolylines.push(pts);
    };
    const first = rows.findIndex(r => r.length > 0);
    let last = -1;
    for (let y = MAP_N - 1; y >= 0; y--) if (rows[y].length > 0) { last = y; break; }
    extend(first, -1, 0);
    extend(last, 1, MAP_N - 1);

    // Keep trees off the banks of the extended river.
    for (const seg of this.riverSegs) {
      const len = Math.hypot(seg.bx - seg.ax, seg.bz - seg.az);
      const n = Math.ceil(len / (TILE * 0.5));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const tx = Math.floor((seg.ax + (seg.bx - seg.ax) * t) / TILE);
        const ty = Math.floor((seg.az + (seg.bz - seg.az) * t) / TILE);
        if (!inMap(tx, ty) && this.terrainAt(tx, ty) === 'forest') this.setExt(tx, ty, 'grass');
      }
    }
  }

  private buildRoad() {
    const ys: (number | null)[] = [];
    for (let x = 0; x < MAP_N; x++) {
      let found: number | null = null;
      for (let y = 0; y < MAP_N; y++) if (this.map[y][x].terrain === 'road') { found = y; break; }
      ys.push(found);
    }
    if (ys.every(v => v === null)) return;
    // Fill gaps (tiles overwritten by villages etc.) from neighbours.
    for (let x = 0; x < MAP_N; x++) {
      if (ys[x] !== null) continue;
      let l = x - 1; while (l >= 0 && ys[l] === null) l--;
      let r = x + 1; while (r < MAP_N && ys[r] === null) r++;
      ys[x] = l >= 0 ? ys[l] : ys[r];
    }
    const rng = makeRng(this.seed ^ 0xbeef);
    const pts: { x: number; z: number }[] = [];
    const left: { x: number; z: number }[] = [];
    let y = ys[0]!;
    for (let k = 1; k <= BORDER + 2; k++) {
      y += Math.round((rng() - 0.5) * 0.9);
      left.unshift({ x: (-k + 0.5) * TILE, z: (y + 0.5) * TILE });
      this.clearForRoad(-k, y);
    }
    pts.push(...left);
    for (let x = 0; x < MAP_N; x++) pts.push({ x: (x + 0.5) * TILE, z: (ys[x]! + 0.5) * TILE });
    y = ys[MAP_N - 1]!;
    for (let k = 0; k < BORDER + 2; k++) {
      y += Math.round((rng() - 0.5) * 0.9);
      pts.push({ x: (MAP_N + k + 0.5) * TILE, z: (y + 0.5) * TILE });
      this.clearForRoad(MAP_N + k, y);
    }
    // Light smoothing of the poly-line so the road meanders instead of zig-zagging.
    const sm = pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      return { x: p.x, z: (pts[i - 1].z + p.z * 2 + pts[i + 1].z) / 4 };
    });
    for (let i = 1; i < sm.length; i++) {
      this.roadSegs.push(makeSeg(sm[i - 1].x, sm[i - 1].z, sm[i].x, sm[i].z, TILE * 0.6));
    }
    this.roadPolyline.push(...sm);
  }

  private clearForRoad(tx: number, ty: number) {
    const t = this.terrainAt(tx, ty);
    if (t !== 'river' && t !== 'buildings') this.setExt(tx, ty, 'road');
  }

  private tileValue(fn: (t: WorldTerrain, tx: number, ty: number) => number) {
    const vals: number[][] = [];
    for (let iy = 0; iy < TOTAL; iy++) {
      const row: number[] = [];
      for (let ix = 0; ix < TOTAL; ix++) row.push(fn(this.ext[iy][ix], ix - BORDER, iy - BORDER));
      vals.push(row);
    }
    return vals;
  }

  private buildHeights() {
    const hillV = this.tileValue((t, tx, ty) => (t === 'mountain' ? this.hillScale[ty + BORDER][tx + BORDER] : 0));
    const forestV = this.tileValue(t => (t === 'forest' ? 1 : 0));
    const villageV = this.tileValue(t => (t === 'buildings' ? 1 : 0));
    const plazaV = this.tileValue(t => (t === 'command_center' || t === 'capture_point' || t === 'supply_node' ? 1 : 0));
    const campV = this.tileValue(t => (t === 'camp' ? 1 : 0));
    const fieldV = this.tileValue(t => (t === 'field' ? 1 : 0));
    const flatV = this.tileValue(t => (t === 'buildings' || t === 'command_center' || t === 'capture_point' || t === 'supply_node' || t === 'road' || t === 'camp' ? 0.25 : 1));

    const sample = (vals: number[][], x: number, z: number, sharp: number) => {
      const fx = x / TILE - 0.5 + BORDER, fz = z / TILE - 0.5 + BORDER;
      const ix = Math.floor(fx), iz = Math.floor(fz);
      let tx = fx - ix, tz = fz - iz;
      const lo = 0.5 - sharp / 2, hi = 0.5 + sharp / 2;
      tx = smoothstep(lo, hi, tx);
      tz = smoothstep(lo, hi, tz);
      const g = (a: number, b: number) => vals[clamp(b, 0, TOTAL - 1)][clamp(a, 0, TOTAL - 1)];
      return lerp(lerp(g(ix, iz), g(ix + 1, iz), tx), lerp(g(ix, iz + 1), g(ix + 1, iz + 1), tx), tz);
    };

    const n = this.noise, n2 = this.noise2;
    const vn = this.vn;
    const mapMax = MAP_N * TILE;
    const r0 = TILE * 0.3, r1 = TILE * 0.62;
    const roadIn = TILE * 0.2, roadOut = TILE * 0.34;

    for (let iz = 0; iz < vn; iz++) {
      const z = WORLD_MIN + iz * this.step;
      for (let ix = 0; ix < vn; ix++) {
        const x = WORLD_MIN + ix * this.step;
        const i = iz * vn + ix;
        const out = Math.max(0, -x, x - mapMax, -z, z - mapMax);
        const bt = smoothstep(0, TILE * 5, out);

        const flat = sample(flatV, x, z, 0.6);
        let h = (n.fbm(x * 0.045, z * 0.045, 4) * lerp(0.1, 0.55, bt) + bt * 0.18) * flat;
        h += n2.noise(x * 0.7, z * 0.7) * 0.025 * flat;

        const hv = sample(hillV, x, z, 1);
        let hh = 0;
        if (hv > 0) hh = Math.pow(hv, 1.25) * (0.95 + 0.3 * n.noise(x * 0.35 + 7, z * 0.35 - 3));
        h += hh;

        // Roads flatten their bed.
        let road = 0;
        for (const s of this.roadSegs) {
          if (x < s.minx || x > s.maxx || z < s.minz || z > s.maxz) continue;
          const d = segDist(s, x, z);
          road = Math.max(road, 1 - smoothstep(roadIn, roadOut, d + n2.noise(x * 1.3, z * 1.3) * 0.08));
        }
        h = lerp(h, hh + h * 0.15, road * 0.85);

        // The river carves its channel.
        let rv = 0;
        for (const s of this.riverSegs) {
          if (x < s.minx || x > s.maxx || z < s.minz || z > s.maxz) continue;
          const d = segDist(s, x, z) + n.noise(x * 0.9, z * 0.9) * 0.12;
          rv = Math.max(rv, 1 - smoothstep(r0, r1, d));
        }
        for (const c of this.riverTileCenters) {
          const dx = Math.abs(x - c.x), dz = Math.abs(z - c.z);
          if (dx > r1 || dz > r1) continue;
          const d = Math.pow(dx ** 4 + dz ** 4, 0.25);
          rv = Math.max(rv, 1 - smoothstep(r0 + 0.06, r1, d));
        }
        h = lerp(h, RIVER_BED + n2.noise(x * 0.5, z * 0.5) * 0.04, rv);

        // Fade to a flat plain at the very edge of the generated world.
        const edge = Math.min(x - WORLD_MIN, WORLD_MIN + WORLD_SIZE - x, z - WORLD_MIN, WORLD_MIN + WORLD_SIZE - z);
        const et = smoothstep(TILE * 3, 0, edge);
        h = lerp(h, 0.02, et);

        this.heights[i] = h;
        this.river[i] = rv * (1 - et);
        this.road[i] = road;
        this.hill[i] = hv;
        this.forest[i] = sample(forestV, x, z, 0.8);
        this.village[i] = sample(villageV, x, z, 0.6);
        this.plaza[i] = sample(plazaV, x, z, 0.5);
        this.camp[i] = sample(campV, x, z, 1);
        this.field[i] = sample(fieldV, x, z, 0.35);
        this.border[i] = bt;
      }
    }
  }

  private findBridges() {
    for (let ty = 0; ty < MAP_N; ty++) {
      for (let tx = 0; tx < MAP_N; tx++) {
        const t = this.map[ty][tx].terrain;
        if (t === 'river') continue;
        const cx = (tx + 0.5) * TILE, cz = (ty + 0.5) * TILE;
        if (this.riverDepthAt(cx, cz) < 0.5) continue;
        // Bridge spans perpendicular to the flow: compare channel extent along each axis.
        const dzN = this.riverDepthAt(cx, cz - TILE * 0.45) + this.riverDepthAt(cx, cz + TILE * 0.45);
        const dxE = this.riverDepthAt(cx - TILE * 0.45, cz) + this.riverDepthAt(cx + TILE * 0.45, cz);
        const axis: 'x' | 'z' = dzN >= dxE ? 'x' : 'z';
        const b: Bridge = { tx, ty, axis, deck: 0.12 + hash2(tx, ty, this.seed) * 0.02 };
        this.bridges.push(b);
        this.bridgeMap.set(bridgeKey(tx, ty), b);
      }
    }
  }
}
