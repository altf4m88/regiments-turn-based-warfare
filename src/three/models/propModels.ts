import * as THREE from 'three';
import { GeoBuilder, V3 } from '../core/GeoBuilder';
import { clamp } from '../core/constants';

const STONE = '#a9a191';
const STONE_DARK = '#7d776b';
const SLATE = '#6b717b';
const TILE_RED = '#9c4a33';
const THATCH = '#a68c55';
const WOOD = '#6b4a2b';
const WOOD_DARK = '#4a3320';
const WINDOW = '#2a313c';
const CANVAS = '#e7e0cc';

// ---------------------------------------------------------------------------
// Vegetation

export const buildConifer = () => {
  const b = new GeoBuilder();
  b.cyl(0.03, 0.05, 0.32, 6, '#4f3a26', { p: [0, 0.16, 0] });
  b.cone(0.3, 0.5, 8, '#2d4b28', { p: [0, 0.5, 0] });
  b.cone(0.24, 0.44, 8, '#335629', { p: [0, 0.74, 0], r: [0, 0.4, 0] });
  b.cone(0.16, 0.38, 7, '#3b612f', { p: [0, 0.97, 0], r: [0, 0.8, 0] });
  return b.build();
};

/** `detail` 1 for trees near the battlefield, 0 for the distant countryside. */
export const buildOak = (detail = 1) => {
  const b = new GeoBuilder();
  b.cyl(0.04, 0.065, 0.48, 6, '#5a4430', { p: [0, 0.24, 0] });
  b.limb([0, 0.4, 0], [0.12, 0.6, 0.04], 0.03, 0.03, '#5a4430');
  b.limb([0, 0.42, 0], [-0.1, 0.62, -0.05], 0.03, 0.03, '#5a4430');
  b.ball(0.26, '#4a7531', { p: [0, 0.78, 0] }, detail);
  b.ball(0.2, '#56843a', { p: [0.17, 0.68, 0.06] }, detail);
  b.ball(0.19, '#447030', { p: [-0.16, 0.7, -0.07] }, detail);
  b.ball(0.17, '#5e8c3e', { p: [0.04, 0.68, -0.17] }, detail);
  b.ball(0.16, '#4f7d35', { p: [-0.04, 0.95, 0.06] }, detail);
  return b.build();
};

export const buildPoplar = () => {
  const b = new GeoBuilder();
  b.cyl(0.025, 0.045, 0.4, 6, '#5a4430', { p: [0, 0.2, 0] });
  b.ball(1, '#557f35', { p: [0, 0.85, 0], s: [0.13, 0.55, 0.13] });
  b.ball(1, '#4c7530', { p: [0.02, 1.05, 0.01], s: [0.09, 0.35, 0.09] });
  return b.build();
};

export const buildBush = () => {
  const b = new GeoBuilder();
  b.ball(0.11, '#4b6f2f', { p: [0, 0.07, 0] }, 0);
  b.ball(0.085, '#567c35', { p: [0.08, 0.06, 0.03] }, 0);
  b.ball(0.08, '#43662b', { p: [-0.07, 0.05, -0.03] }, 0);
  return b.build();
};

export const buildRock = () => {
  const b = new GeoBuilder();
  b.add(new THREE.DodecahedronGeometry(0.1, 0), '#8c8476', { s: [1.3, 0.7, 1] });
  b.add(new THREE.DodecahedronGeometry(0.06, 0), '#7a7365', { p: [0.09, -0.01, 0.04], s: [1, 0.8, 1.2] });
  return b.build();
};

/** Three crossed blades; normals point up so grass shades like the ground. */
export const buildGrassTuft = () => {
  const pos: number[] = [];
  const colors: number[] = [];
  const base = new THREE.Color('#5c7a2e');
  const tip = new THREE.Color('#a8b35e');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + i * 0.3;
    const dx = Math.cos(a) * 0.035, dz = Math.sin(a) * 0.035;
    const lean = 0.03 * (i % 2 ? 1 : -1);
    const h = 0.09 + (i % 3) * 0.025;
    pos.push(-dx, 0, -dz, dx, 0, dz, lean, h, lean * 0.5);
    colors.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeBoundingSphere();
  return g;
};

