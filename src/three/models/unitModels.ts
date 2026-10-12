import * as THREE from 'three';
import { GeoBuilder, V3 } from '../core/GeoBuilder';
import { TEAM, TeamId } from '../core/constants';

/*
 * Procedural Napoleonic miniatures. Every model is authored in its own local
 * space: feet (or hooves / wheels) on y = 0, facing +Z. A foot soldier is ~0.5
 * units tall; a tile is 2 units wide.
 */

const SKIN = '#dcb48f';
const BLACK = '#1b1a19';
const LEATHER = '#3b2a1c';
const WOOD = '#6b4423';
const IRON = '#3a3b3f';
const STEEL = '#c6cad0';
const BRASS = '#c9a43a';
const WHITE = '#efece4';
const GOLD = '#d9b44a';

export const HIP_Y = 0.205;
export const LEG_X = 0.03;
export const SHOULDER_Y = 0.35;

/** Muzzle positions (model space) used to spawn flashes and smoke. */
export const MUZZLE = {
  infantry: new THREE.Vector3(0.035, 0.375, 0.42),
  rider: new THREE.Vector3(0.03, 0.54, 0.34),
  gun: new THREE.Vector3(0, 0.18, 0.25),
};
/** Where the regimental colour hangs from the bearer's pole. */
export const FLAG_ANCHOR = new THREE.Vector3(0.065, 0.85, 0.035);
export const GUIDON_ANCHOR = new THREE.Vector3(0.085, 0.92, 0.07);

export type FootKind = 'line' | 'light' | 'gunner' | 'officer' | 'drummer' | 'bearer';
export type RiderKind = 'hussar' | 'chasseur' | 'guidon';

const team = (t: TeamId) => TEAM[t];

// ---------------------------------------------------------------------------
// Foot soldiers

const head = (b: GeoBuilder, y = 0.405) => {
  b.ball(0.037, SKIN, { p: [0, y, 0.002] });
  b.box(0.034, 0.022, 0.012, SKIN, { p: [0, y - 0.035, 0.0] }); // neck
};

const shako = (b: GeoBuilder, plume: string, opts: { tall?: boolean; plate?: boolean; plumeTall?: boolean } = {}) => {
  const h = opts.tall ? 0.088 : 0.075;
  b.cyl(0.041, 0.036, h, 10, BLACK, { p: [0, 0.428 + h / 2, -0.002] });
  b.box(0.062, 0.007, 0.032, BLACK, { p: [0, 0.432, 0.036], r: [0.25, 0, 0] }); // peak
  if (opts.plate !== false) b.box(0.028, 0.032, 0.005, BRASS, { p: [0, 0.428 + h * 0.48, 0.04] });
  if (opts.plumeTall) b.box(0.013, 0.055, 0.013, plume, { p: [0, 0.428 + h + 0.026, 0.026] });
  else b.ball(0.013, plume, { p: [0, 0.428 + h + 0.008, 0.024] }, 0);
};

const torso = (b: GeoBuilder, coat: string, facing: string, opts: { tails?: boolean; lapels?: boolean } = {}) => {
  b.box(0.122, 0.162, 0.074, coat, { p: [0, 0.285, 0] });
  b.box(0.068, 0.022, 0.06, facing, { p: [0, 0.365, 0] }); // collar
  if (opts.lapels !== false) b.box(0.058, 0.13, 0.006, facing, { p: [0, 0.295, 0.039] });
  if (opts.tails !== false) {
    b.box(0.05, 0.085, 0.012, coat, { p: [-0.028, 0.19, -0.035], r: [-0.12, 0, 0] });
    b.box(0.05, 0.085, 0.012, coat, { p: [0.028, 0.19, -0.035], r: [-0.12, 0, 0] });
    b.box(0.012, 0.07, 0.013, WHITE, { p: [-0.005, 0.19, -0.04], r: [-0.12, 0, 0] });
  }
  // Shoulder wings
  b.box(0.03, 0.016, 0.06, facing, { p: [-0.066, 0.357, 0] });
  b.box(0.03, 0.016, 0.06, facing, { p: [0.066, 0.357, 0] });
};

