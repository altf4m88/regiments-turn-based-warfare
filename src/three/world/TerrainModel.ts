import { Tile } from '../../game/types';
import {
  BORDER, BRIDGE_WIDTH, MAP_N, RES, RIVER_BED, TILE, WATER_LEVEL, WORLD_MIN, WORLD_SIZE,
  clamp, inMap, lerp, smoothstep,
} from '../core/constants';
import { Simplex, hash2, hashString, makeRng } from '../core/noise';

/** Terrain kinds used for decoration; the playable map uses the game's own terrain values. */
export type WorldTerrain = Tile['terrain'] | 'field' | 'camp';

/**
 * A stone bridge carrying the road over the river, reaching bank to bank. It
 * runs straight along the road's line through the water; where the river
 * crosses that line at an angle the bridge is skewed, so its ends and piers
 * sit square to the banks.
 */
export interface Bridge {
  /** Road tiles the bridge carries (the game's crossing tiles). */
  tiles: { tx: number; ty: number }[];
  /** A point on the deck's centreline, and the unit direction the deck runs in. */
  ox: number;
  oz: number;
  dx: number;
  dz: number;
  /** Shift along the deck of its ends and piers, per unit of distance across it. */
  skew: number;
  /** Landings on the two banks, as distance along the centreline from (ox, oz) (a0 < a1). */
  a0: number;
  a1: number;
  /** Deck height at each landing, and at the crown. */
  h0: number;
  h1: number;
  peak: number;
  /** Extent of open water under the deck, in the same unskewed frame as a0/a1. */
  w0: number;
  w1: number;
}

/** A point in a bridge's frame: `u` along the deck (unskewed, like a0/a1), `c` across it. */
export const deckFrame = (b: Bridge, x: number, z: number) => {
  const rx = x - b.ox, rz = z - b.oz;
  const c = -rx * b.dz + rz * b.dx;
  return { u: rx * b.dx + rz * b.dz - b.skew * c, c };
};

/** World position of a point given in a bridge's frame. */
export const deckPoint = (b: Bridge, u: number, c: number) => {
  const s = u + b.skew * c;
  return { x: b.ox + b.dx * s - b.dz * c, z: b.oz + b.dz * s + b.dx * c };
};

/** Walkable deck height at `u` along the bridge (see deckFrame): a shallow hump from bank to bank. */
export const deckHeight = (b: Bridge, u: number) => {
  const t = clamp((u - b.a0) / (b.a1 - b.a0), 0, 1);
  const k = 2 * t - 1;
  return lerp(b.h0, b.h1, t) + (b.peak - (b.h0 + b.h1) / 2) * (1 - k * k);
};

/** Channel radius: full depth inside R0, dry beyond R1. */
const RIVER_R0 = TILE * 0.3, RIVER_R1 = TILE * 0.62;
/** Steepest skew a bridge takes (along per unit across), about 50 degrees. */
const MAX_SKEW = 1.2;
/** Furthest a bridge turns away from the road's line to cross square to the river. */
const MAX_TURN = Math.PI / 6;

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

/** A point on the road's centreline; points at a map tile's centre carry that tile. */
interface RoadPoint { x: number; z: number; tile?: { tx: number; ty: number } }

const TOTAL = MAP_N + BORDER * 2;
const bridgeKey = (tx: number, ty: number) => (ty + 1000) * 4096 + (tx + 1000);

