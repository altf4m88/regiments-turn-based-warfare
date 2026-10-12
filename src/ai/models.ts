import { AiConfig, AiProvider, ThinkingLevelSetting } from '../game/types';

/** What the settings dialog shows for each provider. */
export const AI_PROVIDERS: Record<AiProvider, { label: string; vendor: string; keyPlaceholder: string; keyHint: string }> = {
  gemini: {
    label: 'Gemini',
    vendor: 'Google',
    keyPlaceholder: 'Paste your key here...',
    keyHint: 'Get a key at aistudio.google.com',
  },
  claude: {
    label: 'Claude',
    vendor: 'Anthropic',
    keyPlaceholder: 'sk-ant-...',
    keyHint: 'Get a key at platform.claude.com',
  },
};

/** Models each provider's generals can run on; the first is the default. */
export const AI_MODELS: Record<AiProvider, { id: string; label: string }[]> = {
  gemini: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  ],
  claude: [
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (strongest, slower)' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest, cheapest)' },
  ],
};
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: AI_MODELS.gemini[0].id,
  claude: AI_MODELS.claude[0].id,
};

/** A thinking level is always sent: Gemini 3.8 Flash rejects an empty thinking config. */
export const THINKING_LEVELS: { id: ThinkingLevelSetting; label: string; hint: string }[] = [
  { id: 'low', label: 'Low', hint: 'Fastest replies, least deliberation' },
  { id: 'medium', label: 'Medium', hint: 'Balanced (default)' },
  { id: 'high', label: 'High', hint: 'Deepest planning, slowest turns' },
];
export const DEFAULT_THINKING_LEVEL: ThinkingLevelSetting = 'medium';

/**
 * The provider, key, model and thinking level a config will actually run with.
 * Unknown or retired models fall back to the provider's default.
 */
export const resolveAiModel = (config: AiConfig) => {
  const provider: AiProvider = config.provider === 'claude' ? 'claude' : 'gemini';
  const wanted = provider === 'claude' ? config.claudeModel : config.model;
  return {
    provider,
    apiKey: (provider === 'claude' ? config.claudeApiKey : config.apiKey) ?? '',
    model: wanted && AI_MODELS[provider].some(m => m.id === wanted) ? wanted : DEFAULT_MODELS[provider],
    thinkingLevel: THINKING_LEVELS.some(l => l.id === config.thinkingLevel) ? config.thinkingLevel! : DEFAULT_THINKING_LEVEL,
  };
};
