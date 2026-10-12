import * as THREE from 'three';
import { MAP_N, TILE, WATER_LEVEL, WORLD_MIN, WORLD_SIZE, smoothstep } from '../core/constants';
import { hash2 } from '../core/noise';
import { TerrainModel } from './TerrainModel';

const col = (hex: string) => new THREE.Color(hex);

const C = {
  grassA: col('#6f8f3b'),
  grassB: col('#93a84f'),
  grassDry: col('#a9a25a'),
  forest: col('#4a6529'),
  hill: col('#8a8a4c'),
  rock: col('#8b8272'),
  mud: col('#5a4b34'),
  sand: col('#b0a073'),
  road: col('#a58d63'),
  roadDark: col('#7b6748'),
  village: col('#968874'),
  plaza: col('#aaa392'),
  wheat: col('#c8b466'),
  plough: col('#7a5f40'),
  crop: col('#86a548'),
  trampled: col('#9a9064'),
};

/** Shared uniforms for the tile overlay (selection, move range, targets...). */
export interface OverlayUniforms {
  uOverlay: { value: THREE.DataTexture };
  uHover: { value: THREE.Vector2 };
  uSelected: { value: THREE.Vector2 };
  uGrid: { value: number };
  uTime: { value: number };
}

export const createOverlay = (): { tex: THREE.DataTexture; data: Uint8Array; uniforms: OverlayUniforms } => {
  const data = new Uint8Array(MAP_N * MAP_N * 4);
  const tex = new THREE.DataTexture(data, MAP_N, MAP_N, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return {
    tex,
    data,
    uniforms: {
      uOverlay: { value: tex },
      uHover: { value: new THREE.Vector2(-99, -99) },
      uSelected: { value: new THREE.Vector2(-99, -99) },
      uGrid: { value: 0.55 },
      uTime: { value: 0 },
    },
  };
};

const OVERLAY_GLSL = /* glsl */ `
  uniform sampler2D uOverlay;
  uniform vec2 uHover;
  uniform vec2 uSelected;
  uniform float uGrid;
  uniform float uTime;
  const float TILE_SIZE = ${TILE.toFixed(1)};
  const float MAP_TILES = ${MAP_N.toFixed(1)};

  // Returns emissive contribution; tints base colour in place.
  vec3 applyOverlay(inout vec3 base, vec3 worldP, bool withGrid) {
    vec2 tc = worldP.xz / TILE_SIZE;
    vec3 glow = vec3(0.0);
    float aaw = fwidth(tc.x) + fwidth(tc.y);
    if (tc.x >= 0.0 && tc.y >= 0.0 && tc.x < MAP_TILES && tc.y < MAP_TILES) {
      vec2 f = fract(tc);
      vec2 e2 = min(f, 1.0 - f);
      float edge = min(e2.x, e2.y);
      if (withGrid) {
        float grid = 1.0 - smoothstep(0.0, 0.01 + aaw * 0.9, edge);
        base = mix(base, base * 0.42, grid * uGrid);
      }
      vec2 cell = floor(tc);
      vec4 ov = texture2D(uOverlay, (cell + 0.5) / MAP_TILES);
      float rim = 1.0 - smoothstep(0.035, 0.085 + aaw, edge);
      float a = ov.a * (0.3 + 0.7 * rim);
      base = mix(base, ov.rgb, a);
      glow += ov.rgb * ov.a * (0.12 + rim * 0.5);
      if (cell == uHover) {
        float hr = 1.0 - smoothstep(0.02, 0.06 + aaw, edge);
        base = mix(base, vec3(1.0), hr * 0.85 + 0.08);
        glow += vec3(hr * 0.35 + 0.03);
      }
      if (cell == uSelected) {
        float sr = 1.0 - smoothstep(0.03, 0.1 + aaw, edge);
        float p = 0.65 + 0.35 * sin(uTime * 5.0);
        vec3 gold = vec3(1.0, 0.82, 0.25);
        base = mix(base, gold, sr * p);
        glow += gold * sr * p * 0.6;
      }
      float fb = min(min(tc.x, MAP_TILES - tc.x), min(tc.y, MAP_TILES - tc.y));
      base = mix(base, base * 0.25, (1.0 - smoothstep(0.0, 0.05 + aaw, fb)) * 0.9);
    } else {
      float d = max(max(-tc.x, tc.x - MAP_TILES), max(-tc.y, tc.y - MAP_TILES));
      float grey = dot(base, vec3(0.3, 0.55, 0.15));
      base = mix(base, vec3(grey) * 1.02, 0.22 * smoothstep(0.0, 4.0, d));
    }
    return glow;
  }
`;

export const buildTerrainMesh = (model: TerrainModel, overlay: OverlayUniforms) => {
  const vn = model.vn;
  const count = vn * vn;
  const pos = new Float32Array(count * 3);
  for (let iz = 0; iz < vn; iz++) {
    for (let ix = 0; ix < vn; ix++) {
      const i = iz * vn + ix;
      pos[i * 3] = WORLD_MIN + ix * model.step;
      const edge = ix === 0 || iz === 0 || ix === vn - 1 || iz === vn - 1;
      pos[i * 3 + 1] = edge ? -0.6 : model.heights[i];
      pos[i * 3 + 2] = WORLD_MIN + iz * model.step;
    }
  }
  const idx = new Uint32Array((vn - 1) * (vn - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < vn - 1; iz++) {
    for (let ix = 0; ix < vn - 1; ix++) {
      const a = iz * vn + ix, b = a + 1, c = a + vn, d = c + 1;
      // Alternate the diagonal for a less regular look.
      if ((ix + iz) & 1) { idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d; }
      else { idx[k++] = a; idx[k++] = c; idx[k++] = d; idx[k++] = a; idx[k++] = d; idx[k++] = b; }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  const normals = geo.getAttribute('normal') as THREE.BufferAttribute;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  const n = model.noise, n2 = model.noise2;
  for (let iz = 0; iz < vn; iz++) {
    for (let ix = 0; ix < vn; ix++) {
      const i = iz * vn + ix;
      const x = pos[i * 3], z = pos[i * 3 + 2], h = pos[i * 3 + 1];
      const ny = normals.getY(i);
      const nA = n.fbm(x * 0.12, z * 0.12, 3) * 0.5 + 0.5;
      const nB = n2.fbm(x * 0.05 + 9, z * 0.05 - 4, 2) * 0.5 + 0.5;
      const nFine = n2.noise(x * 2.3, z * 2.3);

      c.copy(C.grassA).lerp(C.grassB, nA);
      c.lerp(C.grassDry, smoothstep(0.55, 0.85, nB) * 0.45);
      c.lerp(C.forest, model.forest[i] * 0.85);
      c.lerp(C.hill, smoothstep(0.15, 0.75, model.hill[i]) * 0.8);
      const rockAmt = Math.max(smoothstep(0.86, 0.7, ny), smoothstep(0.55, 1.0, model.hill[i]) * smoothstep(0.1, 0.6, nFine) * 0.7);
      c.lerp(C.rock, rockAmt * 0.85);

      if (model.field[i] > 0.01) {
        const tx = Math.floor(x / TILE / 2), tz = Math.floor(z / TILE / 2);
        const pick = hash2(tx, tz, model.seed);
        const fieldCol = pick < 0.4 ? C.wheat : pick < 0.7 ? C.plough : C.crop;
        const ang = hash2(tx, tz, 7) > 0.5 ? x : z;
        const stripe = Math.sin(ang * 9.0) * 0.5 + 0.5;
        tmp.copy(fieldCol).multiplyScalar(0.85 + stripe * 0.25);
        c.lerp(tmp, model.field[i] * 0.9);
      }

      c.lerp(C.village, model.village[i] * 0.75);
      // Trampled, worn-down grass around the headquarters camps.
      c.lerp(C.trampled, model.camp[i] * (0.25 + smoothstep(-0.2, 0.6, nFine) * 0.45));
      c.lerp(C.plaza, model.plaza[i] * 0.7);

      if (model.road[i] > 0.001) {
        tmp.copy(C.road).lerp(C.roadDark, smoothstep(0.2, 0.8, nFine * 0.5 + 0.5) * 0.5);
        c.lerp(tmp, smoothstep(0.0, 0.6, model.road[i]) * 0.95);
      }

      const bank = smoothstep(WATER_LEVEL + 0.14, WATER_LEVEL + 0.01, h);
      c.lerp(C.sand, bank * 0.55 * (1 - model.road[i]));
      c.lerp(C.mud, smoothstep(WATER_LEVEL + 0.02, WATER_LEVEL - 0.1, h));

      // Gentle large-scale tonal variation and darkening in hollows.
      const shade = 0.92 + nB * 0.12 - smoothstep(0.0, -0.3, h) * 0.08;
      c.multiplyScalar(shade);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 });
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, overlay);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldP;\n${OVERLAY_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec3 ovBase = diffuseColor.rgb;\nvec3 ovGlow = applyOverlay(ovBase, vWorldP, true);\ndiffuseColor.rgb = ovBase;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += ovGlow * 0.45;');
  };
  mat.customProgramCacheKey = () => 'terrain-overlay';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
};

/** Height texture (half float) so the water shader knows the depth beneath it. */
const buildHeightTexture = (model: TerrainModel) => {
  const vn = model.vn;
  const data = new Uint16Array(vn * vn);
  for (let i = 0; i < vn * vn; i++) data[i] = THREE.DataUtils.toHalfFloat(model.heights[i]);
  const tex = new THREE.DataTexture(data, vn, vn, THREE.RedFormat, THREE.HalfFloatType);
  // Rows are vn * 2 bytes (vn is odd), so the default 4-byte row alignment would shear the texture.
  tex.unpackAlignment = 1;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
};

export const buildWater = (model: TerrainModel, overlay: OverlayUniforms, sunDir: THREE.Vector3) => {
  const heightTex = buildHeightTexture(model);
  const vn = model.vn;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(WORLD_MIN + WORLD_SIZE / 2, WATER_LEVEL, WORLD_MIN + WORLD_SIZE / 2);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uHeight: { value: null },
        uLevel: { value: WATER_LEVEL },
        uUvScale: { value: new THREE.Vector4(1 / WORLD_SIZE * (vn - 1) / vn, 0.5 / vn, WORLD_MIN, 0) },
        uSunDir: { value: sunDir.clone().normalize() },
        uSunColor: { value: new THREE.Color('#fff1d6') },
        uSky: { value: new THREE.Color('#a9c3dc') },
        uDeep: { value: new THREE.Color('#1f4a52') },
        uShallow: { value: new THREE.Color('#4f8a7e') },
      },
    ]),
    vertexShader: /* glsl */ `
      uniform vec4 uUvScale;
      varying vec3 vWorld;
      varying vec2 vHUv;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vHUv = (wp.xz - uUvScale.zz) * uUvScale.x + uUvScale.y;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uHeight;
      uniform float uLevel;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSky;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      varying vec3 vWorld;
      varying vec2 vHUv;
      #include <common>
      #include <fog_pars_fragment>
      ${OVERLAY_GLSL}

      float waves(vec2 p) {
        float t = uTime;
        float w = 0.0;
        w += sin(p.x * 2.7 + t * 1.1 + sin(p.y * 1.3 + t * 0.3)) * 0.010;
        w += sin(p.y * 3.9 - t * 1.9 + p.x * 0.8) * 0.009;
        w += sin((p.x + p.y) * 7.3 + t * 3.1) * 0.0035;
        w += sin((p.x - p.y * 1.3) * 11.1 - t * 2.6) * 0.0025;
        return w;
      }

      void main() {
        float ground = texture2D(uHeight, vHUv).r;
        float depth = uLevel - ground;
        if (depth < 0.0) discard;

        vec2 p = vWorld.xz;
        float e = 0.04;
        float h0 = waves(p);
        float hx = waves(p + vec2(e, 0.0));
        float hz = waves(p + vec2(0.0, e));
        vec3 n = normalize(vec3(-(hx - h0) / e, 1.0, -(hz - h0) / e));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);

        vec3 water = mix(uShallow, uDeep, smoothstep(0.0, 0.24, depth));
        water *= 0.55 + 0.45 * max(dot(n, uSunDir), 0.0);
        vec3 col = mix(water, uSky, fres * 0.85);
        vec3 R = reflect(-uSunDir, n);
        col += uSunColor * pow(max(dot(R, V), 0.0), 140.0) * 1.6;

        float shore = 1.0 - smoothstep(0.0, 0.035, depth);
        float foamN = sin(p.x * 13.0 + uTime * 1.7) * sin(p.y * 11.0 - uTime * 1.3) * 0.5 + 0.5;
        float foam = shore * (0.45 + 0.55 * foamN);
        col = mix(col, vec3(0.92, 0.95, 0.93), foam * 0.75);

        vec3 tint = col;
        vec3 glow = applyOverlay(tint, vWorld, false);
        col = tint + glow * 0.5;

        float alpha = mix(0.5, 0.9, smoothstep(0.0, 0.2, depth)) + foam * 0.2;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  mat.uniforms.uHeight.value = heightTex;
  // Share the overlay uniform objects so updates propagate to the water too.
  Object.assign(mat.uniforms, overlay);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.name = 'water';
  return { mesh, heightTex };
};

