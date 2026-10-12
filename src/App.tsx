/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Sword, 
  Move, 
  Users, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  RotateCcw, 
  Flag,
  Target,
  Info,
  RotateCw,
  MapPin,
  Square,
  Fence,
  ArrowUp,
  Crosshair,
  Zap,
  Wind,
  Footprints,
  Compass,
  Trees,
  Mountain,
  Home,
  Route,
  Bomb,
  CircleDot,
  Terminal,
  Settings,
  Cpu,
  Minus,
  X,
  Box,
  LayoutGrid
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { Client } from "langsmith";
import { Regiment, Tile, GameState, UnitType, Facing, GameAnimation, AiConfig, AiProvider, Nation, ThinkingLevelSetting } from './game/types';
import { getInitialState, getTerrainMpCost, isTargetInFiringLine, getZoCStatus, getTerrainDefenseBonus, UNIT_COSTS, SUPPLY_PER_TURN, SUPPLY_NODE_BONUS, createInitialRegiment, findPath, resolveAttack, nextRegimentId, parseUnitType, NATIONS, nationOf, nationsFor } from './game/engine';
import { AI_MODELS, AI_PROVIDERS, THINKING_LEVELS, resolveAiModel } from './ai/models';
import { AiSession, startAiSession } from './ai/session';
import { Markdown, plainText } from './ui/Markdown';

// The 3D battlefield (three.js) is code-split so the 2D view stays light.
const BattlefieldView = lazy(() => import('./three/BattlefieldView'));

/** Team colours follow the army: British red, French blue. Literal class names so Tailwind keeps them. */
const SIDE_UI: Record<Nation, {
  text: string; textSoft: string; bubble: string; chip: string; unit: string;
  ring40: string; ring60: string; ring80: string; archive: string; pick: string;
}> = {
  british: {
    text: 'text-red-700', textSoft: 'text-red-600', bubble: 'text-red-900 border-red-900', chip: 'bg-red-100',
    unit: 'bg-red-600 border-red-900 text-white', ring40: 'border-red-500/40', ring60: 'border-red-500/60',
    ring80: 'border-red-500/80', archive: 'border-red-500 bg-red-50/50', pick: 'border-red-700 bg-red-50 text-red-900',
  },
  french: {
    text: 'text-blue-700', textSoft: 'text-blue-600', bubble: 'text-blue-900 border-blue-900', chip: 'bg-blue-100',
    unit: 'bg-blue-600 border-blue-900 text-white', ring40: 'border-blue-500/40', ring60: 'border-blue-500/60',
    ring80: 'border-blue-500/80', archive: 'border-blue-500 bg-blue-50/50', pick: 'border-blue-700 bg-blue-50 text-blue-900',
  },
};

const NATION_BLURB: Record<Nation, string> = {
  british: 'Redcoats · Rifles · Royal Artillery · Hussars',
  french: 'Imperial blue · Voltigeurs · Hussards · Chasseurs à cheval',
};

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TILE_SIZE = 48;

