import { Nation } from '../../game/types';

/*
 * Uniforms c. 1812–1815, keyed by the army a player chose: British regiments
 * (Foot Guards, Rifles, Royal Artillery, Royal Hussars...) in red, French ones
 * (Garde Nationale, Voltigeurs, Hussards, Chasseurs à Cheval...) in imperial blue.
 */

const WHITE = '#efece4';
const BLACK = '#1b1a19';
const GOLD = '#d9b44a';

const BRIT_RED = '#b02a20';
const BRIT_BUFF = '#dcc68c';
const BRIT_GREY = '#767a82';
const RIFLE_GREEN = '#2d3b2a';
const BRIT_NAVY = '#1f2a48';

const FR_BLUE = '#23376e';
const FR_RED = '#b3261e';
const FR_GREEN = '#2b4a34';
const CHAMOIS = '#d6b766';

export type Headgear = 'belgic' | 'stovepipe' | 'french' | 'bicorne';

export interface FootUniform {
  coat: string;
  /** Collar, cuffs and shoulder straps. */
  facing: string;
  /** Plastron lapels (French), or null for a single-breasted coat. */
  lapels: string | null;
  /** Horizontal lace loops across the chest (British "bastion" lace), or null. */
  lace: string | null;
  turnbacks: string;
  trousers: string;
  belts: string;
  plume: string;
  headgear: Headgear;
  pack: { body: string; roll: string } | null;
}

export type FootKind = 'line' | 'light' | 'gunner' | 'officer' | 'lightOfficer' | 'drummer' | 'bearer';

const britLine: FootUniform = {
  coat: BRIT_RED, facing: BRIT_BUFF, lapels: null, lace: WHITE, turnbacks: WHITE,
  trousers: BRIT_GREY, belts: WHITE, plume: WHITE, headgear: 'belgic',
  pack: { body: BLACK, roll: '#5a6a8c' },
};

const frLine: FootUniform = {
  coat: FR_BLUE, facing: FR_RED, lapels: WHITE, lace: null, turnbacks: WHITE,
  trousers: WHITE, belts: WHITE, plume: '#2f7a46', headgear: 'french',
  pack: { body: '#7a5a3a', roll: '#9a8f78' },
};

const britRifles: FootUniform = {
  coat: RIFLE_GREEN, facing: BLACK, lapels: null, lace: BLACK, turnbacks: RIFLE_GREEN,
  trousers: '#252f23', belts: BLACK, plume: '#1d3a24', headgear: 'stovepipe', pack: null,
};

const frVoltigeurs: FootUniform = {
  coat: FR_BLUE, facing: CHAMOIS, lapels: FR_BLUE, lace: null, turnbacks: WHITE,
  trousers: FR_BLUE, belts: WHITE, plume: CHAMOIS, headgear: 'french', pack: null,
};

export const FOOT_UNIFORMS: Record<Nation, Record<FootKind, FootUniform>> = {
  british: {
    line: britLine,
    bearer: { ...britLine, pack: null },
    // 95th Rifles: rifle-green jackets, black facings and belts.
    light: britRifles,
    lightOfficer: { ...britRifles, headgear: 'bicorne' },
    // Royal Artillery: dark blue with red facings and yellow lace.
    gunner: {
      coat: BRIT_NAVY, facing: BRIT_RED, lapels: null, lace: GOLD, turnbacks: BRIT_RED,
      trousers: BRIT_GREY, belts: WHITE, plume: WHITE, headgear: 'belgic', pack: null,
    },
    officer: { ...britLine, lace: GOLD, headgear: 'bicorne', pack: null },
    // Drummers wore "reversed colours": the regiment's facing colour as their coat.
    drummer: { ...britLine, coat: BRIT_BUFF, facing: BRIT_RED, lace: BRIT_RED, turnbacks: BRIT_RED, pack: null },
  },
  french: {
    line: frLine,
    bearer: { ...frLine, pack: null },
    // Voltigeurs: blue coats with chamois collars and yellow-green plumes.
    light: frVoltigeurs,
    lightOfficer: { ...frVoltigeurs, headgear: 'bicorne' },
    // Artillerie à pied: all blue with red cuffs and epaulettes.
    gunner: {
      coat: FR_BLUE, facing: FR_RED, lapels: FR_BLUE, lace: null, turnbacks: FR_RED,
      trousers: FR_BLUE, belts: WHITE, plume: FR_RED, headgear: 'french', pack: null,
    },
    officer: { ...frLine, headgear: 'bicorne', pack: null },
    // 1812 Imperial livery: green coats with yellow lace.
    drummer: { ...frLine, coat: FR_GREEN, facing: FR_RED, lapels: FR_GREEN, lace: GOLD, pack: null },
  },
};

export type RiderBody = 'hussar' | 'chasseur';

export interface RiderUniform {
  coat: string;
  facing: string;
  /** Hussar braiding across the dolman, or null. */
  braid: string | null;
  /** Fur-trimmed pelisse slung over the left shoulder, or null. */
  pelisse: { cloth: string; fur: string } | null;
  breeches: string;
  sash: string;
  headgear: 'busby' | 'colpack' | 'shako';
  /** Busby / colpack bag colour. */
  bag: string;
  plume: string;
  cloth: string;
  clothTrim: string;
  sheepskin: string | null;
}

export const RIDER_UNIFORMS: Record<Nation, Record<RiderBody, RiderUniform>> = {
  british: {
    // British hussars: blue dolman and pelisse, white fur, white breeches.
    hussar: {
      coat: BRIT_NAVY, facing: WHITE, braid: GOLD, pelisse: { cloth: BRIT_NAVY, fur: WHITE },
      breeches: '#e4dfd2', sash: '#b02a20', headgear: 'busby', bag: BRIT_RED, plume: WHITE,
      cloth: BRIT_NAVY, clothTrim: GOLD, sheepskin: WHITE,
    },
    // Light dragoons (1812 pattern): blue jackets with buff facings, grey overalls.
    chasseur: {
      coat: BRIT_NAVY, facing: BRIT_BUFF, braid: null, pelisse: null,
      breeches: BRIT_GREY, sash: GOLD, headgear: 'shako', bag: BRIT_BUFF, plume: WHITE,
      cloth: BRIT_NAVY, clothTrim: BRIT_BUFF, sheepskin: null,
    },
  },
  french: {
    // French hussars: green dolman, scarlet pelisse and breeches, yellow braid.
    hussar: {
      coat: FR_GREEN, facing: FR_RED, braid: GOLD, pelisse: { cloth: FR_RED, fur: BLACK },
      breeches: FR_RED, sash: GOLD, headgear: 'busby', bag: FR_RED, plume: BLACK,
      cloth: FR_GREEN, clothTrim: GOLD, sheepskin: BLACK,
    },
    // Chasseurs à cheval: dark green with scarlet facings, fur colpack.
    chasseur: {
      coat: FR_GREEN, facing: FR_RED, braid: null, pelisse: null,
      breeches: FR_GREEN, sash: FR_RED, headgear: 'colpack', bag: FR_RED, plume: '#2f7a46',
      cloth: FR_GREEN, clothTrim: WHITE, sheepskin: null,
    },
  },
};

/** Main coat colour per army, used for camp tents and the HQ marquee. */
export const ARMY_COAT: Record<Nation, string> = { british: BRIT_RED, french: FR_BLUE };

/** Gun carriages: British blue-grey, French Gribeauval olive. */
export const CARRIAGE: Record<Nation, string> = { british: '#5b6b79', french: '#5d6b3a' };
