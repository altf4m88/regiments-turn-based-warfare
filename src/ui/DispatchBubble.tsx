import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Minus, X } from 'lucide-react';
import { modelName, resolveAiModel } from '../ai/models';
import { commanderOf, nationOf } from '../game/engine';
import { GameState, MonologueEntry, Nation } from '../game/types';
import { CommanderPortrait } from './CommanderPortrait';
import { Markdown, plainText } from './Markdown';
import { ProviderIcon } from './ProviderIcon';

const EDGE: Record<Nation, string> = { british: 'border-red-700', french: 'border-blue-700' };
const NAME: Record<Nation, string> = { british: 'text-red-800', french: 'text-blue-800' };

/**
 * The latest AI dispatch as a speech bubble from its general, floating over the top-right
 * of the map: three lines at first, the whole dispatch on request, minimised to a tab, or
 * closed until the next one arrives.
 */
export function DispatchBubble({ state, entry, minimized, onMinimize, onClose, className = '' }: {
  state: GameState;
  entry: MonologueEntry;
  minimized: boolean;
  onMinimize: (minimized: boolean) => void;
  onClose: () => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [readAt, setReadAt] = useState(0);
  // Each new dispatch opens as a short preview.
  useEffect(() => setExpanded(false), [entry.timestamp]);
  const nation = nationOf(state, entry.player);
  const commander = commanderOf(state, entry.player);
  const config = state.aiConfigs[entry.player];
  const ai = config ? resolveAiModel(config) : undefined;
  const unread = minimized && readAt < entry.timestamp;
  const long = plainText(entry.text).length > 180;

  return (
    <AnimatePresence mode="wait">
      {minimized ? (
        <motion.button
          key="tab"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          onClick={() => { setReadAt(entry.timestamp); onMinimize(false); }}
          className={'absolute z-[60] flex items-center gap-2 pl-1 pr-3 py-1 bg-white/95 border-2 shadow-lg text-[10px] font-bold uppercase tracking-wider ' + EDGE[nation] + ' ' + className}
          aria-label={`Show ${commander}'s dispatch`}
        >
          <CommanderPortrait name={commander} nation={nation} size={26} />
          <span className={NAME[nation]}>{commander}'s dispatch</span>
          {unread && <span className="w-2 h-2 rounded-full bg-current animate-pulse" aria-label="new" />}
        </motion.button>
      ) : (
        <motion.div
          key={`bubble-${entry.timestamp}`}
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          className={'absolute z-[60] w-[min(380px,calc(100%-1rem))] ' + className}
          role="status"
          aria-label={`${commander}'s dispatch`}
        >
          <div className="flex items-end gap-2.5 pl-1">
            <CommanderPortrait name={commander} nation={nation} size={52} className="relative z-10 shadow-lg" />
            <div className="flex-1 min-w-0 mb-1 leading-tight bg-white/90 px-2 py-1 shadow-sm">
              <p className={'font-serif italic font-bold text-sm truncate ' + NAME[nation]}>{commander}</p>
              <p className="flex items-center gap-1 text-[9px] font-mono uppercase text-[#141414]/70">
                <ProviderIcon provider={ai?.provider} model={ai?.model} size={10} /> {config ? modelName(config) : 'AI general'} · turn {entry.turn}
              </p>
            </div>
            <div className="flex gap-1 pb-1">
              <button onClick={() => { setReadAt(entry.timestamp); onMinimize(true); }} className="h-7 w-7 flex items-center justify-center bg-white/90 border border-[#141414]/30 hover:bg-[#141414] hover:text-[#E4E3E0]" aria-label="Minimise the dispatch" title="Minimise">
                <Minus size={13} />
              </button>
              <button onClick={onClose} className="h-7 w-7 flex items-center justify-center bg-white/90 border border-[#141414]/30 hover:bg-[#141414] hover:text-[#E4E3E0]" aria-label="Close the dispatch" title="Close until the next dispatch">
                <X size={13} />
              </button>
            </div>
          </div>
          {/* The speech bubble, its tail rising to the portrait. */}
          <div className={'relative mt-2 bg-white/95 backdrop-blur-sm border-2 shadow-xl ' + EDGE[nation]}>
            <span className={'absolute -top-[9px] left-6 w-4 h-4 rotate-45 bg-white border-l-2 border-t-2 ' + EDGE[nation]} aria-hidden />
            <div className="relative px-4 pt-3 pb-1">
              {expanded ? (
                <Markdown text={entry.text} className="max-h-[45vh] overflow-y-auto space-y-1.5 font-serif italic text-[13px] leading-relaxed text-[#141414]" />
              ) : (
                <p className="font-serif italic text-[13px] leading-relaxed text-[#141414] line-clamp-3">{plainText(entry.text)}</p>
              )}
            </div>
            {long ? (
              <button onClick={() => setExpanded(v => !v)} className="px-4 pt-1 pb-2.5 font-bold uppercase text-[9px] tracking-wider text-[#141414]/60 hover:text-[#141414]">
                {expanded ? 'Show less' : 'Read full dispatch'}
              </button>
            ) : <div className="pb-2" />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