const crossbelts = (b: GeoBuilder, color = WHITE, both = true) => {
  b.box(0.014, 0.2, 0.006, color, { p: [0, 0.285, 0.04], r: [0, 0, 0.62] });
  if (both) b.box(0.014, 0.2, 0.006, color, { p: [0, 0.285, 0.041], r: [0, 0, -0.62] });
  b.box(0.014, 0.2, 0.006, color, { p: [0, 0.285, -0.04], r: [0, 0, 0.62] });
  if (both) b.box(0.014, 0.2, 0.006, color, { p: [0, 0.285, -0.041], r: [0, 0, -0.62] });
  b.box(0.022, 0.022, 0.007, BRASS, { p: [0, 0.285, 0.044] });
};

const backpack = (b: GeoBuilder) => {
  b.box(0.1, 0.09, 0.045, LEATHER, { p: [0, 0.3, -0.06] });
  b.add(new THREE.CylinderGeometry(0.019, 0.019, 0.112, 8), '#7f7a70', { p: [0, 0.355, -0.06], r: [0, 0, Math.PI / 2] });
  b.box(0.042, 0.03, 0.026, BLACK, { p: [0.045, 0.205, -0.045] }); // cartridge box
};

export const buildFootBody = (kind: FootKind, t: TeamId) => {
  const T = team(t);
  const b = new GeoBuilder();
  head(b);
  switch (kind) {
    case 'line':
      torso(b, T.coat, T.facing);
      crossbelts(b);
      backpack(b);
      shako(b, T.plume);
      break;
    case 'light':
      torso(b, T.coatDark, '#2f5a33', { lapels: false });
      crossbelts(b, BLACK, false);
      b.box(0.07, 0.06, 0.03, '#8a7c5c', { p: [-0.05, 0.22, -0.04] }); // haversack
      shako(b, '#2f6b3a', { tall: true, plumeTall: true, plate: false });
      break;
    case 'gunner':
      torso(b, T.coatDark, '#b02b20', { lapels: false });
      crossbelts(b, WHITE, false);
      shako(b, '#b02b20', { plumeTall: true });
      break;
    case 'officer': {
      torso(b, T.coat, T.facing);
      b.box(0.125, 0.026, 0.078, '#9c1b2a', { p: [0, 0.215, 0] }); // sash
      b.box(0.036, 0.014, 0.064, GOLD, { p: [-0.07, 0.36, 0] }); // epaulettes
      b.box(0.036, 0.014, 0.064, GOLD, { p: [0.07, 0.36, 0] });
      // Bicorne worn athwart
      const bic = new THREE.CylinderGeometry(0.058, 0.058, 0.026, 12, 1, false, -Math.PI / 2, Math.PI);
      b.add(bic, BLACK, { p: [0, 0.432, 0], r: [-Math.PI / 2, 0, 0], s: [1, 1, 1] });
      b.ball(0.011, t === 1 ? '#1d2a6b' : '#2a3f9a', { p: [-0.03, 0.47, 0.012] }, 0); // cockade
      b.box(0.012, 0.05, 0.012, t === 1 ? WHITE : '#c8102e', { p: [-0.03, 0.5, 0.012] });
      b.box(0.012, 0.13, 0.008, STEEL, { p: [-0.07, 0.17, -0.02], r: [0.35, 0, 0.1] }); // scabbard
      break;
    }
    case 'drummer':
      // Drummers wore "reversed colours": the facing colour as their coat.
      torso(b, t === 1 ? '#c8b98a' : T.facing, T.coat);
      for (let i = 0; i < 4; i++) b.box(0.124, 0.006, 0.076, GOLD, { p: [0, 0.23 + i * 0.035, 0] });
      shako(b, T.plume);
      // Drum on the left hip
      b.add(new THREE.CylinderGeometry(0.042, 0.042, 0.05, 12), WHITE, { p: [-0.035, 0.235, 0.075], r: [0.35, 0, 0.15] });
      b.add(new THREE.CylinderGeometry(0.044, 0.044, 0.01, 12), T.coat, { p: [-0.035, 0.258, 0.083], r: [0.35, 0, 0.15] });
      b.add(new THREE.CylinderGeometry(0.044, 0.044, 0.01, 12), T.coat, { p: [-0.035, 0.212, 0.067], r: [0.35, 0, 0.15] });
      b.box(0.012, 0.2, 0.005, WHITE, { p: [0, 0.3, 0.04], r: [0, 0, -0.62] });
      break;
    case 'bearer':
      torso(b, T.coat, T.facing);
      b.box(0.014, 0.2, 0.006, WHITE, { p: [0, 0.285, 0.04], r: [0, 0, -0.62] });
      b.box(0.03, 0.03, 0.03, LEATHER, { p: [0.05, 0.215, 0.02] }); // colour belt socket
      shako(b, T.plume);
      break;
  }
  return b.build();
};

