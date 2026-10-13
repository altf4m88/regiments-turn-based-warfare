import generalWellington from './general-wellington.jpg';
import generalPicton from './general-picton.jpg';
import generalHill from './general-hill.jpg';
import generalUxbridge from './general-uxbridge.jpg';
import generalMoore from './general-moore.jpg';
import generalGraham from './general-graham.jpg';
import generalBeresford from './general-beresford.jpg';
import generalCraufurd from './general-craufurd.jpg';
import emperorNapoleon from './emperor-napoleon.jpg';
import marshalNey from './marshal-ney.jpg';
import marshalDavout from './marshal-davout.jpg';
import marshalSoult from './marshal-soult.jpg';
import marshalMurat from './marshal-murat.jpg';
import marshalLannes from './marshal-lannes.jpg';
import marshalMassena from './marshal-massena.jpg';
import marshalGrouchy from './marshal-grouchy.jpg';

/**
 * Portraits of the historical commanders, by the name the game uses for them (see
 * COMMANDERS in src/game/engine.ts): 256×256 head-and-shoulders crops of public-domain
 * paintings on Wikimedia Commons, credited in this folder's README.md. Any other name a
 * player types is drawn as an officer's silhouette in their army's colours.
 */
export const PORTRAITS: Record<string, string> = {
  'General Wellington': generalWellington,
  'General Picton': generalPicton,
  'General Hill': generalHill,
  'General Uxbridge': generalUxbridge,
  'General Moore': generalMoore,
  'General Graham': generalGraham,
  'General Beresford': generalBeresford,
  'General Craufurd': generalCraufurd,
  'Emperor Napoléon': emperorNapoleon,
  'Marshal Ney': marshalNey,
  'Marshal Davout': marshalDavout,
  'Marshal Soult': marshalSoult,
  'Marshal Murat': marshalMurat,
  'Marshal Lannes': marshalLannes,
  'Marshal Masséna': marshalMassena,
  'Marshal Grouchy': marshalGrouchy,
};
