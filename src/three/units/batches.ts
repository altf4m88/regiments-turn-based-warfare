import * as THREE from 'three';

/**
 * An instanced mesh that is refilled every frame ("immediate mode"
 * instancing). Figures just push their part matrices; no index bookkeeping.
 */
class Batch {
  mesh: THREE.InstancedMesh;
  count = 0;

  constructor(private geo: THREE.BufferGeometry, private mat: THREE.Material, private cap: number, private parent: THREE.Object3D, shadows: boolean) {
    this.mesh = this.make(cap, shadows);
  }

  private make(cap: number, shadows: boolean) {
    const m = new THREE.InstancedMesh(this.geo, this.mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = shadows;
    m.receiveShadow = true;
    m.count = 0;
    this.parent.add(m);
    return m;
  }

  private grow() {
    const old = this.mesh;
    this.cap *= 2;
    this.mesh = this.make(this.cap, old.castShadow);
    (this.mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    old.removeFromParent();
    old.dispose();
  }

  push(m: THREE.Matrix4) {
    if (this.count >= this.cap) this.grow();
    m.toArray(this.mesh.instanceMatrix.array as Float32Array, this.count * 16);
    this.count++;
  }

  pushArray(a: Float32Array) {
    if (this.count >= this.cap) this.grow();
    (this.mesh.instanceMatrix.array as Float32Array).set(a, this.count * 16);
    this.count++;
  }

  commit() {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, Math.max(1, this.count) * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.count = 0;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geo.dispose();
  }
}

export class BatchSet {
  private batches = new Map<string, Batch>();
  readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.04 });

  constructor(private parent: THREE.Object3D) {}

  get(key: string, make: () => THREE.BufferGeometry, cap = 64) {
    let b = this.batches.get(key);
    if (!b) {
      b = new Batch(make(), this.material, cap, this.parent, true);
      this.batches.set(key, b);
    }
    return b;
  }

  commit() {
    for (const b of this.batches.values()) b.commit();
  }

  dispose() {
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    this.material.dispose();
  }
}

export type { Batch };
