# ⚔️ Regiments

Welcome to **Regiments**, a turn-based strategy game of maneuver, supply, and attrition.

Before the battle, Player 1 chooses to command the **British** or the **French**; Player 2 takes the other army. The choice sets regiment names, uniforms, flags and team colours (British red, French blue); the rules are identical for both sides.

---

## 🚩 Objectives
To achieve total victory, you must accomplish **one** of the following:
1.  **Decapitation Strike**: Capture the enemy **Command Center (CC)** by moving any unit onto it.
2.  **Strategic Dominance**: Capture the central **Capture Point** (10:10) by moving any unit onto it, then keep it for **5 of your turns**. It stays yours after your unit moves off, until an enemy unit steps onto it. Each of your turns that ends while you own it counts, including the turn you take it.
    *   *Note: If the enemy captures the point, your progress is reset to 0.*
3.  **Annihilation**: Destroy every enemy regiment.

---

## 📦 Supply & Reinforcements
Supply is the lifeblood of your army. It is used to call in reinforcements.
*   **Base Supply**: +50 per turn (if you control your Command Center).
*   **Supply Nodes**: +25 per turn for each node captured.
*   **Reinforcements**: Spend supply to spawn new units in empty tiles adjacent to your Command Center.
    *   *Note: Reinforcements cannot move or attack on the turn they arrive.*

---

## 💂 Regiment Types
Each unit has unique strengths and tactical roles:

| Unit Type | Role | Men | MP | Range | Special Traits |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Line Infantry** | Main Battle Force | 1000 | 3 | 2 | Fires only ahead, in a lane 3 tiles wide. Can form **Box Formation**. |
| **Light Infantry** | Skirmishers | 600 | 4 | 3 | 360° firing arc. Line Infantry cannot return their fire. |
| **Cannon** | Artillery | 150 | 2 | 8 | Very long range, but only 30% damage at distance 1. Can build **Palisades**. |
| **Hussars** | Light Cavalry | 400 | 6 | 1 | Sabre charges. ×2.5 damage vs Light Infantry; take only 40% of return fire. |
| **Chasseurs** | Mounted Skirmishers | 400 | 6 | 3 | Carbines with a 360° firing arc. Line Infantry cannot return their fire. |

---

## 🗺️ Terrain & Movement
Movement Points (MP) are consumed based on the terrain type:

| Terrain | MP Cost | Defense Bonus | Notes |
| :--- | :--- | :--- | :--- |
| **Grass** | 1 | 0% | Standard terrain. |
| **Road** | 0.5 | 0% | Rapid movement, including bridges. |
| **Forest** | 1 | +50% | Heavy cover. |
| **Buildings** (village) | 1 | +40% | Infantry only; other units get no bonus. |
| **Mountain** (hills) | 2 | +30% | Slow going. |
| **River** | 3 | -20% | Dangerous crossing; units are vulnerable. |
| **Supply Node** | 1 | +30% | |
| **Capture Point** | 1 | -30% | Exposed: hold the ground around it rather than the tile. |
| **Command Center** | 1 | +60% | |

---

## ⚙️ Combat Mechanics
*   **Firing Lines**: Line Infantry can only shoot ahead of their facing (North, South, East, or West), in a lane 3 tiles wide.
*   **Facing**: A unit that moves ends up facing the direction of its last step.
*   **Rotation**: You can rotate a unit's facing for **1 MP**. This is crucial for repositioning your firing line.
*   **Range**: Distance is the larger of the horizontal and vertical gaps, so diagonals count as 1. Ranges are in the table above.
*   **Damage**: Damage is calculated based on the number of men, attack stats, and the target's effective defense (terrain + entrenchment + palisades, at most 95%).
*   **Rear Attacks**: Attacking a unit from behind its facing deals +50% damage (Hussars hitting Line Infantry from behind deal double). Side attacks get no bonus.
*   **Zone of Control**: An empty tile between two enemy Line Infantry (left and right, or above and below) cannot be entered by infantry or cannon. Cavalry can pass but lose 15% of their men.

---

## 🛡️ Special Abilities
*   **Entrench (all remaining MP, at least 1)**: Grants a +60% defense bonus, and cannon deal half damage to the unit. Not allowed on the Capture Point.
    *   **Holds the regiment in place**: an entrenched regiment cannot move. Leaving the earthworks (`ent` again) costs 1 MP, and the regiment can then march with the MP it has left.
*   **Box Formation (1 MP to form or disband)**: (Line Infantry only)
    *   Grants a 360° firing arc, and the square cannot be flanked.
    *   **Proof against cavalry**: Hussars and Chasseurs deal only **25% damage** to a square.
    *   **Deadly to cavalry**: a square returns full fire on any cavalry that attacks it. Charging Hussars lose their usual 60% protection from return fire, and Chasseurs no longer escape return fire as skirmishers.
    *   **Reduced firepower**: only one face can fire at anything else, so a square deals **half damage** to infantry and artillery (attacking or returning fire). It still shoots at cavalry with full strength.
    *   **Immobile**: a square cannot move; disband it first.
    *   **Vulnerable to artillery**: Cannon fire deals **double damage** to a unit in Box Formation.
*   **Palisades (all remaining MP, at least 1, to build or remove)**: (Cannons only)
    *   Grants a +70% defense bonus.
    *   Restricts firing to a 90° frontal cone, and the gun cannot move or rotate.

---

## 💡 Tactical Tips
*   **Protect the Flanks**: Line Infantry are vulnerable if the enemy moves outside their narrow firing line.
*   **Combined Arms**: Use Hussars to hunt down Light Infantry, and Cannons to soften up entrenched positions.
*   **Squares Invite Shot**: A Box Formation that stops cavalry is a gift to enemy guns. Pin the enemy with Hussars, then let the Cannons fire into the square.
*   **Supply is Key**: Don't ignore the Supply Nodes in the center; they provide the extra resources needed for a prolonged war.
*   **The Center Holds**: The Capture Point is the fastest way to win if you can establish a strong defensive perimeter around it.
