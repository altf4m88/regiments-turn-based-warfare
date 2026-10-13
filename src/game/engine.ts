import { Regiment, UnitType, Tile, GameState, Facing, Nation, SideTally, TurnSnapshot, ArmyDoctrine } from './types';
import { DEFAULT_MODELS, DEFAULT_THINKING_LEVEL } from '../ai/models';

const MAP_SIZE = 20;

/**
 * Bump whenever combat, economy or AI rules change, so the leaderboard only compares
 * battles fought under the same rules. 1: reinforcement prices ×3, bayonet charges,
 * flank cones, and the Human vs AI roll call.
 */
export const RULES_VERSION = 1;

// -- Map codes -----------------------------------------------------------------

/** Letters and digits that cannot be misread for one another (no 0/O, 1/I/L). */
const SEED_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A fresh six-character map code, such as "K7QM2X". */
export const randomSeed = () =>
  Array.from({ length: 6 }, () => SEED_ALPHABET[Math.floor(Math.random() * SEED_ALPHABET.length)]).join('');

/** A map code as typed: upper case, letters and digits only, at most 12 characters. Empty means none. */
export const normalizeSeed = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

/** A deterministic random number generator (mulberry32) seeded from a map code. */
export const seededRandom = (seed: string) => {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const getOrdinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** Id prefixes per unit type, as in the starting regiments (p1-l1, p2-li2, p1-c1, p2-h1, p1-ch1). */
const ID_PREFIX: Record<UnitType, string> = { line_infantry: 'l', light_infantry: 'li', cannon: 'c', hussars: 'h', chasseurs: 'ch' };

/**
 * A short id for a new regiment in the same style as the starting ones (p1-l7),
 * never reusing one a destroyed regiment had.
 */
export const nextRegimentId = (state: Pick<GameState, 'regiments' | 'idCounters'>, owner: number, type: UnitType) => {
  const prefix = `p${owner}-${ID_PREFIX[type]}`;
  const used = Math.max(
    state.idCounters?.[prefix] ?? 0,
    ...state.regiments.map(r => (r.id.startsWith(prefix) ? Number(r.id.slice(prefix.length)) || 0 : 0)),
  );
  return { id: `${prefix}${used + 1}`, idCounters: { ...state.idCounters, [prefix]: used + 1 } };
};

/** Spawn names the CLI accepts, mapped to unit types. */
export const parseUnitType = (input: string): UnitType | null => {
  const t = input.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, UnitType> = {
    line: 'line_infantry', line_infantry: 'line_infantry',
    light: 'light_infantry', light_infantry: 'light_infantry',
    cannon: 'cannon', cannons: 'cannon', artillery: 'cannon',
    hussar: 'hussars', hussars: 'hussars',
    chasseur: 'chasseurs', chasseurs: 'chasseurs',
  };
  return aliases[t] ?? null;
};

export const NATIONS: Record<Nation, { name: string; adjective: string }> = {
  british: { name: 'Britain', adjective: 'British' },
  french: { name: 'France', adjective: 'French' },
};

/** Player 1 commands the British unless they chose France on the start screen. */
export const DEFAULT_NATIONS: { [player: number]: Nation } = { 1: 'british', 2: 'french' };

export const nationsFor = (player1: Nation): { [player: number]: Nation } =>
  ({ 1: player1, 2: player1 === 'british' ? 'french' : 'british' });

export const nationOf = (state: Pick<GameState, 'nations'>, player: number): Nation =>
  state.nations?.[player] ?? DEFAULT_NATIONS[player] ?? 'british';

/** Famous commanders of each army of the period, offered as names for the generals. */
export const COMMANDERS: Record<Nation, string[]> = {
  british: [
    'General Wellington', 'General Picton', 'General Hill', 'General Uxbridge',
    'General Moore', 'General Graham', 'General Beresford', 'General Craufurd',
  ],
  french: [
    'Emperor Napoléon', 'Marshal Ney', 'Marshal Davout', 'Marshal Soult',
    'Marshal Murat', 'Marshal Lannes', 'Marshal Masséna', 'Marshal Grouchy',
  ],
};

/**
 * The starting armies. Each costs about the same at reinforcement prices (5,040 to 5,160
 * supply), so none is simply stronger. Deployments are Player 1's (the south); Player 2's
 * mirror them. Combined arms is the original army, deployed exactly as before.
 */
export const DOCTRINES: Record<ArmyDoctrine, { name: string; blurb: string; deploy: [UnitType, number, number][] }> = {
  balanced: {
    name: 'Combined arms',
    blurb: 'A solid line with skirmishers, guns and horse in support',
    deploy: [
      ['line_infantry', 5, 17], ['line_infantry', 7, 17], ['line_infantry', 9, 17], ['line_infantry', 11, 17], ['line_infantry', 13, 17], ['line_infantry', 15, 17],
      ['light_infantry', 4, 16], ['light_infantry', 16, 16],
      ['cannon', 8, 18], ['cannon', 12, 18],
      ['hussars', 2, 17], ['hussars', 18, 17],
      ['chasseurs', 10, 18],
    ],
  },
  cavalry: {
    name: 'Cavalry corps',
    blurb: 'Six regiments of horse for swift flanking; a thin line and one gun',
    deploy: [
      ['line_infantry', 7, 17], ['line_infantry', 9, 17], ['line_infantry', 11, 17], ['line_infantry', 13, 17],
      ['light_infantry', 10, 16],
      ['cannon', 10, 18],
      ['hussars', 2, 17], ['hussars', 4, 17], ['hussars', 16, 17], ['hussars', 18, 17],
      ['chasseurs', 3, 18], ['chasseurs', 17, 18],
    ],
  },
  light: {
    name: 'Light division',
    blurb: 'A screen of five skirmisher battalions and mounted rifles ahead of the line',
    deploy: [
      ['line_infantry', 7, 17], ['line_infantry', 9, 17], ['line_infantry', 11, 17], ['line_infantry', 13, 17],
      ['light_infantry', 2, 16], ['light_infantry', 6, 16], ['light_infantry', 10, 16], ['light_infantry', 14, 16], ['light_infantry', 18, 16],
      ['cannon', 8, 18],
      ['hussars', 12, 18],
      ['chasseurs', 3, 17], ['chasseurs', 17, 17],
    ],
  },
  artillery: {
    name: 'Grand battery',
    blurb: 'Four guns behind a strong line, for a battle of attrition',
    deploy: [
      ['line_infantry', 6, 17], ['line_infantry', 8, 17], ['line_infantry', 10, 17], ['line_infantry', 12, 17], ['line_infantry', 14, 17],
      ['light_infantry', 3, 16], ['light_infantry', 17, 16],
      ['cannon', 6, 18], ['cannon', 8, 18], ['cannon', 12, 18], ['cannon', 14, 18],
      ['hussars', 2, 17],
    ],
  },
};

export const isDoctrine = (v: unknown): v is ArmyDoctrine => typeof v === 'string' && Object.prototype.hasOwnProperty.call(DOCTRINES, v);

export const doctrineOf = (state: Pick<GameState, 'doctrines'>, player: number): ArmyDoctrine => state.doctrines?.[player] ?? 'balanced';

/** "6 line · 2 light · 2 guns · 2 hussars · 1 chasseurs" for a doctrine's starting army. */
export const doctrineSummary = (doctrine: ArmyDoctrine) => {
  const count = (t: UnitType) => DOCTRINES[doctrine].deploy.filter(([u]) => u === t).length;
  const parts: [UnitType, string, string][] = [
    ['line_infantry', 'line', 'line'], ['light_infantry', 'light', 'light'], ['cannon', 'gun', 'guns'],
    ['hussars', 'hussar', 'hussars'], ['chasseurs', 'chasseur', 'chasseurs'],
  ];
  return parts.filter(([t]) => count(t)).map(([t, one, many]) => `${count(t)} ${count(t) === 1 ? one : many}`).join(' · ');
};

/** The men a doctrine's army starts with. */
export const doctrineMen = (doctrine: ArmyDoctrine) =>
  DOCTRINES[doctrine].deploy.reduce((sum, [type]) => sum + createInitialRegiment('', type, 1, 0, 0, 0).men, 0);

/** Waterloo's two commanders, until a player chooses others. */
export const DEFAULT_COMMANDERS: Record<Nation, string> = { british: 'General Wellington', french: 'Emperor Napoléon' };

/** A commander's name as typed: single spaces, at most 40 characters. */
export const normalizeCommander = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, 40);

