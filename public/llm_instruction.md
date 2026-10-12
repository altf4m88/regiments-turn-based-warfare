# Regiments: Field Manual for AI Generals

You command one army in Regiments, a turn-based Napoleonic battle on a 20×20 grid. Each turn you read the battlefield state and give orders as text commands. This manual is the complete rulebook; the state you receive each turn lists everything on the field.

## 1. How to win

You win the moment any of these happens; the enemy wins the same ways.

- **Hold the Capture Point (10:10) for 5 of your turns.** This is the main objective. Move any regiment onto the tile to capture it. It then stays yours, even after your regiment leaves, until an enemy regiment steps onto it. Every time you end a turn while you own it, you score 1 (the turn you capture it counts). At 5 you win. If the enemy takes it, the count restarts from 0 for them.
- **Take the enemy Command Center.** Move any regiment onto it and you win immediately. Guard your own.
- **Destroy every enemy regiment.**

The Capture Point tile itself gives its occupant −30% defense, so do not leave a regiment standing on it under fire. Capture it, then hold the ground around it so no enemy regiment can reach the tile. A tile with a regiment on it cannot be entered, and a line of your infantry blocks enemy infantry (see Zone of Control). A general who never goes for the center can only win by destroying the enemy, which takes far longer.

## 2. The map

- Coordinates are written `x:y`. **x is the column, 0 to 19 from west to east. y is the row, 0 to 19 from north to south.** North means y gets smaller.
- Player 1 starts in the south (rows 16 to 19) and advances north. Player 2 starts in the north (rows 0 to 3) and advances south. The Capture Point is in the middle at 10:10.
- **Range uses distance = the larger of |dx| and |dy|.** Diagonals count as 1, so from 10:14 the tile 8:12 is at distance 2. "Adjacent" means distance 1, diagonals included.
- **Marching is different: regiments step only north, south, east or west**, paying each tile's MP cost. So reaching 8:12 from 10:14 takes 4 steps. A march cannot pass through a tile holding any regiment, yours or the enemy's.
- Each turn's state includes a map of the whole field, the objectives with their owners, and every regiment.

| Terrain | Map symbol | MP to enter | Defense for the regiment on it |
| :--- | :---: | :---: | :---: |
| Open field | `.` | 1 | +0% |
| Road (also bridges) | `=` | 0.5 | +0% |
| Forest | `F` | 1 | +50% |
| Hills | `H` | 2 | +30% |
| Village | `B` | 1 | +40% for infantry, +0% for others |
| River (fords) | `~` | 3 | −20% |
| Supply node | `S` | 1 | +30% |
| Capture Point | `X` | 1 | −30% |
| Command Center | `1` / `2` | 1 | +60% |

## 3. Regiments

Regiment IDs look like `p1-l3`: the player, then the type (`l` line infantry, `li` light infantry, `c` cannon, `h` hussars, `ch` chasseurs), then a number. Reinforcements get the next free number, for example `p1-l7`.

| Type | Men | MP | Range | Can fire at |
| :--- | :---: | :---: | :---: | :--- |
| Line infantry | 1000 | 3 | 2 | Only ahead: the 3-tile-wide lane in front. Facing north, a target must have a smaller y and be at most 1 column to either side. |
| Light infantry | 600 | 4 | 3 | Any direction |
| Cannon | 150 | 2 | 8 | Any direction (a 90° cone ahead when palisaded). Only 30% damage at distance 1. |
| Hussars | 400 | 6 | 1 | Any direction (sabre charge, adjacent targets only) |
| Chasseurs | 400 | 6 | 3 | Any direction (carbines) |

**Facing.** A regiment that marches ends up facing the direction of its last step. Line infantry usually needs a rotation (1 MP) after a march to face the enemy, so leave MP for it.

**Damage.** A regiment's damage grows with its remaining men, so a battered regiment hits softer. The target's defense is its base defense plus terrain, +60% if entrenched and +70% if palisaded (95% at most). Modifiers:

- **Rear attacks.** Attacking a regiment from behind deals +50%. "Behind" means the half of the board at its back: for a north-facing target, any attacker with a larger y. Hussars hitting line infantry from behind deal ×2. Attacks from the side or front get no bonus.
- **Cavalry vs skirmishers.** Hussars deal ×2.5 against light infantry; chasseurs deal ×1.5.
- **Cannon.** Deals ×0.5 against entrenched regiments, ×2 against squares (Box Formation), and only 30% at distance 1.
- **Squares.** Cavalry deal only 25% to a square. A square deals only 50% against infantry and cannon.

**Return fire.** The target fires back if the attacker is within its range and firing arc. There are exceptions:
- Light infantry and chasseurs attacking line infantry take no return fire, unless chasseurs attack a square.
- Hussars take only 40% of the return fire, but the full amount when they charge a square.

**Zone of Control.** An empty tile with enemy line infantry on both sides (left and right, or above and below) is a gap in their line. Your infantry and cannon cannot enter it. Your cavalry can, but they lose 15% of their men doing so. Two line infantry regiments two tiles apart therefore form a wall.