// ---------------------------------------------------------------------------
// Buildings. Footprints are centred on the origin, front door facing +Z.

const windows = (b: GeoBuilder, w: number, d: number, ys: number[], perSide: number, frame = '#e9e4d6') => {
  for (const y of ys) {
    for (let i = 0; i < perSide; i++) {
      const x = (i + 0.5) / perSide * w - w / 2;
      for (const s of [-1, 1]) {
        b.box(0.07, 0.075, 0.012, frame, { p: [x, y, s * (d / 2 + 0.004)] });
        b.box(0.05, 0.058, 0.014, WINDOW, { p: [x, y, s * (d / 2 + 0.006)] });
      }
    }
  }
};

export const buildCottage = (variant: number) => {
  const b = new GeoBuilder();
  const w = 0.56, d = 0.38, h = 0.3;
  const wall = variant % 2 ? '#e4dccb' : '#cfc3a6';
  b.box(w + 0.02, 0.05, d + 0.02, STONE_DARK, { p: [0, 0.025, 0] });
  b.box(w, h, d, wall, { p: [0, h / 2, 0] });
  b.prism(w + 0.08, 0.24, d + 0.1, variant % 3 === 0 ? THATCH : TILE_RED, { p: [0, h, 0] });
  b.box(0.065, 0.2, 0.065, STONE, { p: [w * 0.32, h + 0.16, -0.04] });
  b.box(0.09, 0.15, 0.015, WOOD_DARK, { p: [-0.1, 0.075, d / 2 + 0.006] });
  windows(b, w, d, [0.17], 2);
  return b.build();
};

export const buildTownhouse = () => {
  const b = new GeoBuilder();
  const w = 0.46, d = 0.38, h = 0.54;
  b.box(w + 0.02, 0.06, d + 0.02, STONE_DARK, { p: [0, 0.03, 0] });
  b.box(w, h, d, '#dcc9a5', { p: [0, h / 2, 0] });
  b.box(w + 0.01, 0.025, d + 0.01, '#c4b08a', { p: [0, 0.28, 0] });
  b.prism(w + 0.06, 0.22, d + 0.08, TILE_RED, { p: [0, h, 0] });
  b.box(0.06, 0.18, 0.06, STONE, { p: [-w * 0.3, h + 0.15, 0.05] });
  b.box(0.06, 0.18, 0.06, STONE, { p: [w * 0.3, h + 0.15, -0.05] });
  b.box(0.1, 0.17, 0.015, '#5b3a22', { p: [0, 0.085, d / 2 + 0.006] });
  windows(b, w, d, [0.2, 0.42], 3);
  return b.build();
};

export const buildBarn = () => {
  const b = new GeoBuilder();
  const w = 0.64, d = 0.42, h = 0.32;
  b.box(w, h, d, '#6e4c2e', { p: [0, h / 2, 0] });
  for (let i = 0; i < 7; i++) b.box(0.012, h, d + 0.01, WOOD_DARK, { p: [-w / 2 + (i + 0.5) * w / 7, h / 2, 0] });
  b.prism(w + 0.06, 0.3, d + 0.12, SLATE, { p: [0, h, 0] });
  b.box(0.2, 0.24, 0.015, '#4a3220', { p: [0, 0.12, d / 2 + 0.006] });
  b.box(0.2, 0.012, 0.018, WOOD, { p: [0, 0.12, d / 2 + 0.008], r: [0, 0, 0.9] });
  return b.build();
};

