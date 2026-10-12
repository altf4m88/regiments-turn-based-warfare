import { Facing } from '../../game/types';

/** World units per map tile. */
export const TILE = 2;
/** Playable map size in tiles (matches engine MAP_SIZE). */
export const MAP_N = 20;
/** Decorative land generated around the playable area, in tiles. */
export const BORDER = 12;
/** Height-field samples per tile. */
export const RES = 6;

export const WORLD_MIN = -BORDER * TILE;
export const WORLD_MAX = (MAP_N + BORDER) * TILE;
export const WORLD_SIZE = WORLD_MAX - WORLD_MIN;
export const MAP_CENTER = (MAP_N * TILE) / 2;

export const WATER_LEVEL = -0.16;
/** Width of bridge decks; figures crossing are kept on the deck. */
export const BRIDGE_WIDTH = 1.15;
export const RIVER_BED = -0.42;

/** Wind blows toward +x / slightly +z. Shared by flags, smoke, trees. */
export const WIND = { x: 0.9, z: 0.35 };

export const TEAM = {
  1: {
    name: 'Player 1',
    css: '#2563eb',
    coat: '#2b4c8c',
    coatDark: '#1d3461',
    facing: '#e9dcb0',
    trousers: '#e7e3d8',
    plume: '#f4f4f0',
    carriage: '#5b6b79',
    flagBase: '#1d3461',
  },
  2: {
    name: 'Player 2',
    css: '#dc2626',
    coat: '#a3271f',
    coatDark: '#6b1913',
    facing: '#1f2d55',
    trousers: '#d8d2c2',
    plume: '#c8102e',
    carriage: '#5d6b3a',
    flagBase: '#6b1913',
  },
} as const;

export type TeamId = 1 | 2;

export const tileCenter = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE, z: (ty + 0.5) * TILE });

export const worldToTile = (x: number, z: number) => ({ tx: Math.floor(x / TILE), ty: Math.floor(z / TILE) });

export const inMap = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < MAP_N && ty < MAP_N;

/**
 * Heading is a rotation about +Y; a heading of 0 faces +Z (south on the map).
 * North (y decreasing) is -Z.
 */
export const facingToHeading = (f: Facing): number => {
  switch (f) {
    case 'north': return Math.PI;
    case 'east': return Math.PI / 2;
    case 'south': return 0;
    case 'west': return -Math.PI / 2;
  }
};

export const headingTo = (dx: number, dz: number) => Math.atan2(dx, dz);

/** Shortest signed angular difference b - a in (-PI, PI]. */
export const angleDelta = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
