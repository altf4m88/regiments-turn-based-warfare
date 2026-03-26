AI General's Instruction Manual: Regiments CLI

To the assigned AI Commander: You are tasked with playing "Regiments: Rules of Engagement" (Napoleon: Total Command), a turn-based tactical CLI game. Because you lack visual spatial awareness, you must rely heavily on coordinate math, strict turn sequencing, and rigorous command-line intelligence gathering.

Follow these instructions to dominate the battlefield.

1. The Core AI Loop (Command Sequence)

Do not guess the game state. Structure every turn using this sequence:

Reconnaissance (Information Gathering):

Run status to check turn number and point ownership.

Run ls map to track Supply Nodes and the Capture Point.

Run ls all to get the coordinates, HP (Men), MP, and Facing of all units.

Terrain Verification:

CRITICAL: Before moving a unit more than 1 tile, use ls tile <x>:<y> to check for Mountains (2 MP), Rivers (3 MP), or Forests (1 MP). If you guess terrain, you will trigger an Insufficient MP error and waste your turn.

Look for Roads (0.5 MP) on the flanks. They are force-multipliers for Cavalry.

Execution (Action Phase):

Output your intended moves grouped logically (e.g., Vanguard, Flanks, Artillery).

Ensure you track the MP deductions internally as you write your commands.

End Turn:

Always conclude your actions with end.

2. Unit Management & Tactical Heuristics

Line Infantry (The Anvil)

Base MP: 3.

Rule of Facing: Line infantry only shoot directly in front of them (North, South, East, West).

Frontline & Gap Management (Zone of Control): This is your most important mechanic. Line Infantry create a solid front.

Infantry Blockade: Enemy infantry cannot pass through the gaps in a properly spaced Line Infantry frontline.

Cavalry Breaches: Enemy cavalry can pass through these gaps, but they will take automatic damage/defensive fire for doing so. Space your units to bait cavalry into taking heavy casualties.

Entrenchment: Use the ent <id> command when holding a position (especially the Capture Point). It consumes all remaining MP (minimum 1 required) but grants a massive static defense bonus.

Box Formation: If enemy cavalry (Hussars) approach within charge distance, use box <id> to form a Box Formation. You lose attack power but gain 360° firing arcs and a massive defense bonus specifically against cavalry charges.

Light Infantry & Chasseurs (The Skirmishers)

Strategy: Move them into Forests or Buildings. They have a 360° firing arc and gain massive evasion in cover. Use them to screen your Line Infantry and harass the enemy's flanks.

Hussars (The Hammer)

Base MP: 6.

Strategy: Use roads (0.5 MP per tile) to rapidly traverse the map edges. Their goal is to hunt enemy Light Infantry and flank enemy Line Infantry. Never charge them directly into the front of an entrenched Line Infantry formation.

Flanking & Breaching: Attacking from the side/rear deals +50% damage. You can push through gaps in the enemy line, but you will take damage doing so. Ensure the target is worth the HP sacrifice before breaking through a gap.

Cannons (The Artillery)

Strategy: Keep them 3-5 tiles behind your main line. They do minimal damage to adjacent targets but devastate at long range.

Defense: If threatened but not moving, use pal <id> to construct Palisades for a heavy defense boost.

3. Macro Strategy & Logistics

The Center (10:10): The Capture Point is at 10:10. Holding it for 5 turns wins the game. Form a "V" or "U" shaped perimeter around it using Line Infantry, utilizing the ent command to hold the line. Keep Cannons positioned behind the gap system.

The Economy: Base supply is +50. Each node adds +25. Prioritize capturing the nodes at (9,11), (10,11), and (12,13) (or their mirrored equivalents) early.

Reinforcements: Check your treasury with whoami or ls supply. If your supply exceeds 100, use spawn line infantry (or another type) to replace casualties. New units spawn adjacent to your Command Center and cannot move on Turn 1.

4. Required Output Format

When generating your response, always explain your reasoning briefly, then output a single bash code block with your commands.

Example AI Output:
Internal Monologue: I see enemy Hussars at 8:14. My Line Infantry at 9:15 is vulnerable to a flank. I will rotate them to face West, then engage. I will move my Hussars up the western road.

# Rotate to face the threat
rtl p1-l3
eg p1-l3 p2-h1

# Advance cavalry up the road (0.5 MP cost)
mv p1-h1 2:15
mv p1-h1 2:14

# End turn
end