/** One leg, pivoting at the hip (origin) and hanging down to the foot. */
export const buildLeg = (trousers: string, gaiters = BLACK) => {
  const b = new GeoBuilder();
  b.box(0.046, 0.15, 0.05, trousers, { p: [0, -0.075, 0] });
  b.box(0.044, 0.055, 0.048, gaiters, { p: [0, -0.175, 0.001] });
  b.box(0.04, 0.022, 0.068, BLACK, { p: [0, -0.194, 0.012] });
  return b.build();
};

export const footTrousers = (kind: FootKind, t: TeamId) => {
  const T = team(t);
  if (kind === 'light') return '#5d6064';
  if (kind === 'gunner') return t === 1 ? '#3f4651' : '#2e3a5c';
  if (kind === 'officer') return T.trousers;
  return T.trousers;
};

const musket = (b: GeoBuilder, butt: V3, muzzle: V3, bayonet = true) => {
  const dir = new THREE.Vector3(muzzle[0] - butt[0], muzzle[1] - butt[1], muzzle[2] - butt[2]);
  const len = dir.length();
  dir.normalize();
  const at = (f: number): V3 => [butt[0] + dir.x * len * f, butt[1] + dir.y * len * f, butt[2] + dir.z * len * f];
  b.limb(butt, at(0.62), 0.017, 0.024, WOOD);
  b.limb(butt, at(0.09), 0.022, 0.034, WOOD); // butt
  b.rod(at(0.4), muzzle, 0.0062, IRON, 5);
  if (bayonet) {
    const tip: V3 = [muzzle[0] + dir.x * 0.075, muzzle[1] + dir.y * 0.075, muzzle[2] + dir.z * 0.075];
    b.limb(muzzle, tip, 0.004, 0.007, STEEL);
  }
};

const arm = (b: GeoBuilder, shoulder: V3, elbow: V3, hand: V3, sleeve: string, cuff: string) => {
  b.limb(shoulder, elbow, 0.034, 0.036, sleeve, 0.008);
  b.limb(elbow, hand, 0.03, 0.032, sleeve, 0.006);
  b.box(0.034, 0.016, 0.034, cuff, { p: [hand[0] * 0.75 + elbow[0] * 0.25, hand[1] * 0.75 + elbow[1] * 0.25, hand[2] * 0.75 + elbow[2] * 0.25] });
  b.ball(0.017, SKIN, { p: hand }, 0);
};

const L_SH: V3 = [-0.076, SHOULDER_Y, 0];
const R_SH: V3 = [0.076, SHOULDER_Y, 0];

export type FootPose = 'carry' | 'aim' | 'up' | 'down' | 'hold' | 'beat';

