import claudeIcon from '../assets/providers/claude.svg';
import geminiIcon from '../assets/providers/gemini.svg';
import { AiProvider } from '../game/types';

const ICONS: Record<AiProvider, { src: string; name: string }> = {
  claude: { src: claudeIcon, name: 'Claude' },
  gemini: { src: geminiIcon, name: 'Gemini' },
};

/** The provider's logo, in its brand colour, to show at a glance which AI is commanding. */
export function ProviderIcon({ provider, size = 14, className = '' }: { provider?: AiProvider; size?: number; className?: string }) {
  if (!provider) return null;
  const icon = ICONS[provider];
  return <img src={icon.src} alt={icon.name} title={icon.name} width={size} height={size} className={'inline-block shrink-0 ' + className} draggable={false} />;
}
