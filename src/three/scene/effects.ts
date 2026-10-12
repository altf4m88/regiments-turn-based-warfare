import * as THREE from 'three';
import { WIND, clamp } from '../core/constants';

type Ground = (x: number, z: number) => number;

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  s0: number; s1: number;
  r: number; g: number; b: number; a: number;
  rot: number; vrot: number;
  drag: number; grav: number; wind: number;
  fadeIn: number;
  land: boolean;
}

const makeTexture = (draw: (g: CanvasRenderingContext2D, s: number) => void, size = 64) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const smokeTex = () => makeTexture((g, s) => {
  const blobs = [[0.5, 0.52, 0.34], [0.38, 0.45, 0.24], [0.62, 0.44, 0.25], [0.45, 0.62, 0.22], [0.6, 0.62, 0.2]];
  for (const [x, y, r] of blobs) {
    const gr = g.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.28)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }
});

const glowTex = () => makeTexture((g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
});

const chunkTex = () => makeTexture((g, s) => {
  g.fillStyle = 'rgba(255,255,255,1)';
  g.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = s * (0.28 + ((i * 37) % 10) / 60);
    const x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
}, 32);

class ParticlePool {
  readonly mesh: THREE.Mesh;
  private list: Particle[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private sr: Float32Array;
  private geo: THREE.InstancedBufferGeometry;
  private tex: THREE.Texture;

  constructor(private max: number, tex: THREE.Texture, additive: boolean, renderOrder: number) {
    this.tex = tex;
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('uv', base.getAttribute('uv'));
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.sr = new Float32Array(max * 2);
    this.geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iSR', new THREE.InstancedBufferAttribute(this.sr, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null } }]),
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute vec4 iCol;
        attribute vec2 iSR;
        varying vec2 vUv;
        varying vec4 vCol;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vCol = iCol;
          vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
          float c = cos(iSR.y), s = sin(iSR.y);
          vec2 p = position.xy * iSR.x;
          mvPosition.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec4 vCol;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          vec4 t = texture2D(uMap, vUv);
          float a = vCol.a * t.a;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vCol.rgb * t.rgb, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    mat.uniforms.uMap.value = tex;
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  get count() {
    return this.list.length;
  }

  spawn(p: Partial<Particle> & { x: number; y: number; z: number }) {
    if (this.list.length >= this.max) this.list.shift();
    const life = p.life ?? 1;
    this.list.push({
      vx: 0, vy: 0, vz: 0, s0: 0.1, s1: 0.1, r: 1, g: 1, b: 1, a: 1,
      rot: Math.random() * Math.PI * 2, vrot: (Math.random() - 0.5) * 0.6,
      drag: 1, grav: 0, wind: 0, fadeIn: 0.05, land: false,
      ...p,
      life, max: life,
    });
  }

  update(dt: number, ground: Ground) {
    const list = this.list;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const d = Math.exp(-p.drag * dt);
      p.vx = p.vx * d + WIND.x * p.wind * dt;
      p.vz = p.vz * d + WIND.z * p.wind * dt;
      p.vy = p.vy * d - p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.vrot * dt;
      if (p.land) {
        const gy = ground(p.x, p.z);
        if (p.y < gy) { p.y = gy; p.vx *= 0.3; p.vz *= 0.3; p.vy = 0; p.grav = 0; }
      }
      list[n++] = p;
      const t = 1 - p.life / p.max;
      const size = p.s0 + (p.s1 - p.s0) * (1 - (1 - t) * (1 - t));
      const fade = clamp(t / p.fadeIn, 0, 1) * Math.pow(1 - t, 1.4);
      const j = n - 1;
      this.pos[j * 3] = p.x; this.pos[j * 3 + 1] = p.y; this.pos[j * 3 + 2] = p.z;
      this.col[j * 4] = p.r; this.col[j * 4 + 1] = p.g; this.col[j * 4 + 2] = p.b; this.col[j * 4 + 3] = p.a * fade;
      this.sr[j * 2] = size; this.sr[j * 2 + 1] = p.rot;
    }
    list.length = n;
    this.geo.instanceCount = n;
    for (const name of ['iPos', 'iCol', 'iSR']) (this.geo.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  clear() {
    this.list.length = 0;
    this.geo.instanceCount = 0;
  }

  dispose() {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}

interface Projectile {
  from: THREE.Vector3;
  to: THREE.Vector3;
  bounce: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  phase: 0 | 1;
  onImpact?: (p: THREE.Vector3) => void;
  trail: number;
}

interface FlashLight { light: THREE.PointLight; t: number; peak: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** All transient battle effects. */
export class Effects {
  readonly group = new THREE.Group();
  private smoke: ParticlePool;
  private glow: ParticlePool;
  private dirt: ParticlePool;
  private balls: THREE.InstancedMesh;
  private projectiles: Projectile[] = [];
  private craters: THREE.InstancedMesh;
  private craterIdx = 0;
  private craterCount = 0;
  private lights: FlashLight[] = [];
  private tmpM = new THREE.Matrix4();
  private tmpV = new THREE.Vector3();
  private campAcc = 0;
  /** Fraction of smoke to keep (lower on the low-quality setting). */
  density = 1;

  constructor(scene: THREE.Scene, private ground: Ground) {
    this.smoke = new ParticlePool(5000, smokeTex(), false, 5);
    this.dirt = new ParticlePool(2500, chunkTex(), false, 4);
    this.glow = new ParticlePool(2500, glowTex(), true, 6);
    this.group.add(this.dirt.mesh, this.smoke.mesh, this.glow.mesh);

    this.balls = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.04, 1),
      new THREE.MeshStandardMaterial({ color: '#1d1d1f', roughness: 0.4, metalness: 0.6 }),
      48,
    );
    this.balls.count = 0;
    this.balls.frustumCulled = false;
    this.balls.castShadow = true;
    this.group.add(this.balls);

    const craterTex = makeTexture((g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(30,24,18,0.95)');
      gr.addColorStop(0.45, 'rgba(52,40,28,0.8)');
      gr.addColorStop(0.75, 'rgba(70,56,38,0.35)');
      gr.addColorStop(1, 'rgba(70,56,38,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    });
    this.craters = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: craterTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      160,
    );
    this.craters.count = 0;
    this.craters.frustumCulled = false;
    this.craters.receiveShadow = true;
    this.craters.renderOrder = 1;
    this.group.add(this.craters);

    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight('#ffb35c', 0, 7, 1.6);
      this.lights.push({ light, t: 1, peak: 0 });
      this.group.add(light);
    }
    scene.add(this.group);
  }

  // -- primitives -------------------------------------------------------------

  flashLight(pos: THREE.Vector3, peak: number) {
    const l = this.lights.reduce((a, b) => (a.t > b.t ? a : b));
    l.light.position.copy(pos).setY(pos.y + 0.4);
    l.t = 0;
    l.peak = peak;
  }

  /** Musket / carbine discharge. `dir` is the horizontal firing direction. */
  muzzle(pos: THREE.Vector3, dirX: number, dirZ: number, scale = 1) {
    this.glow.spawn({ x: pos.x + dirX * 0.04, y: pos.y, z: pos.z + dirZ * 0.04, life: 0.09, s0: 0.22 * scale, s1: 0.12 * scale, r: 1, g: 0.72, b: 0.32, a: 1, fadeIn: 0.01 });
    this.glow.spawn({ x: pos.x + dirX * 0.1, y: pos.y, z: pos.z + dirZ * 0.1, life: 0.06, s0: 0.12 * scale, s1: 0.05, r: 1, g: 0.95, b: 0.7, a: 1, fadeIn: 0.01 });
    if (Math.random() > this.density) return;
    const puffs = 2;
    for (let i = 0; i < puffs; i++) {
      const sp = rand(0.6, 1.4);
      const grey = rand(0.78, 0.9);
      this.smoke.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dirX * sp + rand(-0.1, 0.1), vy: rand(0.02, 0.12), vz: dirZ * sp + rand(-0.1, 0.1),
        drag: 2.6, wind: 0.11, life: rand(3.5, 6.5), s0: 0.1 * scale, s1: rand(0.55, 0.85) * scale,
        r: grey, g: grey, b: grey * 0.98, a: 0.55, fadeIn: 0.04,
      });
    }
  }

  cannonBlast(pos: THREE.Vector3, dirX: number, dirZ: number) {
    this.flashLight(pos, 26);
    for (let i = 0; i < 4; i++) {
      this.glow.spawn({ x: pos.x + dirX * 0.08 * i, y: pos.y, z: pos.z + dirZ * 0.08 * i, life: 0.14, s0: 0.6 - i * 0.1, s1: 0.2, r: 1, g: 0.68, b: 0.3, a: 1, fadeIn: 0.01 });
    }
    for (let i = 0; i < 14 * this.density + 4; i++) {
      const sp = rand(0.4, 2.8);
      const grey = rand(0.74, 0.88);
      this.smoke.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dirX * sp + rand(-0.5, 0.5), vy: rand(0.05, 0.45), vz: dirZ * sp + rand(-0.5, 0.5),
        drag: 1.9, wind: 0.12, life: rand(5, 9), s0: 0.25, s1: rand(1.1, 1.9),
        r: grey, g: grey, b: grey * 0.97, a: 0.6, fadeIn: 0.03,
      });
    }
    for (let i = 0; i < 6; i++) {
      this.dirt.spawn({ x: pos.x - dirX * 0.3, y: pos.y - 0.12, z: pos.z - dirZ * 0.3, vx: rand(-0.6, 0.6), vy: rand(0.3, 0.8), vz: rand(-0.6, 0.6), grav: 3, drag: 0.6, life: 1.2, s0: 0.05, s1: 0.04, r: 0.45, g: 0.37, b: 0.26, a: 0.9, land: true });
    }
  }

