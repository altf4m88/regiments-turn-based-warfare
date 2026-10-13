import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { Download, Map as MapIcon, Trash2, Upload, X } from 'lucide-react';
import { NATIONS, RULES_VERSION } from '../game/engine';
import { BattleRecord, GeneralInfo, exportBattles, importBattles, storeBattles } from '../game/history';
import { buildLeaderboard } from '../game/leaderboard';
import { GameMode } from '../game/types';
import { ARMY_COLOR } from './StrengthChart';
import { ProviderIcon } from './ProviderIcon';
import { REASON_TEXT } from './BattleReport';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (w: number, g: number) => (g ? `${Math.round((w / g) * 100)}%` : '—');
const MODE_NAME: Record<GameMode, string> = { ai: 'AI vs AI', versus: 'Human vs AI', manual: 'Manual' };

type Tab = 'leaderboard' | 'h2h' | 'history';
type ModeFilter = 'all' | GameMode;

const General = ({ who, sub = true, wrap = false }: { who: GeneralInfo; sub?: boolean; wrap?: boolean }) => (
  <span className="min-w-0">
    <span className={'block font-bold ' + (wrap ? 'break-words' : 'truncate')}>{who.kind === 'human' ? (who.label === 'You' ? 'You' : 'Human') : who.label}</span>
    {sub && (
      <span className="flex items-center gap-1 text-[9px] uppercase text-[#141414]/55">
        <ProviderIcon provider={who.provider} size={10} />
        {who.kind === 'human' ? 'Human player' : `AI · ${who.provider === 'claude' ? 'Claude' : who.provider === 'gemini' ? 'Gemini' : 'unknown provider'}`}
      </span>
    )}
  </span>
);

const Segmented = <T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) => (
  <div className="flex border border-[#141414]" role="radiogroup" aria-label={label}>
    {options.map(([v, text]) => (
      <button
        key={v}
        role="radio"
        aria-checked={value === v}
        onClick={() => onChange(v)}
        className={'px-2.5 py-1.5 text-[10px] uppercase font-bold whitespace-nowrap ' + (value === v ? 'bg-[#141414] text-[#E4E3E0]' : 'bg-white hover:bg-[#141414]/10')}
      >
        {text}
      </button>
    ))}
  </div>
);

/**
 * Battle records kept in this browser: a leaderboard of generals, their head-to-head
 * results, and the full history, with export and import to carry them between browsers.
 */