export const buildChurch = () => {
  const b = new GeoBuilder();
  b.box(0.42, 0.42, 0.9, '#c2b8a4', { p: [0, 0.21, -0.1] });
  b.add(new THREE.CylinderGeometry(0.21, 0.21, 0.42, 10, 1, false, Math.PI / 2, Math.PI), '#c2b8a4', { p: [0, 0.21, -0.55] });
  b.prism(0.98, 0.28, 0.46, SLATE, { p: [0, 0.42, -0.1], r: [0, Math.PI / 2, 0] });
  // Tower and spire
  b.box(0.28, 0.82, 0.28, '#b8ae9a', { p: [0, 0.41, 0.42] });
  b.box(0.3, 0.04, 0.3, STONE_DARK, { p: [0, 0.83, 0.42] });
  b.cone(0.2, 0.56, 4, SLATE, { p: [0, 1.13, 0.42], r: [0, Math.PI / 4, 0] });
  b.box(0.012, 0.12, 0.012, '#c9a43a', { p: [0, 1.46, 0.42] });
  b.box(0.06, 0.012, 0.012, '#c9a43a', { p: [0, 1.48, 0.42] });
  b.box(0.08, 0.13, 0.012, WINDOW, { p: [0, 0.66, 0.565] });
  b.box(0.11, 0.18, 0.015, '#5b3a22', { p: [0, 0.09, 0.565] });
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) b.box(0.012, 0.15, 0.06, WINDOW, { p: [s * 0.215, 0.24, -0.35 + i * 0.25] });
  }
  return b.build();
};

export const buildManor = () => {
  const b = new GeoBuilder();
  const w = 2.2, d = 0.9, h = 0.78;
  b.box(w + 0.04, 0.08, d + 0.04, STONE_DARK, { p: [0, 0.04, 0] });
  b.box(w, h, d, '#e2d8c0', { p: [0, h / 2, 0] });
  b.box(w + 0.02, 0.03, d + 0.02, '#c9bc9c', { p: [0, h * 0.5, 0] });
  b.prism(w + 0.04, 0.42, d + 0.06, SLATE, { p: [0, h, 0] });
  // Wings
  for (const s of [-1, 1]) {
    b.box(0.6, h * 0.82, 0.75, '#ddd2b8', { p: [s * (w / 2 + 0.22), h * 0.41, 0.5] });
    b.prism(0.8, 0.34, 0.66, SLATE, { p: [s * (w / 2 + 0.22), h * 0.82, 0.5], r: [0, Math.PI / 2, 0] });
  }
  // Central pediment and door
  b.box(0.5, 0.72, 0.06, '#d4c7a8', { p: [0, 0.36, d / 2 + 0.03] });
  b.prism(0.06, 0.18, 0.56, '#d4c7a8', { p: [0, 0.72, d / 2 + 0.03], r: [0, Math.PI / 2, 0] });
  b.box(0.16, 0.28, 0.02, '#4a3220', { p: [0, 0.14, d / 2 + 0.065] });
  windows(b, w, d, [0.22, 0.56], 9);
  for (let i = 0; i < 5; i++) b.box(0.07, 0.14, 0.07, STONE, { p: [-w / 2 + 0.2 + i * (w - 0.4) / 4, h + 0.32, 0] });
  return b.build();
};

export const buildWindmillBody = () => {
  const b = new GeoBuilder();
  b.cyl(0.26, 0.36, 1.0, 10, '#d9d1bf', { p: [0, 0.5, 0] });
  b.cone(0.3, 0.32, 10, '#6b4a2b', { p: [0, 1.16, 0] });
  b.box(0.12, 0.2, 0.02, '#4a3220', { p: [0, 0.1, 0.33] });
  b.box(0.07, 0.08, 0.02, WINDOW, { p: [0, 0.6, 0.3] });
  b.cyl(0.03, 0.03, 0.18, 6, WOOD_DARK, { p: [0, 1.1, 0.3], r: [Math.PI / 2, 0, 0] });
  return b.build();
};

export const buildWindmillSails = () => {
  const b = new GeoBuilder();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    b.box(0.03, 0.86, 0.02, WOOD_DARK, { p: [sa * 0.43, ca * 0.43, 0], r: [0, 0, -a] });
    b.box(0.16, 0.66, 0.008, '#eae3d1', { p: [sa * 0.5 + ca * 0.09, ca * 0.5 - sa * 0.09, 0.01], r: [0, 0, -a] });
  }
  b.ball(0.05, WOOD_DARK, {}, 0);
  return b.build();
};

// ---------------------------------------------------------------------------
// Camp & depot props

