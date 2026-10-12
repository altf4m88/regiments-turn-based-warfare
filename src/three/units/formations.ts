import { UnitType } from '../../game/types';
import { hash2 } from '../core/noise';

/** A position in a formation, in the regiment's local frame (forward = +Z). */
export interface Slot {
  x: number;
  z: number;
  /** Heading relative to the regiment's heading. */
  h: number;
}

export type FormationMode = 'line' | 'column' | 'square' | 'skirmish' | 'battery' | 'squadron' | 'loose';

/** Figures representing a full-strength regiment (rank and file only). */
export const RANK_FIGURES: Record<UnitType, number> = {
  line_infantry: 24,
  light_infantry: 12,
  cannon: 4,
  hussars: 6,
  chasseurs: 6,
};

export const modeFor = (type: UnitType, box: boolean): FormationMode => {
  switch (type) {
    case 'line_infantry': return box ? 'square' : 'line';
    case 'light_infantry': return 'skirmish';
    case 'cannon': return 'battery';
    case 'hussars': return 'squadron';
    case 'chasseurs': return 'loose';
  }
};

const LINE_DX = 0.17;
const LINE_DZ = 0.2;

/** Rank-and-file slots for `n` figures. */
export const rankSlots = (mode: FormationMode, n: number, seed: number): Slot[] => {
  const out: Slot[] = [];
  if (n <= 0) return out;
  switch (mode) {
    case 'line': {
      const ranks = n >= 9 ? 3 : n >= 4 ? 2 : 1;
      const files = Math.ceil(n / ranks);
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / files), f = i % files;
        const inRank = r < ranks - 1 ? files : n - files * (ranks - 1);
        out.push({ x: (f - (inRank - 1) / 2) * LINE_DX, z: 0.2 - r * LINE_DZ, h: 0 });
      }
      break;
    }
    case 'column': {
      const cols = n >= 6 ? 3 : n >= 2 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols), c = i % cols;
        out.push({ x: (c - (cols - 1) / 2) * 0.16, z: 0.62 - r * 0.18, h: 0 });
      }
      break;
    }
    case 'square': {
      // Hollow square, two ranks deep when there are enough men, every face looking out.
      const ring = (count: number, L: number) => {
        for (let i = 0; i < count; i++) {
          const s = ((i + 0.5) / count) * 4 * L;
          const side = Math.min(3, Math.floor(s / L));
          const u = s - side * L - L / 2;
          if (side === 0) out.push({ x: u, z: L / 2, h: 0 });
          else if (side === 1) out.push({ x: L / 2, z: -u, h: Math.PI / 2 });
          else if (side === 2) out.push({ x: -u, z: -L / 2, h: Math.PI });
          else out.push({ x: -L / 2, z: u, h: -Math.PI / 2 });
        }
      };
      if (n >= 16) {
        const outer = Math.ceil(n / 2);
        ring(outer, 1.08);
        ring(n - outer, 0.8);
      } else {
        ring(n, n >= 8 ? 0.8 : 0.55);
      }
      break;
    }
    case 'skirmish': {
      const cols = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const row = i % 2, col = Math.floor(i / 2);
        out.push({
          x: (col - (cols - 1) / 2) * 0.27 + (hash2(i, 1, seed) - 0.5) * 0.09 + row * 0.12,
          z: (row === 0 ? 0.28 : -0.06) + (hash2(i, 2, seed) - 0.5) * 0.14,
          h: (hash2(i, 3, seed) - 0.5) * 0.7,
        });
      }
      break;
    }
    case 'battery': {
      const crew: Slot[] = [
        { x: -0.21, z: 0.2, h: 0.25 },
        { x: 0.2, z: 0.12, h: -0.35 },
        { x: -0.17, z: -0.34, h: 0.1 },
        { x: 0.19, z: -0.38, h: -0.1 },
      ];
      for (let i = 0; i < n; i++) out.push(crew[i % crew.length]);
      break;
    }
    case 'squadron':
    case 'loose': {
      const loose = mode === 'loose';
      const perRank = n > 4 ? Math.ceil(n / 2) : n;
      const ranks = Math.ceil(n / perRank);
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / perRank), f = i % perRank;
        const inRank = r < ranks - 1 ? perRank : n - perRank * (ranks - 1);
        const jx = loose ? (hash2(i, 5, seed) - 0.5) * 0.14 : 0;
        const jz = loose ? (hash2(i, 6, seed) - 0.5) * 0.2 : 0;
        out.push({ x: (f - (inRank - 1) / 2) * (loose ? 0.32 : 0.25) + jx, z: 0.22 - r * 0.44 + jz, h: loose ? (hash2(i, 7, seed) - 0.5) * 0.3 : 0 });
      }
      break;
    }
  }
  return out;
};

/** Slots for the colour party, officer and drummer, and the gun itself. */
export const specialSlot = (mode: FormationMode, role: 'bearer' | 'officer' | 'drummer' | 'gun' | 'guidon', n: number): Slot => {
  if (mode === 'square') {
    if (role === 'bearer') return { x: 0, z: 0, h: 0 };
    if (role === 'officer') return { x: 0.2, z: 0.12, h: 0.4 };
    return { x: -0.2, z: -0.12, h: -0.4 };
  }
  if (mode === 'column') {
    const rows = Math.ceil(n / (n >= 6 ? 3 : 2));
    if (role === 'officer') return { x: 0, z: 0.86, h: 0 };
    if (role === 'drummer') return { x: 0.3, z: 0.6, h: 0 };
    return { x: 0, z: 0.62 - rows * 0.18 - 0.02, h: 0 };
  }
  if (mode === 'line') {
    const ranks = n >= 9 ? 3 : n >= 4 ? 2 : 1;
    const files = Math.max(1, Math.ceil(n / ranks));
    const half = ((files - 1) / 2) * LINE_DX;
    if (role === 'bearer') return { x: 0, z: 0.2 - ranks * LINE_DZ - 0.04, h: 0 };
    if (role === 'officer') return { x: half + 0.2, z: 0.26, h: -0.3 };
    return { x: -half - 0.16, z: 0.0, h: 0.2 };
  }
  if (role === 'gun') return { x: 0, z: 0.12, h: 0 };
  if (role === 'guidon') return { x: 0.04, z: mode === 'loose' ? -0.68 : -0.64, h: 0 };
  if (role === 'officer') return { x: 0, z: -0.46, h: 0 };
  return { x: 0, z: -0.4, h: 0 };
};