export const buildFootArms = (kind: FootKind, pose: FootPose, t: TeamId) => {
  const T = team(t);
  const sleeve = kind === 'light' || kind === 'gunner' ? T.coatDark : kind === 'drummer' ? (t === 1 ? '#c8b98a' : T.facing) : T.coat;
  const cuff = kind === 'light' ? '#2f5a33' : kind === 'gunner' ? '#b02b20' : kind === 'drummer' ? T.coat : T.facing;
  const b = new GeoBuilder();
  const bayonet = kind === 'line';
  switch (kind) {
    case 'line':
    case 'light':
      if (pose === 'aim') {
        arm(b, R_SH, [0.105, 0.31, 0.05], [0.05, 0.355, 0.075], sleeve, cuff);
        arm(b, L_SH, [-0.05, 0.31, 0.12], [0.03, 0.36, 0.2], sleeve, cuff);
        musket(b, [0.04, 0.37, -0.01], [MUZZLE.infantry.x, MUZZLE.infantry.y, MUZZLE.infantry.z], bayonet);
      } else {
        arm(b, L_SH, [-0.09, 0.27, 0.012], [-0.075, 0.225, 0.04], sleeve, cuff);
        arm(b, R_SH, [0.088, 0.275, 0.0], [0.083, 0.205, 0.012], sleeve, cuff);
        musket(b, [-0.082, 0.205, 0.045], [-0.084, 0.58, 0.012], bayonet);
      }
      break;
    case 'gunner':
      arm(b, R_SH, [0.098, 0.28, 0.02], [0.08, 0.27, 0.05], sleeve, cuff);
      arm(b, L_SH, [-0.06, 0.3, 0.07], [0.07, 0.36, 0.06], sleeve, cuff);
      b.rod([0.078, 0.03, 0.055], [0.078, 0.66, 0.055], 0.007, WOOD, 5);
      b.add(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 8), '#2a2622', { p: [0.078, 0.68, 0.055] });
      break;
    case 'officer':
      arm(b, L_SH, [-0.088, 0.275, 0.0], [-0.08, 0.21, 0.02], sleeve, cuff);
      if (pose === 'up') {
        arm(b, R_SH, [0.1, 0.43, 0.03], [0.1, 0.52, 0.06], sleeve, cuff);
        b.limb([0.1, 0.53, 0.06], [0.1, 0.8, 0.14], 0.008, 0.004, STEEL);
        b.box(0.03, 0.006, 0.012, BRASS, { p: [0.1, 0.53, 0.06] });
      } else {
        arm(b, R_SH, [0.095, 0.28, 0.03], [0.085, 0.24, 0.09], sleeve, cuff);
        b.limb([0.085, 0.24, 0.095], [0.08, 0.48, 0.03], 0.008, 0.004, STEEL);
        b.box(0.03, 0.006, 0.012, BRASS, { p: [0.085, 0.245, 0.093] });
      }
      break;
    case 'drummer':
      arm(b, L_SH, [-0.085, 0.29, 0.04], [-0.045, 0.285, 0.1], sleeve, cuff);
      arm(b, R_SH, [0.085, 0.29, 0.04], [0.02, 0.29, 0.11], sleeve, cuff);
      b.rod([-0.045, 0.288, 0.1], [-0.03, 0.27, 0.16], 0.004, WOOD, 4);
      b.rod([0.02, 0.29, 0.11], [-0.01, 0.272, 0.16], 0.004, WOOD, 4);
      break;
    case 'bearer':
      arm(b, R_SH, [0.098, 0.29, 0.03], [0.065, 0.3, 0.04], sleeve, cuff);
      arm(b, L_SH, [-0.05, 0.31, 0.07], [0.062, 0.4, 0.035], sleeve, cuff);
      b.rod([0.065, 0.16, 0.035], [FLAG_ANCHOR.x, FLAG_ANCHOR.y + 0.02, FLAG_ANCHOR.z], 0.0065, '#5c3a1e', 5);
      b.cone(0.012, 0.045, 6, GOLD, { p: [FLAG_ANCHOR.x, FLAG_ANCHOR.y + 0.05, FLAG_ANCHOR.z] });
      b.ball(0.01, GOLD, { p: [FLAG_ANCHOR.x, FLAG_ANCHOR.y + 0.025, FLAG_ANCHOR.z] }, 0);
      break;
  }
  return b.build();
};

