import { DOCTRINES, doctrineOf } from '../game/engine';
import { ArmyDoctrine, GameState } from '../game/types';

/** How to fight with each army, for an AI general commanding it. */
const PLAYBOOK: Record<Exclude<ArmyDoctrine, 'balanced'>, string> = {
  cavalry: `You command four hussar and two chasseur regiments, but only four line battalions, one light battalion and a single gun. Your strength is speed, not weight of fire: fight a war of movement.
- Every turn, send your horse round the enemy's flanks, along the roads where you can. Hussars have 6 MP and strike adjacent targets; chasseurs have 6 MP and carbines with range 3.
- Hunt what cavalry kills best: light infantry (hussars deal ×2.5), guns, and line infantry caught in the flank or rear (hussars deal ×2). Never charge the front of a line or a square.
- Threaten the enemy's Command Center and supply nodes to pull his line apart, and take the center when the way is open.
- Your thin line is the anvil: hold the approaches to the center with it and let the horse do the killing. Avoid long firefights against massed line and guns; you will lose them.
- If the enemy forms squares, ride away and let your gun and line infantry shoot them: a square cannot move.`,
  light: `You command five light infantry battalions and two chasseur regiments ahead of four line battalions, with one gun and one hussar regiment. Fight a skirmishing battle: bleed the enemy before you close with him.
- Light infantry fire at range 3 in any direction, and enemy line infantry cannot fire back at them or at your chasseurs. Harass his lines every turn.
- Fight from forests (+50% defense) and villages (+40% for infantry), and move into them early.
- Keep your skirmishers away from enemy hussars, which deal ×2.5 to light infantry: screen them with your line or chasseurs, and pull them back when horse comes near.
- Spread out to cover the approaches to the center and the supply nodes. Once the enemy is worn down, your line infantry advances to take and hold the center.`,
  artillery: `You command four guns behind five line battalions, with two light battalions and one hussar regiment. Fight a battle of attrition: let the guns break the enemy before he can close.
- Guns have range 8. Site them a few tiles behind your line with a clear field of fire over the center and its approaches, and palisade those that will hold a position.
- Fire every gun every turn at whatever is in range, above all squares (double damage) and the regiments closest to your line.
- Hold a line in front of the guns, two tiles apart and entrenched where you mean to stand, so the enemy has to cross the killing ground to reach you.
- Your weakness is cavalry: you have a single hussar regiment. Keep the guns out of reach of enemy horse, and be ready to form squares.
- Attrition is not passivity: the center still decides the battle. Move the guns up step by step to cover it, then take and hold it with your line.`,
};

/** What to expect from each enemy army, and how to answer it. */
const COUNTER: Record<Exclude<ArmyDoctrine, 'balanced'>, string> = {
  cavalry: 'a cavalry corps: six regiments of horse and a thin line. Expect hussars round your flanks: keep your line infantry in pairs two tiles apart, cover your light infantry and guns, and form squares when horse comes close. His thin line is weak against steady musketry and your guns.',
  light: 'a light division: five skirmisher battalions and mounted rifles. Your line infantry cannot fire back at skirmishers, so answer them with your own light infantry, your guns and above all your hussars (×2.5 against light infantry), and drive them out of the woods and villages.',
  artillery: 'a grand battery: four guns behind a strong line. Do not stand in squares in front of it or trade fire at long range; close quickly, go for the guns from the flanks with cavalry, and charge the line that shields them with the bayonet.',
};

/**
 * Added to the field manual for an AI general when either side has chosen a special army:
 * how to fight with its own, and what to expect from the enemy's. Nothing is added when
 * both sides field combined arms, so those games keep the standard prompts.
 */
export const doctrineBriefing = (state: Pick<GameState, 'doctrines'>, player: number) => {
  const mine = doctrineOf(state, player), theirs = doctrineOf(state, 3 - player);
  let text = '';
  if (mine !== 'balanced') text += `\n\n## Your army: ${DOCTRINES[mine].name}\n\n${PLAYBOOK[mine]}`;
  if (theirs !== 'balanced') text += `\n\n## The enemy army\n\nThe enemy fields ${COUNTER[theirs]}`;
  return text;
};
