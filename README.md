# Regiments | Turn Based Line-infantry Warfare
It's kinda mix of chess and Total War mechanics, you move your Regiments per turn, manage supply and capture points.
This game specifically made to be playable by Large-Language Model, my purpose is to study LLM tactical awareness and how LLM compete strategically to achieve desired objectives with resource in mind.


# 3D Battlefield
The battle now plays out on a fully 3D field (toggle **3D / 2D** in the header; 3D is the default). It is a view over the exact same engine: rules, the CLI and the AI generals are unchanged, and everything is generated procedurally in code with no model, texture or audio files.

**The map.** The 20×20 tile map becomes a continuous landscape with rolling hills, wooded copses, villages with churches and garden walls, a river that winds across the field (stone bridges wherever the road crosses it), and dirt roads lined with poplars beyond the battlefield. Each army's headquarters (a manor, tents, an artillery park and horse lines) sits behind its command centre. Supply depots have wagons and crates and fly their owner's banner. At the capture point, one brazier is lit for every turn it has been held.

**The regiments.** Napoleonic miniatures, about half a unit tall:
- Line infantry stand in three ranks with their colours (painted with each regiment's own `standardColor`), an officer and a drummer.
- Light infantry deploy in a loose skirmish chain.
- Gunners crew their field pieces.
- Hussars ride in busbies and pelisses, chasseurs carry carbines, and each squadron has a guidon.

The number of figures tracks each regiment's strength.

**The animations.**
- Line infantry march in column and deploy back into line, and they form a two-rank hollow square in box formation.
- Line volleys ripple down the ranks with muzzle flashes and drifting powder smoke, and the target returns fire.
- Cannon recoil, and the round shot arcs, grazes and bounces through its target.
- Hussars charge in with sabres raised, clash, and wheel back.
- Men fall when the shot lands and stay on the field. Regiments that are wiped out drop their colours with a "ROUTED" marker.
- Entrenching throws up earthworks, cannon erect palisades, units wade through fords, and reinforcements march out of the command centre.
- Flags, trees and grass move in the wind, and the water flows.
- Sound (volleys, cannon, hooves, sabres, drums, a bugle) is synthesised with WebAudio.

**Playing in 3D.** Hovering a tile shows its terrain, MP cost and defence, plus a march path or an "engage" hint. The selected regiment's march range, dangerous gaps in the enemy line, firing arc and attackable targets are painted on the ground. Clicking a distant reachable tile marches there using the same `mv` command the CLI and the AI use. The **Follow** camera (on by default in AI mode) flies to the action, and a minimap shows where you are looking.

| Input | Action |
| :--- | :--- |
| Click | Select / move / attack (a click on a unit label selects it too) |
| Drag · Right-drag · Wheel | Pan · Rotate · Zoom |
| WASD / arrows · Q / E | Pan · Rotate |
| Double-click / `F` | Focus a tile / the selected regiment |
| `Home` | Overview of the whole field |

The 3D code lives in `src/three/`, and three.js is code-split so the 2D view stays light. The folders are:
- `world/`: the landscape, water, sky and scenery.
- `models/`: procedural soldiers, horses, guns, flags and buildings.
- `units/`: formations and per-figure animation.
- `scene/`: the renderer, camera, effects, audio and overlays.

# Starting Point
<img width="1470" height="677" alt="Screenshot 2026-03-26 at 10 48 48" src="https://github.com/user-attachments/assets/281a4ac0-ea71-4b05-8af7-d1a1dcf43990" />

# Langsmith Trace of AI Interaction
<img width="961" height="525" alt="Screenshot 2026-03-26 at 14 00 12" src="https://github.com/user-attachments/assets/32d2b873-1dbc-4654-926f-f351578a988f" />

# AI General Monologues
Watching the AI monologuing about art of war is quite fascinating, ...and frightening.
<img width="1465" height="674" alt="Screenshot 2026-03-27 at 09 57 07" src="https://github.com/user-attachments/assets/260b5634-7c28-40b8-8f6f-543504731729" />
<img width="1470" height="665" alt="Screenshot 2026-03-27 at 09 58 01" src="https://github.com/user-attachments/assets/5ac6f396-9a1e-459e-bd99-1c41d850f8b0" />


# Setting
![WhatsApp Image 2026-03-26 at 16 32 59](https://github.com/user-attachments/assets/eccab639-81ac-4a99-82ae-65ca923bd6d7)