// ---------------------------------------------------------------------------
// Horses & riders

export const HORSE_COATS = [
  { coat: '#5b3a23', dark: '#1d1410', socks: '#24180f' },
  { coat: '#7d4a25', dark: '#4a2a14', socks: '#7d4a25' },
  { coat: '#2b2522', dark: '#141110', socks: '#2b2522' },
  { coat: '#a39e95', dark: '#6b6862', socks: '#8f8a82' },
];

export const HORSE_LEGS: { x: number; z: number; front: boolean }[] = [
  { x: -0.047, z: 0.125, front: true },
  { x: 0.047, z: 0.125, front: true },
  { x: -0.047, z: -0.13, front: false },
  { x: 0.047, z: -0.13, front: false },
];
export const HORSE_LEG_TOP = 0.27;

export const buildHorseBody = (variant: number, t: TeamId, kind: RiderKind) => {
  const H = HORSE_COATS[variant % HORSE_COATS.length];
  const T = team(t);
  const b = new GeoBuilder();
  b.ball(1, H.coat, { p: [0, 0.3, -0.005], s: [0.083, 0.086, 0.17] });
  b.ball(1, H.coat, { p: [0, 0.31, 0.115], s: [0.075, 0.088, 0.085] });
  b.ball(1, H.coat, { p: [0, 0.318, -0.12], s: [0.08, 0.086, 0.09] });
  b.box(0.056, 0.16, 0.075, H.coat, { p: [0, 0.405, 0.19], r: [-0.55, 0, 0] });
  b.box(0.046, 0.052, 0.135, H.coat, { p: [0, 0.47, 0.275], r: [0.62, 0, 0] });
  b.box(0.04, 0.04, 0.04, H.dark, { p: [0, 0.427, 0.325], r: [0.62, 0, 0] }); // muzzle
  b.box(0.014, 0.03, 0.01, H.coat, { p: [-0.016, 0.525, 0.245], r: [-0.2, 0, -0.15] });
  b.box(0.014, 0.03, 0.01, H.coat, { p: [0.016, 0.525, 0.245], r: [-0.2, 0, 0.15] });
  b.box(0.016, 0.16, 0.034, H.dark, { p: [0, 0.435, 0.168], r: [-0.55, 0, 0] }); // mane
  b.box(0.03, 0.18, 0.035, H.dark, { p: [0, 0.255, -0.225], r: [-0.32, 0, 0] }); // tail
  // Bridle
  b.box(0.05, 0.008, 0.008, LEATHER, { p: [0, 0.455, 0.29], r: [0.62, 0, 0] });
  // Shabraque (saddle cloth) in regimental colours
  const cloth = kind === 'chasseur' ? T.coatDark : T.coat;
  b.box(0.184, 0.105, 0.2, cloth, { p: [0, 0.345, -0.03] });
  b.box(0.187, 0.014, 0.204, GOLD, { p: [0, 0.296, -0.03] });
  if (kind === 'hussar' || kind === 'guidon') b.box(0.11, 0.022, 0.13, WHITE, { p: [0, 0.403, -0.02] }); // sheepskin
  else b.box(0.095, 0.02, 0.11, LEATHER, { p: [0, 0.402, -0.02] });
  b.box(0.12, 0.05, 0.05, '#4d5560', { p: [0, 0.405, -0.13] }); // portmanteau
  return b.build();
};

/** One horse leg pivoting at the shoulder / hip. */
export const buildHorseLeg = (variant: number) => {
  const H = HORSE_COATS[variant % HORSE_COATS.length];
  const b = new GeoBuilder();
  b.box(0.042, 0.13, 0.055, H.coat, { p: [0, -0.06, 0] });
  b.box(0.026, 0.13, 0.03, H.socks, { p: [0, -0.18, 0.004] });
  b.box(0.034, 0.028, 0.04, '#1a1714', { p: [0, -0.256, 0.008] });
  return b.build();
};

