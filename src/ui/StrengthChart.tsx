import { KeyboardEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { NATIONS, nationOf, snapshot } from '../game/engine';
import { GameState, Nation, TurnSnapshot } from '../game/types';

/** Army colours (the same red and blue as the map), checked for colour-blind separation on white. */
export const ARMY_COLOR: Record<Nation, string> = { british: '#dc2626', french: '#2563eb' };

const H = 210;
const M = { left: 44, right: 58, top: 14, bottom: 26 };
const fmt = (n: number) => n.toLocaleString('en-US');
const compact = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(n % 1000 ? 1 : 0)}K` : String(n));

interface Point extends TurnSnapshot {
  label: string;
}

/** Each army's men after every turn of the battle, with a crosshair readout and a table view. */
export function StrengthChart({ state }: { state: GameState }) {
  const points = useMemo<Point[]>(() => {
    const name = (p: number) => NATIONS[nationOf(state, p)].adjective;
    const pts: Point[] = state.timeline.map(s => ({ ...s, label: s.player === 0 ? 'Start of battle' : `Turn ${s.turn} · after the ${name(s.player)}` }));
    // A battle won mid-turn (an army destroyed, a Command Center taken) ends between snapshots.
    const now = snapshot(state, state.turn, state.currentPlayer);
    const last = pts[pts.length - 1];
    if (!last || [1, 2].some(p => last.men[p] !== now.men[p] || last.regiments[p] !== now.regiments[p])) {
      pts.push({ ...now, label: state.winner ? 'End of battle' : 'Now' });
    }
    return pts;
  }, [state]);

  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Drawn at the width it is shown, so text stays legible on a phone instead of shrinking with the chart.
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [points.length < 2]);

  const n = points.length;
  const peak = Math.max(1, ...points.flatMap(p => [p.men[1], p.men[2]]));
  const yMax = Math.ceil(peak / 2000) * 2000;
  const plotW = W - M.left - M.right, plotH = H - M.top - M.bottom;
  const x = (i: number) => M.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => M.top + plotH - (v / yMax) * plotH;
  const yTicks = [0, yMax / 2, yMax];

  // A tick at the start and where each full turn ends (after Player 2 moves), thinned to about ten.
  const turnEnds = points.map((p, i) => ({ p, i })).filter(({ p }) => p.player === 0 || p.player === 2);
  const every = Math.max(1, Math.ceil(turnEnds.length / 10));
  const xTicks = turnEnds.filter((_, k) => k % every === 0);

  const sides = [1, 2].map(p => ({ player: p, nation: nationOf(state, p), color: ARMY_COLOR[nationOf(state, p)] }));
  const path = (p: number) => points.map((pt, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(pt.men[p]).toFixed(1)}`).join('');

  // End labels only when they will not collide; the legend and readout carry the values otherwise.
  const endY = sides.map(s => y(points[n - 1].men[s.player]));
  const endLabels = Math.abs(endY[0] - endY[1]) >= 14;

  const pick = (e: PointerEvent<SVGRectElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || n === 0) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = n > 1 ? Math.round(((px - M.left) / plotW) * (n - 1)) : 0;
    setActive(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setActive(a => Math.max(0, Math.min(n - 1, (a ?? n - 1) + (e.key === 'ArrowRight' ? 1 : -1))));
  };

  const cur = active !== null ? points[active] : null;

  if (n < 2) {
    return <p className="text-xs text-[#141414]/70">The battle ended before a full turn was played, so there is nothing to chart yet.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-[10px] font-mono uppercase text-[#141414]/70">
        {sides.map(s => (
          <span key={s.player} className="flex items-center gap-1.5">
            <svg width="16" height="4" aria-hidden><line x1="0" y1="2" x2="16" y2="2" stroke={s.color} strokeWidth="2" strokeLinecap="round" /></svg>
            {NATIONS[s.nation].adjective} (P{s.player})
          </span>
        ))}
      </div>
      <div className="relative" ref={boxRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto block outline-none focus-visible:ring-1 focus-visible:ring-[#141414]"
          role="img"
          aria-label={`Men in each army after every turn. ${sides.map(s => `${NATIONS[s.nation].adjective}: ${fmt(points[0].men[s.player])} to ${fmt(points[n - 1].men[s.player])}`).join('; ')}.`}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          {yTicks.map(t => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#e7e5e4" strokeWidth="1" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[#141414]/55 text-[10px] font-mono tabular-nums">{compact(t)}</text>
            </g>
          ))}
          {xTicks.map(({ p, i }) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-[#141414]/55 text-[10px] font-mono">
              {p.player === 0 ? 'Start' : `T${p.turn}`}
            </text>
          ))}
          {cur && <line x1={x(active!)} x2={x(active!)} y1={M.top} y2={M.top + plotH} stroke="#a8a29e" strokeWidth="1" />}
          {sides.map(s => (
            <path key={s.player} d={path(s.player)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {sides.map((s, k) => (
            <g key={s.player}>
              <circle cx={x(n - 1)} cy={endY[k]} r="4" fill={s.color} stroke="#ffffff" strokeWidth="2" />
              {endLabels && (
                <text x={x(n - 1) + 9} y={endY[k]} dy="0.32em" className="fill-[#141414] text-[11px] font-mono tabular-nums">{compact(points[n - 1].men[s.player])}</text>
              )}
            </g>
          ))}
          {cur && sides.map(s => (
            <circle key={s.player} cx={x(active!)} cy={y(cur.men[s.player])} r="4" fill={s.color} stroke="#ffffff" strokeWidth="2" />
          ))}
          <rect
            x={M.left - 6} y={M.top} width={plotW + 12} height={plotH} fill="transparent"
            onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setActive(null)}
          />
        </svg>
        {cur && (
          <div
            className="absolute top-1 pointer-events-none bg-white border border-[#141414]/20 shadow-md px-2.5 py-1.5 text-[10px] font-mono"
            // Beside the crosshair, on whichever side has room, and never past the chart's edges.
            style={{ left: x(active!) > W / 2 ? Math.max(0, x(active!) - 222) : Math.min(W - 214, x(active!) + 10), width: 212 }}
          >
            <div className="uppercase text-[#141414]/55 mb-1 whitespace-nowrap">{cur.label}</div>
            {sides.map(s => (
              <div key={s.player} className="flex items-center gap-1.5 whitespace-nowrap">
                <svg width="10" height="4" aria-hidden><line x1="0" y1="2" x2="10" y2="2" stroke={s.color} strokeWidth="2" strokeLinecap="round" /></svg>
                <span className="font-bold text-[#141414] tabular-nums">{fmt(cur.men[s.player])}</span>
                <span className="text-[#141414]/60">men · {cur.regiments[s.player]} regts · {NATIONS[s.nation].adjective}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <details className="text-[10px] font-mono">
        <summary className="cursor-pointer uppercase text-[#141414]/60 hover:text-[#141414]">Strength by turn (table)</summary>
        <div className="max-h-48 overflow-y-auto mt-2 border border-[#141414]/10">
          <table className="w-full tabular-nums">
            <thead className="sticky top-0 bg-[#f5f5f4] text-[#141414]/60 uppercase">
              <tr>
                <th className="text-left font-normal px-2 py-1">When</th>
                {sides.map(s => <th key={s.player} className="text-right font-normal px-2 py-1">{NATIONS[s.nation].adjective} men (regts)</th>)}
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i} className="border-t border-[#141414]/5">
                  <td className="px-2 py-0.5">{p.label}</td>
                  {sides.map(s => <td key={s.player} className="text-right px-2 py-0.5">{fmt(p.men[s.player])} ({p.regiments[s.player]})</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