export const buildTent = (stripe?: string) => {
  const b = new GeoBuilder();
  b.prism(0.36, 0.24, 0.3, CANVAS, { p: [0, 0, 0], r: [0, Math.PI / 2, 0] });
  if (stripe) b.prism(0.37, 0.05, 0.06, stripe, { p: [0, 0.2, 0], r: [0, Math.PI / 2, 0] });
  b.box(0.012, 0.3, 0.012, WOOD, { p: [0, 0.15, 0.19] });
  b.box(0.1, 0.15, 0.006, '#c9c0a8', { p: [0, 0.07, 0.181] });
  return b.build();
};

export const buildMarquee = (stripe: string) => {
  const b = new GeoBuilder();
  b.box(0.5, 0.2, 0.4, CANVAS, { p: [0, 0.1, 0] });
  for (let i = 0; i < 5; i++) b.box(0.04, 0.2, 0.405, stripe, { p: [-0.2 + i * 0.1, 0.1, 0] });
  b.prism(0.52, 0.22, 0.42, CANVAS, { p: [0, 0.2, 0] });
  b.box(0.01, 0.55, 0.01, WOOD, { p: [0, 0.3, 0] });
  return b.build();
};

export const buildCrates = () => {
  const b = new GeoBuilder();
  const crate = (x: number, y: number, z: number, r: number, s = 0.12) => {
    b.box(s, s, s, '#8a6b3f', { p: [x, y + s / 2, z], r: [0, r, 0] });
    b.box(s + 0.004, 0.012, s + 0.004, WOOD_DARK, { p: [x, y + s * 0.85, z], r: [0, r, 0] });
  };
  crate(0, 0, 0, 0.1); crate(0.13, 0, 0.02, -0.1); crate(0.06, 0.12, 0.01, 0.3, 0.11);
  crate(-0.05, 0, 0.14, 0.4, 0.1);
  // Barrels
  const barrel = (x: number, z: number) => {
    b.cyl(0.045, 0.04, 0.12, 9, '#6e4f2c', { p: [x, 0.06, z] });
    b.cyl(0.047, 0.047, 0.012, 9, '#2d2d2d', { p: [x, 0.03, z] });
    b.cyl(0.047, 0.047, 0.012, 9, '#2d2d2d', { p: [x, 0.09, z] });
  };
  barrel(0.25, -0.05); barrel(0.3, 0.06); barrel(0.21, 0.08);
  // Sacks
  b.ball(1, '#c8b88e', { p: [-0.18, 0.04, -0.06], s: [0.07, 0.045, 0.05] });
  b.ball(1, '#bfae84', { p: [-0.16, 0.04, 0.04], s: [0.07, 0.045, 0.05] });
  b.ball(1, '#c8b88e', { p: [-0.17, 0.09, -0.01], s: [0.065, 0.04, 0.05] });
  return b.build();
};

export const buildWagon = () => {
  const b = new GeoBuilder();
  b.box(0.22, 0.05, 0.42, '#7a5a35', { p: [0, 0.13, 0] });
  b.box(0.22, 0.06, 0.012, WOOD_DARK, { p: [0, 0.18, 0.21] });
  b.box(0.22, 0.06, 0.012, WOOD_DARK, { p: [0, 0.18, -0.21] });
  b.add(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 10, 1, true, -Math.PI / 2, Math.PI), CANVAS, { p: [0, 0.16, 0], r: [Math.PI / 2, 0, 0] });
  for (const z of [-0.14, 0.14]) {
    for (const x of [-0.13, 0.13]) {
      b.add(new THREE.TorusGeometry(0.075, 0.01, 4, 12), WOOD_DARK, { p: [x, 0.08, z], r: [0, Math.PI / 2, 0] });
      b.box(0.01, 0.14, 0.01, WOOD_DARK, { p: [x, 0.08, z] });
    }
  }
  b.box(0.012, 0.012, 0.3, WOOD, { p: [0, 0.08, 0.34], r: [0.15, 0, 0] });
  return b.build();
};