const RIDER_SH_R: V3 = [0.072, 0.54, 0];
const RIDER_SH_L: V3 = [-0.072, 0.54, 0];
export const RIDER_SHOULDER = new THREE.Vector3(0.072, 0.54, 0);

export const buildRider = (kind: RiderKind, t: TeamId) => {
  const T = team(t);
  const b = new GeoBuilder();
  const coat = kind === 'chasseur' ? T.coatDark : T.coat;
  const breeches = kind === 'chasseur' ? '#4a4e45' : t === 1 ? '#e2ddcf' : '#7f2a2a';
  // Legs astride
  for (const s of [-1, 1]) {
    b.limb([s * 0.045, 0.405, -0.02], [s * 0.088, 0.37, 0.07], 0.042, 0.046, breeches, 0.01);
    b.limb([s * 0.088, 0.37, 0.07], [s * 0.092, 0.255, 0.035], 0.036, 0.04, BLACK, 0.008);
    b.box(0.034, 0.02, 0.06, BLACK, { p: [s * 0.092, 0.246, 0.05] });
  }
  b.box(0.115, 0.15, 0.07, coat, { p: [0, 0.475, 0] });
  b.box(0.118, 0.022, 0.074, kind === 'chasseur' ? '#2f5a33' : GOLD, { p: [0, 0.405, 0] }); // sash
  b.box(0.066, 0.02, 0.058, kind === 'chasseur' ? '#2f5a33' : T.facing, { p: [0, 0.552, 0] });
  if (kind !== 'chasseur') {
    for (let i = 0; i < 5; i++) b.box(0.08, 0.006, 0.006, GOLD, { p: [0, 0.43 + i * 0.024, 0.037] });
    // Pelisse slung over the left shoulder, fur-trimmed
    b.box(0.07, 0.12, 0.085, T.coatDark, { p: [-0.065, 0.49, -0.01], r: [0, 0, 0.12] });
    b.box(0.072, 0.016, 0.088, WHITE, { p: [-0.07, 0.43, -0.01], r: [0, 0, 0.12] });
    b.box(0.006, 0.08, 0.06, T.coatDark, { p: [-0.1, 0.33, -0.05], r: [0.1, 0, 0] }); // sabretache
  } else {
    b.box(0.058, 0.11, 0.006, '#2f5a33', { p: [0, 0.485, 0.036] });
  }
  b.box(0.008, 0.2, 0.01, STEEL, { p: [-0.1, 0.36, -0.08], r: [0.9, 0, 0] }); // scabbard
  head(b, 0.59);
  if (kind === 'chasseur') {
    // Fur colpack with tall plume
    b.cyl(0.042, 0.038, 0.075, 10, '#2b2018', { p: [0, 0.655, 0] });
    b.box(0.014, 0.07, 0.014, '#2f6b3a', { p: [-0.02, 0.72, 0.02] });
  } else {
    b.cyl(0.044, 0.04, 0.09, 10, '#1d1813', { p: [0, 0.663, 0] }); // busby
    b.box(0.02, 0.05, 0.03, T.facing, { p: [0.045, 0.69, -0.005], r: [0, 0, -0.5] });
    b.box(0.012, 0.075, 0.012, T.plume, { p: [-0.03, 0.735, 0.01] });
  }
  // Left arm on the reins
  arm(b, RIDER_SH_L, [-0.088, 0.47, 0.06], [-0.03, 0.45, 0.13], coat, T.facing);
  b.limb([-0.03, 0.45, 0.13], [-0.02, 0.462, 0.3], 0.006, 0.004, LEATHER);
  b.limb([-0.03, 0.45, 0.13], [0.02, 0.462, 0.3], 0.006, 0.004, LEATHER);
  return b.build();
};

export type RiderPose = 'rest' | 'charge' | 'aim' | 'carry';