/** Who commands a player's army in this battle: the chosen name, or the army's default. */
export const commanderOf = (state: Pick<GameState, 'nations' | 'commanders'>, player: number) =>
  normalizeCommander(state.commanders?.[player] ?? '') || DEFAULT_COMMANDERS[nationOf(state, player)];

const generateRegimentName = (type: UnitType, nation: Nation, index: number): string => {
  const british = nation === 'british';
  const names = {
    line_infantry: british ? ["Line Infantry", "Grenadiers", "Foot Guards"] : ["Garde Nationale", "Line Infantry", "Chasseurs à Pied"],
    light_infantry: british ? ["Light Infantry", "Rifles"] : ["Voltigeurs", "Legion"],
    cannon: british ? ["Royal Artillery", "Horse Artillery"] : ["Artillerie à Pied", "Artillerie de Marine"],
    hussars: british ? ["Royal Hussars", "Light Dragoons"] : ["Hussards", "Chasseurs"],
    chasseurs: british ? ["Chasseurs", "Mounted Rifles"] : ["Chasseurs à Cheval", "Dragons"]
  };

  const typeNames = names[type];
  const name = typeNames[index % typeNames.length];
  return `${getOrdinal(index + 1)} ${name}`;
};

const generateStandardColor = (rand: () => number = Math.random) => {
  const colors = ["#b22222", "#4682b4", "#556b2f", "#daa520", "#4b0082", "#2f4f4f", "#8b4513", "#2e8b57"];
  return colors[Math.floor(rand() * colors.length)];
};

