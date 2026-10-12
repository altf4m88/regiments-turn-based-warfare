import { TILE } from '../core/constants';

interface Circle { x: number; z: number; r: number }

/** Spatial hash of circular obstacles (tree trunks, houses, crates) that figures step around. */
export class Obstacles {
  private cells = new Map<string, Circle[]>();

  clear() {
    this.cells.clear();
  }

  add(x: number, z: number, r: number) {
    const c = { x, z, r };
    const minX = Math.floor((x - r) / TILE), maxX = Math.floor((x + r) / TILE);
    const minZ = Math.floor((z - r) / TILE), maxZ = Math.floor((z + r) / TILE);
    for (let tz = minZ; tz <= maxZ; tz++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const k = `${tx},${tz}`;
        let list = this.cells.get(k);
        if (!list) { list = []; this.cells.set(k, list); }
        list.push(c);
      }
    }
  }

  /** Pushes a point (with body radius `pad`) out of any overlapping obstacle. */
  resolve(p: { x: number; z: number }, pad = 0.05) {
    const list = this.cells.get(`${Math.floor(p.x / TILE)},${Math.floor(p.z / TILE)}`);
    if (!list) return p;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of list) {
        const dx = p.x - c.x, dz = p.z - c.z;
        const rr = c.r + pad;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4;
        const nx = d2 > 1e-8 ? dx / d : 1, nz = d2 > 1e-8 ? dz / d : 0;
        p.x = c.x + nx * rr;
        p.z = c.z + nz * rr;
      }
    }
    return p;
  }
}