export function RecordsView({ records, onChange, onClose, onPlayMap }: {
  records: BattleRecord[];
  onChange: (records: BattleRecord[]) => void;
  onClose: () => void;
  /** On the start screen: load a past battle's map code to play it again. */
  onPlayMap?: (seed: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('leaderboard');
  const [mode, setMode] = useState<ModeFilter>('all');
  const [allRules, setAllRules] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const shown = useMemo(
    () => records.filter(b => (mode === 'all' || b.mode === mode) && (allRules || b.rules === RULES_VERSION)),
    [records, mode, allRules],
  );
  const board = useMemo(() => buildLeaderboard(shown), [shown]);
  const older = records.filter(b => b.rules !== RULES_VERSION).length;

  const download = () => {
    const blob = new Blob([exportBattles(records)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `regiments_records_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const res = importBattles(records, JSON.parse(await file.text()));
      if (res.error) setNotice(res.error);
      else {
        onChange(res.list);
        setNotice(`Imported ${res.added} new battle${res.added === 1 ? '' : 's'}` +
          (res.duplicates ? `; ${res.duplicates} already here` : '') + (res.invalid ? `; ${res.invalid} unreadable, skipped` : '') + '.');
      }
    } catch {
      setNotice('That file is not a Regiments records export.');
    }
  };
  const clearAll = () => {
    if (!window.confirm(`Delete all ${records.length} battle records from this browser? Export them first if you want to keep them.`)) return;
    onChange(storeBattles([]));
    setNotice('All records deleted.');
  };
  const remove = (id: string) => onChange(storeBattles(records.filter(b => b.battleId !== id)));

  const tabs: [Tab, string][] = [['leaderboard', 'Leaderboard'], ['h2h', 'Head to head'], ['history', `History (${shown.length})`]];

  return (
    <div className="fixed inset-0 z-[110] bg-[#141414]/70 backdrop-blur-sm flex overflow-y-auto p-2 sm:p-6" role="dialog" aria-modal="true" aria-label="Battle records">
      <div className="m-auto w-full max-w-5xl bg-[#E4E3E0] border-2 border-[#141414] shadow-2xl text-[#141414]">
        <header className="p-4 sm:p-6 border-b border-[#141414] flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl sm:text-4xl font-serif italic font-bold tracking-tight">Battle records</h2>
            <p className="mt-1 text-[10px] font-mono uppercase text-[#141414]/60">
              {records.length} battle{records.length === 1 ? '' : 's'} kept in this browser · rules version {RULES_VERSION}
            </p>
          </div>
          <button onClick={onClose} className="h-9 w-9 shrink-0 flex items-center justify-center border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0]" aria-label="Close records">
            <X size={18} />
          </button>
        </header>

        <div className="px-4 sm:px-6 pt-4 flex flex-wrap items-center gap-2">
          <Segmented label="Mode" value={mode} onChange={setMode} options={[['all', 'All modes'], ['ai', 'AI vs AI'], ['versus', 'Human vs AI'], ['manual', 'Manual']]} />
          <Segmented
            label="Rules"
            value={allRules ? 'all' : 'current'}
            onChange={v => setAllRules(v === 'all')}
            options={[['current', 'Current rules'], ['all', `All rules${older ? ` (+${older})` : ''}`]]}
          />
        </div>

        <nav className="px-4 sm:px-6 mt-4 flex gap-1 border-b border-[#141414]" role="tablist">
          {tabs.map(([t, text]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={'px-3 py-2 text-[10px] uppercase font-bold tracking-wider border border-b-0 -mb-px ' + (tab === t ? 'bg-white border-[#141414]' : 'border-transparent text-[#141414]/60 hover:text-[#141414]')}
            >
              {text}
            </button>
          ))}
        </nav>

        <section className="bg-white p-4 sm:p-6 min-h-[16rem]">
          {shown.length === 0 ? (
            <p className="text-sm text-[#141414]/70">
              No finished battles {mode !== 'all' ? `in ${MODE_NAME[mode]} ` : ''}{allRules ? '' : 'under the current rules '}yet. Battles are recorded when one side wins.
            </p>
          ) : tab === 'leaderboard' ? (
            <>
              {board.rows.length === 0 ? (
                <p className="text-sm text-[#141414]/70">These battles were all between the same general on both sides, so there is nobody to rank yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono tabular-nums">
                    <thead className="text-[9px] uppercase text-[#141414]/55 text-left">
                      <tr>
                        <th className="font-normal pb-2 pr-2">#</th>
                        <th className="font-normal pb-2 pr-3">General</th>
                        <th className="font-normal pb-2 pr-3 text-right" title="Elo rating, starting at 1500">Rating</th>
                        <th className="font-normal pb-2 pr-3 text-right">Won–lost</th>
                        <th className="font-normal pb-2 pr-3 hidden sm:table-cell" title="The same two generals on one map with sides swapped">Swapped-side maps</th>
                        <th className="font-normal pb-2 pr-3 hidden md:table-cell text-right">As P1 / as P2</th>
                        <th className="font-normal pb-2 pr-3 hidden md:table-cell text-right">Men lost / killed per battle</th>
                        <th className="font-normal pb-2 hidden lg:table-cell text-right">Turns to win</th>
                      </tr>
                    </thead>
                    <tbody>
                      {board.rows.map((r, i) => (
                        <tr key={r.key} className="border-t border-[#141414]/10 align-top">
                          <td className="py-2 pr-2 text-[#141414]/55">{i + 1}</td>
                          <td className="py-2 pr-3 max-w-[14rem]"><General who={r.who} /></td>
                          <td className="py-2 pr-3 text-right font-bold text-sm">{r.rating}</td>
                          <td className="py-2 pr-3 text-right whitespace-nowrap">
                            {r.wins}–{r.losses}
                            <span className="block text-[9px] text-[#141414]/55">{pct(r.wins, r.games)} of {r.games}</span>
                          </td>
                          <td className="py-2 pr-3 hidden sm:table-cell whitespace-nowrap">
                            {r.sweeps + r.sweptBy + r.splits === 0 ? <span className="text-[#141414]/40">—</span> : (
                              <>
                                <span className="font-bold">{r.sweeps}</span> swept
                                <span className="block text-[9px] text-[#141414]/55">{r.splits} split · swept by {r.sweptBy}</span>
                              </>
                            )}
                          </td>
                          <td className="py-2 pr-3 hidden md:table-cell text-right whitespace-nowrap">
                            {pct(r.asP1.wins, r.asP1.games)} / {pct(r.asP2.wins, r.asP2.games)}
                            <span className="block text-[9px] text-[#141414]/55">{r.asP1.wins}/{r.asP1.games} · {r.asP2.wins}/{r.asP2.games}</span>
                          </td>
                          <td className="py-2 pr-3 hidden md:table-cell text-right whitespace-nowrap">{fmt(r.lostMen / r.games)} / {fmt(r.inflicted / r.games)}</td>
                          <td className="py-2 hidden lg:table-cell text-right">{r.wins ? (r.winTurns / r.wins).toFixed(1) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-4 space-y-1 text-[10px] font-mono text-[#141414]/65 leading-relaxed">
                <p>Player 1, who moves first, won {board.p1Wins} of {board.battles} battles ({pct(board.p1Wins, board.battles)}).</p>
                <p>
                  Rating is Elo: everyone starts at 1500 and each result moves both generals, by more when the weaker one wins. It needs a dozen or more battles to settle.
                  Swapped-side maps pair two battles on one map with the same two generals on opposite sides, which cancels out the map: a sweep means one general won from both ends.
                  {board.mirrors > 0 && ` ${board.mirrors} battle${board.mirrors === 1 ? '' : 's'} with the same general on both sides (including human against human) ${board.mirrors === 1 ? 'is' : 'are'} not ranked.`}
                </p>
              </div>
            </>
          ) : tab === 'h2h' ? (
            board.headToHead.length === 0 ? (
              <p className="text-sm text-[#141414]/70">No battles between two different generals yet.</p>
            ) : (
              <ul className="divide-y divide-[#141414]/10">
                {board.headToHead.map(h => {
                  const paired = h.aSweeps + h.bSweeps + h.splits > 0;
                  const swept = (n: number) => paired && <span className="block text-[9px] font-mono uppercase text-[#141414]/55 mt-0.5">swept {n} map{n === 1 ? '' : 's'}</span>;
                  return (
                    <li key={`${h.a}|${h.b}`} className="py-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-xs">
                      <span className="text-right min-w-0"><General who={h.aWho} wrap />{swept(h.aSweeps)}</span>
                      <span className="text-center font-mono">
                        <span className="block text-xl font-bold tabular-nums">{h.aWins}–{h.bWins}</span>
                        <span className="block text-[9px] uppercase text-[#141414]/55 max-w-[7rem] sm:max-w-none">
                          {paired ? `${h.splits} map${h.splits === 1 ? '' : 's'} split` : 'no swapped-side maps yet'}
                        </span>
                      </span>
                      <span className="min-w-0"><General who={h.bWho} wrap />{swept(h.bSweeps)}</span>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <div>
              <ul className="sm:hidden divide-y divide-[#141414]/10 text-[11px] font-mono">
                {shown.slice(0, 300).map(b => (
                  <li key={b.battleId} className="py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold tracking-wider">{b.seed}</span>
                        <span className="block text-[9px] uppercase text-[#141414]/55">
                          {new Date(b.endedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {MODE_NAME[b.mode]}{b.rules !== RULES_VERSION ? ' · older rules' : ''}
                        </span>
                      </div>
                      <div className="flex shrink-0">
                        {onPlayMap && (
                          <button onClick={() => onPlayMap(b.seed)} className="h-9 w-9 inline-flex items-center justify-center border border-[#141414]" aria-label={`Play map ${b.seed}`}>
                            <MapIcon size={14} />
                          </button>
                        )}
                        <button onClick={() => remove(b.battleId)} className="ml-1 h-9 w-9 inline-flex items-center justify-center border border-[#141414]/30 text-[#141414]/60" aria-label="Delete this record">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {[1, 2].map(p => (
                      <div key={p} className="flex items-baseline gap-1.5">
                        <svg width="12" height="4" aria-hidden className="shrink-0"><line x1="1" y1="2" x2="11" y2="2" stroke={ARMY_COLOR[b.sides[p].nation]} strokeWidth="2.5" strokeLinecap="round" /></svg>
                        <span className="min-w-0">
                          <span className="font-bold uppercase">P{p} {NATIONS[b.sides[p].nation].adjective}</span>{' '}
                          <span className="text-[#141414]/80">{b.sides[p].commander ? `${b.sides[p].commander} · ` : ''}{b.sides[p].general}</span>
                          <span className="text-[#141414]/55"> · lost {fmt(b.sides[p].lostMen)}</span>
                          {b.winner === p && <span className="ml-1 px-1 text-[9px] bg-[#141414] text-[#E4E3E0] uppercase">won</span>}
                        </span>
                      </div>
                    ))}
                    <p className="text-[#141414]/65">{REASON_TEXT[b.reason]}, turn {b.turns}</p>
                  </li>
                ))}
              </ul>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="text-[9px] uppercase text-[#141414]/55 text-left">
                  <tr>
                    <th className="font-normal pb-2 pr-3">Ended</th>
                    <th className="font-normal pb-2 pr-3">Map</th>
                    <th className="font-normal pb-2 pr-3">Player 1 · south</th>
                    <th className="font-normal pb-2 pr-3">Player 2 · north</th>
                    <th className="font-normal pb-2 pr-3">Result</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, 300).map(b => (
                    <tr key={b.battleId} className="border-t border-[#141414]/10 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(b.endedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        <span className="block text-[9px] uppercase text-[#141414]/55">{MODE_NAME[b.mode]}{b.rules !== RULES_VERSION ? ' · older rules' : ''}</span>
                      </td>
                      <td className="py-2 pr-3 font-bold tracking-wider">{b.seed}</td>
                      {[1, 2].map(p => (
                        <td key={p} className="py-2 pr-3 min-w-[9rem]">
                          <span className="flex items-center gap-1.5">
                            <svg width="12" height="4" aria-hidden className="shrink-0"><line x1="1" y1="2" x2="11" y2="2" stroke={ARMY_COLOR[b.sides[p].nation]} strokeWidth="2.5" strokeLinecap="round" /></svg>
                            <span className="uppercase font-bold">{NATIONS[b.sides[p].nation].adjective}</span>
                          </span>
                          {b.sides[p].commander && <span className="block font-serif italic text-xs truncate max-w-[16rem]">{b.sides[p].commander}</span>}
                          <span className="flex items-center gap-1 text-[#141414]/80 truncate max-w-[16rem]"><ProviderIcon provider={b.sides[p].who.provider} size={10} />{b.sides[p].general}</span>
                          <span className="block text-[9px] text-[#141414]/55">lost {fmt(b.sides[p].lostMen)} men</span>
                        </td>
                      ))}
                      <td className="py-2 pr-3 min-w-[9rem]">
                        <span className="font-bold">P{b.winner} {NATIONS[b.sides[b.winner].nation].adjective} won</span>
                        <span className="block text-[#141414]/65">{REASON_TEXT[b.reason]}, turn {b.turns}</span>
                      </td>
                      <td className="py-2 whitespace-nowrap text-right">
                        {onPlayMap && (
                          <button onClick={() => onPlayMap(b.seed)} className="h-8 w-8 inline-flex items-center justify-center border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0]" title={`Play map ${b.seed}`} aria-label={`Play map ${b.seed}`}>
                            <MapIcon size={14} />
                          </button>
                        )}
                        <button onClick={() => remove(b.battleId)} className="ml-1 h-8 w-8 inline-flex items-center justify-center border border-[#141414]/30 text-[#141414]/60 hover:border-red-700 hover:text-red-700" title="Delete this record" aria-label="Delete this record">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              {shown.length > 300 && <p className="mt-3 text-[10px] font-mono text-[#141414]/60">Showing the newest 300 of {shown.length}; export to see them all.</p>}
            </div>
          )}
        </section>

        <footer className="p-4 sm:p-6 border-t border-[#141414] flex flex-wrap items-center gap-2">
          <button onClick={download} disabled={!records.length} className="px-3 py-2 border border-[#141414] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0] disabled:opacity-30" title="Save every record as a JSON file">
            <Download size={14} /> Export
          </button>
          <button onClick={() => fileRef.current?.click()} className="px-3 py-2 border border-[#141414] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0]" title="Merge records exported from another browser">
            <Upload size={14} /> Import
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={upload} />
          <button onClick={clearAll} disabled={!records.length} className="px-3 py-2 border border-red-700/60 text-red-800 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-red-700 hover:text-white disabled:opacity-30">
            <Trash2 size={14} /> Clear all
          </button>
          {notice && <p className="text-[10px] font-mono text-[#141414]/70" role="status">{notice}</p>}
          <p className="w-full sm:w-auto sm:ml-auto text-[9px] font-mono uppercase text-[#141414]/50">Stored in this browser only · export to back up or move</p>
        </footer>
      </div>
    </div>
  );
}
