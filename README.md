# Regiments | Turn Based Line-infantry Warfare
It's kinda mix of chess and Total War mechanics, you move your Regiments per turn, manage supply and capture points.
This game specifically made to be playable by Large-Language Model, my purpose is to study LLM tactical awareness and how LLM compete strategically to achieve desired objectives with resource in mind.

# Game modes
On the start screen, choose the army Player 1 commands (British or French; Player 2 takes the other), then a mode:

- **Manual Play**: you command both armies, taking turns at the same screen.
- **Human vs AI**: you command one army and an AI general commands the other. In the dialog that opens, choose your side (Player 1 in the south moves first; Player 2 in the north moves second) and the general's provider, model and thinking level. On its turn the general moves by itself: you can watch, select regiments to inspect them and use the CLI's information commands (`ls`, `status` and so on), but your orders wait until your turn. Facing a human, the general is held to account for every regiment: each reply shows it a roll call of the regiments it has not used yet (`ls idle`), and its `end` is refused while any remain unless it orders them to `hold`, up to its fifth and last reply. AI Gameplay keeps the generals unassisted, so model comparisons stay clean. In 3D the camera stays on your side of the field and follows the enemy's moves.
- **AI Gameplay**: an AI general commands each army, and you watch.

**On a phone or tablet.** On a narrow screen, or a phone held sideways, the header shrinks to one line (view, AI settings and abandon move into its ⋮ menu). The Intel and HUD panels slide over the map from a command bar at the bottom, which also carries the selected regiment's orders (turn, entrench, square, palisade) and End Turn. In 3D, drag to pan, pinch to zoom, twist with two fingers to rotate, and double-tap to focus.

**Map codes.** Every battlefield comes from a map code such as `K7QM2X`, shown on the start screen with a preview, and in the Tactical HUD during the battle. The same code always generates the same map, so you can replay it, share it, or compare generals on it. Leave the code as it is for a new random map, roll another with **New map**, or type one in.

**Battle statistics.** The *Casualties* panel shows each army's regiments and men standing and lost as the battle goes on. When a battle ends, a report shows:
- who won and how;
- each side's general, regiments and men standing and lost, reinforcements raised, attacks (and bayonet charges), supply earned, turns holding the Capture Point, and orders the game rejected;
- a chart of each army's strength turn by turn, with a table view;
- the earlier battles on the same map.

