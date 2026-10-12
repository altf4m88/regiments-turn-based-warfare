import * as THREE from 'three';
import { MAP_CENTER, WIND, clamp } from '../core/constants';
import { makeRng } from '../core/noise';

export const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.42).normalize();

const SKY = {
  top: new THREE.Color('#4f7fb8'),
  horizon: new THREE.Color('#d7dccf'),
  bottom: new THREE.Color('#9aa58a'),
  fog: new THREE.Color('#c9d2c6'),
};

const makeCloudTexture = (seed: number) => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d')!;
  const rng = makeRng(seed);
  for (let i = 0; i < 26; i++) {
    const x = size * (0.2 + rng() * 0.6);
    const y = size / 2 * (0.45 + rng() * 0.3);
    const r = size * (0.08 + rng() * 0.12);
    const g = ctx.createRadialGradient(x, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.6, 'rgba(244,244,240,0.35)');
    g.addColorStop(1, 'rgba(230,232,236,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

/** Sky dome, sun & ambient light, fog, distant ground, drifting clouds. */
export class Environment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private clouds: THREE.Sprite[] = [];
  private shadowSize = 26;

  constructor(private scene: THREE.Scene, shadowMapSize: number) {
    scene.fog = new THREE.FogExp2(SKY.fog, 0.0062);
    scene.background = SKY.horizon.clone();

    const skyGeo = new THREE.SphereGeometry(600, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: SKY.top },
        uHorizon: { value: SKY.horizon },
        uBottom: { value: SKY.bottom },
        uSunDir: { value: SUN_DIR },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uBottom;
        uniform vec3 uSunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.85, h), 0.7)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.25, h));
          float s = max(dot(d, uSunDir), 0.0);
          col += vec3(1.0, 0.86, 0.62) * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.28);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    sky.name = 'sky';
    this.group.add(sky);
    sky.onBeforeRender = (_r, _s, camera) => sky.position.copy(camera.position);

    const farGround = new THREE.Mesh(
      new THREE.CircleGeometry(1400, 48).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#7f9447' }),
    );
    // Sits below the river bed; the terrain mesh skirts down to meet it at the world edge.
    farGround.position.set(MAP_CENTER, -0.62, MAP_CENTER);
    farGround.receiveShadow = false;
    this.group.add(farGround);

    this.hemi = new THREE.HemisphereLight('#c4d8f0', '#5d5638', 1.15);
    this.group.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#ffe7c2', 2.7);
    this.sun.castShadow = shadowMapSize > 0;
    this.sun.shadow.mapSize.set(Math.max(shadowMapSize, 512), Math.max(shadowMapSize, 512));
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 180;
    this.group.add(this.sun);
    this.group.add(this.sun.target);
    this.fitShadow(new THREE.Vector3(MAP_CENTER, 0, MAP_CENTER), 26);

    const rng = makeRng(77);
    const texes = [makeCloudTexture(1), makeCloudTexture(2), makeCloudTexture(3)];
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.SpriteMaterial({ map: texes[i % 3], transparent: true, depthWrite: false, opacity: 0.8, fog: false });
      const s = new THREE.Sprite(mat);
      const w = 70 + rng() * 80;
      s.scale.set(w, w * 0.45, 1);
      const a = rng() * Math.PI * 2;
      const r = 90 + rng() * 260;
      s.position.set(MAP_CENTER + Math.cos(a) * r, 85 + rng() * 60, MAP_CENTER + Math.sin(a) * r);
      this.clouds.push(s);
      this.group.add(s);
    }
    scene.add(this.group);
  }

  /** Re-centres the shadow frustum on what the camera looks at, snapping to texels to avoid shimmer. */
  fitShadow(focus: THREE.Vector3, halfSize: number) {
    this.shadowSize = clamp(halfSize, 10, 36);
    const s = this.shadowSize;
    const sc = this.sun.shadow.camera;
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s;
    sc.updateProjectionMatrix();
    const texel = (2 * s) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + SUN_DIR.x * 80, SUN_DIR.y * 80, fz + SUN_DIR.z * 80);
    this.sun.target.updateMatrixWorld();
  }

  update(dt: number) {
    for (const c of this.clouds) {
      c.position.x += WIND.x * dt * 1.6;
      c.position.z += WIND.z * dt * 1.6;
      if (c.position.x > MAP_CENTER + 380) c.position.x -= 760;
      if (c.position.z > MAP_CENTER + 380) c.position.z -= 760;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = (m as THREE.Mesh).material as THREE.Material | undefined;
      if (mat) {
        const map = (mat as THREE.SpriteMaterial).map;
        if (map) map.dispose();
        mat.dispose();
      }
    });
    this.sun.shadow.map?.dispose();
  }
}