/**
 * Turns the 20x20 game map into a continuous landscape: a height field with
 * hills, a carved river (with bridges wherever the road crosses it),
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
  /** Bridges whose deck overlaps each tile, including the approaches on the banks. */
  private deckMap = new Map<number, Bridge[]>();

  constructor(readonly map: Tile[][]) {
    this.seed = hashString(map.map(r => r.map(t => t.terrain[0] + t.terrain[1]).join('')).join('|'));
    this.noise = new Simplex(this.seed);
    this.noise2 = new Simplex(this.seed ^ 0x9e3779b9);

    this.buildExtendedTerrain();
    this.buildRiver();

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
    this.carveRiver();
    // The road comes after the river so it can find its crossings and run
    // straight over each bridge, and before the heights it flattens.
    this.buildRoad();
    this.buildHeights();
    this.finishBridges();
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

  /** Bilinear sample of one of the height-grid fields. */
  private sampleGrid(arr: Float32Array, x: number, z: number): number {
    const gx = clamp((x - WORLD_MIN) / this.step, 0, this.vn - 1.001);
    const gz = clamp((z - WORLD_MIN) / this.step, 0, this.vn - 1.001);
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const i = iz * this.vn + ix;
    const a = arr[i], b = arr[i + 1], c = arr[i + this.vn], d = arr[i + this.vn + 1];
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  }

  /** Bilinear sample of the terrain surface. */
  height(x: number, z: number): number {
    return this.sampleGrid(this.heights, x, z);
  }

  /** The bridge whose deck covers a point (grown by `pad`), if any. */
  deckAt(x: number, z: number, pad = 0): Bridge | undefined {
    const list = this.deckMap.get(bridgeKey(Math.floor(x / TILE), Math.floor(z / TILE)));
    if (!list) return undefined;
    for (const b of list) {
      const { u, c } = deckFrame(b, x, z);
      if (Math.abs(c) <= BRIDGE_WIDTH / 2 + pad && u >= b.a0 - pad && u <= b.a1 + pad) return b;
    }
    return undefined;
  }

  /** Walkable height: bridge decks override the river and banks beneath them. */
  ground(x: number, z: number): number {
    const h = this.height(x, z);
    const b = this.deckAt(x, z);
    return b ? Math.max(h, deckHeight(b, deckFrame(b, x, z).u)) : h;
  }

  /** Keeps a point on a bridge deck from stepping off the side into the river. */
  confine(x: number, z: number, out: { x: number; z: number }) {
    out.x = x; out.z = z;
    const b = this.bridgeMap.get(bridgeKey(Math.floor(x / TILE), Math.floor(z / TILE)));
    if (!b) return out;
    const lim = BRIDGE_WIDTH / 2 - 0.1;
    const { u, c } = deckFrame(b, x, z);
    if (Math.abs(c) <= lim) return out;
    const p = deckPoint(b, u, clamp(c, -lim, lim));
    out.x = p.x; out.z = p.z;
    return out;
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
      // Leave from the river tile nearest the row's middle, never from a dry tile between
      // two channels: carving through that would leave it under water.
      const xs = rows[startRow];
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      let x = xs.reduce((best, v) => (Math.abs(v - mean) < Math.abs(best - mean) ? v : best));
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
    const left: RoadPoint[] = [];
    let y = ys[0]!;
    for (let k = 1; k <= BORDER + 2; k++) {
      y += Math.round((rng() - 0.5) * 0.9);
      left.unshift({ x: (-k + 0.5) * TILE, z: (y + 0.5) * TILE });
      this.clearForRoad(-k, y);
    }
    const right: RoadPoint[] = [];
    y = ys[MAP_N - 1]!;
    for (let k = 0; k < BORDER + 2; k++) {
      y += Math.round((rng() - 0.5) * 0.9);
      right.push({ x: (MAP_N + k + 0.5) * TILE, z: (y + 0.5) * TILE });
      this.clearForRoad(MAP_N + k, y);
    }
    const pts: RoadPoint[] = [...left, ...ys.map((ty, tx) => ({ x: (tx + 0.5) * TILE, z: (ty! + 0.5) * TILE, tile: { tx, ty: ty! } })), ...right];
    // Light smoothing of the poly-line so the road meanders instead of zig-zagging,
    // as long as that doesn't pull it into the river.
    const rv = (x: number, z: number) => this.sampleGrid(this.river, x, z);
    const sm = pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const z = (pts[i - 1].z + p.z * 2 + pts[i + 1].z) / 4;
      return rv(p.x, z) > Math.max(rv(p.x, p.z), 0.05) ? p : { ...p, z };
    });
    const road = this.placeBridges(sm);
    for (let i = 1; i < road.length; i++) {
      this.roadSegs.push(makeSeg(road[i - 1].x, road[i - 1].z, road[i].x, road[i].z, TILE * 0.6));
    }
    this.roadPolyline.push(...road.map(({ x, z }) => ({ x, z })));
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

  /** Channel depth factor (0 = dry, 1 = channel core) at every height-grid vertex. */
  private carveRiver() {
    const n = this.noise, vn = this.vn;
    for (let iz = 0; iz < vn; iz++) {
      const z = WORLD_MIN + iz * this.step;
      for (let ix = 0; ix < vn; ix++) {
        const x = WORLD_MIN + ix * this.step;
        let rv = 0;
        for (const s of this.riverSegs) {
          if (x < s.minx || x > s.maxx || z < s.minz || z > s.maxz) continue;
          const d = segDist(s, x, z) + n.noise(x * 0.9, z * 0.9) * 0.12;
          rv = Math.max(rv, 1 - smoothstep(RIVER_R0, RIVER_R1, d));
        }
        for (const c of this.riverTileCenters) {
          const dx = Math.abs(x - c.x), dz = Math.abs(z - c.z);
          if (dx > RIVER_R1 || dz > RIVER_R1) continue;
          const d = Math.pow(dx ** 4 + dz ** 4, 0.25);
          rv = Math.max(rv, 1 - smoothstep(RIVER_R0 + 0.06, RIVER_R1, d));
        }
        this.river[iz * vn + ix] = rv;
      }
    }
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
        const rv = this.river[i];
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

  /**
   * Bridges wherever the road crosses the channel. Each runs straight along the
   * road's line from where it enters the water to where it leaves (a road that
   * changes row mid-river gets one bridge on the diagonal), skewed to the angle
   * the river crosses at. Returns the road with the points each bridge carries
   * replaced by its two landings.
   */
  private placeBridges(verts: RoadPoint[]): RoadPoint[] {
    const rv = (x: number, z: number) => this.sampleGrid(this.river, x, z);
    const STEP = 0.05, WET = 0.12;

    // Walk the road, marking the stretches where it is in the channel.
    const samples: { x: number; z: number; t: number; v: number }[] = [];
    for (let i = 0; i < verts.length - 1; i++) {
      const a = verts[i], b = verts[i + 1];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP);
      for (let k = 0; k < n; k++) {
        const x = lerp(a.x, b.x, k / n), z = lerp(a.z, b.z, k / n);
        samples.push({ x, z, t: i + k / n, v: rv(x, z) });
      }
    }
    const last = verts[verts.length - 1];
    samples.push({ x: last.x, z: last.z, t: verts.length - 1, v: rv(last.x, last.z) });
    const runs: [number, number][] = [];
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].v < WET) continue;
      let j = i;
      while (j + 1 < samples.length && samples[j + 1].v >= WET) j++;
      let deep = 0;
      for (let k = i; k <= j; k++) deep = Math.max(deep, samples[k].v);
      // Ignore the road brushing a bank; join channels with only a sliver of land between.
      if (deep >= 0.35) {
        const prev = runs[runs.length - 1];
        if (prev && (i - prev[1]) * STEP < 1.0) prev[1] = j;
        else runs.push([i, j]);
      }
      i = j;
    }

    const half = BRIDGE_WIDTH / 2;
    const offsets = [-half, -half / 2, 0, half / 2, half];
    const out: (RoadPoint & { key: number })[] = [];
    const dropped = new Set<number>();
    for (const [i, j] of runs) {
      const E = samples[Math.max(0, i - 1)], X = samples[Math.min(samples.length - 1, j + 1)];
      const len = Math.hypot(X.x - E.x, X.z - E.z);
      // Start along the road's line through the water, centred on the crossing.
      const b: Bridge = {
        tiles: [], ox: (E.x + X.x) / 2, oz: (E.z + X.z) / 2, dx: (X.x - E.x) / len, dz: (X.z - E.z) / len,
        skew: 0, a0: -len / 2, a1: len / 2, h0: 0, h1: 0, peak: 0, w0: 0, w1: 0,
      };
      // Where the channel starts and ends along each line of the deck's width, and from
      // that the skew and the landings.
      const fit = () => {
        b.skew = 0;
        const wetRun = (o: number): [number, number] | null => {
          const at = (u: number) => { const p = deckPoint(b, u, o); return rv(p.x, p.z); };
          let u0: number | null = null;
          for (let d = 0; d <= len / 2 + 2 && u0 === null; d += STEP) {
            if (at(-d) >= WET) u0 = -d;
            else if (at(d) >= WET) u0 = d;
          }
          if (u0 === null) return null;
          let lo = u0, hi = u0;
          while (lo > -len - 4 && at(lo - STEP) >= WET) lo -= STEP;
          while (hi < len + 4 && at(hi + STEP) >= WET) hi += STEP;
          return [lo, hi];
        };
        const edges = offsets.map(o => ({ o, run: wetRun(o) })).filter(r => r.run) as { o: number; run: [number, number] }[];
        const edgeA = edges.find(r => r.o === -half), edgeB = edges.find(r => r.o === half);
        const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
        const skew = edgeA && edgeB ? (mid(edgeB.run) - mid(edgeA.run)) / BRIDGE_WIDTH : 0;
        b.skew = clamp(skew, -MAX_SKEW, MAX_SKEW);
        b.a0 = Math.min(-len / 2, ...edges.map(r => r.run[0] - b.skew * r.o)) - 0.2;
        b.a1 = Math.max(len / 2, ...edges.map(r => r.run[1] - b.skew * r.o)) + 0.2;
        return skew;
      };
      // Bridges cross square to the river where they can: turn towards that (the road
      // bends to meet the landings) and leave the rest to the skew.
      const skew = fit();
      if (Math.abs(skew) > 0.3) {
        const turn = clamp(-Math.atan(skew), -MAX_TURN, MAX_TURN);
        const cs = Math.cos(turn), sn = Math.sin(turn);
        [b.dx, b.dz] = [b.dx * cs - b.dz * sn, b.dz * cs + b.dx * sn];
        fit();
      }
      this.bridges.push(b);

      // Road tiles on the bridge give way to its landings.
      let first = Infinity, lastDropped = -Infinity;
      verts.forEach((v, k) => {
        // Everything on the stretch of road it replaces, and any point just past a landing.
        const { u, c } = deckFrame(b, v.x, v.z);
        const within = k > E.t && k < X.t;
        if (!within && (u < b.a0 - 0.3 || u > b.a1 + 0.3 || Math.abs(c) > TILE * 0.75)) return;
        dropped.add(k);
        first = Math.min(first, k);
        lastDropped = Math.max(lastDropped, k);
        if (v.tile && rv(v.x, v.z) >= WET) b.tiles.push(v.tile);
      });
      if (!b.tiles.length) {
        // The channel runs between two tile centres: the bridge belongs to the nearer one.
        const m = deckPoint(b, (b.a0 + b.a1) / 2, 0);
        const near = verts.filter(v => v.tile).reduce((p, v) => (Math.hypot(v.x - m.x, v.z - m.z) < Math.hypot(p.x - m.x, p.z - m.z) ? v : p));
        if (Math.hypot(near.x - m.x, near.z - m.z) < TILE) b.tiles.push(near.tile!);
      }
      for (const t of b.tiles) this.bridgeMap.set(bridgeKey(t.tx, t.ty), b);
      const p0 = deckPoint(b, b.a0, 0), p1 = deckPoint(b, b.a1, 0);
      out.push({ ...p0, key: Math.min(E.t, first - 0.01) });
      out.push({ ...p1, key: Math.max(X.t, lastDropped + 0.01) });
    }
    verts.forEach((v, k) => { if (!dropped.has(k)) out.push({ ...v, key: k }); });
    out.sort((a, b) => a.key - b.key);
    return out.map(({ key: _key, ...p }) => p);
  }

  /** Once the ground exists: deck heights, the water the arches span, and the deck index. */
  private finishBridges() {
    const half = BRIDGE_WIDTH / 2;
    const offsets = [-half, -half / 2, 0, half / 2, half];
    for (const b of this.bridges) {
      const h = (u: number, o: number) => { const p = deckPoint(b, u, o); return this.height(p.x, p.z); };
      // Landings sit just on top of the highest ground under the deck's width.
      b.h0 = Math.max(...offsets.map(o => h(b.a0, o))) + 0.015;
      b.h1 = Math.max(...offsets.map(o => h(b.a1, o))) + 0.015;
      let w0 = Infinity, w1 = -Infinity;
      for (const o of offsets) {
        for (let u = b.a0; u <= b.a1; u += 0.05) {
          if (h(u, o) < WATER_LEVEL + 0.02) {
            w0 = Math.min(w0, u);
            w1 = Math.max(w1, u);
          }
        }
      }
      if (w0 > w1) { w0 = b.a0 + 0.4; w1 = b.a1 - 0.4; }
      b.w0 = w0;
      b.w1 = w1;
      const len = b.a1 - b.a0;
      b.peak = Math.max(0.15 + hash2(Math.round(b.ox), Math.round(b.oz), this.seed) * 0.02 + 0.012 * len, Math.max(b.h0, b.h1) + 0.06);

      // Index every tile the deck (plus a margin) overlaps, for ground() lookups.
      const corners = [b.a0, b.a1].flatMap(u => [-half, half].map(c => deckPoint(b, u, c)));
      const pad = 0.5;
      const x0 = Math.floor((Math.min(...corners.map(p => p.x)) - pad) / TILE), x1 = Math.floor((Math.max(...corners.map(p => p.x)) + pad) / TILE);
      const z0 = Math.floor((Math.min(...corners.map(p => p.z)) - pad) / TILE), z1 = Math.floor((Math.max(...corners.map(p => p.z)) + pad) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        for (let tz = z0; tz <= z1; tz++) {
          const key = bridgeKey(tx, tz);
          const list = this.deckMap.get(key);
          if (list) list.push(b); else this.deckMap.set(key, [b]);
        }
      }
    }
  }
}
