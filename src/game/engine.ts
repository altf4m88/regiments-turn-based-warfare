import { Regiment, UnitType, Tile, GameState, Facing } from './types';

const MAP_SIZE = 20;

const getOrdinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const generateRegimentName = (type: UnitType, owner: number, index: number): string => {
  const names = {
    line_infantry: owner === 1 ? ["Line Infantry", "Grenadiers", "Foot Guards"] : ["Garde Nationale", "Line Infantry", "Chasseurs à Pied"],
    light_infantry: owner === 1 ? ["Light Infantry", "Rifles"] : ["Voltigeurs", "Legion"],
    cannon: owner === 1 ? ["Royal Artillery", "Horse Artillery"] : ["Artillerie à Pied", "Artillerie de Marine"],
    hussars: owner === 1 ? ["Royal Hussars", "Light Dragoons"] : ["Hussards", "Chasseurs"],
    chasseurs: owner === 1 ? ["Chasseurs", "Mounted Rifles"] : ["Chasseurs à Cheval", "Dragons"]
  };

  const typeNames = names[type];
  const name = typeNames[index % typeNames.length];
  return `${getOrdinal(index + 1)} ${name}`;
};

const generateStandardColor = () => {
  const colors = ["#b22222", "#4682b4", "#556b2f", "#daa520", "#4b0082", "#2f4f4f", "#8b4513", "#2e8b57"];
  return colors[Math.floor(Math.random() * colors.length)];
};

export const UNIT_COSTS: { [key in UnitType]: number } = {
  line_infantry: 100,
  light_infantry: 120,
  cannon: 200,
  hussars: 150,
  chasseurs: 180,
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
  facing: Facing = owner === 1 ? 'north' : 'south'
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
    name: generateRegimentName(type, owner, index),
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

export const generateMap = (): Tile[][] => {
  const map: Tile[][] = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < MAP_SIZE; x++) {
      let terrain: Tile['terrain'] = 'grass';
      const rand = Math.random();
      if (rand < 0.1) terrain = 'forest';
      else if (rand < 0.18) terrain = 'mountain'; // Hills
      row.push({ x, y, terrain });
    }
    map.push(row);
  }

  // Generate continuous river
  let riverX = Math.floor(Math.random() * (MAP_SIZE - 4)) + 2;
  for (let y = 0; y < MAP_SIZE; y++) {
    map[y][riverX].terrain = 'river';
    const move = Math.random();
    if (move < 0.2 && riverX > 1) riverX--;
    else if (move > 0.8 && riverX < MAP_SIZE - 2) riverX++;
    if (Math.random() > 0.5 && riverX < MAP_SIZE - 1) {
      map[y][riverX + 1].terrain = 'river';
    }
  }

  // Generate continuous road
  let roadY = Math.floor(Math.random() * (MAP_SIZE - 4)) + 2;
  for (let x = 0; x < MAP_SIZE; x++) {
    map[roadY][x].terrain = 'road';
    const move = Math.random();
    if (move < 0.1 && roadY > 1) roadY--;
    else if (move > 0.9 && roadY < MAP_SIZE - 2) roadY++;
  }

  // Generate building clusters (villages)
  for (let i = 0; i < 4; i++) {
    const startX = Math.floor(Math.random() * (MAP_SIZE - 4)) + 2;
    const startY = Math.floor(Math.random() * (MAP_SIZE - 4)) + 2;
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
    const x = Math.floor(Math.random() * (radius * 2 + 1)) + (centerX - radius);
    const y = Math.floor(Math.random() * (radius * 2 + 1)) + (centerY - radius);
    
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

export const getInitialState = (): GameState => {
  const map = generateMap();
  
  // Place Command Centers
  // Player 1 (Bottom)
  map[19][10] = { x: 10, y: 19, terrain: 'command_center', owner: 1 };
  // Player 2 (Top)
  map[0][10] = { x: 10, y: 0, terrain: 'command_center', owner: 2 };

  const regiments: Regiment[] = [
    // Player 2 (Top) - 6 Line, 2 Light, 2 Cannon, 2 Hussar, 1 Chasseur
    createInitialRegiment('p2-l1', 'line_infantry', 2, 5, 2, 0),
    createInitialRegiment('p2-l2', 'line_infantry', 2, 7, 2, 1),
    createInitialRegiment('p2-l3', 'line_infantry', 2, 9, 2, 2),
    createInitialRegiment('p2-l4', 'line_infantry', 2, 11, 2, 3),
    createInitialRegiment('p2-l5', 'line_infantry', 2, 13, 2, 4),
    createInitialRegiment('p2-l6', 'line_infantry', 2, 15, 2, 5),
    createInitialRegiment('p2-li1', 'light_infantry', 2, 4, 3, 0),
    createInitialRegiment('p2-li2', 'light_infantry', 2, 16, 3, 1),
    createInitialRegiment('p2-c1', 'cannon', 2, 8, 1, 0),
    createInitialRegiment('p2-c2', 'cannon', 2, 12, 1, 1),
    createInitialRegiment('p2-h1', 'hussars', 2, 2, 2, 0),
    createInitialRegiment('p2-h2', 'hussars', 2, 18, 2, 1),
    createInitialRegiment('p2-ch1', 'chasseurs', 2, 10, 1, 0), // Moved slightly to avoid CC

    // Player 1 (Bottom) - 6 Line, 2 Light, 2 Cannon, 2 Hussar, 1 Chasseur
    createInitialRegiment('p1-l1', 'line_infantry', 1, 5, 17, 0),
    createInitialRegiment('p1-l2', 'line_infantry', 1, 7, 17, 1),
    createInitialRegiment('p1-l3', 'line_infantry', 1, 9, 17, 2),
    createInitialRegiment('p1-l4', 'line_infantry', 1, 11, 17, 3),
    createInitialRegiment('p1-l5', 'line_infantry', 1, 13, 17, 4),
    createInitialRegiment('p1-l6', 'line_infantry', 1, 15, 17, 5),
    createInitialRegiment('p1-li1', 'light_infantry', 1, 4, 16, 0),
    createInitialRegiment('p1-li2', 'light_infantry', 1, 16, 16, 1),
    createInitialRegiment('p1-c1', 'cannon', 1, 8, 18, 0),
    createInitialRegiment('p1-c2', 'cannon', 1, 12, 18, 1),
    createInitialRegiment('p1-h1', 'hussars', 1, 2, 17, 0),
    createInitialRegiment('p1-h2', 'hussars', 1, 18, 17, 1),
    createInitialRegiment('p1-ch1', 'chasseurs', 1, 10, 18, 0), // Moved slightly to avoid CC
  ];

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
      1: { apiKey: '', model: 'gemini-3-flash-preview', langsmithApiKey: '', langsmithProject: 'regiments-p1' },
      2: { apiKey: '', model: 'gemini-3-flash-preview', langsmithApiKey: '', langsmithProject: 'regiments-p2' }
    },
    monologueHistory: []
  };
};

