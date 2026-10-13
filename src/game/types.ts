export type UnitType = 'line_infantry' | 'light_infantry' | 'cannon' | 'hussars' | 'chasseurs';

/** The army a player commands; decides regiment names, uniforms, colours and flags. */
export type Nation = 'british' | 'french';
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
  /** Told to `hold` its ground this turn, so it does not count as forgotten. Cleared each turn. */
  holding?: boolean;
}

export interface Tile {
  x: number;
  y: number;
  terrain: 'grass' | 'forest' | 'mountain' | 'river' | 'buildings' | 'road' | 'command_center' | 'supply_node' | 'capture_point';
  owner?: number; // For command_center, supply_node, and capture_point
}

export type AnimationType = 'attack' | 'move' | 'entrench' | 'box_formation' | 'palisade' | 'damage' | 'gauntlet';

export interface GameAnimation {
  id: string;
  type: AnimationType;
  fromX: number;
  fromY: number;
  toX?: number;
  toY?: number;
  unitType?: UnitType;
  damage?: number;
  /**
   * 'gauntlet': cavalry riding from (fromX, fromY) through the gap at (toX, toY) in an enemy
   * line; these are the two line regiments either side of the gap that fire into it.
   */
  shooters?: { x: number; y: number }[];
  /** 'attack': line infantry closing with the bayonet instead of firing. */
  bayonet?: boolean;
  timestamp: number;
}

/** Which LLM service plays a general: Google's Gemini or Anthropic's Claude. */
export type AiProvider = 'gemini' | 'claude';

/**
 * How much the model reasons before answering. Sent as Gemini's thinking level
 * (Gemini 3.8 Flash requires one) or as Claude's effort.
 */
export type ThinkingLevelSetting = 'low' | 'medium' | 'high';

export interface AiConfig {
  /** Defaults to Gemini. */
  provider?: AiProvider;
  /** Google AI (Gemini) API key. */
  apiKey: string;
  /** Gemini model. */
  model: string;
  /** Anthropic API key, from platform.claude.com. */
  claudeApiKey?: string;
  claudeModel?: string;
  thinkingLevel?: ThinkingLevelSetting;
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

export type GameMode = 'manual' | 'ai' | 'versus';

/** A side's running account of the battle; losses and strength are worked out from it and the field. */
export interface SideTally {
  startRegiments: number;
  startMen: number;
  /** Reinforcements raised, their men, and the supply they cost. */
  raised: number;
  raisedMen: number;
  supplySpent: number;
  supplyEarned: number;
  /** Attacks made, of which bayonet charges. */
  attacks: number;
  charges: number;
  /** Turns ended holding the Capture Point. */
  capturePointTurns: number;
  /** Typed or AI orders the game rejected with an error. */
  ordersRejected: number;
}

/** Each army's strength when a player's turn ends (and at the start of the battle). */
export interface TurnSnapshot {
  turn: number;
  /** The player whose turn just ended; 0 for the opening position. */
  player: number;
  men: { [player: number]: number };
  regiments: { [player: number]: number };
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
  /**
   * 'manual': people command both armies. 'ai': an LLM general commands each army.
   * 'versus': a person commands Player 1 against an LLM general commanding Player 2.
   */
  gameMode: GameMode | null;
  /** In 'versus', the player the AI general commands (Player 2 unless you chose to play second). */
  aiPlayer?: number;
  /** The map code: the same code always generates the same battlefield. */
  seed: string;
  /** Unique per battle, so a finished battle is recorded once. */
  battleId: string;
  tally: { [player: number]: SideTally };
  timeline: TurnSnapshot[];
  aiConfigs: { [key: number]: AiConfig };
  monologueHistory: MonologueEntry[];
  nations: { [player: number]: Nation };
  /** Highest number handed out per id prefix ("p1-l": 7), so reinforcement ids are never reused. */
  idCounters?: Record<string, number>;
}
