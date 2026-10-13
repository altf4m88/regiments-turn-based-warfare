import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Eye, Grid3x3, Map as MapIcon, Sparkles, Tag, Video, Volume2, VolumeX } from 'lucide-react';
import { GameState, Nation, Tile } from '../game/types';
import { NATIONS, getTerrainDefenseBonus, getTerrainMpCost, isAiPlayer, nationOf } from '../game/engine';
import { Battlefield, BattlefieldOptions, CameraView } from './scene/Battlefield';
import { HoverInfo } from './scene/highlights';
import { MAP_N, TILE } from './core/constants';

interface Props {
  gameState: GameState;
  mapRotation: number;
  aiMode: boolean;
  /** Phone-sized layout: icon-only toolbar, a smaller minimap and banner. */
  compact?: boolean;
  onTileClick: (x: number, y: number) => void;
  onTileHover: (tile: Tile | null) => void;
}

const TERRAIN_NAME: Record<Tile['terrain'], string> = {
  grass: 'Open Field',
  forest: 'Forest',
  mountain: 'Hills',
  river: 'River',
  buildings: 'Village',
  road: 'Road',
  command_center: 'Command Centre',
  supply_node: 'Supply Depot',
  capture_point: 'Capture Point',
};

const MINI_COLORS: Record<Tile['terrain'], string> = {
  grass: '#8aa24a',
  forest: '#4b6a2b',
  mountain: '#8d8a5a',
  river: '#3f7d8c',
  buildings: '#9a7b5a',
  road: '#b49c6c',
  command_center: '#e8e4d8',
  supply_node: '#e0b84a',
  capture_point: '#d9d3c2',
};

/** Per-army colours for the minimap and overlays: British red, French blue (literal Tailwind classes). */
const ARMY: Record<Nation, { tile: string; unit: string; light: string; banner: string; dark: string }> = {
  british: { tile: '#dc2626', unit: '#b91c1c', light: 'text-red-300', banner: 'text-red-200', dark: 'text-red-800' },
  french: { tile: '#2563eb', unit: '#1d4ed8', light: 'text-blue-300', banner: 'text-blue-200', dark: 'text-blue-800' },
};

const loadOpts = (aiMode: boolean): BattlefieldOptions => {
  const base: BattlefieldOptions = { labels: true, grid: true, follow: aiMode, sound: true, quality: 'high' };
  try {
    const raw = localStorage.getItem('regiments3d.options');
    if (raw) return { ...base, ...JSON.parse(raw), follow: aiMode };
  } catch {
    /* storage unavailable */
  }
  return base;
};

const ToolButton = ({ on, onClick, title, icon, label, compact }: {
  on?: boolean; onClick: () => void; title: string; icon: React.ReactNode; label: string; compact?: boolean;
}) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={compact ? title : undefined}
    aria-pressed={on}
    className={
      'flex items-center gap-1.5 border border-[#141414] text-[10px] uppercase font-bold tracking-tight transition-colors ' +
      (compact ? 'h-9 w-9 justify-center ' : 'h-8 px-2 ') +
      (on ? 'bg-[#141414] text-[#E4E3E0]' : 'bg-[#E4E3E0]/90 hover:bg-[#141414] hover:text-[#E4E3E0]')
    }
  >
    {icon}{!compact && ` ${label}`}
  </button>
);

const Minimap = ({ state, view, onPick, size = 156 }: { state: GameState; view: CameraView | null; onPick: (x: number, z: number) => void; size?: number }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const SIZE = size;
  const s = SIZE / MAP_N;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, SIZE, SIZE);
    for (const row of state.map) for (const t of row) {
      g.fillStyle = MINI_COLORS[t.terrain];
      g.fillRect(t.x * s, t.y * s, s + 0.5, s + 0.5);
      if (t.owner) {
        g.strokeStyle = ARMY[nationOf(state, t.owner)].tile;
        g.lineWidth = 1.5;
        g.strokeRect(t.x * s + 1, t.y * s + 1, s - 2, s - 2);
      }
    }
    for (const r of state.regiments) {
      g.fillStyle = ARMY[nationOf(state, r.owner)].unit;
      const pad = r.type === 'cannon' ? 2.2 : 1.4;
      g.fillRect(r.x * s + pad, r.y * s + pad, s - pad * 2, s - pad * 2);
      if (r.id === state.selectedUnitId) {
        g.strokeStyle = '#facc15';
        g.lineWidth = 2;
        g.strokeRect(r.x * s + 0.5, r.y * s + 0.5, s - 1, s - 1);
      }
    }
    if (view) {
      const k = SIZE / (MAP_N * TILE);
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineWidth = 1.2;
      g.beginPath();
      view.corners.forEach((p, i) => (i ? g.lineTo(p.x * k, p.z * k) : g.moveTo(p.x * k, p.z * k)));
      g.closePath();
      g.stroke();
      g.fillStyle = '#fff';
      g.fillRect(view.target.x * k - 1.5, view.target.z * k - 1.5, 3, 3);
    }
  }, [state, view, s, SIZE]);
  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onPick(((e.clientX - r.left) / r.width) * MAP_N * TILE, ((e.clientY - r.top) / r.height) * MAP_N * TILE);
  };
  return (
    <canvas
      ref={ref}
      width={SIZE}
      height={SIZE}
      onPointerDown={pick}
      onPointerMove={e => e.buttons & 1 && pick(e)}
      className="block cursor-crosshair"
      style={{ width: SIZE, height: SIZE, imageRendering: 'pixelated' }}
    />
  );
};

