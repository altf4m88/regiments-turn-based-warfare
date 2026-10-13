/**
 * Portraits of the historical commanders, by the name the game uses for them (see
 * COMMANDERS in src/game/engine.ts). Commanders without one, and any name a player
 * types, are drawn as an officer's silhouette in their army's colours.
 *
 * To add one: put a square head-and-shoulders crop (about 256×256 JPEG) of a
 * public-domain portrait in this folder, import it here, and credit the source in
 * this folder's README.md.
 */
export const PORTRAITS: Record<string, string> = {};