export const calculateDamage = (attacker: Regiment, defender: Regiment, defenderTerrain: Tile['terrain']): number => {
  let terrainBonus = getTerrainDefenseBonus(defenderTerrain);
  
  // Buildings bonus only for infantry
  if (defenderTerrain === 'buildings' && defender.type !== 'line_infantry' && defender.type !== 'light_infantry') {
    terrainBonus = 0;
  }

  const baseDefense = defender.defense;
  const entrenchBonus = defender.isEntrenched ? 0.6 : 0;
  const palisadeBonus = defender.isPalisaded ? 0.7 : 0;
  
  // Flanking damage
  let flankingBonus = 1.0;
  if (!defender.isBoxFormation) {
    const dx = attacker.x - defender.x;
    const dy = attacker.y - defender.y;
    let isBehind = false;
    switch (defender.facing) {
      case 'north': isBehind = dy > 0; break;
      case 'south': isBehind = dy < 0; break;
      case 'east': isBehind = dx < 0; break;
      case 'west': isBehind = dx > 0; break;
    }
    if (isBehind) {
      if (attacker.type === 'hussars' && defender.type === 'line_infantry') {
        flankingBonus = 2.0; // Hussars double damage vs Line Infantry flanks
      } else {
        flankingBonus = 1.5;
      }
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
    
    if (defender.isEntrenched) {
      bonus *= 0.5; // Cannons less effective vs entrenched
    }
  }

  const effectiveDefense = Math.min(baseDefense + terrainBonus + entrenchBonus + palisadeBonus, 0.95);
  const rawDamage = (attacker.men * attacker.attack * bonus) * (1 - effectiveDefense);
  const variance = 0.9 + Math.random() * 0.2;
  return Math.floor(rawDamage * variance);
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

  const isGap = (left && right) || (top && bottom);

  if (!isGap) return { canPass: true, takesDamage: false };

  const isCavalry = movingUnit.type === 'hussars' || movingUnit.type === 'chasseurs';
  
  if (isCavalry) {
    return { canPass: true, takesDamage: true };
  } else {
    return { canPass: false, takesDamage: false };
  }
};
