import { DOCTRINES, doctrineMen, doctrineSummary } from '../game/engine';
import { ArmyDoctrine, Nation } from '../game/types';

const ORDER: ArmyDoctrine[] = ['balanced', 'cavalry', 'light', 'artillery'];
const PICK: Record<Nation, string> = {
  british: 'border-red-700 bg-red-50 text-red-900',
  french: 'border-blue-700 bg-blue-50 text-blue-900',
};

/** The four starting armies for one side, with the chosen one's order of battle. */
export function ArmyPicker({ nation, player, value, onChange }: {
  nation: Nation;
  player: number;
  value: ArmyDoctrine;
  onChange: (doctrine: ArmyDoctrine) => void;
}) {
  return (
    <div className="px-2 pb-2 space-y-1.5">
      <div role="radiogroup" aria-label={`Player ${player}'s order of battle`} className="grid grid-cols-2 gap-1">
        {ORDER.map(d => (
          <button
            key={d}
            role="radio"
            aria-checked={value === d}
            onClick={() => onChange(d)}
            title={DOCTRINES[d].blurb}
            className={'px-2 py-1.5 border text-left transition-colors ' + (value === d ? PICK[nation] : 'border-[#141414]/15 hover:border-[#141414]/60')}
          >
            <span className="block text-[11px] font-bold uppercase tracking-tight leading-tight">{DOCTRINES[d].name}</span>
            <span className="block text-[9px] font-mono opacity-60 leading-tight">
              <span className="whitespace-nowrap">{DOCTRINES[d].deploy.length} regiments</span> · <span className="whitespace-nowrap">{doctrineMen(d).toLocaleString('en-GB')} men</span>
            </span>
          </button>
        ))}
      </div>
      <p className="text-[10px] font-mono leading-snug">
        <span className="opacity-80">{doctrineSummary(value)}</span>
        <span className="block opacity-50">{DOCTRINES[value].blurb}.</span>
      </p>
    </div>
  );
}
