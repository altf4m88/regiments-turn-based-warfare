# Napoleon: Total Command - CLI Reference

This document provides a comprehensive list of commands, their usage, and the rules governing the game.

## General Commands

| Command | Usage | Description |
| :--- | :--- | :--- |
| `help` | `help` | Displays the list of available commands. |
| `ls` | `ls [all\|types\|map\|supply\|info <id>\|tile <x>:<y>\|costs]` | Lists information about the game state. |
| `whoami` | `whoami` | Shows your player ID and current supply. |
| `status` | `status` | Shows turn number, current player, and Capture Point status. |
| `clear` | `clear` | Clears the command log. |
| `end` | `end` | Ends your current turn. |

### `ls` Sub-commands
- `ls`: Lists all regiments you currently control.
- `ls all`: Lists every regiment on the map (both yours and the enemy's).
- `ls types`: Lists valid unit types for the `spawn` command.
- `ls map`: Lists strategic locations (Command Centers, Supply Nodes, Capture Point) and their owners.
- `ls supply`: Shows the current supply levels for both players.
- `ls info <id>`: Shows detailed statistics for a specific unit (e.g., `ls info p1-l1`).
- `ls tile <x>:<y>`: Shows terrain and unit information for a specific tile (e.g., `ls tile 10:10`).
- `ls costs`: Shows the supply cost to spawn each unit type.

---

## Unit Action Commands

| Command | Usage | Description |
| :--- | :--- | :--- |
| `sel` | `sel <id>` | Selects a unit on the map (visual only). |
| `mv` | `mv <id> <x>:<y>` | Moves a unit to an adjacent tile. Costs MP based on terrain. |
| `eg` | `eg <id> <targetId>` | Engages (attacks) an enemy unit. Unit must have MP and be in range. |
| `ent` | `ent <id>` | Entrenches a unit. Increases defense but costs all remaining MP (min 1). |
| `rtr` | `rtr <id>` | Rotates a unit 90° clockwise. Costs 1 MP. |
| `rtl` | `rtl <id>` | Rotates a unit 90° counter-clockwise. Costs 1 MP. |
| `rlt` | `rlt <id>` | Alias for `rtl`. |
| `box` | `box <id>` | Toggles Box Formation (Line Infantry only). +Defense vs Cavalry, 360° fire, but -Attack. |
| `pal` | `pal <id>` | Toggles Palisades (Cannons only). +Defense, but restricts firing arc. |
| `spawn` | `spawn <type>` | Spawns a new unit at an adjacent empty tile near your Command Center. |

---

## Simple Rules

1.  **Turns**: Players take turns moving and attacking. Each turn, units regain their Maximum Movement Points (MP).
2.  **Movement**: Units can move to adjacent tiles (up, down, left, right).
    -   **Grass/Road**: 1 MP (Roads are 0.5 MP if implemented, currently 1 MP).
    -   **Forest**: 1 MP (provides defense bonus).
    -   **Mountain (Hill)**: 2 MP.
    -   **River**: 3 MP.
3.  **Combat**:
    -   Units have a **Firing Line** (facing). Line Infantry can only shoot forward.
    -   **Flanking**: Attacking a unit from the side or rear deals 50% more damage.
    -   **Cavalry**: Devastating against Light Infantry in the open and Line Infantry flanks.
    -   **Cannons**: Long range, but weak at close range (adjacent).
4.  **Supply**:
    -   Earn +50 Supply per turn base.
    -   Earn +25 Supply per turn for each **Supply Node** held.
    -   Spawning units costs Supply.
5.  **Winning**:
    -   **Capture Point**: Hold the center point for 5 consecutive turns.
    -   **Annihilation**: Capture the enemy's Command Center.

---

## Initial Unit Deployment

### Player 1 (Bottom)
| ID | Unit Type | Position (X:Y) |
| :--- | :--- | :--- |
| `p1-cc` | Command Center | 10:19 |
| `p1-l1` | Line Infantry | 5:17 |
| `p1-l2` | Line Infantry | 7:17 |
| `p1-l3` | Line Infantry | 9:17 |
| `p1-l4` | Line Infantry | 11:17 |
| `p1-l5` | Line Infantry | 13:17 |
| `p1-l6` | Line Infantry | 15:17 |
| `p1-li1` | Light Infantry | 4:16 |
| `p1-li2` | Light Infantry | 16:16 |
| `p1-c1` | Cannon | 8:18 |
| `p1-c2` | Cannon | 12:18 |
| `p1-h1` | Hussars | 2:17 |
| `p1-h2` | Hussars | 18:17 |
| `p1-ch1` | Chasseurs | 10:18 |

### Player 2 (Top)
| ID | Unit Type | Position (X:Y) |
| :--- | :--- | :--- |
| `p2-cc` | Command Center | 10:0 |
| `p2-l1` | Line Infantry | 5:2 |
| `p2-l2` | Line Infantry | 7:2 |
| `p2-l3` | Line Infantry | 9:2 |
| `p2-l4` | Line Infantry | 11:2 |
| `p2-l5` | Line Infantry | 13:2 |
| `p2-l6` | Line Infantry | 15:2 |
| `p2-li1` | Light Infantry | 4:3 |
| `p2-li2` | Light Infantry | 16:3 |
| `p2-c1` | Cannon | 8:1 |
| `p2-c2` | Cannon | 12:1 |
| `p2-h1` | Hussars | 2:2 |
| `p2-h2` | Hussars | 18:2 |
| `p2-ch1` | Chasseurs | 10:1 |
