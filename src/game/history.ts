import { PROVIDERS, describeModel, resolveAiModel } from '../ai/models';
import { DOCTRINES, RULES_VERSION, commanderOf, doctrineOf, isAiPlayer, isDoctrine, nationOf, sideStats, victoryReason, VictoryReason } from './engine';
import { AiProvider, ArmyDoctrine, GameMode, GameState, Nation, ThinkingLevelSetting } from './types';

/** Who commanded a side: a person, or an AI general with its provider, model and thinking level. */
export interface GeneralInfo {
  kind: 'human' | 'ai';
  /** For display, e.g. "Claude Sonnet 5.5 · medium" or "You". */
  label: string;
  provider?: AiProvider;
  model?: string;
  thinking?: ThinkingLevelSetting;
}

export interface SideRecord {
  nation: Nation;
  /** Display label, kept for older records and quick reading; `who` has the details. */
  general: string;
  who: GeneralInfo;
  /** The commander's name in that battle, e.g. "Marshal Ney". */
  commander?: string;
  /** The army it fielded; missing from records made before armies could be chosen (combined arms). */
  doctrine?: ArmyDoctrine;
  men: number;
  regiments: number;
  lostMen: number;
  lostRegiments: number;
  raised: number;
  attacks: number;
  charges: number;
  supplyEarned: number;
  capturePointTurns: number;
  ordersRejected: number;
}

/** One finished battle, kept in this browser for the report, the history and the leaderboard. */
export interface BattleRecord {
  /** Record format: 2 adds `who`, `rules`, `startedAt` and the extra side counts. */
  version: number;
  /** The game's RULES_VERSION when it was fought; 0 for battles from before rules were versioned. */
  rules: number;
  battleId: string;
  seed: string;
  mode: GameMode;
  startedAt?: number;
  endedAt: number;
  turns: number;
  winner: number;
  reason: VictoryReason;
  sides: { [player: number]: SideRecord };
}

const KEY = 'regiments.battles';
/** About 1 KB each, so this stays well inside the browser's storage quota. */
export const RECORD_LIMIT = 1000;

/** Who commands a side: "You" or "Human", or the AI general's model and thinking level. */
export const generalOf = (state: GameState, player: number) =>
  isAiPlayer(state, player)
    ? describeModel(state.aiConfigs[player])
    : state.gameMode === 'versus' ? 'You' : 'Human';

const generalInfo = (state: GameState, player: number): GeneralInfo => {
  if (!isAiPlayer(state, player)) return { kind: 'human', label: generalOf(state, player) };
  const ai = resolveAiModel(state.aiConfigs[player]);
  return { kind: 'ai', label: generalOf(state, player), provider: ai.provider, model: ai.model, thinking: ai.thinkingLevel };
};

/** A stable identity for a general across battles, used to group the leaderboard. */
export const generalKey = (who: GeneralInfo) =>
  who.kind === 'human' ? 'human' : `ai:${who.model ?? who.label}:${who.thinking ?? ''}`;

