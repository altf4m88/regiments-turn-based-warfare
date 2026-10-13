import { describeModel } from '../ai/models';
import { isAiPlayer, nationOf, sideStats, victoryReason, VictoryReason } from './engine';
import { GameMode, GameState, Nation } from './types';

/** One finished battle, kept in this browser so rematches on the same map can be compared. */
export interface BattleRecord {
  battleId: string;
  seed: string;
  mode: GameMode;
  endedAt: number;
  turns: number;
  winner: number;
  reason: VictoryReason;
  sides: {
    [player: number]: { nation: Nation; general: string; men: number; regiments: number; lostMen: number; lostRegiments: number };
  };
}

const KEY = 'regiments.battles';
const LIMIT = 100;

/** Who commands a side: "You" or "Human", or the AI general's model and thinking level. */
export const generalOf = (state: GameState, player: number) =>
  isAiPlayer(state, player)
    ? describeModel(state.aiConfigs[player])
    : state.gameMode === 'versus' ? 'You' : 'Human';

export const recordBattle = (state: GameState): BattleRecord | null => {
  const reason = victoryReason(state);
  if (!state.winner || !reason || !state.gameMode) return null;
  const side = (p: number) => {
    const s = sideStats(state, p);
    return { nation: nationOf(state, p), general: generalOf(state, p), men: s.men, regiments: s.regiments, lostMen: s.lostMen, lostRegiments: s.lostRegiments };
  };
  return {
    battleId: state.battleId,
    seed: state.seed,
    mode: state.gameMode,
    endedAt: Date.now(),
    turns: state.turn,
    winner: state.winner,
    reason,
    sides: { 1: side(1), 2: side(2) },
  };
};

/** Finished battles stored in this browser, newest first. Empty if storage is unavailable. */
export const loadBattles = (): BattleRecord[] => {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter(b => b && typeof b.seed === 'string' && b.sides?.[1] && b.sides?.[2]) : [];
  } catch {
    return [];
  }
};

/** Stores a finished battle (once per battle) and returns the updated list. */
export const saveBattle = (record: BattleRecord): BattleRecord[] => {
  const list = [record, ...loadBattles().filter(b => b.battleId !== record.battleId)].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: the battle is still listed for this session */
  }
  return list;
};