/**
 * Supply cost of a reinforcement: deliberately steep, so generals fight with the army they
 * have. On +50 base income a side can afford a new line regiment about every six turns.
 */
export const UNIT_COSTS: { [key in UnitType]: number } = {
  line_infantry: 300,
  light_infantry: 360,
  cannon: 600,
  hussars: 450,
  chasseurs: 540,
};

export const SUPPLY_PER_TURN = 50;
export const SUPPLY_NODE_BONUS = 25;

export const createInitialRegiment = (
  id: string,
  type: UnitType,
  owner: number,
  x: number,
  y: number,
  index: number,
  facing: Facing = owner === 1 ? 'north' : 'south',
  nation: Nation = DEFAULT_NATIONS[owner] ?? 'british'
): Regiment => {
  const stats = {
    line_infantry: { maxMen: 1000, attack: 0.18, defense: 0.12, maxMp: 3, range: 2 },
    light_infantry: { maxMen: 600, attack: 0.14, defense: 0.06, maxMp: 4, range: 3 },
    cannon: { maxMen: 150, attack: 0.35, defense: 0.02, maxMp: 2, range: 8 },
    hussars: { maxMen: 400, attack: 0.35, defense: 0.05, maxMp: 6, range: 1 },
    chasseurs: { maxMen: 400, attack: 0.12, defense: 0.05, maxMp: 6, range: 3 },
  }[type];

  return {
    id,
    name: generateRegimentName(type, nation, index),
    type,
    owner,
    standardColor: generateStandardColor(),
    x,
    y,
    facing,
    men: stats.maxMen,
    maxMen: stats.maxMen,
    attack: stats.attack,
    defense: stats.defense,
    mp: stats.maxMp,
    maxMp: stats.maxMp,
    range: stats.range,
    isEntrenched: false,
    isBoxFormation: false,
    isPalisaded: false,
    hasAttacked: false,
  };
};

/** A battlefield; pass a seeded generator to get the same map every time. */
export const generateMap = (rand: () => number = Math.random): Tile[][] => {
  const map: Tile[][] = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < MAP_SIZE; x++) {
      let terrain: Tile['terrain'] = 'grass';
      const roll = rand();
      if (roll < 0.1) terrain = 'forest';
      else if (roll < 0.18) terrain = 'mountain'; // Hills
      row.push({ x, y, terrain });
    }
    map.push(row);
  }

  // Generate continuous river
  let riverX = Math.floor(rand() * (MAP_SIZE - 4)) + 2;
  for (let y = 0; y < MAP_SIZE; y++) {
    map[y][riverX].terrain = 'river';
    const move = rand();
    if (move < 0.2 && riverX > 1) riverX--;
    else if (move > 0.8 && riverX < MAP_SIZE - 2) riverX++;
    if (rand() > 0.5 && riverX < MAP_SIZE - 1) {
      map[y][riverX + 1].terrain = 'river';
    }
  }

  // Generate continuous road
  let roadY = Math.floor(rand() * (MAP_SIZE - 4)) + 2;
  for (let x = 0; x < MAP_SIZE; x++) {
    map[roadY][x].terrain = 'road';
    const move = rand();
    if (move < 0.1 && roadY > 1) roadY--;
    else if (move > 0.9 && roadY < MAP_SIZE - 2) roadY++;
  }

  // Generate building clusters (villages)
  for (let i = 0; i < 4; i++) {
    const startX = Math.floor(rand() * (MAP_SIZE - 4)) + 2;
    const startY = Math.floor(rand() * (MAP_SIZE - 4)) + 2;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        if (map[startY + dy][startX + dx].terrain !== 'river') {
          map[startY + dy][startX + dx].terrain = 'buildings';
        }
      }
    }
  }

  // Generate Capture Point (center)
  const centerX = Math.floor(MAP_SIZE / 2);
  const centerY = Math.floor(MAP_SIZE / 2);
  map[centerY][centerX].terrain = 'capture_point';
  map[centerY][centerX].owner = 0;

  // Generate Supply Nodes (max 3) - around the center
  let nodesPlaced = 0;
  const radius = 4;
  while (nodesPlaced < 3) {
    const x = Math.floor(rand() * (radius * 2 + 1)) + (centerX - radius);
    const y = Math.floor(rand() * (radius * 2 + 1)) + (centerY - radius);
    
    // Ensure it's within map bounds and not the capture point
    if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE && (x !== centerX || y !== centerY)) {
      const tile = map[y][x];
      if (tile.terrain === 'grass' || tile.terrain === 'forest' || tile.terrain === 'road') {
        tile.terrain = 'supply_node';
        tile.owner = 0; // Neutral
        nodesPlaced++;
      }
    }
  }

  return map;
};