export const recordBattle = (state: GameState): BattleRecord | null => {
  const reason = victoryReason(state);
  if (!state.winner || !reason || !state.gameMode) return null;
  const side = (p: number): SideRecord => {
    const s = sideStats(state, p);
    const who = generalInfo(state, p);
    return {
      nation: nationOf(state, p), general: who.label, who, commander: commanderOf(state, p), doctrine: doctrineOf(state, p),
      men: s.men, regiments: s.regiments, lostMen: s.lostMen, lostRegiments: s.lostRegiments,
      raised: s.raised, attacks: s.attacks, charges: s.charges, supplyEarned: s.supplyEarned,
      capturePointTurns: s.capturePointTurns, ordersRejected: s.ordersRejected,
    };
  };
  return {
    version: 2,
    rules: RULES_VERSION,
    battleId: state.battleId,
    seed: state.seed,
    mode: state.gameMode,
    startedAt: state.startedAt,
    endedAt: Date.now(),
    turns: state.turn,
    winner: state.winner,
    reason,
    sides: { 1: side(1), 2: side(2) },
  };
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * Checks a stored or imported record and fills in what older formats lack. Anything that
 * is not plausibly a battle record is dropped (imports are untrusted files).
 */
export const normalizeRecord = (raw: unknown): BattleRecord | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const sides = r.sides;
  if (!str(r.battleId) || !str(r.seed) || !sides?.[1] || !sides?.[2]) return null;
  if (!['manual', 'ai', 'versus'].includes(r.mode) || ![1, 2].includes(r.winner)) return null;
  if (!['capture_point', 'command_center', 'annihilation'].includes(r.reason)) return null;
  const side = (s: Record<string, any>): SideRecord | null => {
    if (!s || (s.nation !== 'british' && s.nation !== 'french')) return null;
    const label = str(s.general) || str(s.who?.label) || 'Unknown';
    // Version 1 records only had the label: "You"/"Human" for people, a model name otherwise.
    const who: GeneralInfo = s.who && (s.who.kind === 'human' || s.who.kind === 'ai')
      ? {
          kind: s.who.kind, label: str(s.who.label) || label,
          ...(s.who.kind === 'ai' ? {
            provider: PROVIDERS.includes(s.who.provider) ? s.who.provider : undefined,
            model: str(s.who.model, 100) || undefined,
            thinking: ['low', 'medium', 'high'].includes(s.who.thinking) ? s.who.thinking : undefined,
          } : {}),
        }
      : /^(you|human)$/i.test(label)
        ? { kind: 'human', label }
        : { kind: 'ai', label, provider: /claude/i.test(label) ? 'claude' : /gemini/i.test(label) ? 'gemini' : undefined };
    return {
      nation: s.nation, general: label, who, commander: str(s.commander, 40) || undefined,
      doctrine: isDoctrine(s.doctrine) ? s.doctrine : undefined,
      men: num(s.men), regiments: num(s.regiments), lostMen: num(s.lostMen), lostRegiments: num(s.lostRegiments),
      raised: num(s.raised), attacks: num(s.attacks), charges: num(s.charges), supplyEarned: num(s.supplyEarned),
      capturePointTurns: num(s.capturePointTurns), ordersRejected: num(s.ordersRejected),
    };
  };
  const s1 = side(sides[1]), s2 = side(sides[2]);
  if (!s1 || !s2) return null;
  return {
    version: 2,
    rules: num(r.rules),
    battleId: str(r.battleId, 120),
    seed: str(r.seed, 12),
    mode: r.mode,
    startedAt: typeof r.startedAt === 'number' ? r.startedAt : undefined,
    endedAt: num(r.endedAt),
    turns: num(r.turns),
    winner: r.winner,
    reason: r.reason,
    sides: { 1: s1, 2: s2 },
  };
};

/** The army a side fielded, named only when either side chose something other than combined arms. */
export const armyOf = (b: BattleRecord, player: number) =>
  [1, 2].some(p => (b.sides[p].doctrine ?? 'balanced') !== 'balanced') ? DOCTRINES[b.sides[player].doctrine ?? 'balanced'].name : '';

const byNewest = (a: BattleRecord, b: BattleRecord) => b.endedAt - a.endedAt;

/** Finished battles stored in this browser, newest first. Empty if storage is unavailable. */
export const loadBattles = (): BattleRecord[] => {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.map(normalizeRecord).filter((b): b is BattleRecord => !!b).sort(byNewest) : [];
  } catch {
    return [];
  }
};

/** Replaces the stored battles; returns the list as stored (newest first, capped). */
export const storeBattles = (records: BattleRecord[]): BattleRecord[] => {
  const list = [...records].sort(byNewest).slice(0, RECORD_LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: the list still lasts for this session */
  }
  return list;
};

/** Stores a finished battle (once per battle) and returns the updated list. */
export const saveBattle = (record: BattleRecord): BattleRecord[] =>
  storeBattles([record, ...loadBattles().filter(b => b.battleId !== record.battleId)]);

/** Merges battles from an exported file; battles already stored are skipped. */
export const importBattles = (current: BattleRecord[], data: unknown) => {
  const raw = Array.isArray(data) ? data : (data as { records?: unknown })?.records;
  if (!Array.isArray(raw)) return { list: current, added: 0, duplicates: 0, invalid: 0, error: 'This file has no battle records.' };
  const known = new Set(current.map(b => b.battleId));
  const fresh: BattleRecord[] = [];
  let duplicates = 0, invalid = 0;
  for (const item of raw) {
    const rec = normalizeRecord(item);
    if (!rec) invalid++;
    else if (known.has(rec.battleId)) duplicates++;
    else {
      known.add(rec.battleId);
      fresh.push(rec);
    }
  }
  return { list: storeBattles([...current, ...fresh]), added: fresh.length, duplicates, invalid, error: null as string | null };
};

/** The battles as a file another browser can import. */
export const exportBattles = (records: BattleRecord[]) =>
  JSON.stringify({ game: 'Regiments', kind: 'battle-records', exportedAt: new Date().toISOString(), records }, null, 1);