From the report you can export it all as JSON (with the generals' dispatches), or start a rematch on the same map. **Rematch, swap sides** gives each general the other army's starting position and turn order while it keeps its own army, which is the fair way to compare two generals on an asymmetric map. Finished battles are kept in this browser.

**Records and leaderboard.** *Records & leaderboard* on the start screen (or *Leaderboard* in a battle report) opens every finished battle kept in this browser, filtered by mode and by rules version. It has three tabs:
- **Leaderboard**: each general (an AI model at a thinking level, or you) with an Elo rating (everyone starts at 1500), won–lost, swapped-side maps (won from both ends, or split one each), win rates as Player 1 and as Player 2, men lost and killed per battle, and turns to win. Battles with the same general on both sides, including human against human, are not ranked. It also shows how often Player 1, who moves first, wins.
- **Head to head**: each pair of generals' score and swapped-side maps.
- **History**: every battle, with a button to replay its map or delete it.

Records only compare battles fought under the current rules (`RULES_VERSION` in `src/game/engine.ts`, bumped whenever combat, economy or AI rules change); switch to *All rules* to include older ones. Nothing leaves your browser: **Export** saves the records as JSON, **Import** merges a file from another browser (battles already present are skipped), and **Clear all** deletes them.

**Pause AI** in the header stops the AI generals once the current turn ends. If an AI general's turn fails, for example because of a missing key, an API error or a rate limit, the battle waits for you: **Retry AI turn** runs it again from where it stopped, and so does saving new settings in *AI Settings*.

# AI Generals
In *AI Settings*, each AI player's general runs on **Gemini** (Google) or **Claude** (Anthropic), so you can pit one against the other:

| Provider | Models | Key |
| :--- | :--- | :--- |
| Gemini | Gemini 3.8 Flash (`gemini-3.8-flash`) | [Google AI Studio](https://aistudio.google.com), or Vertex AI |
| Claude | Claude Sonnet 5.5 (`claude-sonnet-5-5`, default), Claude Opus 5.5 (strongest), Claude Haiku 5.5 (fastest and cheapest) | [Claude Platform](https://platform.claude.com) |

Each player also picks a thinking level: Low, Medium (the default) or High. It is sent as Gemini's thinking level, which Gemini 3.8 Flash requires, or as Claude's effort. Higher levels plan more carefully, but turns take longer and cost more.

Requests go straight from the browser to Google or Anthropic, using the player's own key. Because the key sits in the browser, use a dedicated key with a spending limit. On Claude, the game caches the instructions and the turn so far between a turn's requests. If Claude Sonnet 5.5 or Opus 5.5 declines a request, Anthropic's server-side fallback tries another model in the same call. A general whose request is still declined ends its turn, and the battle log says why.


# 3D Battlefield
The battle now plays out on a fully 3D field (toggle **3D / 2D** in the header; 3D is the default). It is a view over the exact same engine: rules, the CLI and the AI generals are unchanged, and everything is generated procedurally in code with no model, texture or audio files.

**The map.** The 20×20 tile map becomes a continuous landscape with rolling hills, wooded copses, villages with churches and garden walls, a river that winds across the field (stone bridges wherever the road crosses it), and dirt roads lined with poplars beyond the battlefield. Each army's headquarters (a manor, tents, an artillery park and horse lines) sits behind its command centre. Supply depots have wagons and crates and fly their owner's banner. At the capture point, one brazier is lit for every turn it has been held.

**The regiments.** Napoleonic miniatures, about half a unit tall, in period uniforms. On the start screen Player 1 chooses to command the British or the French, and Player 2 takes the other army. British regiments wear red coats, with rifle-green Rifles and blue Royal Artillery and hussars. French regiments wear imperial blue, with chamois-collared voltigeurs and green hussars and chasseurs à cheval. Team colours across the 2D and 3D views follow the army: British red, French blue.
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
- Cavalry riding through a gap in an enemy line draw a volley from the regiments either side, which wheel to fire into the gap as the riders pass.
- Line infantry engaging an adjacent enemy level their bayonets and charge to the drum behind their officer; the defenders brace to meet them, and both sides' losses fall at the clash.
- Men fall when the shot lands and stay on the field. Regiments that are wiped out drop their colours with a "ROUTED" marker.
- Entrenching throws up earthworks, cannon erect palisades, units wade through fords, and reinforcements march out of the command centre.
- Flags, trees and grass move in the wind, and the water flows.
- Sound is synthesised with WebAudio, with a field reverb, and distant fire is muffled by distance. It covers:
  - gritty, crackling musket volleys and ragged skirmish fire
  - cannon, and round shot landing
  - boots marching behind the drum, and the Rifles' bugle-horn
  - galloping squadrons and gun teams rumbling into place
  - sabres whistling and clashing in a charge, and a bayonet charge going in with a cheer
  - bugle calls when the capture point or a depot changes hands, a flare-up as each capture-point brazier is lit, and a victory fanfare

**Playing in 3D.** Hovering a tile shows its terrain, MP cost and defence, plus a march path or an "engage" hint. The selected regiment's march range, dangerous gaps in the enemy line, firing arc and attackable targets are painted on the ground. Clicking a distant reachable tile marches there using the same `mv` command the CLI and the AI use. At every turn change the camera swings round behind the army whose turn it is. The **Follow** camera (on by default in AI mode) flies to the action, and a minimap shows where you are looking.

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

# Deploy to Google Cloud (Cloud Run)
Regiments is a static single-page app, so it deploys as a small nginx container on [Cloud Run](https://cloud.google.com/run). Cloud Run scales to zero, so you only pay while someone is playing. The repo includes:
- `Dockerfile`: builds the app with Node 22, then serves `dist/` with unprivileged nginx on Cloud Run's `$PORT`.
- `deploy/nginx.conf.template`: SPA fallback, gzip, long-lived caching for fingerprinted `/assets`, and no caching for `index.html`.
- `cloudbuild.yaml`: build → push to Artifact Registry → deploy to Cloud Run, for continuous deployment.

**API keys stay in the browser.** Players type their Gemini, Claude and LangSmith keys into *AI Settings*, and the deployed site never sees them. Don't put keys in a `.env` for the build: Vite inlines `define`d variables into the public JavaScript. `.dockerignore` keeps `.env*` files out of the image anyway.

### One-time setup
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

### Option A: deploy from your machine (one command)
```bash
gcloud run deploy regiments --source . --region us-central1 --allow-unauthenticated
```
Cloud Build builds the `Dockerfile` remotely, so you don't need Docker installed. The command prints the service URL when it finishes. Run it again to ship a new version.

### Option B: deploy automatically on every push to `main`
1. Create the image repository once:
   ```bash
   gcloud artifacts repositories create regiments --repository-format=docker --location=us-central1
   ```
2. Let Cloud Build deploy to Cloud Run. New projects build as the Compute Engine default service account; older projects use `PROJECT_NUMBER@cloudbuild.gserviceaccount.com` instead.
   ```bash
   PROJECT_ID=$(gcloud config get-value project)
   SA="$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
   for role in roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.writer; do
     gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA" --role=$role
   done
   ```
3. In the console, open **Cloud Build → Triggers → Create trigger**:
   - Connect this GitHub repository.
   - Event: *Push to a branch*, branch `^main$`.
   - Configuration: *Cloud Build configuration file* `cloudbuild.yaml`.

You can also run the pipeline by hand with `gcloud builds submit --config cloudbuild.yaml`. To change the region, service name or repository name, pass `--substitutions=_REGION=europe-west1,_SERVICE=regiments,_REPOSITORY=regiments`.

### Test the container locally
```bash
docker build -t regiments .
docker run --rm -p 8080:8080 regiments   # open http://localhost:8080
```

> If `--allow-unauthenticated` fails with a policy error, your organisation restricts public services (Domain Restricted Sharing). Ask an org admin for an exception, or keep the service private and put it behind IAP.

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
