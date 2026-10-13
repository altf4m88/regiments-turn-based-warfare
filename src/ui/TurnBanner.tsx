import { useEffect, useRef, useState } from 'react';
import { modelName, resolveAiModel } from '../ai/models';
import { NATIONS, commanderOf, isAiPlayer, nationOf } from '../game/engine';
import { GameState, Nation } from '../game/types';
import { ProviderIcon } from './ProviderIcon';

const TITLE_COLOR: Record<Nation, string> = { british: 'text-red-200', french: 'text-blue-200' };
const SHOW_MS = 3200;

/**
 * Announces each new turn across the battlefield (3D or 2D): the army on the march, and who
 * commands it, with the AI model and its provider's logo when an AI general is thinking.
 */
export function TurnBanner({ state, compact = false }: { state: GameState; compact?: boolean }) {
  const [banner, setBanner] = useState<{ key: number; turn: number; player: number } | null>(null);
  const last = useRef<string | null>(null);

  useEffect(() => {
    const key = `${state.battleId}:${state.turn}:${state.currentPlayer}`;
    if (last.current === key) return;
    const first = last.current === null || !last.current.startsWith(`${state.battleId}:`);
    last.current = key;
    // Not when a battle opens (the field is still drawing) or once it is won.
    if (first || state.winner) return;
    setBanner({ key: Date.now(), turn: state.turn, player: state.currentPlayer });
  }, [state.battleId, state.turn, state.currentPlayer, state.winner]);

  // Each banner fades out on its own clock; a victory clears it at once.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [banner?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (state.winner) setBanner(null);
  }, [state.winner]);

  if (!banner) return null;
  const nation = nationOf(state, banner.player);
  const commander = commanderOf(state, banner.player);
  const ai = isAiPlayer(state, banner.player);
  const config = state.aiConfigs[banner.player];

  return (
    <div
      key={banner.key}
      className="bf-turn-banner fixed left-1/2 top-[22%] z-[65] pointer-events-none text-center max-w-[calc(100vw-1rem)]"
      role="status"
    >
      <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-[#E4E3E0]/80">Turn {banner.turn} · Player {banner.player}</div>
      <div className={(compact ? 'text-2xl ' : 'text-4xl ') + 'font-serif italic font-bold tracking-tight whitespace-nowrap ' + TITLE_COLOR[nation]}>
        The {NATIONS[nation].adjective} march
      </div>
      <div className={'mt-1.5 flex items-center justify-center gap-2 text-[#E4E3E0] ' + (compact ? 'text-xs' : 'text-sm')}>
        {ai ? (
          <>
            <span><span className="font-bold">{commander}</span> is thinking with {modelName(config)}</span>
            <ProviderIcon provider={resolveAiModel(config).provider} size={compact ? 16 : 20} />
          </>
        ) : (
          <span>
            <span className="font-bold">{commander}</span> {state.gameMode === 'versus' ? 'awaits your orders' : 'takes command'}
          </span>
        )}
      </div>
    </div>
  );
}
