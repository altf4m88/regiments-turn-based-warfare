/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Sword, 
  Move, 
  Users, 
  ChevronRight, 
  RotateCcw, 
  Flag,
  Target,
  Info,
  RotateCw,
  MapPin,
  Square,
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
  Fence,
  Bomb,
  CircleDot,
  Terminal
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { Regiment, Tile, GameState, UnitType, Facing, GameAnimation } from './game/types';
import { getInitialState, calculateDamage, getTerrainMpCost, isTargetInFiringLine, getZoCStatus, getTerrainDefenseBonus, UNIT_COSTS, SUPPLY_PER_TURN, SUPPLY_NODE_BONUS, createInitialRegiment, findPath } from './game/engine';

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

export default function App() {
  const [gameState, setGameState] = useState<GameState>(getInitialState());
  const [hoveredTile, setHoveredTile] = useState<Tile | null>(null);
  const [mapRotation, setMapRotation] = useState(0);
  const [commandInput, setCommandInput] = useState('');
  const [commandError, setCommandError] = useState<string | null>(null);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

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

  const performMove = (unit: Regiment, x: number, y: number, cost: number) => {
    if (unit.isPalisaded) {
      addBattlefieldLog(`[${unit.id}] ${unit.name} cannot move while palisaded!`);
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
    const defenderTile = gameState.map[defender.y][defender.x];
    const attackerTile = gameState.map[attacker.y][attacker.x];
    
    const damage = calculateDamage(attacker, defender, defenderTile.terrain);
    const dist = Math.max(Math.abs(attacker.x - defender.x), Math.abs(attacker.y - defender.y));
    let counterDamage = (defender.range >= dist && isTargetInFiringLine(defender, attacker.x, attacker.y))
      ? calculateDamage(defender, attacker, attackerTile.terrain) 
      : 0;

    // Skirmishers (Light Infantry/Chasseurs) harass Line Infantry without taking return fire
    if ((attacker.type === 'light_infantry' || attacker.type === 'chasseurs') && defender.type === 'line_infantry') {
      counterDamage = 0;
    }

    // Hussars are fast and hard to hit during a charge
    if (attacker.type === 'hussars') {
      counterDamage = Math.floor(counterDamage * 0.4); // Take 60% less return fire when attacking
    }

    const actualDamage = Math.floor(Math.min(defender.men, damage));
    const actualCounterDamage = Math.floor(Math.min(attacker.men, counterDamage));

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
    
    if (defender.men <= damage) {
      addBattlefieldLog(`[${defender.id}] ${defender.name} has been routed!`);
    }
    if (attacker.men <= counterDamage) {
      addBattlefieldLog(`[${attacker.id}] ${attacker.name} has been routed!`);
    }
  };

  const handleEntrench = () => {
    if (!selectedUnit || selectedUnit.owner !== gameState.currentPlayer || selectedUnit.mp < 1 || selectedUnit.isEntrenched) return;

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

    const newId = `${gameState.currentPlayer}-${type}-${Date.now()}`;
    const index = gameState.regiments.filter(r => r.owner === gameState.currentPlayer && r.type === type).length;
    const newUnit = createInitialRegiment(newId, type, gameState.currentPlayer, emptyNeighbor.x, emptyNeighbor.y, index);
    
    // Reinforcements cannot move or attack on the turn they arrive
    newUnit.mp = 0;
    newUnit.hasAttacked = true;

    setGameState(prev => ({
      ...prev,
      supply: {
        ...prev.supply,
        [prev.currentPlayer]: prev.supply[prev.currentPlayer] - cost
      },
      regiments: [...prev.regiments, newUnit]
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

  const executeCommand = (cmd: string) => {
    setCommandError(null);
    const lines = cmd.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (lines.length === 0) {
      setCommandInput('');
      return;
    }

    setGameState(prev => {
      let currentState = { ...prev };
      let logsToAdd: string[] = [];
      let cliToAdd: string[] = [];
      let error: string | null = null;

      const localAddBattlefieldLog = (msg: string) => {
        logsToAdd = [msg, ...logsToAdd];
      };

      const localAddCliOutput = (msg: string) => {
        cliToAdd = [msg, ...cliToAdd];
      };

      for (const line of lines) {
        if (error) break;
        const parts = line.toLowerCase().split(' ');
        const action = parts[0];

        if (action === 'end') {
          currentState = processEndTurn(currentState);
          currentState.battlefieldLogs = [`Turn ${currentState.turn}: Player ${currentState.currentPlayer}'s turn.`, ...currentState.battlefieldLogs].slice(0, 20);
          localAddCliOutput("Turn ended by command.");
          break;
        }

        if (action === 'help') {
          localAddCliOutput("Commands: ls [all|types|map|supply|info <id>|tile <x>:<y>|costs], whoami, status, mv <id> <x>:<y>, eg <id> <targetId>, ent <id>, rtr <id>, rtl <id>, rlt <id>, box <id>, pal <id>, sel <id>, spawn <type>, end, clear, help");
          continue;
        }

        if (action === 'whoami') {
          localAddCliOutput(`You are Player ${currentState.currentPlayer}. Supply: ${currentState.supply[currentState.currentPlayer]}`);
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
          const type = parts[1] as UnitType;
          const cost = UNIT_COSTS[type];
          if (!cost) { error = "Invalid unit type."; break; }
          if (currentState.supply[currentState.currentPlayer] < cost) { error = `Insufficient supply. Need ${cost}.`; break; }
          
          let cc: Tile | null = null;
          for (const row of currentState.map) for (const tile of row) if (tile.terrain === 'command_center' && tile.owner === currentState.currentPlayer) cc = tile;
          if (!cc) { error = "No Command Center found."; break; }

          const neighbors = [{x:cc.x,y:cc.y-1},{x:cc.x,y:cc.y+1},{x:cc.x-1,y:cc.y},{x:cc.x+1,y:cc.y},{x:cc.x-1,y:cc.y-1},{x:cc.x+1,y:cc.y-1},{x:cc.x-1,y:cc.y+1},{x:cc.x+1,y:cc.y+1}];
          const emptyNeighbor = neighbors.find(n => n.x >= 0 && n.x < 20 && n.y >= 0 && n.y < 20 && !currentState.regiments.some(r => r.x === n.x && r.y === n.y) && currentState.map[n.y][n.x].terrain !== 'river' && currentState.map[n.y][n.x].terrain !== 'mountain');
          if (!emptyNeighbor) { error = "No space around CC."; break; }

          const newId = `${currentState.currentPlayer}-${type}-${Date.now()}`;
          const index = currentState.regiments.filter(r => r.owner === currentState.currentPlayer && r.type === type).length;
          const newUnit = createInitialRegiment(newId, type, currentState.currentPlayer, emptyNeighbor.x, emptyNeighbor.y, index);
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
            
            // Perform attack logic manually
            const damage = calculateDamage(unit, target, currentState.map[target.y][target.x].terrain);
            const counterDamage = (target.range >= dist && isTargetInFiringLine(target, unit.x, unit.y)) ? calculateDamage(target, unit, currentState.map[unit.y][unit.x].terrain) : 0;
            const actualDamage = Math.floor(Math.min(target.men, damage));
            const actualCounterDamage = Math.floor(Math.min(unit.men, counterDamage));
            currentState.regiments = currentState.regiments.map(r => {
              if (r.id === target.id) return { ...r, men: Math.max(0, r.men - actualDamage) };
              if (r.id === unit.id) return { ...r, men: Math.max(0, r.men - actualCounterDamage), hasAttacked: true, mp: Math.max(0, r.mp - 1) };
              return r;
            }).filter(r => r.men > 0);
            localAddBattlefieldLog(`[${unit.id}] engaged [${target.id}]. Casualties: Enemy ${actualDamage}, Own ${actualCounterDamage}`);
            localAddCliOutput(`Attacked [${target.id}] with [${unit.id}].`);
            break;
          }
          case 'ent':
            if (unit.mp < 1 || unit.isEntrenched) { error = "Cannot entrench."; break; }
            currentState.regiments = currentState.regiments.map(r => r.id === unit.id ? { ...r, isEntrenched: true, mp: 0 } : r);
            localAddBattlefieldLog(`[${unit.id}] entrenched.`);
            localAddCliOutput(`[${unit.id}] entrenched.`);
            break;
          case 'rtr':
          case 'rtl':
          case 'rlt': {
            if (unit.mp < 1) { error = "Insufficient MP."; break; }
            const directions: Facing[] = ['north', 'east', 'south', 'west'];
            const currentIndex = directions.indexOf(unit.facing);
            const nextIndex = (action === 'rtr') ? (currentIndex + 1) % 4 : (currentIndex + 3) % 4;
            const newFacing = directions[nextIndex];
            currentState.regiments = currentState.regiments.map(r => r.id === unit.id ? { ...r, facing: newFacing, mp: r.mp - 1 } : r);
            localAddCliOutput(`[${unit.id}] rotated to face ${newFacing}.`);
            break;
          }
          case 'box':
            if (unit.type !== 'line_infantry' || unit.mp < 1) { error = "Cannot form Box."; break; }
            currentState.regiments = currentState.regiments.map(r => r.id === unit.id ? { ...r, isBoxFormation: !r.isBoxFormation, mp: r.mp - 1 } : r);
            localAddCliOutput(`[${unit.id}] toggled Box Formation.`);
            break;
          case 'pal':
            if (unit.type !== 'cannon' || unit.mp < 1) { error = "Cannot build Palisades."; break; }
            currentState.regiments = currentState.regiments.map(r => r.id === unit.id ? { ...r, isPalisaded: !r.isPalisaded, mp: 0 } : r);
            localAddCliOutput(`[${unit.id}] toggled Palisades.`);
            break;
          default:
            error = `Unknown command: ${action}`;
        }
      }

      if (error) {
        setCommandError(error);
        localAddCliOutput(`Error: ${error}`);
      }

      return {
        ...currentState,
        battlefieldLogs: [...logsToAdd, ...currentState.battlefieldLogs].slice(0, 20),
        cliHistory: [...cliToAdd, ...currentState.cliHistory].slice(0, 50)
      };
    });

    setCommandInput('');
  };

  const resetGame = () => {
    setGameState(getInitialState());
  };

  const exportLogs = () => {
    const content = `--- BATTLEFIELD LOGS ---\n${gameState.battlefieldLogs.join('\n')}\n\n--- CLI HISTORY ---\n${gameState.cliHistory.join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `napoleon_logs_turn_${gameState.turn}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex flex-col bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0] overflow-hidden">
      {/* Header */}
      <header className="border-b border-[#141414] p-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter uppercase italic font-serif">Regiments</h1>
          <p className="text-[10px] uppercase tracking-widest opacity-50 font-mono">19th Century Warfare Simulation</p>
        </div>
        <div className="flex gap-8 items-center">
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
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase opacity-50 font-mono italic">Supply</p>
            <p className="text-xl font-bold font-mono text-blue-600">{gameState.supply[gameState.currentPlayer]}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase opacity-50 font-mono italic">Capture Point</p>
            <p className={cn(
              "text-xl font-bold font-mono",
              gameState.capturePointOwner === 1 ? "text-blue-700" : gameState.capturePointOwner === 2 ? "text-red-700" : "opacity-30"
            )}>
              {gameState.capturePointOwner ? `${gameState.capturePointTurns}/5` : "---"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase opacity-50 font-mono italic">Current Turn</p>
            <p className="text-xl font-bold font-mono">{gameState.turn}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase opacity-50 font-mono italic">Active Player</p>
            <p className={cn(
              "text-xl font-bold uppercase",
              gameState.currentPlayer === 1 ? "text-blue-700" : "text-red-700"
            )}>
              Player {gameState.currentPlayer}
            </p>
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
                              selectedUnit.owner === 1 ? "bg-blue-100" : "bg-red-100"
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
                              disabled={selectedUnit.mp < 1 || selectedUnit.isEntrenched || selectedUnit.owner !== gameState.currentPlayer}
                              className="py-3 border border-[#141414] uppercase text-[10px] font-bold tracking-widest hover:bg-[#141414] hover:text-[#E4E3E0] disabled:opacity-30 transition-all flex items-center justify-center gap-2"
                            >
                              <Shield size={14} /> Entrench
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
        <section className="flex-1 bg-[#D1D0CC] overflow-auto p-12 relative flex flex-col items-center">
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
                          tile.owner === 1 ? "border-blue-500/60" : tile.owner === 2 ? "border-red-500/60" : "border-[#141414]/20"
                        )}>
                          <CircleDot size={20} className={tile.owner === 1 ? "text-blue-600" : tile.owner === 2 ? "text-red-600" : "text-[#141414]/40"} />
                        </div>
                      )}
                      {tile.terrain === 'capture_point' && (
                        <div className={cn(
                          "absolute inset-0 flex items-center justify-center border-4 border-double",
                          tile.owner === 1 ? "border-blue-500/80" : tile.owner === 2 ? "border-red-500/80" : "border-[#141414]/40"
                        )}>
                          <Target size={28} className={cn(
                            "animate-pulse",
                            tile.owner === 1 ? "text-blue-600" : tile.owner === 2 ? "text-red-600" : "text-[#141414]/60"
                          )} />
                        </div>
                      )}
                      {tile.terrain === 'command_center' && (
                        <div className={cn(
                          "absolute inset-0 flex items-center justify-center border-2 border-dashed",
                          tile.owner === 1 ? "border-blue-500/40" : "border-red-500/40"
                        )}>
                          <Flag size={24} className={tile.owner === 1 ? "text-blue-600" : "text-red-600"} />
                        </div>
                      )}
                    </div>

                    {/* Unit */}
                    {unit && (
                      <motion.div 
                        layoutId={unit.id}
                        className={cn(
                          "absolute inset-2 flex flex-col items-center justify-center border-2 shadow-sm",
                          unit.owner === 1 ? "bg-blue-600 border-blue-900 text-white" : "bg-red-600 border-red-900 text-white",
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

          {/* Winner Overlay */}
          <AnimatePresence>
            {gameState.winner && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 bg-[#141414]/90 z-50 flex flex-col items-center justify-center text-[#E4E3E0] p-12 text-center"
              >
                <h2 className="text-6xl font-bold uppercase italic font-serif mb-4">Victory</h2>
                <p className="text-2xl mb-8 uppercase tracking-widest">Player {gameState.winner} has conquered the field</p>
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
                      <textarea 
                        autoFocus
                        rows={3}
                        value={commandInput}
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