export const buildRiderArm = (kind: RiderKind, pose: RiderPose, t: TeamId) => {
  const T = team(t);
  const coat = kind === 'chasseur' ? T.coatDark : T.coat;
  const cuff = kind === 'chasseur' ? '#2f5a33' : T.facing;
  const b = new GeoBuilder();
  if (kind === 'guidon') {
    arm(b, RIDER_SH_R, [0.1, 0.48, 0.05], [0.085, 0.52, 0.07], coat, cuff);
    b.rod([0.085, 0.36, 0.07], [GUIDON_ANCHOR.x, GUIDON_ANCHOR.y + 0.02, GUIDON_ANCHOR.z], 0.006, '#5c3a1e', 5);
    b.cone(0.01, 0.05, 6, STEEL, { p: [GUIDON_ANCHOR.x, GUIDON_ANCHOR.y + 0.05, GUIDON_ANCHOR.z] });
    return b.build();
  }
  if (kind === 'hussar') {
    if (pose === 'charge') {
      arm(b, RIDER_SH_R, [0.1, 0.62, 0.03], [0.09, 0.69, 0.06], coat, cuff);
      b.limb([0.09, 0.7, 0.06], [0.085, 0.93, -0.06], 0.009, 0.004, STEEL);
      b.box(0.034, 0.008, 0.016, BRASS, { p: [0.09, 0.695, 0.06] });
    } else {
      arm(b, RIDER_SH_R, [0.098, 0.475, 0.03], [0.075, 0.45, 0.1], coat, cuff);
      b.limb([0.075, 0.455, 0.1], [0.086, 0.69, -0.02], 0.009, 0.004, STEEL);
      b.box(0.034, 0.008, 0.016, BRASS, { p: [0.075, 0.455, 0.1] });
    }
    return b.build();
  }
  // Chasseur: carbine
  if (pose === 'aim') {
    arm(b, RIDER_SH_R, [0.1, 0.5, 0.05], [0.045, 0.53, 0.06], coat, cuff);
    arm(b, RIDER_SH_L, [-0.05, 0.5, 0.11], [0.03, 0.535, 0.17], coat, cuff);
    musket(b, [0.04, 0.535, -0.01], [MUZZLE.rider.x, MUZZLE.rider.y, MUZZLE.rider.z], false);
  } else {
    arm(b, RIDER_SH_R, [0.1, 0.475, 0.03], [0.08, 0.45, 0.09], coat, cuff);
    musket(b, [0.085, 0.4, 0.1], [0.08, 0.7, 0.06], false);
  }
  return b.build();
};

// ---------------------------------------------------------------------------
// Artillery

export const WHEEL_R = 0.12;
export const WHEEL_X = 0.112;

export const buildGun = (t: TeamId) => {
  const T = team(t);
  const b = new GeoBuilder();
  const c = T.carriage;
  b.box(0.062, 0.05, 0.43, c, { p: [0, 0.07, -0.17], r: [-0.25, 0, 0] }); // trail
  b.box(0.016, 0.065, 0.17, c, { p: [-0.042, 0.15, -0.005] }); // cheeks
  b.box(0.016, 0.065, 0.17, c, { p: [0.042, 0.15, -0.005] });
  b.box(0.07, 0.014, 0.02, IRON, { p: [0, 0.018, -0.375] }); // trail plate
  b.box(0.012, 0.012, 0.16, WOOD, { p: [0, 0.05, -0.43], r: [0.4, 0, 0] }); // handspike
  b.add(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), IRON, { p: [0, WHEEL_R, 0], r: [0, 0, Math.PI / 2] }); // axle
  // Barrel: radiusTop maps to the muzzle after rotating +Y onto +Z.
  b.add(new THREE.CylinderGeometry(0.019, 0.027, 0.34, 12), '#9c7b3c', { p: [0, 0.178, 0.045], r: [Math.PI / 2 - 0.05, 0, 0] });
  b.add(new THREE.CylinderGeometry(0.024, 0.024, 0.022, 12), '#8a6a30', { p: [0, 0.186, 0.205], r: [Math.PI / 2 - 0.05, 0, 0] });
  b.add(new THREE.CylinderGeometry(0.029, 0.029, 0.02, 12), '#8a6a30', { p: [0, 0.172, -0.1], r: [Math.PI / 2 - 0.05, 0, 0] });
  b.ball(0.013, '#8a6a30', { p: [0, 0.17, -0.142] }, 0);
  b.box(0.012, 0.012, 0.04, '#8a6a30', { p: [-0.03, 0.18, 0.03] }); // trunnions
  b.box(0.012, 0.012, 0.04, '#8a6a30', { p: [0.03, 0.18, 0.03] });
  b.box(0.075, 0.045, 0.085, c, { p: [0, 0.122, -0.15], r: [-0.25, 0, 0] }); // ammunition chest
  b.box(0.08, 0.008, 0.09, IRON, { p: [0, 0.147, -0.155], r: [-0.25, 0, 0] });
  return b.build();
};