export const buildFlagpole = (height: number) => {
  const b = new GeoBuilder();
  b.cyl(0.012, 0.018, height, 6, '#d8d2c4', { p: [0, height / 2, 0] });
  b.ball(0.025, '#c9a43a', { p: [0, height + 0.02, 0] }, 0);
  b.cyl(0.06, 0.08, 0.06, 8, STONE_DARK, { p: [0, 0.03, 0] });
  return b.build();
};

export const buildBrazier = () => {
  const b = new GeoBuilder();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.limb([Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07], [Math.cos(a) * 0.03, 0.18, Math.sin(a) * 0.03], 0.012, 0.012, '#2b2a28');
  }
  b.cyl(0.07, 0.045, 0.06, 8, '#3a3633', { p: [0, 0.2, 0] });
  b.cyl(0.06, 0.06, 0.012, 8, '#1a1716', { p: [0, 0.225, 0] });
  return b.build();
};

export const buildPlaza = () => {
  const b = new GeoBuilder();
  b.cyl(0.95, 0.98, 0.06, 28, '#b1aa98', { p: [0, 0.0, 0] });
  b.cyl(0.62, 0.62, 0.065, 24, '#c3bba6', { p: [0, 0.006, 0] });
  b.cyl(0.18, 0.2, 0.07, 16, '#8f8878', { p: [0, 0.01, 0] });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.box(0.05, 0.068, 0.3, '#9d9583', { p: [Math.cos(a) * 0.78, 0.004, Math.sin(a) * 0.78], r: [0, -a, 0] });
  }
  return b.build();
};

export const buildStoneWall = (length: number) => {
  const b = new GeoBuilder();
  const n = Math.max(1, Math.round(length / 0.12));
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + (i + 0.5) * (length / n);
    b.box(length / n + 0.01, 0.09 + (i % 3) * 0.01, 0.08, i % 2 ? STONE : '#9a9282', { p: [x, 0.045, 0] });
  }
  return b.build();
};

export const buildFence = (length: number) => {
  const b = new GeoBuilder();
  const n = Math.max(2, Math.round(length / 0.2));
  for (let i = 0; i <= n; i++) b.box(0.018, 0.13, 0.018, WOOD, { p: [-length / 2 + (i * length) / n, 0.065, 0] });
  b.box(length, 0.014, 0.01, WOOD, { p: [0, 0.1, 0] });
  b.box(length, 0.014, 0.01, WOOD, { p: [0, 0.05, 0] });
  return b.build();
};

export const buildHaystack = () => {
  const b = new GeoBuilder();
  b.cyl(0.1, 0.14, 0.14, 9, '#c8ad5c', { p: [0, 0.07, 0] });
  b.cone(0.11, 0.12, 9, '#bfa250', { p: [0, 0.2, 0] });
  return b.build();
};

export const buildWell = () => {
  const b = new GeoBuilder();
  b.cyl(0.09, 0.09, 0.1, 10, STONE, { p: [0, 0.05, 0] });
  b.cyl(0.07, 0.07, 0.102, 10, '#1d2a30', { p: [0, 0.052, 0] });
  b.box(0.015, 0.22, 0.015, WOOD, { p: [-0.08, 0.15, 0] });
  b.box(0.015, 0.22, 0.015, WOOD, { p: [0.08, 0.15, 0] });
  b.prism(0.22, 0.08, 0.16, TILE_RED, { p: [0, 0.25, 0] });
  return b.build();
};

export interface BridgeSpec {
  /** Landings on the two banks, along local +X from the bridge's centre. */
  x0: number;
  x1: number;
  /** Open water under the deck, in the same frame. */
  w0: number;
  w1: number;
  width: number;
  /** Shift in x per unit of z, so the ends and piers lie along a river crossing at an angle. */
  skew: number;
  /** Walkable deck height at local x, measured before the skew. */
  deck: (x: number) => number;
}

/**
 * A stone road bridge running along local +X from bank to bank: arches over
 * the water on pointed cutwaters, a humped roadway, parapets and end posts.
 * A skewed bridge is built square, then sheared to the river's angle.
 */
