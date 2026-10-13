import { BattleRecord, GeneralInfo, generalKey } from './history';

/** Elo settings: everyone starts at 1500; K is how far one result moves a rating. */
export const ELO_START = 1500;
const ELO_K = 32;

export interface GeneralRow {
  key: string;
  who: GeneralInfo;
  games: number;
  wins: number;
  losses: number;
  rating: number;
  /** Maps played from both ends against the same opponent: won both, or one each. */
  sweeps: number;
  sweptBy: number;
  splits: number;
  asP1: { games: number; wins: number };
  asP2: { games: number; wins: number };
  lostMen: number;
  inflicted: number;
  winTurns: number;
  wonBy: Record<BattleRecord['reason'], number>;
}

export interface HeadToHead {
  a: GeneralRow['key'];
  b: GeneralRow['key'];
  aWho: GeneralInfo;
  bWho: GeneralInfo;
  aWins: number;
  bWins: number;
  /** Swapped-side pairs on the same map: swept by a, swept by b, or split one each. */
  aSweeps: number;
  bSweeps: number;
  splits: number;
}

export interface Leaderboard {
  rows: GeneralRow[];
  headToHead: HeadToHead[];
  /** All battles counted, including mirror matches and human-vs-human. */
  battles: number;
  p1Wins: number;
  /** Battles left out of ratings because the same general led both sides. */
  mirrors: number;
}

const sideKey = (b: BattleRecord, p: number) => generalKey(b.sides[p].who);

/**
 * Pairs each battle with a later one on the same map where the same two generals swapped
 * sides, the fairest test of who is better, since maps are not symmetric.
 */
export const swappedPairs = (records: BattleRecord[]) => {
  const pairs: [BattleRecord, BattleRecord][] = [];
  const used = new Set<string>();
  const chrono = [...records].sort((a, b) => a.endedAt - b.endedAt);
  for (const r of chrono) {
    if (used.has(r.battleId) || sideKey(r, 1) === sideKey(r, 2)) continue;
    const mate = chrono.find(s =>
      s !== r && !used.has(s.battleId) && s.seed === r.seed && s.endedAt >= r.endedAt &&
      sideKey(s, 1) === sideKey(r, 2) && sideKey(s, 2) === sideKey(r, 1));
    if (!mate) continue;
    used.add(r.battleId);
    used.add(mate.battleId);
    pairs.push([r, mate]);
  }
  return pairs;
};

/**
 * Ratings and records per general from finished battles. Elo is updated in the order the
 * battles were fought; battles with the same general on both sides (mirror matches, and
 * people playing each other) tell nothing about who is better and are left out of it.
 */
export const buildLeaderboard = (records: BattleRecord[]): Leaderboard => {
  const rows = new Map<string, GeneralRow>();
  const row = (b: BattleRecord, p: number) => {
    const key = sideKey(b, p);
    let r = rows.get(key);
    if (!r) {
      r = {
        key, who: b.sides[p].who, games: 0, wins: 0, losses: 0, rating: ELO_START,
        sweeps: 0, sweptBy: 0, splits: 0, asP1: { games: 0, wins: 0 }, asP2: { games: 0, wins: 0 },
        lostMen: 0, inflicted: 0, winTurns: 0, wonBy: { capture_point: 0, command_center: 0, annihilation: 0 },
      };
      rows.set(key, r);
    }
    return r;
  };
  const h2h = new Map<string, HeadToHead>();
  const pairOf = (x: GeneralRow, y: GeneralRow) => {
    const [a, b] = x.key < y.key ? [x, y] : [y, x];
    const id = `${a.key}|${b.key}`;
    let h = h2h.get(id);
    if (!h) {
      h = { a: a.key, b: b.key, aWho: a.who, bWho: b.who, aWins: 0, bWins: 0, aSweeps: 0, bSweeps: 0, splits: 0 };
      h2h.set(id, h);
    }
    return h;
  };

  let p1Wins = 0, mirrors = 0;
  const chrono = [...records].sort((a, b) => a.endedAt - b.endedAt);
  for (const b of chrono) {
    if (b.winner === 1) p1Wins++;
    if (sideKey(b, 1) === sideKey(b, 2)) {
      mirrors++;
      continue;
    }
    const sides = [1, 2].map(p => ({ p, r: row(b, p), won: b.winner === p }));
    const [one, two] = sides;
    const expectOne = 1 / (1 + 10 ** ((two.r.rating - one.r.rating) / 400));
    const delta = ELO_K * ((one.won ? 1 : 0) - expectOne);
    one.r.rating += delta;
    two.r.rating -= delta;
    for (const { p, r, won } of sides) {
      r.games++;
      if (won) {
        r.wins++;
        r.winTurns += b.turns;
        r.wonBy[b.reason]++;
      } else r.losses++;
      const seat = p === 1 ? r.asP1 : r.asP2;
      seat.games++;
      if (won) seat.wins++;
      r.lostMen += b.sides[p].lostMen;
      r.inflicted += b.sides[3 - p].lostMen;
    }
    const h = pairOf(one.r, two.r);
    const winnerKey = sideKey(b, b.winner);
    if (winnerKey === h.a) h.aWins++; else h.bWins++;
  }

  for (const [x, y] of swappedPairs(records)) {
    const wx = sideKey(x, x.winner), wy = sideKey(y, y.winner);
    const a = rows.get(sideKey(x, 1)), b = rows.get(sideKey(x, 2));
    if (!a || !b) continue;
    const h = pairOf(a, b);
    if (wx === wy) {
      const winner = rows.get(wx)!, loser = wx === a.key ? b : a;
      winner.sweeps++;
      loser.sweptBy++;
      if (wx === h.a) h.aSweeps++; else h.bSweeps++;
    } else {
      a.splits++;
      b.splits++;
      h.splits++;
    }
  }

  const sorted = [...rows.values()].sort((a, b) => b.rating - a.rating || b.games - a.games);
  for (const r of sorted) r.rating = Math.round(r.rating);
  return {
    rows: sorted,
    headToHead: [...h2h.values()].sort((a, b) => b.aWins + b.bWins - (a.aWins + a.bWins)),
    battles: records.length,
    p1Wins,
    mirrors,
  };
};
