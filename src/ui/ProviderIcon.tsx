import claudeIcon from '../assets/providers/claude.svg';
import deepseekIcon from '../assets/providers/deepseek.svg';
import gemmaIcon from '../assets/providers/gemma.svg';
import geminiIcon from '../assets/providers/gemini.svg';
import kimiIcon from '../assets/providers/kimi.svg';
import metaIcon from '../assets/providers/meta.svg';
import minimaxIcon from '../assets/providers/minimax.svg';
import mistralIcon from '../assets/providers/mistral.svg';
import nvidiaIcon from '../assets/providers/nvidia.svg';
import openaiIcon from '../assets/providers/openai.svg';
import openrouterIcon from '../assets/providers/openrouter.svg';
import qwenIcon from '../assets/providers/qwen.svg';
import xaiIcon from '../assets/providers/xai.svg';
import zaiIcon from '../assets/providers/zai.svg';
import { Maker, makerOf } from '../ai/models';
import { AiProvider } from '../game/types';

/** Each logo, and whether it is a one-colour mark that needs a light disc to show on dark buttons. */
const ICONS: Record<Maker, { src: string; name: string; mono?: boolean }> = {
  claude: { src: claudeIcon, name: 'Claude' },
  gemini: { src: geminiIcon, name: 'Gemini' },
  openai: { src: openaiIcon, name: 'OpenAI', mono: true },
  openrouter: { src: openrouterIcon, name: 'OpenRouter', mono: true },
  meta: { src: metaIcon, name: 'Meta' },
  zai: { src: zaiIcon, name: 'Z.ai', mono: true },
  gemma: { src: gemmaIcon, name: 'Gemma' },
  deepseek: { src: deepseekIcon, name: 'DeepSeek' },
  qwen: { src: qwenIcon, name: 'Qwen' },
  kimi: { src: kimiIcon, name: 'Kimi' },
  mistral: { src: mistralIcon, name: 'Mistral AI' },
  nvidia: { src: nvidiaIcon, name: 'NVIDIA' },
  xai: { src: xaiIcon, name: 'xAI' },
  minimax: { src: minimaxIcon, name: 'MiniMax' },
};

/**
 * The logo of whoever is commanding, to show at a glance which AI it is: the provider's,
 * or for a model on OpenRouter, its maker's (Meta for Llama, Z.ai for GLM…).
 */
export function ProviderIcon({ provider, model, size = 14, className = '' }: { provider?: AiProvider; model?: string; size?: number; className?: string }) {
  if (!provider) return null;
  const icon = ICONS[makerOf(provider, model)];
  const label = provider === 'openrouter' && makerOf(provider, model) !== 'openrouter' ? `${icon.name} via OpenRouter` : icon.name;
  if (icon.mono) {
    const inner = Math.round(size * 0.72);
    return (
      <span title={label} className={'inline-flex items-center justify-center shrink-0 rounded-full bg-white ring-1 ring-[#141414]/10 ' + className} style={{ width: size, height: size }}>
        <img src={icon.src} alt={label} width={inner} height={inner} draggable={false} />
      </span>
    );
  }
  return <img src={icon.src} alt={label} title={label} width={size} height={size} className={'inline-block shrink-0 ' + className} draggable={false} />;
}
