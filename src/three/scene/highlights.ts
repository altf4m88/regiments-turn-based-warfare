import * as THREE from 'three';
import { GameState, Regiment } from '../../game/types';
import { getTerrainMpCost, getZoCStatus, isTargetInFiringLine } from '../../game/engine';
import { MAP_N } from '../core/constants';

export interface Reach {
  cost: Map<number, number>;
  prev: Map<number, number>;
}

const key = (x: number, y: number) => y * MAP_N + x;

/**
 * Tiles a unit can reach this turn with `mv`, using the same rules as the
 * engine's findPath: 4-way steps, terrain MP costs, occupied tiles blocked,
 * and infantry unable to slip through gaps in an enemy line (ZoC).
 */
export const computeReach = (unit: Regiment, state: GameState): Reach => {
  const cost = new Map<number, number>();
  const prev = new Map<number, number>();
  const occupied = new Set(state.regiments.filter(r => r.id !== unit.id).map(r => key(r.x, r.y)));
  const start = key(unit.x, unit.y);
  cost.set(start, 0);
  const open: number[] = [start];
  while (open.length) {
    open.sort((a, b) => cost.get(a)! - cost.get(b)!);
    const cur = open.shift()!;
    const cx = cur % MAP_N, cy = Math.floor(cur / MAP_N);
    const c0 = cost.get(cur)!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_N || ny >= MAP_N) continue;
      const k = key(nx, ny);
      if (occupied.has(k)) continue;
      if (!getZoCStatus(nx, ny, unit, state.regiments).canPass) continue;
      const nc = c0 + getTerrainMpCost(state.map[ny][nx].terrain);
      if (nc > unit.mp) continue;
      if (!cost.has(k) || cost.get(k)! > nc) {
        cost.set(k, nc);
        prev.set(k, cur);
        open.push(k);
      }
    }
  }
  return { cost, prev };
};

export const pathTo = (reach: Reach, x: number, y: number) => {
  const out: { x: number; y: number }[] = [];
  let k: number | undefined = key(x, y);
  if (!reach.cost.has(k)) return null;
  while (k !== undefined && reach.prev.has(k)) {
    out.unshift({ x: k % MAP_N, y: Math.floor(k / MAP_N) });
    k = reach.prev.get(k);
  }
  return out;
};

const COLORS = {
  move: new THREE.Color('#4f8ff7'),
  reach: new THREE.Color('#7fb0ff'),
  danger: new THREE.Color('#fb923c'),
  attack: new THREE.Color('#ef4444'),
  range: new THREE.Color('#f87171'),
  path: new THREE.Color('#e0ecff'),
  friendly: new THREE.Color('#fde68a'),
};

export interface HoverInfo {
  x: number;
  y: number;
  path: { x: number; y: number }[] | null;
  cost: number | null;
  attack: boolean;
}

/**
 * Paints the per-tile overlay texture: movement range, dangerous gaps, firing
 * arcs and attackable targets for the selected regiment, plus a path preview
 * to the hovered tile.
 */
export const paintOverlay = (
  data: Uint8Array,
  state: GameState,
  hover: { x: number; y: number } | null,
  reachCache: { id: string; sig: string; reach: Reach } | null,
): { hover: HoverInfo | null; reachCache: { id: string; sig: string; reach: Reach } | null } => {
  data.fill(0);
  const sel = state.regiments.find(r => r.id === state.selectedUnitId);
  let hoverInfo: HoverInfo | null = hover ? { x: hover.x, y: hover.y, path: null, cost: null, attack: false } : null;
  if (!sel) return { hover: hoverInfo, reachCache: null };

  const set = (x: number, y: number, c: THREE.Color, a: number) => {
    const i = (y * MAP_N + x) * 4;
    if (data[i + 3] / 255 > a) return;
    // Overlay colours are written as sRGB bytes; the shader blends them directly.
    data[i] = Math.round(c.r * 255);
    data[i + 1] = Math.round(c.g * 255);
    data[i + 2] = Math.round(c.b * 255);
    data[i + 3] = Math.round(a * 255);
  };

  const mine = sel.owner === state.currentPlayer && !state.winner;
  const occupiedBy = new Map(state.regiments.map(r => [key(r.x, r.y), r]));

  // Firing arc (shown for any selected unit so you can read enemy threats too).
  for (let y = Math.max(0, sel.y - sel.range); y <= Math.min(MAP_N - 1, sel.y + sel.range); y++) {
    for (let x = Math.max(0, sel.x - sel.range); x <= Math.min(MAP_N - 1, sel.x + sel.range); x++) {
      if (x === sel.x && y === sel.y) continue;
      if (!isTargetInFiringLine(sel, x, y)) continue;
      const u = occupiedBy.get(key(x, y));
      if (u && u.owner !== sel.owner && mine && !sel.hasAttacked) set(x, y, COLORS.attack, 0.78);
      else set(x, y, COLORS.range, mine ? 0.16 : 0.12);
    }
  }

  let reach: Reach | null = null;
  let cache = reachCache;
  if (mine && sel.mp > 0 && !sel.isBoxFormation && !sel.isPalisaded && !sel.isEntrenched) {
    const sig = `${sel.x},${sel.y},${sel.mp},${state.regiments.map(r => `${r.id}${r.x}.${r.y}`).join('|')}`;
    if (cache && cache.id === sel.id && cache.sig === sig) reach = cache.reach;
    else {
      reach = computeReach(sel, state);
      cache = { id: sel.id, sig, reach };
    }
    for (const [k, c] of reach.cost) {
      const x = k % MAP_N, y = Math.floor(k / MAP_N);
      if (c === 0) continue;
      const danger = getZoCStatus(x, y, sel, state.regiments).takesDamage;
      set(x, y, danger ? COLORS.danger : COLORS.reach, danger ? 0.5 : 0.3);
    }
    // Adjacent steps (incl. diagonals) that a direct click allows.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = sel.x + dx, y = sel.y + dy;
        if ((dx === 0 && dy === 0) || x < 0 || y < 0 || x >= MAP_N || y >= MAP_N) continue;
        if (occupiedBy.has(key(x, y))) continue;
        if (sel.mp < getTerrainMpCost(state.map[y][x].terrain)) continue;
        const z = getZoCStatus(x, y, sel, state.regiments);
        if (!z.canPass) continue;
        set(x, y, z.takesDamage ? COLORS.danger : COLORS.move, z.takesDamage ? 0.6 : 0.46);
      }
    }
  }

  if (hover && hoverInfo) {
    const u = occupiedBy.get(key(hover.x, hover.y));
    if (u && mine && u.owner !== sel.owner) {
      const dist = Math.max(Math.abs(sel.x - hover.x), Math.abs(sel.y - hover.y));
      hoverInfo.attack = dist <= sel.range && !sel.hasAttacked && sel.mp >= 1 && isTargetInFiringLine(sel, hover.x, hover.y);
    } else if (!u && reach) {
      const path = pathTo(reach, hover.x, hover.y);
      if (path && path.length) {
        hoverInfo = { ...hoverInfo, path, cost: reach.cost.get(key(hover.x, hover.y)) ?? null };
        for (const p of path) set(p.x, p.y, COLORS.path, 0.62);
      }
    }
  }
  return { hover: hoverInfo, reachCache: cache };
};
