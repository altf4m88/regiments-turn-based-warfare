import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MAP_CENTER, MAP_N, TILE, clamp, angleDelta } from '../core/constants';

interface Fly {
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromDist: number;
  toDist: number;
  fromAz: number;
  toAz: number;
  fromPolar: number;
  toPolar: number;
  t: number;
  dur: number;
}

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Strategy-game camera: left-drag pans across the ground, right-drag orbits,
 * wheel zooms, WASD/arrows pan, Q/E rotate, and scripted fly-to moves.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private fly: Fly | null = null;
  private keys = new Set<string>();
  private shake = 0;
  private shakeOffset = new THREE.Vector3();
  private lastUserInput = 0;

  constructor(dom: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2500);
    this.controls = new OrbitControls(this.camera, dom);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.09;
    c.screenSpacePanning = false;
    c.minDistance = 4;
    c.maxDistance = 85;
    c.minPolarAngle = 0.12;
    c.maxPolarAngle = 1.36;
    c.zoomSpeed = 1.1;
    c.panSpeed = 1.0;
    c.rotateSpeed = 0.6;
    c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    c.target.set(MAP_CENTER, 0, MAP_CENTER + 6);
    this.setSpherical(c.target, 46, 0, 0.82);
    c.addEventListener('start', () => {
      this.fly = null;
      this.lastUserInput = performance.now();
    });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** ms since the user last touched the camera. */
  get idleMs() {
    return performance.now() - this.lastUserInput;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '+', '=', '-', '_'].includes(k)) {
      this.keys.add(k);
      this.fly = null;
      this.lastUserInput = performance.now();
      if (k.startsWith('arrow')) e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onBlur = () => this.keys.clear();

  private setSpherical(target: THREE.Vector3, dist: number, az: number, polar: number) {
    const s = new THREE.Spherical(dist, polar, az);
    this.camera.position.setFromSpherical(s).add(target);
    this.camera.lookAt(target);
  }

  get azimuth() {
    return this.controls.getAzimuthalAngle();
  }

  get distance() {
    return this.controls.getDistance();
  }

  flyTo(target: THREE.Vector3, opts: { distance?: number; azimuth?: number; polar?: number; duration?: number } = {}) {
    const c = this.controls;
    const fromAz = c.getAzimuthalAngle();
    const toAz = opts.azimuth ?? fromAz;
    this.fly = {
      fromTarget: c.target.clone(),
      toTarget: target.clone(),
      fromDist: c.getDistance(),
      toDist: opts.distance ?? c.getDistance(),
      fromAz,
      toAz: fromAz + angleDelta(fromAz, toAz),
      fromPolar: c.getPolarAngle(),
      toPolar: opts.polar ?? c.getPolarAngle(),
      t: 0,
      dur: opts.duration ?? 1.0,
    };
  }

  rotateTo(azimuth: number) {
    this.flyTo(this.controls.target, { azimuth, duration: 1.1 });
  }

  addShake(amount: number) {
    this.shake = Math.min(0.25, this.shake + amount);
  }

  update(dt: number, groundAt: (x: number, z: number) => number) {
    const c = this.controls;
    this.camera.position.sub(this.shakeOffset);
    this.shakeOffset.set(0, 0, 0);

    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = ease(f.t);
      c.target.lerpVectors(f.fromTarget, f.toTarget, e);
      this.setSpherical(
        c.target,
        f.fromDist + (f.toDist - f.fromDist) * e,
        f.fromAz + (f.toAz - f.fromAz) * e,
        f.fromPolar + (f.toPolar - f.fromPolar) * e,
      );
      if (f.t >= 1) this.fly = null;
    }

    if (this.keys.size) {
      const dist = c.getDistance();
      const speed = dist * 0.9 * dt;
      const az = c.getAzimuthalAngle();
      const fwd = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const move = new THREE.Vector3();
      if (this.keys.has('w') || this.keys.has('arrowup')) move.add(fwd);
      if (this.keys.has('s') || this.keys.has('arrowdown')) move.sub(fwd);
      if (this.keys.has('d') || this.keys.has('arrowright')) move.add(right);
      if (this.keys.has('a') || this.keys.has('arrowleft')) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed);
        c.target.add(move);
        this.camera.position.add(move);
      }
      let rot = 0;
      if (this.keys.has('q')) rot -= 1.4 * dt;
      if (this.keys.has('e')) rot += 1.4 * dt;
      let zoom = 1;
      if (this.keys.has('+') || this.keys.has('=')) zoom = 1 - 1.2 * dt;
      if (this.keys.has('-') || this.keys.has('_')) zoom = 1 + 1.2 * dt;
      if (rot !== 0 || zoom !== 1) {
        this.setSpherical(c.target, clamp(dist * zoom, c.minDistance, c.maxDistance), az + rot, c.getPolarAngle());
      }
    }

    // Keep the focus over the battlefield and riding on the terrain.
    const lo = -TILE * 3, hi = MAP_N * TILE + TILE * 3;
    const tx = clamp(c.target.x, lo, hi), tz = clamp(c.target.z, lo, hi);
    if (tx !== c.target.x || tz !== c.target.z) {
      this.camera.position.x += tx - c.target.x;
      this.camera.position.z += tz - c.target.z;
      c.target.x = tx;
      c.target.z = tz;
    }
    const gy = groundAt(c.target.x, c.target.z);
    const dy = (Math.max(gy, 0) - c.target.y) * Math.min(1, dt * 4);
    c.target.y += dy;
    this.camera.position.y += dy;

    c.update();

    // Never dip below the terrain.
    const camGround = groundAt(this.camera.position.x, this.camera.position.z) + 0.6;
    if (this.camera.position.y < camGround) this.camera.position.y = camGround;

    if (this.shake > 0.001) {
      const s = this.shake;
      this.shakeOffset.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      this.camera.position.add(this.shakeOffset);
      this.shake *= Math.exp(-dt * 9);
    }
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.controls.dispose();
  }
}
