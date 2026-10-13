import { ReactNode } from 'react';
import { Download, Eye, Repeat, RotateCcw, Shuffle } from 'lucide-react';
import { NATIONS, nationOf, sideStats, victoryReason, VictoryReason } from '../game/engine';
import { BattleRecord, generalOf } from '../game/history';
import { GameState, Nation, Regiment, Tile } from '../game/types';
import { ARMY_COLOR, StrengthChart } from './StrengthChart';

const fmt = (n: number) => n.toLocaleString('en-US');

const MODE_LABEL: Record<string, string> = { manual: 'Manual Play', versus: 'Human vs AI', ai: 'AI Gameplay' };

export const REASON_TEXT: Record<VictoryReason, string> = {
  capture_point: 'held the Capture Point for 5 turns',
  command_center: 'took the enemy Command Center',
  annihilation: 'destroyed the enemy army',
};

/** A short line key in an army's colour, so identity never rests on colour alone. */
const Key = ({ nation }: { nation: Nation }) => (
  <svg width="14" height="4" aria-hidden className="shrink-0">
    <line x1="1" y1="2" x2="13" y2="2" stroke={ARMY_COLOR[nation]} strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

/** Live losses for the sidebar: regiments and men each army has standing and has lost. */
export function CasualtyPanel({ state }: { state: GameState }) {
  return (
    <table className="w-full text-[10px] font-mono tabular-nums">
      <thead>
        <tr className="text-[9px] uppercase text-[#141414]/50">
          <th className="text-left font-normal pb-1">Army</th>
          <th className="text-right font-normal pb-1">Regiments</th>
          <th className="text-right font-normal pb-1">Men</th>
        </tr>
      </thead>
      <tbody>
        {[1, 2].map(p => {
          const s = sideStats(state, p);
          const nation = nationOf(state, p);
          return (
            <tr key={p} className="border-t border-[#141414]/10 align-top">
              <td className="py-1.5">
                <span className="flex items-center gap-1.5 uppercase font-bold"><Key nation={nation} />{NATIONS[nation].adjective}</span>
              </td>
              <td className="py-1.5 text-right">
                <span className="font-bold">{s.regiments}</span>
                <span className="block text-[9px] text-[#141414]/55">{s.lostRegiments ? `${s.lostRegiments} lost` : 'none lost'}</span>
              </td>
              <td className="py-1.5 text-right">
                <span className="font-bold">{fmt(s.men)}</span>
                <span className="block text-[9px] text-[#141414]/55">{s.lostMen ? `${fmt(s.lostMen)} lost` : 'none lost'}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const TERRAIN_FILL: Record<Tile['terrain'], string> = {
  grass: '#8BC34A', forest: '#558B2F', mountain: '#33691E', river: '#0288D1', buildings: '#795548',
  road: '#9E9E9E', command_center: '#F5F5F5', supply_node: '#FFD54F', capture_point: '#f4b4b4',
};

/** A thumbnail of a battlefield with each army's starting regiments, for picking a map code. */
export function MapPreview({ map, regiments, nations, size = 140 }: {
  map: Tile[][];
  regiments: Regiment[];
  nations: { [player: number]: Nation };
  size?: number;
}) {
  const n = map.length;
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} className="block border border-[#141414]" role="img" aria-label="Map preview: Player 1 starts in the south, Player 2 in the north">
      {map.flat().map(t => (
        <rect key={`${t.x}-${t.y}`} x={t.x} y={t.y} width="1.02" height="1.02" fill={TERRAIN_FILL[t.terrain]} />
      ))}
      {map.flat().filter(t => t.terrain === 'command_center').map(t => (
        <rect key={`cc${t.x}-${t.y}`} x={t.x + 0.1} y={t.y + 0.1} width="0.8" height="0.8" fill="none" stroke={ARMY_COLOR[nations[t.owner ?? 1]]} strokeWidth="0.2" />
      ))}
      {regiments.map(r => (
        <rect key={r.id} x={r.x + 0.2} y={r.y + 0.2} width="0.6" height="0.6" fill={ARMY_COLOR[nations[r.owner]]} stroke="#fff" strokeWidth="0.1" />
      ))}
    </svg>
  );
}

const Stat = ({ value, note }: { value: string; note?: string }) => (
  <>
    <span className="font-bold text-[#141414]">{value}</span>
    {note && <span className="text-[#141414]/55"> {note}</span>}
  </>
);

/** The end-of-battle report: who won and how, each side's account, strength over time, and earlier battles on this map. */
export function BattleReport({ state, history, onRematch, onExport, onViewField, onNewCampaign }: {
  state: GameState;
  history: BattleRecord[];
  onRematch: (swapSides: boolean) => void;
  onExport: () => void;
  onViewField: () => void;
  onNewCampaign: () => void;
}) {
  const winner = state.winner!;
  const reason = victoryReason(state);
  const sides = [1, 2].map(p => ({ player: p, nation: nationOf(state, p), general: generalOf(state, p), s: sideStats(state, p) }));
  const won = sides[winner - 1];
  const onThisMap = history.filter(b => b.seed === state.seed).slice(0, 8);

  const rows: { label: string; cell: (s: (typeof sides)[number]['s']) => ReactNode }[] = [
    { label: 'Regiments standing', cell: s => <Stat value={fmt(s.regiments)} note={`of ${s.startRegiments + s.raised}`} /> },
    { label: 'Regiments lost', cell: s => <Stat value={fmt(s.lostRegiments)} /> },
    { label: 'Men standing', cell: s => <Stat value={fmt(s.men)} note={`of ${fmt(s.startMen + s.raisedMen)}`} /> },
    { label: 'Men lost', cell: s => <Stat value={fmt(s.lostMen)} note={s.startMen + s.raisedMen ? `(${Math.round((s.lostMen / (s.startMen + s.raisedMen)) * 100)}%)` : undefined} /> },
    { label: 'Reinforcements raised', cell: s => <Stat value={fmt(s.raised)} note={s.raised ? `for ${fmt(s.supplySpent)} supply` : undefined} /> },
    { label: 'Attacks', cell: s => <Stat value={fmt(s.attacks)} note={s.charges ? `(${s.charges} bayonet charge${s.charges === 1 ? '' : 's'})` : undefined} /> },
    { label: 'Supply earned', cell: s => <Stat value={fmt(s.supplyEarned)} /> },
    { label: 'Turns holding the Capture Point', cell: s => <Stat value={fmt(s.capturePointTurns)} /> },
    { label: 'Orders rejected', cell: s => <Stat value={fmt(s.ordersRejected)} /> },
  ];

  return (
    <div className="absolute inset-0 z-50 overflow-y-auto bg-[#141414]/85 backdrop-blur-sm p-4 sm:p-8">
      <div className="max-w-3xl mx-auto bg-[#E4E3E0] border-2 border-[#141414] shadow-2xl">
        <header className="p-6 border-b border-[#141414]">
          <p className="text-[10px] uppercase tracking-[0.25em] font-mono text-[#141414]/60">
            Battle report · {MODE_LABEL[state.gameMode ?? 'manual']} · Map <span className="font-bold text-[#141414]">{state.seed}</span>
          </p>
          <h2 className="mt-2 text-4xl font-serif italic font-bold tracking-tight">The {NATIONS[won.nation].adjective} carry the field</h2>
          <p className="mt-2 text-sm">
            Player {winner} ({won.general}) {reason ? REASON_TEXT[reason] : 'won'} on turn {state.turn}.
          </p>
        </header>

        <section className="p-6 border-b border-[#141414]/20">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="w-2/5" />
                {sides.map(sd => (
                  <th key={sd.player} className="text-left font-normal pb-3 pl-3 align-bottom">
                    <span className="flex items-center gap-1.5 text-sm font-bold uppercase">
                      <Key nation={sd.nation} /> {NATIONS[sd.nation].adjective}
                      {sd.player === winner && <span className="ml-1 px-1.5 py-0.5 text-[9px] tracking-widest bg-[#141414] text-[#E4E3E0]">Victor</span>}
                    </span>
                    <span className="block text-[10px] font-mono uppercase text-[#141414]/60 mt-0.5">
                      Player {sd.player} · {sd.player === 1 ? 'south' : 'north'} · {sd.general}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {rows.map(r => (
                <tr key={r.label} className="border-t border-[#141414]/10">
                  <td className="py-1.5 text-[10px] uppercase text-[#141414]/60">{r.label}</td>
                  {sides.map(sd => <td key={sd.player} className="py-1.5 pl-3">{r.cell(sd.s)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="p-6 border-b border-[#141414]/20 bg-white">
          <h3 className="text-[11px] uppercase tracking-widest font-serif italic text-[#141414]/60 mb-3">Men under arms, turn by turn</h3>
          <StrengthChart state={state} />
        </section>

        <section className="p-6 border-b border-[#141414]/20">
          <h3 className="text-[11px] uppercase tracking-widest font-serif italic text-[#141414]/60 mb-3">Battles on map {state.seed}</h3>
          {onThisMap.length > 1 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] font-mono tabular-nums">
                <thead className="text-[#141414]/55 uppercase">
                  <tr>
                    <th className="text-left font-normal pb-1">Ended</th>
                    <th className="text-left font-normal pb-1">Player 1 · south</th>
                    <th className="text-left font-normal pb-1">Player 2 · north</th>
                    <th className="text-left font-normal pb-1">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {onThisMap.map(b => (
                    <tr key={b.battleId} className={b.battleId === state.battleId ? 'border-t border-[#141414]/10 bg-white/70' : 'border-t border-[#141414]/10'}>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{new Date(b.endedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      {[1, 2].map(p => (
                        <td key={p} className="py-1.5 pr-2">
                          <span className="flex items-center gap-1.5 font-bold uppercase"><Key nation={b.sides[p].nation} />{NATIONS[b.sides[p].nation].adjective}</span>
                          <span className="block text-[#141414]/60">{b.sides[p].general} · lost {fmt(b.sides[p].lostMen)} men</span>
                        </td>
                      ))}
                      <td className="py-1.5">
                        <span className="font-bold">{NATIONS[b.sides[b.winner].nation].adjective} won</span>
                        <span className="block text-[#141414]/60">{REASON_TEXT[b.reason]}, turn {b.turns}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-[#141414]/70">
              The first battle recorded on this map. Rematch with sides swapped to see how each general fares from the other end of the field, moving {winner === 1 ? 'second' : 'first'} instead.
            </p>
          )}
        </section>

        <footer className="p-6 flex flex-wrap gap-2">
          <button onClick={() => onRematch(true)} className="px-4 py-2.5 bg-[#141414] text-[#E4E3E0] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#2a2a2a]" title="Same map; each general takes the other army's starting position and turn order">
            <Shuffle size={14} /> Rematch, swap sides
          </button>
          <button onClick={() => onRematch(false)} className="px-4 py-2.5 border border-[#141414] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0]" title="Same map, same sides">
            <Repeat size={14} /> Rematch
          </button>
          <button onClick={onExport} className="px-4 py-2.5 border border-[#141414] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0]" title="Download this report, the turn-by-turn strength and the generals' dispatches as JSON">
            <Download size={14} /> Export report
          </button>
          <button onClick={onViewField} className="px-4 py-2.5 border border-[#141414] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0]">
            <Eye size={14} /> View battlefield
          </button>
          <button onClick={onNewCampaign} className="ml-auto px-4 py-2.5 border border-[#141414] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0]">
            <RotateCcw size={14} /> New campaign
          </button>
        </footer>
      </div>
    </div>
  );
}