export const buildWheel = (t: TeamId) => {
  const T = team(t);
  const b = new GeoBuilder();
  b.add(new THREE.TorusGeometry(WHEEL_R - 0.006, 0.01, 4, 18), IRON, { r: [0, Math.PI / 2, 0] });
  b.add(new THREE.TorusGeometry(WHEEL_R - 0.018, 0.009, 4, 18), T.carriage, { r: [0, Math.PI / 2, 0] });
  for (let i = 0; i < 6; i++) {
    b.box(0.008, WHEEL_R * 2 - 0.03, 0.01, T.carriage, { r: [(i * Math.PI) / 6, 0, 0] });
  }
  b.add(new THREE.CylinderGeometry(0.022, 0.022, 0.045, 8), IRON, { r: [0, 0, Math.PI / 2] });
  return b.build();
};

// ---------------------------------------------------------------------------
// Earthworks, palisades, cannonball

export const buildEarthworks = (width: number) => {
  const b = new GeoBuilder();
  const segs = Math.max(3, Math.round(width / 0.18));
  for (let i = 0; i < segs; i++) {
    const f = segs === 1 ? 0.5 : i / (segs - 1);
    const x = (f - 0.5) * width;
    const z = 0.36 - Math.pow(Math.abs(f - 0.5) * 2, 2) * 0.14;
    const rot = (f - 0.5) * 0.6;
    b.box(0.22, 0.09, 0.12, '#6e5a3c', { p: [x, 0.03, z], r: [0.3, -rot, 0] });
    b.box(0.2, 0.03, 0.06, '#7f6a48', { p: [x, 0.08, z - 0.01], r: [0.1, -rot, 0] });
    // Gabions (woven baskets of earth)
    if (i % 2 === 0) b.cyl(0.035, 0.035, 0.07, 7, '#8a7650', { p: [x, 0.11, z - 0.03] });
  }
  return b.build();
};

export const buildPalisade = () => {
  const b = new GeoBuilder();
  for (let i = 0; i < 9; i++) {
    const a = -0.75 + (i / 8) * 1.5;
    const r = 0.42;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    // Sharpened stakes leaning outwards
    b.cyl(0.004, 0.014, 0.22, 5, '#7a5a35', { p: [x, 0.08, z], r: [0.75 * Math.cos(a), 0, -0.75 * Math.sin(a)] });
    if (i % 2 === 0) b.cyl(0.004, 0.012, 0.18, 5, '#6a4d2c', { p: [x * 0.93, 0.06, z * 0.93], r: [0.5 * Math.cos(a), 0, -0.5 * Math.sin(a)] });
  }
  b.add(new THREE.TorusGeometry(0.4, 0.012, 3, 16, 1.6), '#5a4228', { p: [0, 0.04, 0], r: [Math.PI / 2, 0, Math.PI / 2 - 0.8] });
  return b.build();
};