export const buildStoneBridge = ({ x0, x1, w0, w1, width, skew, deck }: BridgeSpec) => {
  const b = new GeoBuilder();
  const BED = -0.6, SPRING = -0.12, PIER = 0.2;
  const n = Math.max(8, Math.ceil((x1 - x0) / 0.12));
  const xs = Array.from({ length: n + 1 }, (_, i) => x0 + ((x1 - x0) * i) / n);
  const extrude = (shape: THREE.Shape, depth: number, z: number, color: string) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, z - depth / 2);
    b.add(g, color);
  };
  // A strip following the deck's profile between two heights above it.
  const band = (lo: number, hi: number, depth: number, z: number, color: string) => {
    const s = new THREE.Shape();
    s.moveTo(x0, deck(x0) + lo);
    for (const x of xs) s.lineTo(x, deck(x) + hi);
    for (let i = n; i > 0; i--) s.lineTo(xs[i], deck(xs[i]) + lo);
    extrude(s, depth, z, color);
  };

  // Arches across the open water, with piers between them.
  const lo = Math.max(x0 + 0.3, w0 - 0.1), hi = Math.min(x1 - 0.3, w1 + 0.1);
  const count = Math.max(1, Math.round((hi - lo) / 0.9));
  const span = (hi - lo - PIER * (count - 1)) / count;
  const arches = Array.from({ length: count }, (_, k) => lo + k * (span + PIER));

  // Body: the deck's profile on top, abutments and piers down into the river bed,
  // and each arch cut out of the underside.
  const body = new THREE.Shape();
  body.moveTo(x0, BED);
  for (const x of xs) body.lineTo(x, deck(x) - 0.015);
  body.lineTo(x1, BED);
  for (let k = count - 1; k >= 0; k--) {
    const l = arches[k], r = l + span, c = (l + r) / 2, hw = span / 2;
    let room = Infinity;
    for (let t = 0; t <= 1; t += 0.1) room = Math.min(room, deck(l + span * t) - 0.1 - SPRING);
    const rise = clamp(room, 0.03, hw);
    body.lineTo(r, BED);
    body.lineTo(r, SPRING);
    for (let j = 1; j < 14; j++) {
      const a = (Math.PI * j) / 14;
      body.lineTo(c + hw * Math.cos(a), SPRING + rise * Math.sin(a));
    }
    body.lineTo(l, SPRING);
    body.lineTo(l, BED);
  }
  extrude(body, width - 0.04, 0, '#958d7c');

  band(-0.03, 0, width - 0.16, 0, '#8f8571'); // roadway
  band(-0.07, -0.04, width + 0.02, 0, STONE_DARK); // string course
  for (const side of [-1, 1]) {
    const z = side * (width / 2 - 0.035);
    band(-0.02, 0.11, 0.07, z, STONE); // parapet
    band(0.11, 0.135, 0.09, z, STONE_DARK); // coping
    for (const x of [x0 + 0.07, x1 - 0.07]) {
      b.box(0.14, 0.24, 0.13, STONE_DARK, { p: [x, deck(x) + 0.08, z] });
      b.box(0.17, 0.03, 0.16, STONE, { p: [x, deck(x) + 0.215, z] });
    }
    // Pointed cutwaters on both faces of every pier.
    for (let k = 1; k < count; k++) {
      const px = arches[k] - PIER / 2, h = SPRING + 0.1 - BED;
      const r: V3 = [0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0];
      const pz = side * (width / 2 - 0.05);
      b.add(new THREE.CylinderGeometry(PIER / 2 + 0.01, PIER / 2 + 0.01, h, 2, 1, false, 0, Math.PI), '#958d7c', { p: [px, BED + h / 2, pz], r });
      b.add(new THREE.ConeGeometry(PIER / 2 + 0.01, 0.12, 2, 1, false, 0, Math.PI), STONE_DARK, { p: [px, SPRING + 0.16, pz], r });
    }
  }
  const geo = b.build();
  // Skew the whole bridge (x += skew * z) so abutments, piers and cutwaters follow the banks.
  if (skew) geo.applyMatrix4(new THREE.Matrix4().set(1, 0, skew, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
  return geo;
};
