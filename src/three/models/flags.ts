import * as THREE from 'three';
import { Nation } from '../../game/types';

const ROMAN: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const toRoman = (n: number) => {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out || 'I';
};

/** Shared time uniform so every flag waves with one update. */
export const flagUniforms = { uTime: { value: 0 } };

/**
 * Regimental colours drawn on a canvas: British colours with a union canton,
 * or French 1804-pattern lozenge colours.
 * The field uses the regiment's own `standardColor` from the game state.
 */
export const makeFlagTexture = (nation: Nation, field: string, number: number, guidon = false) => {
  const w = 128, h = 88;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = field;
  g.fillRect(0, 0, w, h);
  if (nation === 'british') {
    const cw = 56, ch = 40;
    g.save();
    g.beginPath(); g.rect(0, 0, cw, ch); g.clip();
    g.fillStyle = '#1b2a5e'; g.fillRect(0, 0, cw, ch);
    g.strokeStyle = '#f2f0ea'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(cw, ch); g.moveTo(cw, 0); g.lineTo(0, ch); g.stroke();
    g.strokeStyle = '#c8102e'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(cw, ch); g.moveTo(cw, 0); g.lineTo(0, ch); g.stroke();
    g.fillStyle = '#f2f0ea'; g.fillRect(cw / 2 - 7, 0, 14, ch); g.fillRect(0, ch / 2 - 7, cw, 14);
    g.fillStyle = '#c8102e'; g.fillRect(cw / 2 - 4, 0, 8, ch); g.fillRect(0, ch / 2 - 4, cw, 8);
    g.restore();
    g.strokeStyle = '#d9b44a'; g.lineWidth = 4;
    g.beginPath(); g.arc(86, 50, 20, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#d9b44a';
    g.font = 'bold 20px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(toRoman(number), 86, 51);
  } else {
    g.fillStyle = '#f4f1e8';
    g.beginPath(); g.moveTo(w / 2, 4); g.lineTo(w - 6, h / 2); g.lineTo(w / 2, h - 4); g.lineTo(6, h / 2); g.closePath(); g.fill();
    g.fillStyle = '#1f3a8f';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(26, 0); g.lineTo(0, 18); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(w, h); g.lineTo(w - 26, h); g.lineTo(w, h - 18); g.closePath(); g.fill();
    g.fillStyle = '#c8102e';
    g.beginPath(); g.moveTo(w, 0); g.lineTo(w - 26, 0); g.lineTo(w, 18); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0, h); g.lineTo(26, h); g.lineTo(0, h - 18); g.closePath(); g.fill();
    g.fillStyle = '#b8922e';
    g.font = 'bold 26px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${number}e`, w / 2, h / 2 + 1);
  }
  g.strokeStyle = '#d9b44a';
  g.lineWidth = 5;
  g.strokeRect(2.5, 2.5, w - 5, h - 5);
  if (guidon) {
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(w + 1, 10); g.lineTo(w * 0.68, h / 2); g.lineTo(w + 1, h - 10); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

const FLAG_SHADER_HEAD = /* glsl */ `
  uniform float uTime;
  uniform float uFlagW;
  vec3 flagDisp(vec3 p) {
    float fx = clamp(p.x / uFlagW, 0.0, 1.0);
    float ph = modelMatrix[3][0] * 2.3 + modelMatrix[3][2] * 1.7;
    float w = sin(p.x * 15.0 - uTime * 6.5 + ph) * 0.6 + sin(p.x * 27.0 - uTime * 10.0 + p.y * 12.0 + ph) * 0.25;
    return vec3(0.0, -fx * fx * uFlagW * 0.09, w * 0.11 * uFlagW * fx);
  }
`;

export const makeFlagMesh = (tex: THREE.Texture, width: number, height: number, guidon = false) => {
  const geo = new THREE.PlaneGeometry(width, height, 14, 6);
  geo.translate(width / 2, -height / 2, 0);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    side: THREE.DoubleSide,
    roughness: 0.85,
    alphaTest: guidon ? 0.5 : 0,
    transparent: false,
  });
  const flagW = { value: width };
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = flagUniforms.uTime;
    shader.uniforms.uFlagW = flagW;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FLAG_SHADER_HEAD}`)
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        vec3 fp0 = position + flagDisp(position);
        vec3 fpx = position + vec3(0.01, 0.0, 0.0); fpx += flagDisp(fpx);
        vec3 fpy = position + vec3(0.0, 0.01, 0.0); fpy += flagDisp(fpy);
        vec3 objectNormal = normalize(cross(fpx - fp0, fpy - fp0));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif
      `)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += flagDisp(position);');
  };
  mat.customProgramCacheKey = () => (guidon ? 'flag-guidon' : 'flag');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
};

export const disposeFlagMesh = (m: THREE.Mesh) => {
  m.geometry.dispose();
  const mat = m.material as THREE.MeshStandardMaterial;
  mat.map?.dispose();
  mat.dispose();
};

/** Plain ownership banners for command centres, depots and the capture point (null = unclaimed). */
export const makeBannerTexture = (nation: Nation | null) => {
  const w = 128, h = 84;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  if (nation === 'british') {
    g.fillStyle = '#22408a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2f0ea'; g.lineWidth = 12;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
    g.fillStyle = '#f2f0ea'; g.fillRect(w / 2 - 10, 0, 20, h); g.fillRect(0, h / 2 - 10, w, 20);
    g.fillStyle = '#c8102e'; g.fillRect(w / 2 - 5, 0, 10, h); g.fillRect(0, h / 2 - 5, w, 10);
  } else if (nation === 'french') {
    g.fillStyle = '#1f3a8f'; g.fillRect(0, 0, w / 3, h);
    g.fillStyle = '#f4f1e8'; g.fillRect(w / 3, 0, w / 3, h);
    g.fillStyle = '#c8102e'; g.fillRect((2 * w) / 3, 0, w / 3 + 1, h);
    g.fillStyle = '#b8922e';
    g.beginPath(); g.arc(w / 2, h / 2, 13, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = '#e9e5d9'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#9b968a'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  }
  if (nation) {
    g.strokeStyle = '#d9b44a'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, w - 5, h - 5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};
