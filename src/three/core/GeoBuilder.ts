import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

export interface PartOpts {
  p?: V3;
  r?: V3;
  s?: V3;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

/**
 * Builds a single vertex-coloured geometry out of primitive parts. All the
 * soldiers, horses, guns and props are made this way, so each model is one
 * draw call (or one instanced batch).
 */
export class GeoBuilder {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: PartOpts = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    _e.set(o.r?.[0] ?? 0, o.r?.[1] ?? 0, o.r?.[2] ?? 0);
    _q.setFromEuler(_e);
    _v.set(o.p?.[0] ?? 0, o.p?.[1] ?? 0, o.p?.[2] ?? 0);
    _s.set(o.s?.[0] ?? 1, o.s?.[1] ?? 1, o.s?.[2] ?? 1);
    _m.compose(_v, _q, _s);
    g.applyMatrix4(_m);
    _c.set(color);
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      cols[i * 3] = _c.r;
      cols[i * 3 + 1] = _c.g;
      cols[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, o?: PartOpts) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, o);
  }

  cyl(rTop: number, rBottom: number, h: number, seg: number, color: THREE.ColorRepresentation, o?: PartOpts) {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg), color, o);
  }

  cone(r: number, h: number, seg: number, color: THREE.ColorRepresentation, o?: PartOpts) {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, o);
  }

  ball(r: number, color: THREE.ColorRepresentation, o?: PartOpts, detail = 1) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, o);
  }

  /** A box stretched between two points (arms, legs, poles, sword blades...). */
  limb(from: V3, to: V3, w: number, d: number, color: THREE.ColorRepresentation, extend = 0) {
    _a.set(from[0], from[1], from[2]);
    _b.set(to[0], to[1], to[2]);
    const dir = _b.clone().sub(_a);
    const len = dir.length();
    dir.normalize();
    const geo = new THREE.BoxGeometry(w, len + extend * 2, d);
    const q = new THREE.Quaternion().setFromUnitVectors(_up, dir);
    const mid = _a.clone().add(_b).multiplyScalar(0.5);
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    return this.add(geo, color);
  }

  /** A cylinder stretched between two points. */
  rod(from: V3, to: V3, r: number, color: THREE.ColorRepresentation, seg = 6) {
    _a.set(from[0], from[1], from[2]);
    _b.set(to[0], to[1], to[2]);
    const dir = _b.clone().sub(_a);
    const len = dir.length();
    dir.normalize();
    const geo = new THREE.CylinderGeometry(r, r, len, seg);
    const q = new THREE.Quaternion().setFromUnitVectors(_up, dir);
    const mid = _a.clone().add(_b).multiplyScalar(0.5);
    geo.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    return this.add(geo, color);
  }

  /** Triangular prism (roof): ridge along X, width along Z. */
  prism(w: number, h: number, d: number, color: THREE.ColorRepresentation, o?: PartOpts) {
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0);
    shape.lineTo(d / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.translate(0, 0, -w / 2);
    geo.rotateY(Math.PI / 2);
    return this.add(geo, color, o);
  }

  /** Merge in a geometry produced by another builder. */
  merge(geo: THREE.BufferGeometry, o: PartOpts = {}) {
    const g = geo.clone();
    _e.set(o.r?.[0] ?? 0, o.r?.[1] ?? 0, o.r?.[2] ?? 0);
    _q.setFromEuler(_e);
    _v.set(o.p?.[0] ?? 0, o.p?.[1] ?? 0, o.p?.[2] ?? 0);
    _s.set(o.s?.[0] ?? 1, o.s?.[1] ?? 1, o.s?.[2] ?? 1);
    g.applyMatrix4(_m.compose(_v, _q, _s));
    this.parts.push(g);
    return this;
  }

  get empty() {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error('GeoBuilder: failed to merge geometry');
    for (const p of this.parts) p.dispose();
    this.parts = [];
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}
