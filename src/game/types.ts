export type UnitType = 'line_infantry' | 'light_infantry' | 'cannon' | 'hussars' | 'chasseurs';
export type Facing = 'north' | 'south' | 'east' | 'west';

export interface Regiment {
  id: string;
  name: string;
  type: UnitType;
  owner: number; // 1 or 2
  standardColor: string;
  x: number;
  y: number;
  facing: Facing;
  men: number;
  maxMen: number;
  attack: number;
  defense: number;
  mp: number;
  maxMp: number;
  range: number;
  isEntrenched: boolean;
  isBoxFormation: boolean;
  isPalisaded: boolean;
  hasAttacked: boolean;
}

export interface Tile {
  x: number;
  y: number;
  terrain: 'grass' | 'forest' | 'mountain' | 'river' | 'buildings' | 'road' | 'command_center' | 'supply_node' | 'capture_point';
  owner?: number; // For command_center, supply_node, and capture_point
}

export type AnimationType = 'attack' | 'move' | 'entrench' | 'box_formation' | 'palisade' | 'damage';

export interface GameAnimation {
  id: string;
  type: AnimationType;
  fromX: number;
  fromY: number;
  toX?: number;
  toY?: number;
  unitType?: UnitType;
  damage?: number;
  timestamp: number;
}

export interface AiConfig {
  apiKey: string;
  model: string;
  langsmithApiKey?: string;
  langsmithProject?: string;
  useVertexAI?: boolean;
  projectId?: string;
  location?: string;
}

export interface MonologueEntry {
  turn: number;
  player: number;
  text: string;
  timestamp: number;
}

export interface GameState {
  map: Tile[][];
  regiments: Regiment[];
  turn: number;
  currentPlayer: number;
  selectedUnitId: string | null;
  winner: number | null;
  animations: GameAnimation[];
  supply: { [key: number]: number };
  capturePointOwner: number | null;
  capturePointTurns: number;
  battlefieldLogs: string[];
  cliHistory: string[];
  gameMode: 'manual' | 'ai' | null;
  aiConfigs: { [key: number]: AiConfig };
  monologueHistory: MonologueEntry[];
}