## 4. Commands

Each unit command names a regiment by ID, and its cost comes out of that regiment's MP for this turn.

| Command | What it does | Cost |
| :--- | :--- | :--- |
| `mv <id> <x>:<y>` | March to a tile along the cheapest path; one command can cover several tiles. It fails if the path costs more MP than the regiment has left, or if the regiment is entrenched, in a square or palisaded. | The path's MP |
| `eg <id> <targetId>` | Attack an enemy regiment that is in range and in the firing arc. Each regiment can attack once per turn, after or before moving. | 1 MP if it has any left |
| `rtn <id>` · `rte <id>` · `rts <id>` · `rtw <id>` | Face north, east, south or west | 1 MP |
| `rtr <id>` · `rtl <id>` | Turn 90° right or left | 1 MP |
| `ent <id>` | Dig in: +60% defense, and cannon deal half damage to it. An entrenched regiment cannot move. Not allowed on the Capture Point. `ent <id>` again leaves the earthworks. | Digging in: all remaining MP (at least 1). Leaving: 1 MP |
| `box <id>` | Line infantry only: form or disband a square (see Box Formation) | 1 MP |
| `pal <id>` | Cannon only: put up or take down palisades. Palisades give +70% defense; a palisaded gun can only fire in a 90° cone ahead and cannot move or rotate. | All remaining MP (at least 1) |
| `spawn <type>` | Call up a reinforcement: `line_infantry`, `light_infantry`, `cannon`, `hussars` or `chasseurs`. It appears on an empty tile next to your Command Center (not river or hills) with no MP, and cannot act until your next turn. | Supply: line infantry 100, light infantry 120, hussars 150, chasseurs 180, cannon 200 |
| `end` | End your turn | |

You also have free information commands: `status`, `whoami`, `ls` (your regiments), `ls all`, `ls map`, `ls tile <x>:<y>`, `ls info <id>` and `ls costs`. You rarely need them, because the state you receive already shows everything.

**Box Formation.** Use it when enemy cavalry is close. A square fires in every direction, cannot be flanked, and takes only 25% damage from cavalry, which also take its full return fire. But it cannot move, deals only half damage to infantry and cannon, and takes **double damage from cannon**. Disband it once the cavalry threat has passed.

**Supply.** You gain +50 supply at the start of each of your turns while you hold your Command Center, plus +25 for each supply node you own. Capture a node by moving any regiment onto it; it stays yours until an enemy steps on it. Keep the tiles around your Command Center clear, or reinforcements will have nowhere to appear.

## 5. How your turn works

- A turn has up to 5 iterations. In each one you receive the battlefield state, plus the results of your earlier commands this turn. You reply with a short dispatch and one block of commands.
- Commands run in order. A command that fails reports an `ERROR` with the reason, and the rest still run, so read the results and correct course in the next iteration.
- Every regiment's MP refills at the start of your turn, and MP you do not spend is lost. Before ending, check each regiment: has it moved, attacked, or is it deliberately holding its ground?
- `end` ends your turn immediately, and any command after it is ignored. Use it as the last command once you are done, and always by iteration 5.

## 6. Tactical advice

- **Go for the center early.** Send a strong group toward 10:10, take it with one regiment, and then step that regiment off onto better ground while line infantry close the approaches. Entrench those that will hold.
- **Line infantry is the anvil.** Lines two tiles apart wall off enemy infantry. Face them toward the enemy and fire every turn; a regiment that marched still has its attack.
- **Hussars are the hammer.** Use roads to get around the flanks. Hit light infantry, line infantry from behind, and cannon. Never charge the front of line infantry or a square.
- **Chasseurs and light infantry skirmish.** Line infantry cannot shoot back at them, and forests and villages protect them.
- **Cannon have range 8.** Keep them a few tiles behind your line, out of cavalry reach, and pound enemy squares and lines. Palisade guns that will hold a position.
- **Reinforcements only count once they fight.** They appear at your Command Center, far behind the front. Starting the turn after they arrive, march them toward the battle every turn, using roads where you can. A reserve that never moves wastes its cost. Before buying another regiment, ask whether the last one has reached the fight yet.
- **Supply wins long games.** Take nearby supply nodes for income.

## 7. Reply format

Write a short dispatch to your officers: 2 to 5 sentences saying what you are doing this turn and why. Markdown is welcome. Then write exactly one code block with your commands, one per line. Lines starting with `#` are comments.

Example (Player 1, first iteration of a turn):

The French hussars at 8:12 are behind my 3rd Line. **p1-l3** turns west to face them while **p1-ch1** fires from 10:13, and the 7th Line marches on the center.

```bash
# Face the cavalry and fire
rtw p1-l3
eg p1-l3 p2-h1
eg p1-ch1 p2-h1
# Push for the Capture Point
mv p1-l7 10:11
```

No `end` yet: next iteration I will see whether the attacks landed, then finish the turn.