export const findPath = (
  start: { x: number, y: number },
  end: { x: number, y: number },
  movingUnit: Regiment,
  regiments: Regiment[],
  map: Tile[][]
): { path: { x: number, y: number }[], cost: number } | null => {
  // Simple Dijkstra for shortest path with terrain costs
  const queue: { x: number, y: number, path: { x: number, y: number }[], cost: number }[] = [
    { ...start, path: [], cost: 0 }
  ];
  const visited = new Map<string, number>();
  visited.set(`${start.x},${start.y}`, 0);

  let bestPath: { path: { x: number, y: number }[], cost: number } | null = null;

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;

    if (current.x === end.x && current.y === end.y) {
      if (!bestPath || current.cost < bestPath.cost) {
        bestPath = { path: current.path, cost: current.cost };
      }
      continue;
    }

    if (bestPath && current.cost >= bestPath.cost) continue;

    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const neighbor of neighbors) {
      if (neighbor.x < 0 || neighbor.x >= map[0].length || neighbor.y < 0 || neighbor.y >= map.length) continue;
      
      // Check if tile is occupied by another unit (except the moving unit itself at the start)
      if (regiments.some(r => r.x === neighbor.x && r.y === neighbor.y && r.id !== movingUnit.id)) continue;

      const tile = map[neighbor.y][neighbor.x];
      const terrainCost = getTerrainMpCost(tile.terrain);
      
      // ZoC check
      const zoc = getZoCStatus(neighbor.x, neighbor.y, movingUnit, regiments);
      if (!zoc.canPass) continue;

      const newCost = current.cost + terrainCost;
      const key = `${neighbor.x},${neighbor.y}`;
      
      if (!visited.has(key) || visited.get(key)! > newCost) {
        visited.set(key, newCost);
        queue.push({
          ...neighbor,
          path: [...current.path, neighbor],
          cost: newCost
        });
      }
    }
  }

  return bestPath;
};

export const getTerrainDefenseBonus = (terrain: Tile['terrain']): number => {
  switch (terrain) {
    case 'forest': return 0.5;
    case 'mountain': return 0.3;
    case 'buildings': return 0.4;
    case 'river': return -0.2;
    case 'command_center': return 0.6;
    case 'supply_node': return 0.3;
    case 'capture_point': return -0.3;
    default: return 0;
  }
};

export const getTerrainMpCost = (terrain: Tile['terrain']): number => {
  switch (terrain) {
    case 'mountain': return 2;
    case 'river': return 3;
    case 'road': return 0.5;
    default: return 1;
  }
};