  /** Bullet strikes around the target: little dust kicks. */
  dustKick(pos: THREE.Vector3) {
    const dc = rand(0.55, 0.68);
    this.smoke.spawn({ x: pos.x, y: pos.y + 0.03, z: pos.z, vx: rand(-0.1, 0.1), vy: rand(0.2, 0.45), vz: rand(-0.1, 0.1), drag: 3, wind: 0.05, life: rand(0.8, 1.5), s0: 0.05, s1: 0.22, r: dc, g: dc * 0.9, b: dc * 0.75, a: 0.5 });
    if (Math.random() < 0.5) this.dirt.spawn({ x: pos.x, y: pos.y + 0.02, z: pos.z, vx: rand(-0.4, 0.4), vy: rand(0.6, 1.1), vz: rand(-0.4, 0.4), grav: 4, drag: 0.4, life: 0.9, s0: 0.025, s1: 0.02, r: 0.4, g: 0.33, b: 0.22, a: 1, land: true });
  }

  /** Cannonball impact: fountain of earth, dust cloud and a scorched crater. */
  impact(pos: THREE.Vector3, big = true, crater = true) {
    if (big) this.flashLight(pos, 9);
    this.glow.spawn({ x: pos.x, y: pos.y + 0.1, z: pos.z, life: 0.12, s0: big ? 0.5 : 0.25, s1: 0.3, r: 1, g: 0.6, b: 0.25, a: 0.9, fadeIn: 0.01 });
    const n = big ? 26 : 12;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(0.4, 1.6);
      this.dirt.spawn({
        x: pos.x, y: pos.y + 0.05, z: pos.z,
        vx: Math.cos(a) * sp, vy: rand(1.4, 3.2) * (big ? 1 : 0.7), vz: Math.sin(a) * sp,
        grav: 6.5, drag: 0.4, life: rand(1.0, 1.8), s0: rand(0.03, 0.07), s1: 0.03,
        r: rand(0.32, 0.45), g: rand(0.26, 0.35), b: rand(0.17, 0.24), a: 1, land: true,
      });
    }
    for (let i = 0; i < (big ? 8 : 4); i++) {
      const c = rand(0.5, 0.62);
      this.smoke.spawn({
        x: pos.x + rand(-0.15, 0.15), y: pos.y + 0.1, z: pos.z + rand(-0.15, 0.15),
        vx: rand(-0.4, 0.4), vy: rand(0.3, 0.9), vz: rand(-0.4, 0.4),
        drag: 2, wind: 0.1, life: rand(2.5, 4.5), s0: 0.2, s1: rand(0.7, 1.1),
        r: c, g: c * 0.9, b: c * 0.78, a: 0.6,
      });
    }
    if (crater) this.addCrater(pos.x, pos.z, big ? rand(0.32, 0.45) : 0.22);
  }

  splash(pos: THREE.Vector3, amount = 10) {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(0.2, 0.7);
      this.glow.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * sp, vy: rand(0.8, 1.8), vz: Math.sin(a) * sp, grav: 5, drag: 0.5, life: 0.7, s0: 0.05, s1: 0.03, r: 0.55, g: 0.65, b: 0.7, a: 0.6 });
    }
  }

  /** Hooves kicking up dust. */
  hoofDust(pos: THREE.Vector3, strength = 1) {
    if (Math.random() > 0.6 * this.density) return;
    const c = rand(0.62, 0.72);
    this.smoke.spawn({
      x: pos.x + rand(-0.08, 0.08), y: pos.y + 0.03, z: pos.z + rand(-0.08, 0.08),
      vx: rand(-0.15, 0.15), vy: rand(0.05, 0.25), vz: rand(-0.15, 0.15),
      drag: 2, wind: 0.08, life: rand(1.2, 2.2), s0: 0.08, s1: 0.4 * strength,
      r: c, g: c * 0.92, b: c * 0.78, a: 0.32,
    });
  }

  sparks(pos: THREE.Vector3, n = 6) {
    for (let i = 0; i < n; i++) {
      this.glow.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: rand(-1.2, 1.2), vy: rand(0.2, 1.4), vz: rand(-1.2, 1.2), grav: 4, drag: 1, life: rand(0.2, 0.4), s0: 0.04, s1: 0.01, r: 1, g: 0.85, b: 0.5, a: 1 });
    }
  }

  /** Earth thrown up while digging in. */
  digging(pos: THREE.Vector3, width: number, heading: number) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    for (let i = 0; i < 18; i++) {
      const off = (Math.random() - 0.5) * width;
      const x = pos.x + fx * 0.36 + fz * off, z = pos.z + fz * 0.36 - fx * off;
      this.dirt.spawn({ x, y: this.ground(x, z) + 0.05, z, vx: fx * rand(0, 0.5), vy: rand(0.8, 1.6), vz: fz * rand(0, 0.5), grav: 5, drag: 0.5, life: 1, s0: 0.04, s1: 0.03, r: 0.42, g: 0.34, b: 0.22, a: 1, land: true });
    }
  }

  fire(pos: THREE.Vector3, scale = 1) {
    this.glow.spawn({
      x: pos.x + rand(-0.03, 0.03) * scale, y: pos.y, z: pos.z + rand(-0.03, 0.03) * scale,
      vx: rand(-0.05, 0.05), vy: rand(0.25, 0.5) * scale, vz: rand(-0.05, 0.05),
      drag: 1, life: rand(0.35, 0.6), s0: 0.1 * scale, s1: 0.02, r: 1, g: rand(0.38, 0.55), b: 0.1, a: 0.42,
    });
    if (Math.random() < 0.08) {
      this.smoke.spawn({ x: pos.x, y: pos.y + 0.15, z: pos.z, vy: rand(0.2, 0.35), wind: 0.06, drag: 0.4, life: rand(2, 3.5), s0: 0.08, s1: 0.4 * scale, r: 0.5, g: 0.5, b: 0.5, a: 0.25 });
    }
  }

  campfires(points: THREE.Vector3[], dt: number) {
    this.campAcc += dt;
    while (this.campAcc > 0.12) {
      this.campAcc -= 0.12;
      for (const p of points) {
        this.glow.spawn({ x: p.x + rand(-0.03, 0.03), y: p.y + 0.02, z: p.z + rand(-0.03, 0.03), vy: rand(0.15, 0.3), life: 0.4, s0: 0.1, s1: 0.02, r: 1, g: 0.55, b: 0.18, a: 0.8 });
        if (Math.random() < 0.35) this.smoke.spawn({ x: p.x, y: p.y + 0.15, z: p.z, vy: rand(0.25, 0.4), wind: 0.07, drag: 0.3, life: rand(5, 8), s0: 0.08, s1: 0.7, r: 0.62, g: 0.62, b: 0.64, a: 0.22, fadeIn: 0.1 });
      }
    }
  }

  addCrater(x: number, z: number, size: number) {
    const y = Math.max(this.ground(x, z), this.ground(x + size * 0.4, z), this.ground(x - size * 0.4, z), this.ground(x, z + size * 0.4), this.ground(x, z - size * 0.4)) + 0.012;
    this.tmpM.makeRotationY(Math.random() * Math.PI * 2);
    this.tmpM.scale(this.tmpV.set(size * 2, 1, size * 2));
    this.tmpM.setPosition(x, y, z);
    this.craters.setMatrixAt(this.craterIdx, this.tmpM);
    this.craterIdx = (this.craterIdx + 1) % 160;
    this.craterCount = Math.min(160, this.craterCount + 1);
    this.craters.count = this.craterCount;
    this.craters.instanceMatrix.needsUpdate = true;
  }

  /**
   * Round shot: arcs to a first graze short of the target, then skips on
   * through the formation, exactly how solid shot did its damage.
   */
  cannonball(from: THREE.Vector3, to: THREE.Vector3, onImpact?: (p: THREE.Vector3) => void) {
    const d = from.distanceTo(to);
    const dir = to.clone().sub(from).setY(0).normalize();
    const graze = to.clone().addScaledVector(dir, -Math.min(0.6, d * 0.2));
    graze.y = this.ground(graze.x, graze.z);
    const bounce = to.clone().addScaledVector(dir, 0.9);
    bounce.y = this.ground(bounce.x, bounce.z);
    this.projectiles.push({ from: from.clone(), to: graze, bounce, t: 0, dur: 0.18 + d * 0.035, arc: 0.12 + d * 0.035, phase: 0, onImpact, trail: 0 });
  }

  /** Seconds until a shot fired now over this distance makes its first graze. */
  static flightTime(dist: number) {
    return 0.18 + dist * 0.035;
  }

  update(dt: number) {
    // Projectiles
    let n = 0;
    for (const p of this.projectiles) {
      p.t += dt / p.dur;
      const a = p.phase === 0 ? p.from : p.to;
      const b = p.phase === 0 ? p.to : p.bounce;
      const arc = p.phase === 0 ? p.arc : 0.12;
      const t = Math.min(1, p.t);
      this.tmpV.lerpVectors(a, b, t);
      this.tmpV.y += Math.sin(t * Math.PI) * arc;
      p.trail += dt;
      if (p.trail > 0.03 && p.phase === 0) {
        p.trail = 0;
        this.smoke.spawn({ x: this.tmpV.x, y: this.tmpV.y, z: this.tmpV.z, life: 0.8, s0: 0.05, s1: 0.16, r: 0.85, g: 0.85, b: 0.85, a: 0.25, drag: 1 });
      }
      if (p.t >= 1) {
        if (p.phase === 0) {
          this.impact(p.to, true, true);
          p.onImpact?.(p.to);
          p.phase = 1;
          p.t = 0;
          p.dur = 0.35;
        } else {
          this.impact(p.bounce, false, false);
          continue;
        }
      }
      this.tmpM.makeTranslation(this.tmpV.x, this.tmpV.y + 0.04, this.tmpV.z);
      this.balls.setMatrixAt(n, this.tmpM);
      this.projectiles[n++] = p;
    }
    this.projectiles.length = n;
    this.balls.count = n;
    this.balls.instanceMatrix.needsUpdate = true;

    for (const l of this.lights) {
      if (l.t >= 1) { l.light.intensity = 0; continue; }
      l.t = Math.min(1, l.t + dt * 6);
      l.light.intensity = l.peak * Math.pow(1 - l.t, 2);
    }

    this.smoke.update(dt, this.ground);
    this.dirt.update(dt, this.ground);
    this.glow.update(dt, this.ground);
  }

  clear() {
    this.smoke.clear();
    this.dirt.clear();
    this.glow.clear();
    this.projectiles.length = 0;
    this.balls.count = 0;
    this.craterCount = 0;
    this.craters.count = 0;
  }

  dispose() {
    this.group.removeFromParent();
    this.smoke.dispose();
    this.dirt.dispose();
    this.glow.dispose();
    this.balls.geometry.dispose();
    (this.balls.material as THREE.Material).dispose();
    this.craters.geometry.dispose();
    const cm = this.craters.material as THREE.MeshLambertMaterial;
    cm.map?.dispose();
    cm.dispose();
  }
}