const GameAnimations = ({ animations, mapRotation }: { animations: GameAnimation[], mapRotation: number }) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-50">
      <AnimatePresence>
        {animations.map(anim => {
          const fromX = anim.fromX * TILE_SIZE + TILE_SIZE / 2;
          const fromY = anim.fromY * TILE_SIZE + TILE_SIZE / 2;
          const toX = anim.toX !== undefined ? anim.toX * TILE_SIZE + TILE_SIZE / 2 : fromX;
          const toY = anim.toY !== undefined ? anim.toY * TILE_SIZE + TILE_SIZE / 2 : fromY;

          if (anim.type === 'move') {
            return (
              <motion.div
                key={anim.id}
                initial={{ x: fromX, y: fromY, opacity: 0.5, scale: 0.5 }}
                animate={{ x: toX, y: toY, opacity: 0, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
                className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-white/20 blur-md"
              />
            );
          }

          if (anim.type === 'attack') {
            return (
              <div key={anim.id} className="absolute pointer-events-none">
                {/* Muzzle Flash */}
                <motion.div
                  initial={{ x: fromX, y: fromY, opacity: 1, scale: 0.5 }}
                  animate={{ opacity: 0, scale: 2 }}
                  transition={{ duration: 0.2 }}
                  className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-orange-400 blur-sm"
                />
                
                {anim.unitType === 'cannon' ? (
                  <motion.div
                    initial={{ x: fromX, y: fromY, opacity: 1, scale: 1.5 }}
                    animate={{ x: toX, y: toY, opacity: 0.5, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-gray-800 shadow-[0_0_15px_#1f2937]"
                  />
                ) : (anim.unitType === 'hussars' || anim.unitType === 'chasseurs') ? (
                  <motion.div
                    initial={{ x: fromX, y: fromY, opacity: 1, scale: 1, rotate: -mapRotation }}
                    animate={{ x: toX, y: toY, opacity: 0, scale: 1.2, rotate: 45 - mapRotation }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute -ml-4 -mt-4 text-white"
                  >
                    <Sword size={32} />
                  </motion.div>
                ) : (
                  [...Array(5)].map((_, i) => (
                    <motion.div
                      key={`${anim.id}-${i}`}
                      initial={{ x: fromX + (Math.random() - 0.5) * 20, y: fromY + (Math.random() - 0.5) * 20, opacity: 1, scale: 0.5 }}
                      animate={{ x: toX + (Math.random() - 0.5) * 40, y: toY + (Math.random() - 0.5) * 40, opacity: 0, scale: 1 }}
                      transition={{ duration: 0.4, delay: i * 0.05 }}
                      className="absolute w-2 h-2 rounded-full bg-white/80 blur-[1px]"
                    />
                  ))
                )}
              </div>
            );
          }

          if (anim.type === 'damage') {
            return (
              <motion.div
                key={anim.id}
                initial={{ x: fromX, y: fromY, opacity: 0, scale: 0.5, rotate: -mapRotation }}
                animate={{ opacity: 1, scale: 1.2, y: fromY - 40, rotate: -mapRotation }}
                exit={{ opacity: 0 }}
                className="absolute -ml-4 -mt-8 text-red-600 font-bold text-lg z-[60] drop-shadow-sm"
              >
                -{anim.damage}
              </motion.div>
            );
          }

          if (anim.type === 'entrench') {
            return (
              <motion.div
                key={anim.id}
                initial={{ x: fromX, y: fromY, opacity: 0, scale: 0, rotate: -mapRotation }}
                animate={{ opacity: 1, scale: 1.5, rotate: -mapRotation }}
                exit={{ opacity: 0 }}
                className="absolute -ml-4 -mt-4 text-blue-500"
              >
                <Shield size={32} />
              </motion.div>
            );
          }

          if (anim.type === 'box_formation') {
            return (
              <motion.div
                key={anim.id}
                initial={{ x: fromX, y: fromY, opacity: 0, scale: 0, rotate: -mapRotation }}
                animate={{ opacity: 1, scale: 1.5, rotate: -mapRotation }}
                exit={{ opacity: 0 }}
                className="absolute -ml-4 -mt-4 text-gray-800"
              >
                <Square size={32} />
              </motion.div>
            );
          }

          if (anim.type === 'palisade') {
            return (
              <motion.div
                key={anim.id}
                initial={{ x: fromX, y: fromY, opacity: 0, scale: 0, rotate: -mapRotation }}
                animate={{ opacity: 1, scale: 1.5, rotate: -mapRotation }}
                exit={{ opacity: 0 }}
                className="absolute -ml-4 -mt-4 text-amber-800"
              >
                <Fence size={32} />
              </motion.div>
            );
          }

          return null;
        })}
      </AnimatePresence>
    </div>
  );
};

const UnitIcon = ({ type }: { type: UnitType }) => {
  switch (type) {
    case 'line_infantry': return <Users size={24} strokeWidth={2.5} />;
    case 'light_infantry': return <Footprints size={22} />;
    case 'cannon': return <Crosshair size={24} strokeWidth={2.5} />;
    case 'hussars': return <Sword size={24} />;
    case 'chasseurs': return <Wind size={22} />;
    default: return <Users size={20} />;
  }
};

const AiConfigModal = ({ 
  isOpen, 
  onClose, 
  aiConfigs, 
  onSave,
  nations
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  aiConfigs: { [key: number]: AiConfig };
  onSave: (configs: { [key: number]: AiConfig }) => void;
  nations: { [player: number]: Nation };
}) => {
  const [localConfigs, setLocalConfigs] = useState(aiConfigs);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#E4E3E0] border-2 border-[#141414] p-8 max-w-2xl w-full max-h-full overflow-y-auto shadow-2xl flex flex-col gap-6"
      >
        <div className="flex justify-between items-center border-b border-[#141414] pb-4">
          <h2 className="text-2xl font-bold uppercase tracking-tight">AI General Configuration</h2>
          <button onClick={onClose} className="hover:rotate-90 transition-transform">
            <X size={24} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {[1, 2].map(playerNum => {
            const config = localConfigs[playerNum];
            const ai = resolveAiModel(config);
            const update = (patch: Partial<AiConfig>) => setLocalConfigs(prev => ({ ...prev, [playerNum]: { ...prev[playerNum], ...patch } }));
            return (
            <div key={playerNum} className="space-y-4 p-4 border border-[#141414]/20 bg-white/50">
              <h3 className={cn("font-bold uppercase text-sm border-b border-[#141414] pb-2", SIDE_UI[nations[playerNum]].text)}>Player {playerNum} · {NATIONS[nations[playerNum]].adjective}</h3>
              
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold opacity-60">AI Provider</label>
                <div className="grid grid-cols-2 border border-[#141414]" role="radiogroup" aria-label={`Player ${playerNum}'s AI provider`}>
                  {(['gemini', 'claude'] as AiProvider[]).map(p => (
                    <button
                      key={p}
                      role="radio"
                      aria-checked={ai.provider === p}
                      onClick={() => update({ provider: p })}
                      className={cn(
                        "p-2 text-left transition-all",
                        ai.provider === p ? "bg-[#141414] text-[#E4E3E0]" : "bg-white hover:bg-[#141414]/10"
                      )}
                    >
                      <span className="block text-xs font-bold uppercase">{AI_PROVIDERS[p].label}</span>
                      <span className="block text-[9px] font-mono uppercase opacity-60">{AI_PROVIDERS[p].vendor}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold opacity-60">{AI_PROVIDERS[ai.provider].label} API Key</label>
                <input 
                  type="password"
                  value={ai.apiKey}
                  onChange={(e) => update(ai.provider === 'claude' ? { claudeApiKey: e.target.value } : { apiKey: e.target.value })}
                  placeholder={AI_PROVIDERS[ai.provider].keyPlaceholder}
                  className="w-full p-2 bg-white border border-[#141414] font-mono text-xs focus:ring-1 focus:ring-[#141414] outline-none"
                />
                <p className="text-[9px] font-mono opacity-50">{AI_PROVIDERS[ai.provider].keyHint}</p>
              </div>

              {ai.provider === 'gemini' && (
                <div className="flex items-center gap-2 pt-1">
                  <input 
                    type="checkbox"
                    id={`vertex-${playerNum}`}
                    checked={config.useVertexAI || false}
                    onChange={(e) => update({ useVertexAI: e.target.checked })}
                    className="accent-[#141414]"
                  />
                  <label htmlFor={`vertex-${playerNum}`} className="text-[10px] uppercase font-bold opacity-60 cursor-pointer">Use Vertex AI (Google Cloud)</label>
                </div>
              )}

              {ai.provider === 'gemini' && config.useVertexAI && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold opacity-60">Project ID</label>
                    <input 
                      type="text"
                      value={config.projectId || ''}
                      onChange={(e) => update({ projectId: e.target.value })}
                      placeholder="my-project-id"
                      className="w-full p-2 bg-white border border-[#141414] font-mono text-[10px] focus:ring-1 focus:ring-[#141414] outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold opacity-60">Location</label>
                    <input 
                      type="text"
                      value={config.location || ''}
                      onChange={(e) => update({ location: e.target.value })}
                      placeholder="us-central1"
                      className="w-full p-2 bg-white border border-[#141414] font-mono text-[10px] focus:ring-1 focus:ring-[#141414] outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold opacity-60">Model Selection</label>
                <select 
                  value={ai.model}
                  onChange={(e) => update(ai.provider === 'claude' ? { claudeModel: e.target.value } : { model: e.target.value })}
                  className="w-full p-2 bg-white border border-[#141414] font-mono text-xs focus:ring-1 focus:ring-[#141414] outline-none"
                >
                  {AI_MODELS[ai.provider].map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold opacity-60">Thinking Level</label>
                <select
                  value={ai.thinkingLevel}
                  onChange={(e) => update({ thinkingLevel: e.target.value as ThinkingLevelSetting })}
                  className="w-full p-2 bg-white border border-[#141414] font-mono text-xs focus:ring-1 focus:ring-[#141414] outline-none"
                >
                  {THINKING_LEVELS.map(l => (
                    <option key={l.id} value={l.id}>{l.label}: {l.hint}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 pt-2 border-t border-[#141414]/10">
                <label className="text-[10px] uppercase font-bold opacity-60">LangSmith API Key (Optional)</label>
                <input 
                  type="password"
                  value={localConfigs[playerNum].langsmithApiKey || ''}
                  onChange={(e) => setLocalConfigs(prev => ({
                    ...prev,
                    [playerNum]: { ...prev[playerNum], langsmithApiKey: e.target.value }
                  }))}
                  placeholder="ls__..."
                  className="w-full p-2 bg-white border border-[#141414] font-mono text-xs focus:ring-1 focus:ring-[#141414] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold opacity-60">LangSmith Project</label>
                <input 
                  type="text"
                  value={localConfigs[playerNum].langsmithProject || ''}
                  onChange={(e) => setLocalConfigs(prev => ({
                    ...prev,
                    [playerNum]: { ...prev[playerNum], langsmithProject: e.target.value }
                  }))}
                  className="w-full p-2 bg-white border border-[#141414] font-mono text-xs focus:ring-1 focus:ring-[#141414] outline-none"
                />
              </div>
            </div>
            );
          })}
        </div>

        <div className="text-[10px] uppercase opacity-50 font-mono leading-relaxed">
          * Your API keys are kept in memory only and never saved to any server; requests go straight from this browser to Google or Anthropic.
          Pit Gemini against Claude, or give each side a different model or thinking level, to see how they compete tactically.
        </div>

        <div className="flex gap-4 mt-4">
          <button 
            onClick={() => {
              onSave(localConfigs);
              onClose();
            }}
            className="flex-1 bg-[#141414] text-[#E4E3E0] p-3 uppercase font-bold hover:bg-opacity-90 transition-all"
          >
            Deploy AI Generals
          </button>
          <button 
            onClick={onClose}
            className="px-6 border border-[#141414] uppercase font-bold hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>(getInitialState());
  const [hoveredTile, setHoveredTile] = useState<Tile | null>(null);
  const [mapRotation, setMapRotation] = useState(0);
  const [commandInput, setCommandInput] = useState('');
  const [commandError, setCommandError] = useState<string | null>(null);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiMonologue, setAiMonologue] = useState<string | null>(null);
  const [dispatchExpanded, setDispatchExpanded] = useState(false);
  const [dispatchMinimized, setDispatchMinimized] = useState(() => {
    try {
      return localStorage.getItem('regiments.dispatch') === 'minimized';
    } catch {
      return false;
    }
  });
  const [aiInstructions, setAiInstructions] = useState<string>('');
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>(() => {
    try {
      return localStorage.getItem('regiments.view') === '2d' ? '2d' : '3d';
    } catch {
      return '3d';
    }
  });
  const [p1Nation, setP1Nation] = useState<Nation>(() => {
    try {
      return localStorage.getItem('regiments.p1Nation') === 'french' ? 'french' : 'british';
    } catch {
      return 'british';
    }
  });
  const aiTurnRef = useRef<{ turn: number, player: number } | null>(null);
  const side = (player: number) => SIDE_UI[nationOf(gameState, player)];

  useEffect(() => {
    try {
      localStorage.setItem('regiments.dispatch', dispatchMinimized ? 'minimized' : 'open');
    } catch {
      /* storage unavailable */
    }
  }, [dispatchMinimized]);

  // Each new dispatch starts as a short preview.
  useEffect(() => setDispatchExpanded(false), [aiMonologue]);

  useEffect(() => {
    try {
      localStorage.setItem('regiments.view', viewMode);
    } catch {
      /* storage unavailable */
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem('regiments.p1Nation', p1Nation);
    } catch {
      /* storage unavailable */
    }
  }, [p1Nation]);

  /** Fresh battle with the chosen armies (the map is regenerated too). */
  const startGame = (mode: 'manual' | 'ai', aiConfigs: { [key: number]: AiConfig }) => {
    aiTurnRef.current = null;
    setGameState({ ...getInitialState(nationsFor(p1Nation)), gameMode: mode, aiConfigs });
  };

  useEffect(() => {
    fetch('/llm_instruction.md')
      .then(res => res.text())
      .then(text => setAiInstructions(text))
      .catch(err => console.error("Failed to load AI instructions", err));
  }, []);

  useEffect(() => {
    if (gameState.gameMode === 'ai') {
      setMapRotation(gameState.currentPlayer === 1 ? 0 : 180);
    }
  }, [gameState.currentPlayer, gameState.gameMode]);

  const getGameStateString = useCallback((state: GameState = gameState) => {
    let stateStr = `--- BATTLEFIELD STATUS (Turn ${state.turn}) ---\n`;
    stateStr += `Armies: Player 1 = ${NATIONS[nationOf(state, 1)].adjective}, Player 2 = ${NATIONS[nationOf(state, 2)].adjective}\n`;
    stateStr += `Current Player: Player ${state.currentPlayer}\n`;
    stateStr += `Supply: P1: ${state.supply[1]}, P2: ${state.supply[2]}\n`;
    stateStr += `Capture Point (10:10): ${state.capturePointOwner ? `Owned by P${state.capturePointOwner} (${state.capturePointTurns}/5 turns)` : 'Uncaptured'}\n\n`;

    // Objectives and terrain, so a general never has to spend an iteration on reconnaissance.
    const tiles = state.map.flat();
    const at = (t: Tile) => `${t.x}:${t.y}`;
    stateStr += `--- OBJECTIVES ---\n`;
    stateStr += `Command Centers (move any regiment onto the enemy's to win at once): ${tiles.filter(t => t.terrain === 'command_center').map(t => `P${t.owner} at ${at(t)}`).join(', ')}\n`;
    stateStr += `Supply Nodes (+${SUPPLY_NODE_BONUS} supply per turn each to the owner; move onto one to take it): ${tiles.filter(t => t.terrain === 'supply_node').map(t => `${at(t)} (${t.owner ? `P${t.owner}` : 'neutral'})`).join(', ') || 'none'}\n\n`;
    const glyph: Partial<Record<Tile['terrain'], string>> = { grass: '.', road: '=', forest: 'F', mountain: 'H', river: '~', buildings: 'B', supply_node: 'S', capture_point: 'X' };
    stateStr += `--- MAP (x = column 0-19 west to east, y = row 0-19 north to south) ---\n`;
    stateStr += `Legend: . open field, = road (0.5 MP), F forest, H hills (2 MP), ~ river (3 MP), B village, S supply node, X capture point, 1/2 command centers\n`;
    stateStr += `      ${'0'.repeat(10)}${'1'.repeat(10)}\n      ${'0123456789'.repeat(2)}\n`;
    state.map.forEach((row, y) => {
      stateStr += `y=${String(y).padStart(2)}  ${row.map(t => (t.terrain === 'command_center' ? String(t.owner ?? '?') : glyph[t.terrain] ?? '?')).join('')}\n`;
    });
    stateStr += `\n`;
    
    stateStr += `--- REGIMENTS ---\n`;
    state.regiments.forEach(r => {
      stateStr += `ID: ${r.id} | Name: ${r.name} | Owner: P${r.owner} | Type: ${r.type} | Pos: ${r.x}:${r.y} | Facing: ${r.facing} | Men: ${r.men}/${r.maxMen} | MP: ${r.mp}/${r.maxMp} | Range: ${r.range} | Entrenched: ${r.isEntrenched} | Box: ${r.isBoxFormation} | Palisaded: ${r.isPalisaded} | Attacked: ${r.hasAttacked}\n`;
    });

    stateStr += `\n--- RECENT BATTLEFIELD LOGS ---\n`;
    stateStr += state.battlefieldLogs.slice(0, 10).join('\n');

    stateStr += `\n\n--- RECENT COMMAND HISTORY ---\n`;
    stateStr += state.cliHistory.slice(0, 10).join('\n');
    
    return stateStr;
  }, [gameState]);

  const addBattlefieldLog = (msg: string) => {
    setGameState(prev => ({
      ...prev,
      battlefieldLogs: [msg, ...prev.battlefieldLogs].slice(0, 20)
    }));
  };

  const addCliOutput = (msg: string) => {
    setGameState(prev => ({
      ...prev,
      cliHistory: [msg, ...prev.cliHistory].slice(0, 50)
    }));
  };

  const addAnimation = (anim: Omit<GameAnimation, 'id' | 'timestamp'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const timestamp = Date.now();
    setGameState(prev => ({
      ...prev,
      animations: [...prev.animations, { ...anim, id, timestamp }]
    }));
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setGameState(prev => {
        const filtered = prev.animations.filter(a => now - a.timestamp < 1000);
        if (filtered.length === prev.animations.length) return prev;
        return { ...prev, animations: filtered };
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const rotateView = () => {
    setMapRotation(prev => (prev + 90) % 360);
    addBattlefieldLog("Adjusting tactical view perspective.");
  };

  const selectedUnit = gameState.regiments.find(r => r.id === gameState.selectedUnitId);

  const handleTileClick = (x: number, y: number) => {
    if (gameState.winner) return;

    const unitAtTile = gameState.regiments.find(r => r.x === x && r.y === y);

    if (selectedUnit && selectedUnit.owner === gameState.currentPlayer) {
      if (unitAtTile && unitAtTile.owner !== gameState.currentPlayer) {
        const dist = Math.max(Math.abs(selectedUnit.x - x), Math.abs(selectedUnit.y - y));
        const inFiringLine = isTargetInFiringLine(selectedUnit, x, y);
        
        if (dist <= selectedUnit.range && !selectedUnit.hasAttacked && selectedUnit.mp >= 1) {
          if (!inFiringLine) {
            if (selectedUnit.isPalisaded) {
              addBattlefieldLog("Palisaded cannons have a limited firing arc!");
            } else {
              addBattlefieldLog("Line Infantry can only shoot straight!");
            }
            return;
          }
          performAttack(selectedUnit, unitAtTile);
          return;
        }
      }

      if (!unitAtTile) {
        if (selectedUnit.isBoxFormation) {
          addBattlefieldLog("Line Infantry cannot move while in Box Formation!");
          return;
        }
        if (selectedUnit.isEntrenched) {
          addBattlefieldLog("Entrenched troops must leave their earthworks before they can move!");
          return;
        }
        const dist = Math.max(Math.abs(selectedUnit.x - x), Math.abs(selectedUnit.y - y));
        const tile = gameState.map[y][x];
        const cost = getTerrainMpCost(tile.terrain);
        
        if (dist === 1 && selectedUnit.mp >= cost) {
          const zocStatus = getZoCStatus(x, y, selectedUnit, gameState.regiments);
          if (!zocStatus.canPass) {
            addBattlefieldLog("Infantry cannot bypass enemy line formation!");
            return;
          }
          performMove(selectedUnit, x, y, cost);
          return;
        }
      }
    }

    if (unitAtTile) {
      setGameState(prev => ({ ...prev, selectedUnitId: unitAtTile.id }));
    } else {
      setGameState(prev => ({ ...prev, selectedUnitId: null }));
    }
  };

  // In 3D, clicking a distant reachable tile marches there via the engine's `mv`
  // command (same pathfinding and MP rules the CLI and AI generals use).
  const handleTileClick3D = (x: number, y: number) => {
    if (!gameState.winner && selectedUnit && selectedUnit.owner === gameState.currentPlayer) {
      const occupied = gameState.regiments.some(r => r.x === x && r.y === y);
      const dist = Math.max(Math.abs(selectedUnit.x - x), Math.abs(selectedUnit.y - y));
      if (!occupied && dist > 1 && !selectedUnit.isBoxFormation && !selectedUnit.isPalisaded && !selectedUnit.isEntrenched) {
        const route = findPath({ x: selectedUnit.x, y: selectedUnit.y }, { x, y }, selectedUnit, gameState.regiments, gameState.map);
        if (route && route.cost <= selectedUnit.mp) {
          executeCommand(`mv ${selectedUnit.id} ${x}:${y}`);
          return;
        }
      }
    }
    handleTileClick(x, y);
  };

  const performMove = (unit: Regiment, x: number, y: number, cost: number) => {
    if (unit.isPalisaded) {
      addBattlefieldLog(`[${unit.id}] ${unit.name} cannot move while palisaded!`);
      return;
    }
    if (unit.isEntrenched) {
      addBattlefieldLog(`[${unit.id}] ${unit.name} must leave its earthworks before it can move!`);
      return;
    }
    let newFacing = unit.facing;
    if (x > unit.x) newFacing = 'east';
    else if (x < unit.x) newFacing = 'west';
    else if (y > unit.y) newFacing = 'south';
    else if (y < unit.y) newFacing = 'north';

    const zocStatus = getZoCStatus(x, y, unit, gameState.regiments);
    let damageTaken = 0;
    if (zocStatus.takesDamage) {
      damageTaken = Math.floor(unit.men * 0.15);
      addBattlefieldLog(`[${unit.id}] ${unit.name} took fire while bypassing enemy line! (-${damageTaken} men)`);
      if (damageTaken >= unit.men) {
        addBattlefieldLog(`[${unit.id}] ${unit.name} has been routed!`);
      }
    }

    setGameState(prev => {
      const newRegiments = prev.regiments.map(r => 
        r.id === unit.id ? { ...r, x, y, men: Math.max(0, r.men - damageTaken), mp: r.mp - cost, isEntrenched: false, facing: newFacing } : r
      ).filter(r => r.men > 0);

      const isUnitAlive = newRegiments.some(r => r.id === unit.id);
      const targetTile = prev.map[y][x];
      let winner = prev.winner;
      let newMap = prev.map;
      let capturePointOwner = prev.capturePointOwner;
      let capturePointTurns = prev.capturePointTurns;

      if (isUnitAlive && targetTile.terrain === 'command_center' && targetTile.owner !== unit.owner) {
        winner = unit.owner;
      }

      if (isUnitAlive && targetTile.terrain === 'supply_node' && targetTile.owner !== unit.owner) {
        newMap = prev.map.map((row, ty) => row.map((tile, tx) => {
          if (tx === x && ty === y) return { ...tile, owner: unit.owner };
          return tile;
        }));
      }

      if (isUnitAlive && targetTile.terrain === 'capture_point' && targetTile.owner !== unit.owner) {
        newMap = prev.map.map((row, ty) => row.map((tile, tx) => {
          if (tx === x && ty === y) return { ...tile, owner: unit.owner };
          return tile;
        }));
        capturePointOwner = unit.owner;
        capturePointTurns = 0; // Reset progress on capture
      }

      return {
        ...prev,
        map: newMap,
        regiments: newRegiments,
        winner,
        capturePointOwner,
        capturePointTurns
      };
    });
    addAnimation({ type: 'move', fromX: unit.x, fromY: unit.y, toX: x, toY: y, unitType: unit.type });
    addBattlefieldLog(`[${unit.id}] ${unit.name} moved to (${x}, ${y}).`);
    
    const targetTile = gameState.map[y][x];
    if (targetTile.terrain === 'command_center' && targetTile.owner !== unit.owner) {
      addBattlefieldLog(`[${unit.id}] ${unit.name} has captured the enemy Command Center!`);
    } else if (targetTile.terrain === 'supply_node' && targetTile.owner !== unit.owner) {
      addBattlefieldLog(`[${unit.id}] ${unit.name} has captured a Supply Node!`);
    } else if (targetTile.terrain === 'capture_point' && targetTile.owner !== unit.owner) {
      addBattlefieldLog(`[${unit.id}] ${unit.name} has captured the central Capture Point!`);
    }
  };

  const handleRotate = (direction: 'cw' | 'ccw' = 'cw') => {
    if (!selectedUnit || selectedUnit.owner !== gameState.currentPlayer || selectedUnit.mp < 1) return;
    if (selectedUnit.isPalisaded) {
      addBattlefieldLog(`[${selectedUnit.id}] ${selectedUnit.name} cannot rotate while palisaded!`);
      return;
    }
    
    const facings: Facing[] = ['north', 'east', 'south', 'west'];
    const currentIndex = facings.indexOf(selectedUnit.facing);
    const nextIndex = direction === 'cw' ? (currentIndex + 1) % 4 : (currentIndex + 3) % 4;
    const nextFacing = facings[nextIndex];

    setGameState(prev => ({
      ...prev,
      regiments: prev.regiments.map(r => 
        r.id === selectedUnit.id ? { ...r, facing: nextFacing, mp: r.mp - 1 } : r
      )
    }));
    addBattlefieldLog(`[${selectedUnit.id}] ${selectedUnit.name} rotated ${direction === 'cw' ? 'clockwise' : 'counter-clockwise'} to face ${nextFacing}.`);
  };

  const performAttack = (attacker: Regiment, defender: Regiment) => {
    const { damage: actualDamage, counterDamage: actualCounterDamage } = resolveAttack(attacker, defender, gameState.map);

    setGameState(prev => {
      let newRegiments = prev.regiments.map(r => {
        if (r.id === defender.id) {
          return { ...r, men: Math.max(0, r.men - actualDamage) };
        }
        if (r.id === attacker.id) {
          return { ...r, men: Math.max(0, r.men - actualCounterDamage), hasAttacked: true, mp: Math.max(0, r.mp - 1) };
        }
        return r;
      });

      newRegiments = newRegiments.filter(r => r.men > 0);

      const p1Units = newRegiments.filter(r => r.owner === 1);
      const p2Units = newRegiments.filter(r => r.owner === 2);
      let winner = null;
      if (p1Units.length === 0) winner = 2;
      else if (p2Units.length === 0) winner = 1;

      return { ...prev, regiments: newRegiments, winner };
    });

    addAnimation({ type: 'attack', fromX: attacker.x, fromY: attacker.y, toX: defender.x, toY: defender.y, unitType: attacker.type });
    addAnimation({ type: 'damage', fromX: defender.x, fromY: defender.y, damage: actualDamage });
    if (actualCounterDamage > 0) {
      addAnimation({ type: 'damage', fromX: attacker.x, fromY: attacker.y, damage: actualCounterDamage });
    }
    
    addBattlefieldLog(`[${attacker.id}] ${attacker.name} engaged [${defender.id}] ${defender.name}.`);
    addBattlefieldLog(`Casualties - Enemy: ${actualDamage}, Own: ${actualCounterDamage}`);
    
    if (defender.isBoxFormation && (attacker.type === 'hussars' || attacker.type === 'chasseurs')) {
      addBattlefieldLog(`[${defender.id}] ${defender.name}'s square holds firm against the cavalry!`);
    }
    if (defender.men <= actualDamage) {
      addBattlefieldLog(`[${defender.id}] ${defender.name} has been routed!`);
    }
    if (attacker.men <= actualCounterDamage) {
      addBattlefieldLog(`[${attacker.id}] ${attacker.name} has been routed!`);
    }
  };

  const handleEntrench = () => {
    if (!selectedUnit || selectedUnit.owner !== gameState.currentPlayer || selectedUnit.mp < 1) return;
    if (selectedUnit.isEntrenched) {
      // Leaving the earthworks costs 1 MP; the regiment can march on with what is left.
      setGameState(prev => ({
        ...prev,
        regiments: prev.regiments.map(r => r.id === selectedUnit.id ? { ...r, isEntrenched: false, mp: r.mp - 1 } : r)
      }));
      addBattlefieldLog(`[${selectedUnit.id}] ${selectedUnit.name} has left its earthworks.`);
      return;
    }
    if (gameState.map[selectedUnit.y][selectedUnit.x].terrain === 'capture_point') {
      addBattlefieldLog("Cannot entrench on the Strategic Point.");
      return;
    }

    setGameState(prev => ({
      ...prev,
      regiments: prev.regiments.map(r => 
        r.id === selectedUnit.id ? { ...r, isEntrenched: true, mp: 0 } : r
      )
    }));
    addAnimation({ type: 'entrench', fromX: selectedUnit.x, fromY: selectedUnit.y });
    addBattlefieldLog(`[${selectedUnit.id}] ${selectedUnit.name} has entrenched.`);
  };

  const handleToggleBox = () => {
    if (!selectedUnit || selectedUnit.owner !== gameState.currentPlayer || selectedUnit.mp < 1 || selectedUnit.type !== 'line_infantry') return;

    setGameState(prev => ({
      ...prev,
      regiments: prev.regiments.map(r => 
        r.id === selectedUnit.id ? { ...r, isBoxFormation: !r.isBoxFormation, mp: r.mp - 1 } : r
      )
    }));
    addAnimation({ type: 'box_formation', fromX: selectedUnit.x, fromY: selectedUnit.y });
    addBattlefieldLog(`[${selectedUnit.id}] ${selectedUnit.name} has ${selectedUnit.isBoxFormation ? 'disbanded' : 'formed'} Box Formation.`);
  };

  const handleTogglePalisade = () => {
    if (!selectedUnit || selectedUnit.owner !== gameState.currentPlayer || selectedUnit.mp < 1 || selectedUnit.type !== 'cannon') return;

    setGameState(prev => ({
      ...prev,
      regiments: prev.regiments.map(r => 
        r.id === selectedUnit.id ? { ...r, isPalisaded: !r.isPalisaded, mp: 0 } : r
      )
    }));
    addAnimation({ type: 'palisade', fromX: selectedUnit.x, fromY: selectedUnit.y, unitType: 'cannon' });
    addBattlefieldLog(`[${selectedUnit.id}] ${selectedUnit.name} has ${selectedUnit.isPalisaded ? 'removed' : 'erected'} palisades.`);
  };

  const handleReinforce = (type: UnitType) => {
    const cost = UNIT_COSTS[type];
    if (gameState.supply[gameState.currentPlayer] < cost) {
      addBattlefieldLog(`Insufficient supply for ${type}. Need ${cost}.`);
      return;
    }

    // Find Command Center
    let cc: Tile | null = null;
    for (const row of gameState.map) {
      for (const tile of row) {
        if (tile.terrain === 'command_center' && tile.owner === gameState.currentPlayer) {
          cc = tile;
          break;
        }
      }
      if (cc) break;
    }

    if (!cc) return;

    // Find empty adjacent tile
    const neighbors = [
      { x: cc.x, y: cc.y - 1 },
      { x: cc.x, y: cc.y + 1 },
      { x: cc.x - 1, y: cc.y },
      { x: cc.x + 1, y: cc.y },
      { x: cc.x - 1, y: cc.y - 1 },
      { x: cc.x + 1, y: cc.y - 1 },
      { x: cc.x - 1, y: cc.y + 1 },
      { x: cc.x + 1, y: cc.y + 1 },
    ];

    const emptyNeighbor = neighbors.find(n => 
      n.x >= 0 && n.x < 20 && n.y >= 0 && n.y < 20 &&
      !gameState.regiments.some(r => r.x === n.x && r.y === n.y) &&
      gameState.map[n.y][n.x].terrain !== 'river' &&
      gameState.map[n.y][n.x].terrain !== 'mountain'
    );

    if (!emptyNeighbor) {
      addBattlefieldLog("No space around Command Center for reinforcements!");
      return;
    }

    const { id: newId, idCounters } = nextRegimentId(gameState, gameState.currentPlayer, type);
    const index = gameState.regiments.filter(r => r.owner === gameState.currentPlayer && r.type === type).length;
    const newUnit = createInitialRegiment(newId, type, gameState.currentPlayer, emptyNeighbor.x, emptyNeighbor.y, index, undefined, nationOf(gameState, gameState.currentPlayer));
    
    // Reinforcements cannot move or attack on the turn they arrive
    newUnit.mp = 0;
    newUnit.hasAttacked = true;

    setGameState(prev => ({
      ...prev,
      supply: {
        ...prev.supply,
        [prev.currentPlayer]: prev.supply[prev.currentPlayer] - cost
      },
      regiments: [...prev.regiments, newUnit],
      idCounters
    }));

    addBattlefieldLog(`Reinforcements arrived: ${newUnit.name} at (${emptyNeighbor.x}, ${emptyNeighbor.y}).`);
  };

  const processEndTurn = (prev: GameState): GameState => {
    const nextPlayer = prev.currentPlayer === 1 ? 2 : 1;
    const isNewTurn = prev.currentPlayer === 2;
    
    // Capture Point Logic
    let newCapturePointTurns = prev.capturePointTurns;
    let winner = prev.winner;
    
    if (prev.capturePointOwner === prev.currentPlayer) {
      newCapturePointTurns += 1;
      if (newCapturePointTurns >= 5) {
        winner = prev.currentPlayer;
      }
    }

    // Check if next player has a Command Center and Supply Nodes
    let hasCC = false;
    let supplyNodesCount = 0;
    for (const row of prev.map) {
      for (const tile of row) {
        if (tile.terrain === 'command_center' && tile.owner === nextPlayer) {
          hasCC = true;
        }
        if (tile.terrain === 'supply_node' && tile.owner === nextPlayer) {
          supplyNodesCount++;
        }
      }
    }

    const supplyGain = (hasCC ? SUPPLY_PER_TURN : 0) + (supplyNodesCount * SUPPLY_NODE_BONUS);

    return {
      ...prev,
      currentPlayer: nextPlayer,
      turn: isNewTurn ? prev.turn + 1 : prev.turn,
      selectedUnitId: null,
      winner,
      capturePointTurns: newCapturePointTurns,
      supply: {
        ...prev.supply,
        [nextPlayer]: prev.supply[nextPlayer] + supplyGain
      },
      regiments: prev.regiments.map(r => ({
        ...r,
        mp: r.maxMp,
        hasAttacked: false
      })),
      cliHistory: []
    };
  };

  const endTurn = () => {
    setGameState(prev => {
      const nextState = processEndTurn(prev);
      return {
        ...nextState,
        battlefieldLogs: [`Turn ${nextState.turn}: Player ${nextState.currentPlayer}'s turn.`, ...nextState.battlefieldLogs].slice(0, 20)
      };
    });
  };

  const applyCommands = (state: GameState, cmd: string): { newState: GameState, logs: string[], cli: string[], error: string | null } => {
    let currentState = { ...state, animations: [] };
    let logsToAdd: string[] = [];
    let cliToAdd: string[] = [];
    let error: string | null = null;

    const localAddBattlefieldLog = (msg: string) => {
      logsToAdd = [msg, ...logsToAdd];
    };

    const localAddCliOutput = (msg: string) => {
      cliToAdd = [msg, ...cliToAdd];
    };

    const lines = cmd.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    
    for (const line of lines) {
      if (error) break;
      const cleanLine = line.split('#')[0].trim();
      if (!cleanLine) continue;
      
      const parts = cleanLine.toLowerCase().split(' ');
      const action = parts[0];

      localAddCliOutput(`> ${cleanLine}`);

      if (action === 'end') {
        currentState = processEndTurn(currentState);
        currentState.battlefieldLogs = [`Turn ${currentState.turn}: Player ${currentState.currentPlayer}'s turn.`, ...currentState.battlefieldLogs].slice(0, 20);
        localAddCliOutput("Turn ended by command.");
        break;
      }

      if (action === 'help') {
        localAddCliOutput("Commands: ls [all|types|map|supply|info <id>|tile <x>:<y>|costs], whoami, status, mv <id> <x>:<y>, eg <id> <targetId>, ent <id>, rtr <id>, rtl <id>, rlt <id>, box <id>, pal <id>, sel <id>, spawn <type>, end, clear, help, export");
        continue;
      }

      if (action === 'export') {
        exportLogs();
        localAddCliOutput("Logs exported to file.");
        continue;
      }

      if (action === 'whoami') {
        localAddCliOutput(`You are Player ${currentState.currentPlayer} (${NATIONS[nationOf(currentState, currentState.currentPlayer)].adjective}). Supply: ${currentState.supply[currentState.currentPlayer]}`);
        continue;
      }

      if (action === 'status') {
        localAddCliOutput(`Turn: ${currentState.turn} | Player: ${currentState.currentPlayer} | Supply: ${currentState.supply[currentState.currentPlayer]}`);
        if (currentState.capturePointOwner) {
          localAddCliOutput(`Capture Point: Player ${currentState.capturePointOwner} (${currentState.capturePointTurns}/5)`);
        } else {
          localAddCliOutput("Capture Point: Neutral");
        }
        continue;
      }

      if (action === 'clear') {
        currentState.cliHistory = [];
        currentState.battlefieldLogs = [];
        continue;
      }

      if (action === 'ls') {
        const sub = parts[1];
        if (sub === 'all') {
          localAddCliOutput("--- All Regiments ---");
          currentState.regiments.forEach(r => localAddCliOutput(`[${r.id}] ${r.name} (P${r.owner}) at (${r.x},${r.y})`));
        } else if (sub === 'types') {
          localAddCliOutput("Unit Types: line_infantry, light_infantry, cannon, hussars, chasseurs");
        } else if (sub === 'map') {
          localAddCliOutput("--- Strategic Map ---");
          currentState.map.forEach(row => row.forEach(tile => {
            if (tile.terrain === 'command_center' || tile.terrain === 'supply_node' || tile.terrain === 'capture_point') {
              localAddCliOutput(`${tile.terrain.replace('_', ' ')} at (${tile.x},${tile.y}) Owner: P${tile.owner || 0}`);
            }
          }));
        } else if (sub === 'supply') {
          localAddCliOutput(`Supply - P1: ${currentState.supply[1]} | P2: ${currentState.supply[2]}`);
        } else if (sub === 'info') {
          const targetId = parts[2];
          const target = currentState.regiments.find(r => r.id.toLowerCase() === targetId);
          if (!target) { error = `Unit "${targetId}" not found.`; break; }
          localAddCliOutput(`--- Unit Info: ${target.id} ---`);
          localAddCliOutput(`${target.name} (${target.type.replace('_', ' ')})`);
          localAddCliOutput(`Pos: (${target.x},${target.y}) | Men: ${target.men} | MP: ${target.mp}/${target.maxMp}`);
          localAddCliOutput(`Atk: ${target.attack} | Range: ${target.range} | Facing: ${target.facing}`);
        } else if (sub === 'tile') {
          const coords = parts[2]?.split(':');
          if (!coords || coords.length !== 2) { error = 'Usage: ls tile <x>:<y>'; break; }
          const x = parseInt(coords[0]), y = parseInt(coords[1]);
          const tile = currentState.map[y]?.[x];
          if (!tile) { error = `Tile (${x},${y}) not found.`; break; }
          localAddCliOutput(`--- Tile Info: (${x},${y}) ---`);
          localAddCliOutput(`Terrain: ${tile.terrain.replace('_', ' ')}`);
          if (tile.owner) localAddCliOutput(`Owner: P${tile.owner}`);
        } else if (sub === 'costs') {
          localAddCliOutput("--- Unit Costs ---");
          Object.entries(UNIT_COSTS).forEach(([type, cost]) => localAddCliOutput(`${type.replace('_', ' ')}: ${cost} supply`));
        } else {
          localAddCliOutput("--- Your Regiments ---");
          currentState.regiments.filter(r => r.owner === currentState.currentPlayer).forEach(r => localAddCliOutput(`[${r.id}] ${r.name} (${r.type.replace('_', ' ')}) at (${r.x},${r.y}) MP:${r.mp}`));
        }
        continue;
      }

      if (action === 'spawn') {
        const typeInput = parts.slice(1).join('_');
        const type = parseUnitType(typeInput);
        if (!type) { error = `Invalid unit type: ${typeInput}. Use: line_infantry, light_infantry, cannon, hussars or chasseurs.`; break; }
        const cost = UNIT_COSTS[type];
        if (currentState.supply[currentState.currentPlayer] < cost) { error = `Insufficient supply. Need ${cost}.`; break; }
        
        let cc: Tile | null = null;
        for (const row of currentState.map) for (const tile of row) if (tile.terrain === 'command_center' && tile.owner === currentState.currentPlayer) cc = tile;
        if (!cc) { error = "No Command Center found."; break; }

        const neighbors = [{x:cc.x,y:cc.y-1},{x:cc.x,y:cc.y+1},{x:cc.x-1,y:cc.y},{x:cc.x+1,y:cc.y},{x:cc.x-1,y:cc.y-1},{x:cc.x+1,y:cc.y-1},{x:cc.x-1,y:cc.y+1},{x:cc.x+1,y:cc.y+1}];
        const emptyNeighbor = neighbors.find(n => n.x >= 0 && n.x < 20 && n.y >= 0 && n.y < 20 && !currentState.regiments.some(r => r.x === n.x && r.y === n.y) && currentState.map[n.y][n.x].terrain !== 'river' && currentState.map[n.y][n.x].terrain !== 'mountain');
        if (!emptyNeighbor) { error = "No space around CC."; break; }

        const { id: newId, idCounters } = nextRegimentId(currentState, currentState.currentPlayer, type);
        currentState.idCounters = idCounters;
        const index = currentState.regiments.filter(r => r.owner === currentState.currentPlayer && r.type === type).length;
        const newUnit = createInitialRegiment(newId, type, currentState.currentPlayer, emptyNeighbor.x, emptyNeighbor.y, index, undefined, nationOf(currentState, currentState.currentPlayer));
        newUnit.mp = 0; newUnit.hasAttacked = true;
        currentState.regiments = [...currentState.regiments, newUnit];
        currentState.supply = { ...currentState.supply, [currentState.currentPlayer]: currentState.supply[currentState.currentPlayer] - cost };
        localAddBattlefieldLog(`Reinforcements arrived: ${newUnit.name} at (${emptyNeighbor.x}, ${emptyNeighbor.y}).`);
        continue;
      }

      const unitId = parts[1];
      const unit = currentState.regiments.find(r => r.id.toLowerCase() === unitId);
      if (!unit) { error = `Unit "${unitId}" not found.`; break; }
      if (unit.owner !== currentState.currentPlayer) { error = `Unit "${unitId}" belongs to P${unit.owner}.`; break; }

      switch (action) {
        case 'sel':
          currentState.selectedUnitId = unit.id;
          localAddCliOutput(`Selected [${unit.id}] ${unit.name}.`);
          break;
        case 'mv': {
          const coords = parts[2]?.split(':');
          if (!coords || coords.length !== 2) { error = "Invalid coords."; break; }
          const x = parseInt(coords[0]), y = parseInt(coords[1]);
          
          if (unit.isPalisaded) { error = "Unit is palisaded."; break; }
          if (unit.isBoxFormation) { error = "Unit is in box formation."; break; }
          if (unit.isEntrenched) { error = "Unit is entrenched. Leave the earthworks first with 'ent' (1 MP)."; break; }

          const pathResult = findPath({ x: unit.x, y: unit.y }, { x, y }, unit, currentState.regiments, currentState.map);
          if (!pathResult) { error = "No valid path found."; break; }
          if (unit.mp < pathResult.cost) { error = `Insufficient MP. Need ${pathResult.cost}, have ${unit.mp}.`; break; }

          // Apply movement step by step to handle ZoC damage
          let currentX = unit.x;
          let currentY = unit.y;
          let currentMp = unit.mp;
          let currentMen = unit.men;
          let currentFacing = unit.facing;

          for (const step of pathResult.path) {
            if (step.x > currentX) currentFacing = 'east';
            else if (step.x < currentX) currentFacing = 'west';
            else if (step.y > currentY) currentFacing = 'south';
            else if (step.y < currentY) currentFacing = 'north';

            const tile = currentState.map[step.y][step.x];
            const cost = getTerrainMpCost(tile.terrain);
            const zocStatus = getZoCStatus(step.x, step.y, unit, currentState.regiments);
            
            let stepDamage = 0;
            if (zocStatus.takesDamage) {
              stepDamage = Math.floor(currentMen * 0.15);
              localAddBattlefieldLog(`[${unit.id}] took fire while bypassing enemy line at (${step.x}, ${step.y})! (-${stepDamage} men)`);
            }

            currentX = step.x;
            currentY = step.y;
            currentMp -= cost;
            currentMen = Math.max(0, currentMen - stepDamage);

            if (currentMen <= 0) {
              localAddBattlefieldLog(`[${unit.id}] ${unit.name} has been routed during movement!`);
              break;
            }
          }

          currentState.regiments = currentState.regiments.map(r => 
            r.id === unit.id ? { ...r, x: currentX, y: currentY, men: currentMen, mp: currentMp, isEntrenched: false, facing: currentFacing } : r
          ).filter(r => r.men > 0);

          if (currentMen > 0) {
            const targetTile = currentState.map[currentY][currentX];
            if (targetTile.terrain === 'command_center' && targetTile.owner !== unit.owner) {
              currentState.winner = unit.owner;
              localAddBattlefieldLog(`[${unit.id}] ${unit.name} has captured the enemy Command Center!`);
            } else if (targetTile.terrain === 'supply_node' && targetTile.owner !== unit.owner) {
              currentState.map = currentState.map.map((row, ty) => row.map((tile, tx) => {
                if (tx === currentX && ty === currentY) return { ...tile, owner: unit.owner };
                return tile;
              }));
              localAddBattlefieldLog(`[${unit.id}] ${unit.name} has captured a Supply Node!`);
            } else if (targetTile.terrain === 'capture_point' && targetTile.owner !== unit.owner) {
              currentState.map = currentState.map.map((row, ty) => row.map((tile, tx) => {
                if (tx === currentX && ty === currentY) return { ...tile, owner: unit.owner };
                return tile;
              }));
              currentState.capturePointOwner = unit.owner;
              currentState.capturePointTurns = 0;
              localAddBattlefieldLog(`[${unit.id}] ${unit.name} has captured the Strategic Point!`);
            }

            // Add movement animation
            currentState.animations = [
              ...currentState.animations,
              { id: Math.random().toString(36).substr(2, 9), timestamp: Date.now(), type: 'move', fromX: unit.x, fromY: unit.y, toX: currentX, toY: currentY, unitType: unit.type }
            ];

            localAddBattlefieldLog(`[${unit.id}] ${unit.name} moved to (${currentX}, ${currentY}).`);
            localAddCliOutput(`Moved [${unit.id}] to (${currentX},${currentY}). Cost: ${pathResult.cost} MP.`);
          } else {
            localAddCliOutput(`[${unit.id}] ${unit.name} was routed.`);
          }
          break;
        }
        case 'eg': {
          const targetId = parts[2];
          const target = currentState.regiments.find(r => r.id.toLowerCase() === targetId);
          if (!target) { error = "Target not found."; break; }
          if (target.owner === unit.owner) { error = "Cannot attack friendly."; break; }
          if (unit.hasAttacked) { error = "Already attacked."; break; }
          const dist = Math.max(Math.abs(unit.x - target.x), Math.abs(unit.y - target.y));
          if (dist > unit.range) { error = "Out of range."; break; }
          if (!isTargetInFiringLine(unit, target.x, target.y)) { error = "Not in firing line."; break; }
          
          const { damage: actualDamage, counterDamage: actualCounterDamage } = resolveAttack(unit, target, currentState.map);
          
          currentState.regiments = currentState.regiments.map(r => {
            if (r.id === target.id) return { ...r, men: Math.max(0, r.men - actualDamage) };
            if (r.id === unit.id) return { ...r, men: Math.max(0, r.men - actualCounterDamage), hasAttacked: true, mp: Math.max(0, r.mp - 1) };
            return r;
          }).filter(r => r.men > 0);

          // Add animations
          const timestamp = Date.now();
          currentState.animations = [
            ...currentState.animations,
            { id: Math.random().toString(36).substr(2, 9), timestamp, type: 'attack', fromX: unit.x, fromY: unit.y, toX: target.x, toY: target.y, unitType: unit.type },
            { id: Math.random().toString(36).substr(2, 9), timestamp, type: 'damage', fromX: target.x, fromY: target.y, damage: actualDamage }
          ];
          if (actualCounterDamage > 0) {
            currentState.animations.push({ id: Math.random().toString(36).substr(2, 9), timestamp, type: 'damage', fromX: unit.x, fromY: unit.y, damage: actualCounterDamage });
          }

          // Wiping out an army wins, as it does for attacks made from the UI.
          if (!currentState.regiments.some(r => r.owner === 1)) currentState.winner = 2;
          else if (!currentState.regiments.some(r => r.owner === 2)) currentState.winner = 1;

          localAddBattlefieldLog(`[${unit.id}] engaged [${target.id}]. Casualties: Enemy ${actualDamage}, Own ${actualCounterDamage}`);
          if (target.isBoxFormation && (unit.type === 'hussars' || unit.type === 'chasseurs')) {
            localAddBattlefieldLog(`[${target.id}]'s square holds firm against the cavalry!`);
          }
          localAddCliOutput(`Attacked [${target.id}] with [${unit.id}].`);
          break;
        }
        case 'ent': {
          const tile = currentState.map[unit.y][unit.x];
          if (unit.isEntrenched) {
            // Leaving the earthworks costs 1 MP; the regiment can march on with what is left.
            if (unit.mp < 1) { error = "Leaving the earthworks costs 1 MP."; break; }
            currentState.regiments = currentState.regiments.map(r => r.id === unit.id ? { ...r, isEntrenched: false, mp: r.mp - 1 } : r);
            localAddBattlefieldLog(`[${unit.id}] left its earthworks.`);
            localAddCliOutput(`[${unit.id}] left its earthworks.`);
            break;
          }
          if (unit.mp < 1 || tile.terrain === 'capture_point') { 
            error = tile.terrain === 'capture_point' ? "Cannot entrench on Strategic Point." : "Cannot entrench."; 
            break; 
          }
          currentState.regiments = currentState.regiments.map(r => r.id === unit.id ? { ...r, isEntrenched: true, mp: 0 } : r);
          currentState.animations = [
            ...currentState.animations,
            { id: Math.random().toString(36).substr(2, 9), timestamp: Date.now(), type: 'entrench', fromX: unit.x, fromY: unit.y }
          ];
          localAddBattlefieldLog(`[${unit.id}] entrenched.`);
          localAddCliOutput(`[${unit.id}] entrenched.`);
          break;
        }
        case 'rtr':
        case 'rtl':
        case 'rlt':
        case 'rtn':
        case 'rte':
        case 'rts':
        case 'rtw': {
          if (unit.mp < 1) { error = "Insufficient MP."; break; }
          if (unit.isPalisaded) { error = "Unit is palisaded and cannot rotate."; break; }
          const directions: Facing[] = ['north', 'east', 'south', 'west'];
          const currentIndex = directions.indexOf(unit.facing);
          let newFacing: Facing;
          
          if (action === 'rtn') newFacing = 'north';
          else if (action === 'rte') newFacing = 'east';
          else if (action === 'rts') newFacing = 'south';
          else if (action === 'rtw') newFacing = 'west';
          else {
            const nextIndex = (action === 'rtr') ? (currentIndex + 1) % 4 : (currentIndex + 3) % 4;
            newFacing = directions[nextIndex];
          }

          if (newFacing === unit.facing) {
            localAddCliOutput(`[${unit.id}] is already facing ${newFacing}.`);
            break;
          }

          currentState.regiments = currentState.regiments.map(r => r.id === unit.id ? { ...r, facing: newFacing, mp: r.mp - 1 } : r);
          localAddCliOutput(`[${unit.id}] rotated to face ${newFacing}.`);
          break;
        }
        case 'box':
          if (unit.type !== 'line_infantry' || unit.mp < 1) { error = "Cannot form Box."; break; }
          currentState.regiments = currentState.regiments.map(r => r.id === unit.id ? { ...r, isBoxFormation: !r.isBoxFormation, mp: r.mp - 1 } : r);
          currentState.animations = [
            ...currentState.animations,
            { id: Math.random().toString(36).substr(2, 9), timestamp: Date.now(), type: 'box_formation', fromX: unit.x, fromY: unit.y }
          ];
          localAddCliOutput(`[${unit.id}] toggled Box Formation.`);
          break;
        case 'pal':
          if (unit.type !== 'cannon' || unit.mp < 1) { error = "Cannot build Palisades."; break; }
          currentState.regiments = currentState.regiments.map(r => r.id === unit.id ? { ...r, isPalisaded: !r.isPalisaded, mp: 0 } : r);
          currentState.animations = [
            ...currentState.animations,
            { id: Math.random().toString(36).substr(2, 9), timestamp: Date.now(), type: 'palisade', fromX: unit.x, fromY: unit.y }
          ];
          localAddCliOutput(`[${unit.id}] toggled Palisades.`);
          break;
        default:
          error = `Unknown command: ${action}`;
      }
    }

    return {
      newState: {
        ...currentState,
        battlefieldLogs: [...logsToAdd, ...currentState.battlefieldLogs].slice(0, 20),
        cliHistory: [...cliToAdd, ...currentState.cliHistory].slice(0, 50)
      },
      logs: logsToAdd,
      cli: cliToAdd,
      error
    };
  };

  const executeCommand = (cmd: string) => {
    setCommandError(null);
    setGameState(prev => {
      const { newState, error } = applyCommands(prev, cmd);
      if (error) setCommandError(error);
      return newState;
    });
    setCommandInput('');
  };

  const runAiTurn = useCallback(async () => {
    const config = gameState.aiConfigs[gameState.currentPlayer];
    const { provider, apiKey, model, thinkingLevel } = resolveAiModel(config);
    if (!apiKey) {
      addBattlefieldLog(`ERROR: ${AI_PROVIDERS[provider].label} API Key for Player ${gameState.currentPlayer} not found. Please configure AI settings.`);
      setIsAiThinking(false);
      return;
    }

    setIsAiThinking(true);
    setAiMonologue(null);
    
    // LangSmith tracing setup
    let parentRunId: string | undefined;
    let client: Client | undefined;
    // Kept outside the try so the error handlers can ask it whether an error was a rate limit.
    let session: AiSession | undefined;

    // Helper for exponential backoff
    const retryWithBackoff = async <T extends unknown>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
      let lastError: any;
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (error: any) {
          lastError = error;
          if (session?.isRateLimit(error) && i < maxRetries - 1) {
            const delay = Math.pow(2, i) * 2000 + Math.random() * 1000;
            addBattlefieldLog(`AI Player ${gameState.currentPlayer} is hitting rate limits. Retrying in ${Math.round(delay/1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }
      }
      throw lastError;
    };

    try {
      let currentGameState = gameState;
      let turnEnded = false;
      let iteration = 0;
      let turnOutput = "";

      // Start a chat session to maintain context across iterations
      const chat = await startAiSession({
        provider,
        apiKey,
        model,
        thinkingLevel,
        systemInstruction: aiInstructions,
        useVertexAI: config.useVertexAI,
      });
      session = chat;

      if (config.langsmithApiKey) {
        client = new Client({
          apiKey: config.langsmithApiKey,
        });
        parentRunId = crypto.randomUUID();
        await client.createRun({
          id: parentRunId,
          name: `AI Turn Flow - Player ${currentGameState.currentPlayer}`,
          run_type: "chain",
          inputs: { 
            turn: currentGameState.turn, 
            player: currentGameState.currentPlayer,
            provider,
            model,
            thinkingLevel
          },
          project_name: config.langsmithProject || 'regiments-simulation',
        });
      }

      while (!turnEnded && iteration < 5) {
        // Only this general's own earlier dispatches: the enemy's plans stay secret.
        const lastMonologues = currentGameState.monologueHistory.filter(m => m.player === currentGameState.currentPlayer).slice(-2);
        const monologueContext = lastMonologues.length > 0 
          ? `\nPREVIOUS STRATEGIC CONTEXT:\n${lastMonologues.map(m => `Turn ${m.turn} (P${m.player}): ${m.text}`).join('\n')}\n`
          : '';

        const lastIteration = iteration === 4;
        // From the second iteration on, name the regiments that haven't been used yet this turn.
        const unused = currentGameState.regiments.filter(r =>
          r.owner === currentGameState.currentPlayer && r.mp === r.maxMp && !r.hasAttacked && !r.isEntrenched && !r.isPalisaded);
        const unusedNote = iteration === 0 ? '' : unused.length
          ? `\nRegiments that have not moved or fought yet this turn: ${unused.map(r => `${r.id} (${r.mp} MP)`).join(', ')}.`
          : '\nEvery regiment has acted this turn.';
        const prompt = `
${monologueContext}
${turnOutput ? `\nRESULTS OF YOUR COMMANDS SO FAR THIS TURN:\n${turnOutput}\n` : ''}
CURRENT GAME STATE:
${getGameStateString(currentGameState)}

You are Player ${currentGameState.currentPlayer} (${NATIONS[nationOf(currentGameState, currentGameState.currentPlayer)].adjective}). Turn ${currentGameState.turn}, iteration ${iteration + 1} of 5.
Reply with a short dispatch (2-5 sentences: your plan for this turn), then ONE code block with your commands.
- The commands run in order, and you will see their results in the next iteration.
- Every regiment's MP refills each turn, and MP you leave unused is lost.
- \`end\` ends your turn at once and any command after it is ignored. ${lastIteration ? 'This is your last iteration: finish with `end`.' : 'Add it as the last command only once every regiment has done what you want this turn.'}${unusedNote}
`;

        let response;
        
        if (client && parentRunId) {
          const runId = crypto.randomUUID();
          await client.createRun({
            id: runId,
            parent_run_id: parentRunId,
            name: `Iteration ${iteration + 1}`,
            run_type: "llm",
            inputs: { prompt },
            project_name: config.langsmithProject || 'regiments-simulation',
          });

          try {
            response = await retryWithBackoff(() => chat.send(prompt));
            await client.updateRun(runId, {
              outputs: { response: response.text, ...(response.refusal ? { refusal: response.refusal } : {}) },
              end_time: Date.now()
            });
          } catch (e) {
            await client.updateRun(runId, {
              error: e instanceof Error ? e.message : String(e),
              end_time: Date.now()
            });
            throw e;
          }
        } else {
          response = await retryWithBackoff(() => chat.send(prompt));
        }

        if (response.refusal) {
          // The model declined to answer: end its turn rather than retrying the same request.
          // The note goes into this turn's state, so the forced 'end' below keeps it.
          const why = response.refusal.category ? ` (${response.refusal.category})` : '';
          const note = `AI Player ${currentGameState.currentPlayer}'s model declined to answer${why}. Ending its turn.`;
          currentGameState = { ...currentGameState, battlefieldLogs: [note, ...currentGameState.battlefieldLogs].slice(0, 20) };
          setGameState(currentGameState);
          break;
        }

        const responseText = response.text;
        if (!responseText) {
          throw new Error("Empty response from AI");
        }

        // Extract monologue (text before the first code block)
        const monologue = responseText.split('```')[0].trim();
        if (monologue) {
          setAiMonologue(monologue);
          const newMonologueEntry = {
            turn: currentGameState.turn,
            player: currentGameState.currentPlayer,
            text: monologue,
            timestamp: Date.now()
          };
          currentGameState = {
            ...currentGameState,
            monologueHistory: [...currentGameState.monologueHistory, newMonologueEntry]
          };
          setGameState(currentGameState);
        }

        const commandMatch = responseText.match(/```(?:bash|text|cli|sh)?\s*([\s\S]*?)```/i);
        let commands = commandMatch ? commandMatch[1].trim().split('\n') : [];

        if (commands.length === 0) {
          // Fallback: try to find lines that look like commands in the whole text
          // This handles cases where the AI forgets triple backticks
          const lines = responseText.split('\n');
          const commandKeywords = ['mv', 'eg', 'ent', 'rtr', 'rtl', 'rlt', 'rtn', 'rte', 'rts', 'rtw', 'box', 'pal', 'sel', 'spawn', 'end', 'ls', 'whoami', 'status', 'help', 'clear'];
          commands = lines.filter(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return false;
            const firstWord = trimmed.toLowerCase().split(' ')[0];
            return commandKeywords.includes(firstWord);
          });
        }

        if (commands.length > 0) {
          addBattlefieldLog(`AI Player ${currentGameState.currentPlayer} (${model}, ${thinkingLevel} thinking) is executing commands...`);
          
          let iterationLogs: string[] = [];
          let iterationCli: string[] = [];

          for (const cmd of commands) {
            const trimmedCmd = cmd.trim();
            if (!trimmedCmd || trimmedCmd.startsWith('#')) continue;

            // Execute one command
            const { newState, logs, cli, error } = applyCommands(currentGameState, trimmedCmd);
            
            currentGameState = newState;
            setGameState(newState); // Update UI immediately
            
            iterationLogs = [...logs, ...iterationLogs];
            iterationCli = [...cli, ...iterationCli];
            
            if (error) {
              iterationCli = [`ERROR: ${error} (cmd: ${trimmedCmd})`, ...iterationCli];
              // Continue to next command instead of breaking
            }

            if (trimmedCmd.toLowerCase() === 'end') {
              turnEnded = true;
              break;
            }

            await new Promise(resolve => setTimeout(resolve, 800));
          }

          // Collect output for AI's next iteration
          turnOutput += `\n--- Iteration ${iteration + 1} Results ---\n`;
          turnOutput += iterationCli.reverse().join('\n') + '\n' + iterationLogs.reverse().join('\n') + '\n';
        } else {
          // No commands found, assume AI is done or confused
          turnEnded = true;
        }

        iteration++;
        if (!turnEnded && iteration < 5) {
          addBattlefieldLog(`AI Player ${currentGameState.currentPlayer} is analyzing results...`);
          // Increased delay to stay under RPM limits
          await new Promise(resolve => setTimeout(resolve, 3500));
        }
      }

      // Final safety check: if the turn hasn't ended after all iterations, force an end
      // This prevents the game from getting stuck if the AI fails to issue 'end'
      if (currentGameState.currentPlayer === gameState.currentPlayer && !gameState.winner) {
        addBattlefieldLog(`AI Player ${currentGameState.currentPlayer} turn timed out. Forcing end.`);
        const { newState } = applyCommands(currentGameState, 'end');
        setGameState(newState);
      }

      // Update LangSmith parent run with end time
      if (client && parentRunId) {
        await client.updateRun(parentRunId, {
          end_time: Date.now()
        });
      }

      // Clear monologue after turn ends
      setTimeout(() => setAiMonologue(null), 3000);
    } catch (error: any) {
      console.error("AI Turn Error:", error);
      if (session?.isRateLimit(error)) {
        addBattlefieldLog(`CRITICAL: AI Player ${gameState.currentPlayer} hit API rate limits. Please wait a minute before trying again or use a paid API key.`);
      } else {
        addBattlefieldLog("AI encountered an error during its turn.");
      }
      
      // Update LangSmith parent run with error
      if (client && parentRunId) {
        await client.updateRun(parentRunId, {
          error: error instanceof Error ? error.message : String(error),
          end_time: Date.now()
        }).catch(err => console.error("Failed to update LangSmith run with error:", err));
      }
    } finally {
      setIsAiThinking(false);
    }
  }, [aiInstructions, getGameStateString, gameState, executeCommand]);

  useEffect(() => {
    if (gameState.gameMode === 'ai' && !gameState.winner && !isAiThinking) {
      // Check if we've already started processing this turn/player
      if (aiTurnRef.current?.turn === gameState.turn && aiTurnRef.current?.player === gameState.currentPlayer) {
        return;
      }

      // Small delay before AI starts its turn
      const timer = setTimeout(() => {
        aiTurnRef.current = { turn: gameState.turn, player: gameState.currentPlayer };
        runAiTurn();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState.gameMode, gameState.currentPlayer, gameState.winner, gameState.turn, isAiThinking, runAiTurn]);

  const resetGame = () => {
    aiTurnRef.current = null;
    setGameState(getInitialState());
  };

  const exportLogs = () => {
    const content = `--- BATTLEFIELD LOGS ---\n${gameState.battlefieldLogs.join('\n')}\n\n--- CLI HISTORY ---\n${gameState.cliHistory.join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `regiments_logs_turn_${gameState.turn}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (gameState.gameMode === null) {
    return (
      <div className="fixed inset-0 bg-[#E4E3E0] flex items-center justify-center z-50 p-8">
        <div className="max-w-2xl w-full border border-[#141414] p-12 bg-white shadow-2xl flex flex-col gap-8">
          <div className="text-center space-y-2">
            <h1 className="text-6xl font-serif italic tracking-tighter leading-none">REGIMENTS</h1>
          </div>
          
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-mono opacity-50 text-center">Player 1 commands</p>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Player 1's army">
              {(['british', 'french'] as const).map(n => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={p1Nation === n}
                  onClick={() => setP1Nation(n)}
                  className={cn(
                    "p-4 border-2 flex items-center gap-3 text-left transition-all",
                    p1Nation === n ? SIDE_UI[n].pick : "border-[#141414]/15 hover:border-[#141414]/60"
                  )}
                >
                  <span className={cn("w-8 h-6 shrink-0 border border-[#141414]/40", n === 'british' ? "bg-[#b02a20]" : "bg-[#23376e]")} />
                  <span>
                    <span className="block font-bold uppercase tracking-tight">{NATIONS[n].adjective}</span>
                    <span className="block text-[9px] font-mono uppercase opacity-60 leading-snug">{NATION_BLURB[n]}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[10px] font-mono text-center opacity-50">
              Player 2 commands the {NATIONS[p1Nation === 'british' ? 'french' : 'british'].adjective}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <button 
              onClick={() => startGame('manual', gameState.aiConfigs)}
              className="p-8 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-all flex flex-col items-center gap-4 group"
            >
              <Users size={48} className="group-hover:scale-110 transition-transform" />
              <div className="text-center">
                <h2 className="text-xl font-bold uppercase">Manual Play</h2>
                <p className="text-[10px] uppercase opacity-50 font-mono mt-1">Command your troops directly</p>
              </div>
            </button>
            
            <button 
              onClick={() => setShowAiConfig(true)}
              className="p-8 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-all flex flex-col items-center gap-4 group"
            >
              <Terminal size={48} className="group-hover:scale-110 transition-transform" />
              <div className="text-center">
                <h2 className="text-xl font-bold uppercase">AI Gameplay</h2>
                <p className="text-[10px] uppercase opacity-50 font-mono mt-1">Watch AI Generals battle</p>
              </div>
            </button>
          </div>
          
          <AiConfigModal 
            isOpen={showAiConfig}
            onClose={() => setShowAiConfig(false)}
            aiConfigs={gameState.aiConfigs}
            nations={nationsFor(p1Nation)}
            onSave={(configs) => {
              startGame('ai', configs);
              setShowAiConfig(false);
            }}
          />

          <div className="border-t border-[#141414]/10 pt-6 text-center">
            <p className="text-[10px] uppercase font-mono opacity-40">Bring your own API keys!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0] overflow-hidden">
      {/* Header */}
      <header className="border-b border-[#141414] p-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter uppercase italic font-serif">Regiments</h1>
          <p className="text-[10px] uppercase tracking-widest opacity-50 font-mono">19th Century Warfare Simulation</p>
        </div>
        <div className="flex gap-4 xl:gap-8 items-center">
          {isAiThinking && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 px-3 py-1 bg-[#141414] text-[#E4E3E0] text-[10px] font-bold uppercase tracking-widest animate-pulse"
            >
              <Cpu size={12} className="animate-spin" /> 
              AI Player {gameState.currentPlayer} is processing...
            </motion.div>
          )}
          <div className="flex border border-[#141414]" role="group" aria-label="Battlefield view">
            {(['3d', '2d'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "px-2.5 py-2 flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-tighter transition-colors",
                  viewMode === mode ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/10"
                )}
                title={mode === '3d' ? '3D battlefield' : 'Classic 2D map'}
              >
                {mode === '3d' ? <Box size={14} /> : <LayoutGrid size={14} />} {mode.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mr-4 border-r border-[#141414]/20 pr-4">
            <button 
              onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
              className={cn(
                "p-2 border border-[#141414] transition-colors flex items-center gap-2 text-[10px] uppercase font-bold tracking-tighter",
                isLeftSidebarOpen ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414] hover:text-[#E4E3E0]"
              )}
              title="Toggle Unit Intel"
            >
              <Users size={14} /> {isLeftSidebarOpen ? 'Hide Intel' : 'Show Intel'}
            </button>
            <button 
              onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
              className={cn(
                "p-2 border border-[#141414] transition-colors flex items-center gap-2 text-[10px] uppercase font-bold tracking-tighter",
                isRightSidebarOpen ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414] hover:text-[#E4E3E0]"
              )}
              title="Toggle Tactical HUD"
            >
              <Terminal size={14} /> {isRightSidebarOpen ? 'Hide HUD' : 'Show HUD'}
            </button>
            <button 
              onClick={() => setShowAiConfig(true)}
              className="p-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors flex items-center gap-2 text-[10px] uppercase font-bold tracking-tighter"
              title="AI Settings"
            >
              <Settings size={14} /> AI Settings
            </button>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase opacity-50 font-mono italic">Supply</p>
            <p className={cn("text-xl font-bold font-mono", side(gameState.currentPlayer).textSoft)}>{gameState.supply[gameState.currentPlayer]}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase opacity-50 font-mono italic">Capture Point</p>
            <p className={cn(
              "text-xl font-bold font-mono",
              gameState.capturePointOwner ? side(gameState.capturePointOwner).text : "opacity-30"
            )}>
              {gameState.capturePointOwner ? `${gameState.capturePointTurns}/5` : "---"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase opacity-50 font-mono italic">Current Turn</p>
            <p className="text-xl font-bold font-mono">{gameState.turn}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase opacity-50 font-mono italic">Active Player · {NATIONS[nationOf(gameState, gameState.currentPlayer)].adjective}</p>
            <p className={cn(
              "text-xl font-bold uppercase",
              side(gameState.currentPlayer).text
            )}>
              Player {gameState.currentPlayer}
            </p>
            {gameState.gameMode === 'ai' && (() => {
              const ai = resolveAiModel(gameState.aiConfigs[gameState.currentPlayer]);
              const model = AI_MODELS[ai.provider].find(m => m.id === ai.model)?.label.replace(/ \(.*\)$/, '') ?? ai.model;
              return (
                <p className="text-[9px] uppercase font-mono tracking-wider opacity-60 flex items-center justify-end gap-1 whitespace-nowrap">
                  <Cpu size={10} /> {model} · {ai.thinkingLevel}
                </p>
              );
            })()}
          </div>
          <button 
            onClick={resetGame}
            className="p-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* With the HUD column hidden, the AI general's dispatch floats as a compact card in the
            map's top-right corner: three lines by default, expandable, or minimised to a tab. */}
        <AnimatePresence>
          {aiMonologue && !isRightSidebarOpen && (dispatchMinimized ? (
            <motion.button
              key="dispatch-tab"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onClick={() => setDispatchMinimized(false)}
              className={cn(
                "absolute z-[60] top-4 px-3 py-2 border-2 bg-white/90 backdrop-blur-sm shadow-lg flex items-center gap-2 font-bold uppercase text-[9px] tracking-wider",
                "right-4",
                side(gameState.currentPlayer).bubble
              )}
              aria-label="Show the AI general's dispatch"
            >
              <Cpu size={12} /> General {gameState.currentPlayer}'s dispatch
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            </motion.button>
          ) : (
            <motion.div
              key="dispatch"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={cn(
                "absolute z-[60] top-4 w-[min(380px,calc(100%-2rem))] border-2 bg-white/90 backdrop-blur-sm shadow-xl",
                "right-4",
                side(gameState.currentPlayer).bubble
              )}
            >
              <div className="flex items-center justify-between gap-2 px-4 pt-3 font-bold uppercase text-[9px] tracking-wider opacity-60">
                <span className="flex items-center gap-2"><Cpu size={10} /> AI General {gameState.currentPlayer} · Dispatch</span>
                <button onClick={() => setDispatchMinimized(true)} className="p-0.5 hover:opacity-100" aria-label="Minimise the dispatch">
                  <Minus size={12} />
                </button>
              </div>
              {dispatchExpanded ? (
                <Markdown text={aiMonologue} className="px-4 pt-1 max-h-[40vh] overflow-y-auto space-y-1.5 font-serif italic text-xs leading-relaxed" />
              ) : (
                <p className="px-4 pt-1 font-serif italic text-xs leading-relaxed line-clamp-3">{plainText(aiMonologue)}</p>
              )}
              {aiMonologue.length > 180 ? (
                <button
                  onClick={() => setDispatchExpanded(v => !v)}
                  className="px-4 pt-1 pb-3 font-bold uppercase text-[9px] tracking-wider opacity-60 hover:opacity-100"
                >
                  {dispatchExpanded ? 'Show less' : 'Read full dispatch'}
                </button>
              ) : <div className="pb-3" />}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Sidebar Left: Unit Info */}
        <AnimatePresence>
          {isLeftSidebarOpen && (
            <motion.aside 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="border-r border-[#141414] flex flex-col gap-6 overflow-hidden bg-[#E4E3E0] z-20"
            >
              <div className="w-80 p-6 flex flex-col gap-6 overflow-y-auto h-full">
                <section>
                  <h2 className="text-[11px] uppercase tracking-widest opacity-50 font-serif italic mb-4">Selected Regiment</h2>
                  <AnimatePresence mode="wait">
                    {selectedUnit ? (
                      <motion.div 
                        key={selectedUnit.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-4"
                      >
                        <div className="p-4 border border-[#141414] bg-white/50 relative overflow-hidden">
                          {/* Standard Placeholder */}
                          <div 
                            className="absolute top-0 right-0 w-12 h-16 opacity-20 pointer-events-none"
                            style={{ 
                              backgroundColor: selectedUnit.standardColor,
                              clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 50% 85%, 0% 100%)' 
                            }}
                          />

                          <div className="flex justify-between items-start mb-2 relative z-10">
                            <div className="space-y-0.5">
                              <h3 className="text-xl font-bold uppercase tracking-tight leading-none">{selectedUnit.name}</h3>
                              <p className="text-[10px] uppercase opacity-50 font-mono italic">{selectedUnit.type.replace('_', ' ')}</p>
                            </div>
                            <span className={cn(
                              "px-2 py-0.5 text-[10px] font-bold uppercase border border-[#141414]",
                              side(selectedUnit.owner).chip
                            )}>
                              P{selectedUnit.owner}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-4 relative z-10">
                            <div className="space-y-1">
                              <p className="text-[10px] uppercase opacity-50 font-mono flex items-center gap-1"><Users size={10} /> Strength</p>
                              <p className="text-lg font-bold font-mono">{selectedUnit.men} / {selectedUnit.maxMen}</p>
                              <div className="w-full h-1 bg-gray-200">
                                <div 
                                  className="h-full bg-[#141414]" 
                                  style={{ width: `${(selectedUnit.men / selectedUnit.maxMen) * 100}%` }} 
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] uppercase opacity-50 font-mono flex items-center gap-1"><Move size={10} /> Movement</p>
                              <p className="text-lg font-bold font-mono">{selectedUnit.mp} / {selectedUnit.maxMp}</p>
                            </div>
                          </div>
                          <div className="flex justify-between items-center mt-4 text-[9px] font-mono opacity-40 uppercase tracking-tighter relative z-10">
                            <span>UID: {selectedUnit.id}</span>
                            <span>Color: {selectedUnit.standardColor}</span>
                          </div>
                        </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-3 border border-[#141414] flex flex-col items-center gap-1">
                              <Sword size={16} className="opacity-50" />
                              <p className="text-[10px] uppercase font-mono">Attack</p>
                              <p className="font-bold">{Math.round(selectedUnit.attack * 100)}</p>
                            </div>
                            <div className="p-3 border border-[#141414] flex flex-col items-center gap-1">
                              <Shield size={16} className="opacity-50" />
                              <p className="text-[10px] uppercase font-mono">Defense</p>
                              <p className="font-bold">{Math.round(selectedUnit.defense * 100)}</p>
                            </div>
                          </div>

                          {/* Buff Indicators */}
                          <div className="flex flex-wrap gap-2">
                            {selectedUnit.isEntrenched && (
                              <div className="px-2 py-1 bg-[#141414] text-[#E4E3E0] text-[9px] uppercase font-bold tracking-tighter flex items-center gap-1">
                                <Shield size={10} /> Entrenched +6
                              </div>
                            )}
                            {selectedUnit.isPalisaded && (
                              <div className="px-2 py-1 bg-[#141414] text-[#E4E3E0] text-[9px] uppercase font-bold tracking-tighter flex items-center gap-1">
                                <Fence size={10} /> Palisaded +7
                              </div>
                            )}
                            {selectedUnit.isBoxFormation && (
                              <div className="px-2 py-1 bg-[#141414] text-[#E4E3E0] text-[9px] uppercase font-bold tracking-tighter flex items-center gap-1">
                                <Square size={10} /> Box Formation
                              </div>
                            )}
                            {(() => {
                              const tile = gameState.map[selectedUnit.y][selectedUnit.x];
                              const bonus = getTerrainDefenseBonus(tile.terrain);
                              if (bonus > 0) {
                                const label = tile.terrain === 'mountain' ? 'Hill' : tile.terrain === 'buildings' ? 'Village' : tile.terrain;
                                const value = Math.round(bonus * 10);
                                return (
                                  <div className="px-2 py-1 border border-[#141414] text-[9px] uppercase font-bold tracking-tighter flex items-center gap-1">
                                    <MapPin size={10} /> {label} +{value}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="grid grid-cols-2 gap-1">
                              <button 
                                onClick={() => handleRotate('ccw')}
                                disabled={selectedUnit.mp < 1 || selectedUnit.owner !== gameState.currentPlayer}
                                className="py-3 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] disabled:opacity-30 transition-all flex items-center justify-center"
                                title="Rotate CCW (1 MP)"
                              >
                                <RotateCcw size={14} />
                              </button>
                              <button 
                                onClick={() => handleRotate('cw')}
                                disabled={selectedUnit.mp < 1 || selectedUnit.owner !== gameState.currentPlayer}
                                className="py-3 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] disabled:opacity-30 transition-all flex items-center justify-center"
                                title="Rotate CW (1 MP)"
                              >
                                <RotateCw size={14} />
                              </button>
                            </div>
                            <button 
                              onClick={handleEntrench}
                              disabled={selectedUnit.mp < 1 || selectedUnit.owner !== gameState.currentPlayer}
                              className={cn(
                                "py-3 border border-[#141414] uppercase text-[10px] font-bold tracking-widest disabled:opacity-30 transition-all flex items-center justify-center gap-2",
                                selectedUnit.isEntrenched ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414] hover:text-[#E4E3E0]"
                              )}
                            >
                              <Shield size={14} /> {selectedUnit.isEntrenched ? 'Leave Earthworks (1 MP)' : 'Entrench (All MP)'}
                            </button>
                          </div>

                          {selectedUnit.type === 'line_infantry' && (
                            <button 
                              onClick={handleToggleBox}
                              disabled={selectedUnit.mp < 1 || selectedUnit.owner !== gameState.currentPlayer}
                              className={cn(
                                "w-full py-3 border border-[#141414] uppercase text-[10px] font-bold tracking-widest transition-all flex items-center justify-center gap-2",
                                selectedUnit.isBoxFormation ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414] hover:text-[#E4E3E0]"
                              )}
                            >
                              <Square size={14} /> {selectedUnit.isBoxFormation ? 'Disband Box' : 'Form Box'} (1 MP)
                            </button>
                          )}

                          {selectedUnit.type === 'cannon' && (
                            <button 
                              onClick={handleTogglePalisade}
                              disabled={selectedUnit.mp < 1 || selectedUnit.owner !== gameState.currentPlayer}
                              className={cn(
                                "w-full py-3 border border-[#141414] uppercase text-[10px] font-bold tracking-widest transition-all flex items-center justify-center gap-2",
                                selectedUnit.isPalisaded ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414] hover:text-[#E4E3E0]"
                              )}
                            >
                              <Fence size={14} /> {selectedUnit.isPalisaded ? 'Remove Palisades' : 'Erect Palisades'} (1 MP)
                            </button>
                          )}
                      </motion.div>
                    ) : (
                      <div className="p-8 border border-dashed border-[#141414]/30 text-center opacity-30">
                        <Info className="mx-auto mb-2" size={24} />
                        <p className="text-xs uppercase font-mono">No Regiment Selected</p>
                      </div>
                    )}
                  </AnimatePresence>
                </section>

                <section>
                  <h2 className="text-[11px] uppercase tracking-widest opacity-50 font-serif italic mb-4">Reinforcements</h2>
                  <div className="grid grid-cols-1 gap-2">
                    {(Object.keys(UNIT_COSTS) as UnitType[]).map(type => (
                      <button
                        key={type}
                        onClick={() => handleReinforce(type)}
                        disabled={gameState.supply[gameState.currentPlayer] < UNIT_COSTS[type]}
                        className="p-2 border border-[#141414] text-[10px] uppercase font-bold flex justify-between items-center hover:bg-[#141414] hover:text-[#E4E3E0] disabled:opacity-30 transition-all"
                      >
                        <span>{type.replace('_', ' ')}</span>
                        <span className="font-mono">{UNIT_COSTS[type]} S</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="mt-auto">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-[11px] uppercase tracking-widest opacity-50 font-serif italic">Battlefield Logs</h2>
                    <button 
                      onClick={exportLogs}
                      className="text-[9px] uppercase font-mono px-2 py-1 border border-[#141414]/20 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
                    >
                      Export Logs
                    </button>
                  </div>
                  <div className="space-y-2 font-mono text-[10px]">
                    {gameState.battlefieldLogs.map((log, i) => (
                      <div key={i} className={cn(
                        "p-2 border-l-2 border-[#141414] bg-white/30",
                        i === 0 ? "opacity-100" : "opacity-40"
                      )}>
                        {log}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Game Map */}
        <section className={cn(
          "flex-1 relative",
          viewMode === '3d' ? "overflow-hidden bg-[#c9d2c6]" : "bg-[#D1D0CC] overflow-auto p-12 flex flex-col items-center"
        )}>
          {viewMode === '3d' ? (
            <Suspense fallback={
              <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-widest opacity-50">
                Surveying the battlefield…
              </div>
            }>
              <BattlefieldView
                gameState={gameState}
                mapRotation={mapRotation}
                aiMode={gameState.gameMode === 'ai'}
                onTileClick={handleTileClick3D}
                onTileHover={setHoveredTile}
              />
            </Suspense>
          ) : (
          <motion.div 
            animate={{ rotate: mapRotation }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
            className="grid gap-0 border border-[#141414] shadow-2xl relative shrink-0"
            style={{ 
              gridTemplateColumns: `repeat(${gameState.map[0].length}, ${TILE_SIZE}px)`,
              gridTemplateRows: `repeat(${gameState.map.length}, ${TILE_SIZE}px)`
            }}
          >
            <GameAnimations animations={gameState.animations} mapRotation={mapRotation} />
            {gameState.map.map((row, y) => (
              row.map((tile, x) => {
                const unit = gameState.regiments.find(r => r.x === x && r.y === y);
                const isSelected = selectedUnit?.id === unit?.id;
                const isHovered = hoveredTile?.x === x && hoveredTile?.y === y;
                const zocStatus = selectedUnit && !unit ? getZoCStatus(x, y, selectedUnit, gameState.regiments) : { canPass: true, takesDamage: false };
                const dx = selectedUnit ? Math.abs(selectedUnit.x - x) : 0;
                const dy = selectedUnit ? Math.abs(selectedUnit.y - y) : 0;
                const dist = Math.max(dx, dy);
                
                const canMoveTo = selectedUnit && selectedUnit.owner === gameState.currentPlayer && !unit && (dist === 1) && selectedUnit.mp >= getTerrainMpCost(tile.terrain) && zocStatus.canPass;
                const canAttack = selectedUnit && selectedUnit.owner === gameState.currentPlayer && unit && unit.owner !== gameState.currentPlayer && dist <= selectedUnit.range && !selectedUnit.hasAttacked && isTargetInFiringLine(selectedUnit, x, y);

                const isDangerous = zocStatus.takesDamage;

                const isInFiringRange = selectedUnit && dist > 0 && dist <= selectedUnit.range && isTargetInFiringLine(selectedUnit, x, y);

                return (
                  <div 
                    key={`${x}-${y}`}
                    onClick={() => handleTileClick(x, y)}
                    onMouseEnter={() => setHoveredTile(tile)}
                    onMouseLeave={() => setHoveredTile(null)}
                    className={cn(
                      "relative border-[0.5px] border-[#141414]/10 cursor-pointer transition-all",
                      tile.terrain === 'grass' && "bg-[#8BC34A]",
                      tile.terrain === 'forest' && "bg-[#558B2F]",
                      tile.terrain === 'mountain' && "bg-[#33691E]",
                      tile.terrain === 'river' && "bg-[#0288D1]",
                      tile.terrain === 'buildings' && "bg-[#795548]",
                      tile.terrain === 'road' && "bg-[#9E9E9E]",
                      tile.terrain === 'command_center' && "bg-[#F5F5F5]",
                      tile.terrain === 'supply_node' && "bg-[#FFD54F]",
                      tile.terrain === 'capture_point' && "bg-[#FF5252]/20",
                      isHovered && "bg-[#141414]/5",
                      isInFiringRange && "bg-red-500/10",
                      canMoveTo && !isDangerous && "after:absolute after:inset-2 after:border-2 after:border-dashed after:border-blue-500/40",
                      canMoveTo && isDangerous && "after:absolute after:inset-2 after:border-2 after:border-dashed after:border-orange-500/60",
                      canAttack && "after:absolute after:inset-2 after:border-2 after:border-dashed after:border-red-500/40"
                    )}
                    style={{ width: TILE_SIZE, height: TILE_SIZE }}
                  >
                    {/* Terrain Icon (Subtle) */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                      {tile.terrain === 'forest' && <Trees size={24} />}
                      {tile.terrain === 'mountain' && <Mountain size={24} />}
                      {tile.terrain === 'buildings' && <Home size={24} />}
                      {tile.terrain === 'road' && <Route size={24} />}
                      {tile.terrain === 'supply_node' && (
                        <div className={cn(
                          "absolute inset-0 flex items-center justify-center border-2 border-dotted",
                          tile.owner ? side(tile.owner).ring60 : "border-[#141414]/20"
                        )}>
                          <CircleDot size={20} className={tile.owner ? side(tile.owner).textSoft : "text-[#141414]/40"} />
                        </div>
                      )}
                      {tile.terrain === 'capture_point' && (
                        <div className={cn(
                          "absolute inset-0 flex items-center justify-center border-4 border-double",
                          tile.owner ? side(tile.owner).ring80 : "border-[#141414]/40"
                        )}>
                          <Target size={28} className={cn(
                            "animate-pulse",
                            tile.owner ? side(tile.owner).textSoft : "text-[#141414]/60"
                          )} />
                        </div>
                      )}
                      {tile.terrain === 'command_center' && (
                        <div className={cn(
                          "absolute inset-0 flex items-center justify-center border-2 border-dashed",
                          side(tile.owner ?? 1).ring40
                        )}>
                          <Flag size={24} className={side(tile.owner ?? 1).textSoft} />
                        </div>
                      )}
                    </div>

                    {/* Unit */}
                    {unit && (
                      <motion.div 
                        layoutId={unit.id}
                        className={cn(
                          "absolute inset-2 flex flex-col items-center justify-center border-2 shadow-sm",
                          side(unit.owner).unit,
                          isSelected && "ring-4 ring-yellow-400 ring-offset-2",
                          unit.mp === 0 && unit.hasAttacked && "grayscale opacity-80"
                        )}
                      >
                        <div className="relative w-full h-full flex items-center justify-center">
                          {/* Facing Indicator - Locked to Grid */}
                          <div className={cn(
                            "absolute inset-0 flex items-center justify-center transition-transform duration-300",
                            unit.facing === 'north' && "rotate-0",
                            unit.facing === 'east' && "rotate-90",
                            unit.facing === 'south' && "rotate-180",
                            unit.facing === 'west' && "-rotate-90"
                          )}>
                            <ArrowUp size={12} className="absolute -top-2 left-1/2 -translate-x-1/2 opacity-60" />
                          </div>
                          
                          {/* Unit Icon - Upright for User */}
                          <motion.div 
                            animate={{ rotate: -mapRotation }}
                            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                          >
                            <UnitIcon type={unit.type} />
                          </motion.div>
                        </div>
                        
                        {unit.isEntrenched && (
                          <div className="absolute -top-1 -right-1 bg-white text-[#141414] p-0.5 rounded-full border border-[#141414] z-10">
                            <Shield size={8} />
                          </div>
                        )}
                        {unit.isPalisaded && (
                          <div className="absolute -top-1 -right-1 bg-white text-[#141414] p-0.5 rounded-full border border-[#141414] z-10">
                            <Fence size={8} />
                          </div>
                        )}
                        {unit.isBoxFormation && (
                          <div className="absolute -top-1 -left-1 bg-white text-[#141414] p-0.5 rounded-full border border-[#141414] z-10">
                            <Square size={8} />
                          </div>
                        )}
                        {(() => {
                          const tile = gameState.map[unit.y][unit.x];
                          const bonus = getTerrainDefenseBonus(tile.terrain);
                          if (bonus > 0) {
                            return (
                              <div className="absolute -bottom-1 -right-1 bg-white text-[#141414] p-0.5 rounded-full border border-[#141414] z-10">
                                <MapPin size={8} />
                              </div>
                            );
                          }
                          return null;
                        })()}

                        <div className="absolute bottom-0 left-0 w-full h-1 bg-black/20">
                          <div 
                            className="h-full bg-white" 
                            style={{ width: `${(unit.men / unit.maxMen) * 100}%` }} 
                          />
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
              })
            ))}
          </motion.div>
          )}

          <AiConfigModal 
        isOpen={showAiConfig}
        onClose={() => setShowAiConfig(false)}
        aiConfigs={gameState.aiConfigs}
        nations={gameState.nations}
        onSave={(configs) => {
          setGameState(prev => ({ ...prev, aiConfigs: configs }));
          setShowAiConfig(false);
        }}
      />

      {/* Winner Overlay */}
          <AnimatePresence>
            {gameState.winner && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 bg-[#141414]/90 z-50 flex flex-col items-center justify-center text-[#E4E3E0] p-12 text-center"
              >
                <h2 className="text-6xl font-bold uppercase italic font-serif mb-4">Victory</h2>
                <p className="text-2xl mb-8 uppercase tracking-widest">Player {gameState.winner} ({NATIONS[nationOf(gameState, gameState.winner)].adjective}) has conquered the field</p>
                <button 
                  onClick={resetGame}
                  className="px-12 py-4 border border-[#E4E3E0] hover:bg-[#E4E3E0] hover:text-[#141414] transition-all uppercase font-bold tracking-widest"
                >
                  New Campaign
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Sidebar Right: Controls */}
        <AnimatePresence>
          {isRightSidebarOpen && (
            <motion.aside 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 256, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="border-l border-[#141414] flex flex-col gap-8 overflow-hidden bg-[#E4E3E0] z-20"
            >
              <div className="w-64 p-6 flex flex-col gap-8 h-full overflow-y-auto">
                <section>
                  <h2 className="text-[11px] uppercase tracking-widest opacity-50 font-serif italic mb-4">Tactical HUD</h2>
                  <div className="space-y-4">
                    <button 
                      onClick={rotateView}
                      className="w-full py-3 border border-[#141414] uppercase text-[10px] font-bold tracking-widest hover:bg-[#141414] hover:text-[#E4E3E0] transition-all flex items-center justify-center gap-2"
                    >
                      <Compass size={14} /> Rotate View
                    </button>
                    <div className="p-4 border border-[#141414] bg-white/50">
                      <p className="text-[10px] uppercase opacity-50 font-mono italic">Terrain Info</p>
                      {hoveredTile ? (
                        <div className="mt-2">
                          <p className="text-lg font-bold uppercase">
                            {hoveredTile.terrain === 'mountain' ? 'Hills' : 
                             hoveredTile.terrain === 'buildings' ? 'Village' : 
                             hoveredTile.terrain === 'road' ? 'Road' : 
                             hoveredTile.terrain === 'command_center' ? 'Command Center' :
                             hoveredTile.terrain === 'supply_node' ? 'Supply Node' :
                             hoveredTile.terrain === 'capture_point' ? 'Capture Point' :
                             hoveredTile.terrain}
                          </p>
                          <p className="text-[10px] font-mono opacity-70">MP Cost: {getTerrainMpCost(hoveredTile.terrain)}</p>
                        </div>
                      ) : (
                        <p className="text-xs font-mono opacity-30 mt-2 italic">Hover over map...</p>
                      )}
                    </div>
                  </div>
                </section>

                {/* The latest AI dispatch lives here, off the map, so it never hides the troops. */}
                {gameState.monologueHistory.length > 0 && (() => {
                  const latest = gameState.monologueHistory[gameState.monologueHistory.length - 1];
                  return (
                    <section>
                      <h2 className="flex items-center justify-between text-[11px] uppercase tracking-widest opacity-50 font-serif italic mb-4">
                        <span>General {latest.player}'s Dispatch</span>
                        <span className="not-italic font-mono text-[9px]">Turn {latest.turn}</span>
                      </h2>
                      <div className={cn("p-3 border-l-2 max-h-[38vh] overflow-y-auto custom-scrollbar", side(latest.player).archive)}>
                        <Markdown text={latest.text} className="space-y-1.5 font-serif italic text-[11px] leading-relaxed text-[#141414]/85" />
                      </div>
                    </section>
                  );
                })()}

                <section>
                  <button 
                    onClick={() => setIsArchiveOpen(!isArchiveOpen)}
                    className="w-full flex items-center justify-between text-[11px] uppercase tracking-widest opacity-50 font-serif italic mb-4 hover:opacity-100 transition-opacity"
                  >
                    <span>Strategic Archive</span>
                    {isArchiveOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  
                  <AnimatePresence>
                    {isArchiveOpen && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                          {gameState.monologueHistory.length === 0 ? (
                            <p className="text-[10px] font-mono opacity-30 italic">No strategic data recorded.</p>
                          ) : (
                            [...gameState.monologueHistory].reverse().map((m, i) => (
                              <div key={i} className={cn(
                                "p-3 border-l-2 text-[10px] leading-relaxed",
                                side(m.player).archive
                              )}>
                                <div className="flex justify-between items-center mb-1 opacity-60 font-bold uppercase text-[8px]">
                                  <span>Turn {m.turn} - Player {m.player}</span>
                                  <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <Markdown text={m.text} className="space-y-1 font-serif italic text-[#141414]/80" />
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>

                <section className="mt-auto space-y-4">
                  <div className="p-4 border border-[#141414] bg-[#141414] text-[#E4E3E0] flex flex-col gap-2">
                    <div className="flex items-center gap-2 opacity-50">
                      <Terminal size={12} />
                      <p className="text-[10px] uppercase font-mono italic">Command Line</p>
                    </div>

                    {/* CLI History Area */}
                    <div className="h-32 overflow-y-auto flex flex-col-reverse gap-1 mb-2 scrollbar-hide border-b border-white/5 pb-2">
                      {gameState.cliHistory.map((msg, i) => (
                        <p key={i} className="text-[10px] font-mono opacity-80 leading-tight border-l border-white/10 pl-2">
                          {msg}
                        </p>
                      ))}
                    </div>

                    <div className="relative">
                      {isAiThinking && (
                        <div className="absolute inset-0 bg-[#141414]/80 flex items-center justify-center z-10">
                          <div className="flex gap-1">
                            <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-1 h-1 bg-white rounded-full" />
                            <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-white rounded-full" />
                            <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-white rounded-full" />
                          </div>
                          <span className="ml-2 text-[8px] font-mono text-white uppercase tracking-widest">AI Thinking</span>
                        </div>
                      )}
                      <textarea 
                        autoFocus
                        rows={3}
                        value={commandInput}
                        disabled={isAiThinking}
                        onChange={(e) => {
                          setCommandInput(e.target.value);
                          if (commandError) setCommandError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            executeCommand(commandInput);
                          }
                        }}
                        placeholder="mv p1-l1 10:15..."
                        className="w-full bg-transparent border-b border-[#E4E3E0]/30 py-1 text-xs font-mono focus:outline-none focus:border-[#E4E3E0] placeholder:opacity-30 resize-none"
                      />
                      {commandError && (
                        <p className="text-[9px] text-red-400 mt-1 font-mono leading-tight">{commandError}</p>
                      )}
                    </div>
                    <p className="text-[8px] opacity-30 font-mono mt-1 italic">Type 'help' for commands</p>
                  </div>
                  <button 
                    onClick={() => {
                      endTurn();
                      setCommandInput('');
                      setCommandError(null);
                    }}
                    className="w-full py-6 bg-[#141414] text-[#E4E3E0] uppercase font-bold tracking-[0.2em] hover:bg-[#2a2a2a] transition-all flex items-center justify-center gap-3 group"
                  >
                    End Turn <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </section>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