export const getInitialState = (
  nations: { [player: number]: Nation } = DEFAULT_NATIONS,
  seed: string = randomSeed(),
  doctrines: { [player: number]: ArmyDoctrine } = { 1: 'balanced', 2: 'balanced' },
): GameState => {
  const rand = seededRandom(seed);
  const map = generateMap(rand);
  const reg = (id: string, type: UnitType, owner: number, x: number, y: number, index: number) =>
    createInitialRegiment(id, type, owner, x, y, index, undefined, nations[owner]);
  
  // Place Command Centers
  // Player 1 (Bottom)
  map[19][10] = { x: 10, y: 19, terrain: 'command_center', owner: 1 };
  // Player 2 (Top)
  map[0][10] = { x: 10, y: 0, terrain: 'command_center', owner: 2 };

  // Each army from its doctrine: Player 2 (north) mirrors Player 1's deployment. Player 2 is
  // listed first, as it always was, so a map code still gives the same colours.
  const army = (owner: number): Regiment[] => {
    const counts: Partial<Record<UnitType, number>> = {};
    return DOCTRINES[doctrines[owner] ?? 'balanced'].deploy.map(([type, x, y]) => {
      const index = counts[type] ?? 0;
      counts[type] = index + 1;
      return reg(`p${owner}-${ID_PREFIX[type]}${index + 1}`, type, owner, x, owner === 1 ? y : 19 - y, index);
    });
  };
  const regiments: Regiment[] = [...army(2), ...army(1)];
  // The colours come from the map code too, so a rematch looks the same.
  for (const r of regiments) r.standardColor = generateStandardColor(rand);

  return {
    map,
    regiments,
    turn: 1,
    currentPlayer: 1,
    selectedUnitId: null,
    winner: null,
    animations: [],
    supply: { 1: 100, 2: 100 },
    capturePointOwner: null,
    capturePointTurns: 0,
    battlefieldLogs: ["Welcome Commander. 19th Century Warfare Simulation Active."],
    cliHistory: [],
    gameMode: null,
    aiConfigs: {
      1: { provider: 'gemini', apiKey: '', model: DEFAULT_MODELS.gemini, claudeApiKey: '', claudeModel: DEFAULT_MODELS.claude, openaiApiKey: '', openaiModel: DEFAULT_MODELS.openai, openrouterApiKey: '', openrouterModel: DEFAULT_MODELS.openrouter, thinkingLevel: DEFAULT_THINKING_LEVEL, langsmithApiKey: '', langsmithProject: 'regiments-p1' },
      2: { provider: 'gemini', apiKey: '', model: DEFAULT_MODELS.gemini, claudeApiKey: '', claudeModel: DEFAULT_MODELS.claude, openaiApiKey: '', openaiModel: DEFAULT_MODELS.openai, openrouterApiKey: '', openrouterModel: DEFAULT_MODELS.openrouter, thinkingLevel: DEFAULT_THINKING_LEVEL, langsmithApiKey: '', langsmithProject: 'regiments-p2' }
    },
    monologueHistory: [],
    nations: { ...nations },
    doctrines: { ...doctrines },
    seed,
    startedAt: Date.now(),
    battleId: `${seed}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    tally: { 1: openingTally(regiments, 1), 2: openingTally(regiments, 2) },
    timeline: [snapshot({ regiments }, 0, 0)],
    // Start numbering reinforcements after the starting regiments, so no id is ever reused.
    idCounters: regiments.reduce<Record<string, number>>((acc, r) => {
      const m = /^(p\d+-[a-z]+?)(\d+)$/.exec(r.id);
      if (m) acc[m[1]] = Math.max(acc[m[1]] ?? 0, Number(m[2]));
      return acc;
    }, {}),
  };
};

/** In Human vs AI, the LLM general commands Player 2 unless you chose to play second. */
export const VERSUS_AI_PLAYER = 2;

/** The player the AI general commands in Human vs AI. */
export const aiPlayerOf = (state: Pick<GameState, 'aiPlayer'>) => state.aiPlayer ?? VERSUS_AI_PLAYER;

/** The player you command in Human vs AI. */
export const humanPlayerOf = (state: Pick<GameState, 'aiPlayer'>) => 3 - aiPlayerOf(state);

/** Whether an LLM general commands this player: both in AI Gameplay, one side in Human vs AI. */
export const isAiPlayer = (state: Pick<GameState, 'gameMode' | 'aiPlayer'>, player: number) =>
  state.gameMode === 'ai' || (state.gameMode === 'versus' && player === aiPlayerOf(state));

// -- Idle regiments ------------------------------------------------------------------

/**
 * A player's regiments that have done nothing yet this turn: not moved, fought, turned,
 * dug in, formed square, raised palisades or been told to hold. Fresh reinforcements
 * (which cannot act yet) never count.
 */
export const idleRegiments = (state: Pick<GameState, 'regiments'>, player: number) =>
  state.regiments.filter(r =>
    r.owner === player && r.mp === r.maxMp && !r.hasAttacked &&
    !r.isEntrenched && !r.isPalisaded && !r.isBoxFormation && !r.holding);

/** One line for the roll call: where a regiment is, and what it could do right now. */
export const describeIdle = (state: Pick<GameState, 'regiments'>, r: Regiment) => {
  const dist = (e: Regiment) => Math.max(Math.abs(e.x - r.x), Math.abs(e.y - r.y));
  const enemies = state.regiments.filter(e => e.owner !== r.owner).sort((a, b) => dist(a) - dist(b));
  const targets = enemies.filter(e => dist(e) <= r.range && isTargetInFiringLine(r, e.x, e.y));
  const nearest = enemies[0];
  return `${r.id} (${r.type.replace('_', ' ')}) at ${r.x}:${r.y} facing ${r.facing}, ${r.men} men, ${r.mp} MP` +
    (targets.length ? ` · can engage now: ${targets.slice(0, 4).map(e => e.id).join(', ')}` : ' · no enemy in range and arc') +
    (nearest ? ` · nearest enemy ${nearest.id} at ${nearest.x}:${nearest.y} (${dist(nearest)} away)` : '');
};

// -- Battle statistics -------------------------------------------------------------

const openingTally = (regiments: Regiment[], owner: number): SideTally => {
  const mine = regiments.filter(r => r.owner === owner);
  return {
    startRegiments: mine.length,
    startMen: mine.reduce((a, r) => a + r.men, 0),
    raised: 0, raisedMen: 0, supplySpent: 0, supplyEarned: 0,
    attacks: 0, charges: 0, capturePointTurns: 0, ordersRejected: 0,
  };
};

/** Adds to a side's counts, e.g. bumpTally(tally, 1, { attacks: 1 }). */
export const bumpTally = (
  tally: GameState['tally'],
  player: number,
  add: Partial<Record<keyof SideTally, number>>,
): GameState['tally'] => {
  const side = { ...tally[player] };
  for (const [k, v] of Object.entries(add)) side[k as keyof SideTally] += v ?? 0;
  return { ...tally, [player]: side };
};

/** Both armies' men and regiments, as recorded after each turn. */
export const snapshot = (state: Pick<GameState, 'regiments'>, turn: number, player: number): TurnSnapshot => {
  const side = (p: number) => state.regiments.filter(r => r.owner === p);
  return {
    turn,
    player,
    men: { 1: side(1).reduce((a, r) => a + r.men, 0), 2: side(2).reduce((a, r) => a + r.men, 0) },
    regiments: { 1: side(1).length, 2: side(2).length },
  };
};

/** A side's standing and losses so far, worked out from its tally and the regiments on the field. */
export const sideStats = (state: Pick<GameState, 'regiments' | 'tally'>, player: number) => {
  const t = state.tally[player];
  const mine = state.regiments.filter(r => r.owner === player);
  const men = mine.reduce((a, r) => a + r.men, 0);
  const lostMen = t.startMen + t.raisedMen - men;
  const enemy = state.tally[3 - player];
  const enemyMen = state.regiments.filter(r => r.owner === 3 - player).reduce((a, r) => a + r.men, 0);
  return {
    ...t,
    regiments: mine.length,
    men,
    lostRegiments: t.startRegiments + t.raised - mine.length,
    lostMen,
    inflicted: enemy.startMen + enemy.raisedMen - enemyMen,
  };
};

export type VictoryReason = 'capture_point' | 'command_center' | 'annihilation';

/** How the winner won: holding the Capture Point, taking the enemy Command Center, or destroying every regiment. */
export const victoryReason = (state: Pick<GameState, 'winner' | 'regiments' | 'capturePointOwner' | 'capturePointTurns'>): VictoryReason | null => {
  if (!state.winner) return null;
  if (!state.regiments.some(r => r.owner !== state.winner)) return 'annihilation';
  if (state.capturePointOwner === state.winner && state.capturePointTurns >= 5) return 'capture_point';
  return 'command_center';
};

/**
 * Whether an attack from (x, y) hits a regiment in the flank. Its front is the 90° cone
 * ahead of its facing (facing north: a smaller y, and no more columns to the side than
 * rows ahead); an attack from anywhere else, the side or the rear, is a flank attack.
 */
export const isFlankAttack = (defender: Pick<Regiment, 'x' | 'y' | 'facing'>, x: number, y: number) => {
  const dx = x - defender.x, dy = y - defender.y;
  const [ahead, aside] =
    defender.facing === 'north' ? [-dy, dx] :
    defender.facing === 'south' ? [dy, dx] :
    defender.facing === 'east' ? [dx, dy] : [-dx, dy];
  return !(ahead > 0 && Math.abs(aside) <= ahead);
};

/**
 * Line infantry that attacks an adjacent enemy closes with the bayonet instead of
 * firing a volley. A square holds its ground and fires.
 */
export const isBayonetCharge = (attacker: Pick<Regiment, 'type' | 'isBoxFormation' | 'x' | 'y'>, defender: Pick<Regiment, 'x' | 'y'>) =>
  attacker.type === 'line_infantry' && !attacker.isBoxFormation &&
  Math.max(Math.abs(attacker.x - defender.x), Math.abs(attacker.y - defender.y)) === 1;

/** Shock of a bayonet charge: the charging side hits harder and the side receiving it replies weaker. */
export const BAYONET_CHARGE_BONUS = 1.2;
export const BAYONET_REPLY_FACTOR = 0.9;

/**
 * `melee` marks the two halves of a bayonet charge: 'charge' for the charging
 * regiment's blow and 'reply' for the defender fighting back. In a melee neither
 * side is protected by earthworks or palisades.
 */
export const calculateDamage = (attacker: Regiment, defender: Regiment, defenderTerrain: Tile['terrain'], melee?: 'charge' | 'reply'): number => {
  let terrainBonus = getTerrainDefenseBonus(defenderTerrain);
  
  // Buildings bonus only for infantry
  if (defenderTerrain === 'buildings' && defender.type !== 'line_infantry' && defender.type !== 'light_infantry') {
    terrainBonus = 0;
  }

  const baseDefense = defender.defense;
  const entrenchBonus = defender.isEntrenched && !melee ? 0.6 : 0;
  const palisadeBonus = defender.isPalisaded && !melee ? 0.7 : 0;
  
  // Flanking damage: an attack from the side or the rear. A square has no flank.
  let flankingBonus = 1.0;
  if (!defender.isBoxFormation && isFlankAttack(defender, attacker.x, attacker.y)) {
    if (attacker.type === 'hussars' && defender.type === 'line_infantry') {
      flankingBonus = 2.0; // Hussars double damage vs Line Infantry flanks
    } else {
      flankingBonus = 1.5;
    }
  }

  // Cavalry vs Light Infantry bonus
  let bonus = 1.0 * flankingBonus;
  if (attacker.type === 'hussars' && defender.type === 'light_infantry') {
    bonus = 2.5 * flankingBonus; // Hussars are devastating against skirmishers in the open
  } else if (attacker.type === 'chasseurs' && defender.type === 'light_infantry') {
    bonus = 1.5 * flankingBonus;
  }
  // Cannon vs close range penalty
  if (attacker.type === 'cannon') {
    const dist = Math.max(Math.abs(attacker.x - defender.x), Math.abs(attacker.y - defender.y));
    if (dist <= 1) bonus = 0.3;
    
    if (defender.isEntrenched && !melee) {
      bonus *= 0.5; // Cannons less effective vs entrenched
    }
    if (defender.isBoxFormation) {
      bonus *= 2; // A packed infantry square is a perfect artillery target
    }
  }

  // Box formation: horses will not ride into a hedge of bayonets, but only one
  // face of the square can fire at anything that is not cavalry.
  const attackerIsCavalry = attacker.type === 'hussars' || attacker.type === 'chasseurs';
  const defenderIsCavalry = defender.type === 'hussars' || defender.type === 'chasseurs';
  if (defender.isBoxFormation && attackerIsCavalry) {
    bonus *= 0.25;
  }
  if (attacker.isBoxFormation && !defenderIsCavalry) {
    bonus *= 0.5;
  }

  if (melee === 'charge') bonus *= BAYONET_CHARGE_BONUS;
  if (melee === 'reply') bonus *= BAYONET_REPLY_FACTOR;

  const effectiveDefense = Math.min(baseDefense + terrainBonus + entrenchBonus + palisadeBonus, 0.95);
  const rawDamage = (attacker.men * attacker.attack * bonus) * (1 - effectiveDefense);
  const variance = 0.9 + Math.random() * 0.2;
  return Math.floor(rawDamage * variance);
};

/**
 * Resolves one engagement: the attacker's damage and the defender's return
 * fire, after the special rules for bayonet charges, skirmishers, charging hussars
 * and squares.
 * Shared by click-to-attack and the `eg` command so they can never disagree.
 */
export const resolveAttack = (attacker: Regiment, defender: Regiment, map: Tile[][]) => {
  if (isBayonetCharge(attacker, defender)) {
    // Hand to hand: the defender always fights back, but a regiment caught in
    // the flank or rear (a square has none) fights back at half strength.
    const caughtInFlank = !defender.isBoxFormation && isFlankAttack(defender, attacker.x, attacker.y);
    const damage = calculateDamage(attacker, defender, map[defender.y][defender.x].terrain, 'charge');
    const reply = calculateDamage(defender, attacker, map[attacker.y][attacker.x].terrain, 'reply');
    return {
      damage: Math.floor(Math.min(defender.men, damage)),
      counterDamage: Math.floor(Math.min(attacker.men, caughtInFlank ? reply * 0.5 : reply)),
      bayonet: true,
    };
  }

  const damage = calculateDamage(attacker, defender, map[defender.y][defender.x].terrain);
  const dist = Math.max(Math.abs(attacker.x - defender.x), Math.abs(attacker.y - defender.y));
  let counterDamage = (defender.range >= dist && isTargetInFiringLine(defender, attacker.x, attacker.y))
    ? calculateDamage(defender, attacker, map[attacker.y][attacker.x].terrain)
    : 0;

  // Skirmishers (Light Infantry/Chasseurs) harass Line Infantry without taking return
  // fire, except that a square always answers cavalry.
  const squareVsCavalry = defender.isBoxFormation && attacker.type === 'chasseurs';
  if ((attacker.type === 'light_infantry' || attacker.type === 'chasseurs') && defender.type === 'line_infantry' && !squareVsCavalry) {
    counterDamage = 0;
  }

  // Hussars are fast and hard to hit during a charge, but not when riding at a square.
  if (attacker.type === 'hussars' && !defender.isBoxFormation) {
    counterDamage = Math.floor(counterDamage * 0.4); // Take 60% less return fire when attacking
  }

  return {
    damage: Math.floor(Math.min(defender.men, damage)),
    counterDamage: Math.floor(Math.min(attacker.men, counterDamage)),
    bayonet: false,
  };
};

export const isTargetInFiringLine = (attacker: Regiment, targetX: number, targetY: number): boolean => {
  if (attacker.isPalisaded) {
    const dx = targetX - attacker.x;
    const dy = targetY - attacker.y;
    
    switch (attacker.facing) {
      case 'north': return dy < 0 && Math.abs(dx) <= Math.abs(dy);
      case 'south': return dy > 0 && Math.abs(dx) <= Math.abs(dy);
      case 'east': return dx > 0 && Math.abs(dy) <= Math.abs(dx);
      case 'west': return dx < 0 && Math.abs(dy) <= Math.abs(dx);
    }
  }

  if (attacker.type !== 'line_infantry' || attacker.isBoxFormation) return true; // Other units and Box have 360 firing

  const dx = targetX - attacker.x;
  const dy = targetY - attacker.y;

  switch (attacker.facing) {
    case 'north': return dy < 0 && Math.abs(dx) <= 1;
    case 'south': return dy > 0 && Math.abs(dx) <= 1;
    case 'east': return dx > 0 && Math.abs(dy) <= 1;
    case 'west': return dx < 0 && Math.abs(dy) <= 1;
    default: return false;
  }
};

export const getZoCStatus = (x: number, y: number, movingUnit: Regiment, regiments: Regiment[]) => {
  const enemyRegiments = regiments.filter(r => r.owner !== movingUnit.owner && r.type === 'line_infantry');
  
  // Check horizontal gap
  const left = enemyRegiments.find(r => r.x === x - 1 && r.y === y);
  const right = enemyRegiments.find(r => r.x === x + 1 && r.y === y);
  
  // Check vertical gap
  const top = enemyRegiments.find(r => r.x === x && r.y === y - 1);
  const bottom = enemyRegiments.find(r => r.x === x && r.y === y + 1);

  const pair = left && right ? [left, right] : top && bottom ? [top, bottom] : null;

  if (!pair) return { canPass: true, takesDamage: false };

  const isCavalry = movingUnit.type === 'hussars' || movingUnit.type === 'chasseurs';
  
  if (isCavalry) {
    // The two regiments either side fire into the gap as the horsemen ride through.
    return { canPass: true, takesDamage: true, shooters: pair.map(r => ({ x: r.x, y: r.y })) };
  } else {
    return { canPass: false, takesDamage: false };
  }
};