export default function BattlefieldView({ gameState, mapRotation, aiMode, compact = false, onTileClick, onTileHover }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const bfRef = useRef<Battlefield | null>(null);
  const clickRef = useRef(onTileClick);
  const hoverRef = useRef(onTileHover);
  const stateRef = useRef(gameState);
  clickRef.current = onTileClick;
  hoverRef.current = onTileHover;
  stateRef.current = gameState;

  const [opts, setOpts] = useState<BattlefieldOptions>(() => loadOpts(aiMode));
  const [hover, setHover] = useState<{ info: HoverInfo; screen: { x: number; y: number } } | null>(null);
  const [view, setView] = useState<CameraView | null>(null);
  const [showHelp, setShowHelp] = useState(true);
  // Touch screens get tap and pinch wording in the help.
  const touch = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches, []);
  const [failed, setFailed] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ key: number; turn: number; player: number } | null>(null);
  const lastTurnRef = useRef<string | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let bf: Battlefield;
    try {
      bf = new Battlefield(el, {
        onTileClick: (x, y) => clickRef.current(x, y),
        onHover: (info, screen) => {
          setHover(info && screen ? { info, screen } : null);
          const s = stateRef.current;
          hoverRef.current(info ? s.map[info.y]?.[info.x] ?? null : null);
        },
        onCamera: v => setView(v),
      }, opts);
    } catch (err) {
      console.error(err);
      setFailed('WebGL is not available in this browser, so the 3D battlefield cannot be shown. Switch to the 2D view.');
      return;
    }
    bfRef.current = bf;
    bf.setRotation(mapRotation);
    bf.update(stateRef.current);
    const t = setTimeout(() => setShowHelp(false), 9000);
    return () => {
      clearTimeout(t);
      bf.dispose();
      bfRef.current = null;
    };
    // The battlefield is created once; later props flow in through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bfRef.current?.update(gameState);
  }, [gameState]);

  // Announce each new turn with a banner across the battlefield.
  useEffect(() => {
    const key = `${gameState.turn}:${gameState.currentPlayer}`;
    if (lastTurnRef.current === key) return;
    const first = lastTurnRef.current === null;
    lastTurnRef.current = key;
    if (first || gameState.winner) return;
    setBanner({ key: Date.now(), turn: gameState.turn, player: gameState.currentPlayer });
    const t = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(t);
  }, [gameState.turn, gameState.currentPlayer, gameState.winner]);

  useEffect(() => {
    bfRef.current?.setRotation(mapRotation);
  }, [mapRotation]);

  useEffect(() => {
    bfRef.current?.setOptions(opts);
    try {
      localStorage.setItem('regiments3d.options', JSON.stringify(opts));
    } catch {
      /* storage unavailable */
    }
  }, [opts]);

  useEffect(() => {
    setOpts(o => ({ ...o, follow: aiMode }));
  }, [aiMode]);

  const toggle = (k: keyof BattlefieldOptions) => setOpts(o => ({ ...o, [k]: !o[k] }));

  const tooltip = useMemo(() => {
    if (!hover) return null;
    const { info } = hover;
    const tile = gameState.map[info.y]?.[info.x];
    if (!tile) return null;
    const unit = gameState.regiments.find(r => r.x === info.x && r.y === info.y);
    const def = Math.round(getTerrainDefenseBonus(tile.terrain) * 100);
    return { tile, unit, def, info };
  }, [hover, gameState]);

  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-8 text-center font-mono text-xs uppercase opacity-60">{failed}</div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden select-none" onContextMenu={e => e.preventDefault()}>
      <div ref={mountRef} className="absolute inset-0" />

      {/* Toolbar */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-1 z-10 max-w-[calc(100%-1.5rem)]">
        <ToolButton compact={compact} on={opts.labels} onClick={() => toggle('labels')} title="Regiment labels" icon={<Tag size={compact ? 14 : 12} />} label="Labels" />
        <ToolButton compact={compact} on={opts.grid} onClick={() => toggle('grid')} title="Tile grid" icon={<Grid3x3 size={compact ? 14 : 12} />} label="Grid" />
        <ToolButton compact={compact} on={opts.follow} onClick={() => toggle('follow')} title="Camera follows the action" icon={<Video size={compact ? 14 : 12} />} label="Follow" />
        <ToolButton compact={compact} on={opts.sound} onClick={() => toggle('sound')} title="Battle sounds" icon={opts.sound ? <Volume2 size={compact ? 14 : 12} /> : <VolumeX size={compact ? 14 : 12} />} label="Sound" />
        <ToolButton compact={compact} on={opts.quality === 'high'} onClick={() => setOpts(o => ({ ...o, quality: o.quality === 'high' ? 'low' : 'high' }))} title="Shadows and full-resolution rendering" icon={<Sparkles size={compact ? 14 : 12} />} label={opts.quality === 'high' ? 'High' : 'Low'} />
        <ToolButton compact={compact} onClick={() => bfRef.current?.overview()} title="Overview (Home)" icon={<MapIcon size={compact ? 14 : 12} />} label="Overview" />
        {gameState.selectedUnitId && (
          <ToolButton
            onClick={() => {
              const u = gameState.regiments.find(r => r.id === gameState.selectedUnitId);
              if (u) bfRef.current?.focusTile(u.x, u.y);
            }}
            title="Focus selected regiment (F)"
            compact={compact}
            icon={<Crosshair size={compact ? 14 : 12} />}
            label="Focus"
          />
        )}
      </div>

      {/* Minimap */}
      <div className={'absolute z-10 border-2 border-[#141414] bg-[#141414] shadow-xl ' + (compact ? 'bottom-2 left-2' : 'bottom-3 left-3')}>
        <Minimap state={gameState} view={view} size={compact ? 92 : 156} onPick={(x, z) => bfRef.current?.focusWorld(x, z)} />
        <div className="flex justify-between px-1.5 py-0.5 text-[8px] font-mono uppercase text-[#E4E3E0]/70">
          <span>Turn {gameState.turn}</span>
          <span className={ARMY[nationOf(gameState, gameState.currentPlayer)].light}>P{gameState.currentPlayer} to move</span>
        </div>
      </div>

      {/* Controls help */}
      <div
        className={
          'absolute z-10 bg-[#141414]/85 text-[#E4E3E0] px-3 py-2 text-[9px] font-mono uppercase leading-relaxed transition-opacity duration-700 pointer-events-none ' +
          (compact ? 'bottom-2 left-[110px] right-2 max-w-sm ' : 'bottom-3 left-[180px] hidden md:block ') +
          (showHelp ? 'opacity-100' : 'opacity-0')
        }
      >
        <div className="flex items-center gap-1 opacity-60 mb-0.5"><Eye size={10} /> Field glass</div>
        {touch ? (
          <>Tap: select / march / engage · Drag: pan<br />Pinch: zoom · Two-finger twist: rotate · Double-tap: focus</>
        ) : (
          <>Click: select / move / attack · Drag: pan · Right-drag: rotate<br />
          Wheel: zoom · WASD: pan · Q/E: rotate · Dbl-click / F: focus · Home: overview</>
        )}
      </div>

      {/* Turn banner */}
      {banner && (
        <div key={banner.key} className="bf-turn-banner absolute left-1/2 top-[18%] z-20 pointer-events-none text-center">
          <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-[#E4E3E0]/80">Turn {banner.turn}</div>
          <div className={(compact ? 'text-2xl ' : 'text-4xl ') + 'font-serif italic font-bold tracking-tight whitespace-nowrap ' + ARMY[nationOf(gameState, banner.player)].banner}>
            The {NATIONS[nationOf(gameState, banner.player)].adjective} march
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#E4E3E0]/70 mt-1">
            Player {banner.player}
            {gameState.gameMode === 'versus' && (isAiPlayer(gameState, banner.player) ? ' · AI general' : ' · Your command')}
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      {tooltip && hover && (
        <div
          className="absolute z-20 pointer-events-none bg-[#E4E3E0] border border-[#141414] shadow-lg px-2.5 py-1.5 text-[10px] font-mono leading-snug min-w-[140px]"
          style={{ left: Math.min(hover.screen.x + 16, (mountRef.current?.clientWidth ?? 9999) - 190), top: hover.screen.y + 14 }}
        >
          <div className="flex justify-between gap-3 font-bold uppercase">
            <span>{TERRAIN_NAME[tooltip.tile.terrain]}</span>
            <span className="opacity-50">{tooltip.info.x}:{tooltip.info.y}</span>
          </div>
          <div className="opacity-70">
            {getTerrainMpCost(tooltip.tile.terrain)} MP · {tooltip.def >= 0 ? '+' : ''}{tooltip.def}% def
            {tooltip.tile.owner ? ` · P${tooltip.tile.owner}` : ''}
          </div>
          {tooltip.unit && (
            <div className={'mt-1 pt-1 border-t border-[#141414]/20 ' + ARMY[nationOf(gameState, tooltip.unit.owner)].dark}>
              <div className="font-bold">{tooltip.unit.name}</div>
              <div className="opacity-80">{tooltip.unit.id} · {tooltip.unit.men}/{tooltip.unit.maxMen} men · {tooltip.unit.mp} MP</div>
            </div>
          )}
          {tooltip.info.attack && <div className="mt-1 font-bold text-red-700 uppercase">⚔ Click to engage</div>}
          {tooltip.info.path && tooltip.info.cost !== null && (
            <div className="mt-1 font-bold text-blue-800 uppercase">→ March here · {tooltip.info.cost} MP</div>
          )}
        </div>
      )}
    </div>
  );
}
