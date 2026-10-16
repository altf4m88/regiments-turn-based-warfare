import { AiConfig, AiProvider, ThinkingLevelSetting } from '../game/types';

/** Whose logo marks a general: its provider, or for an OpenRouter model, the model's maker. */
export type Maker = AiProvider | 'meta' | 'zai' | 'gemma' | 'deepseek' | 'qwen' | 'kimi' | 'mistral' | 'nvidia' | 'xai' | 'minimax';

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
  openai: {
    label: 'OpenAI',
    vendor: 'GPT',
    keyPlaceholder: 'sk-...',
    keyHint: 'Get a key at platform.openai.com',
  },
  openrouter: {
    label: 'OpenRouter',
    vendor: 'Llama · GLM · Gemma…',
    keyPlaceholder: 'sk-or-...',
    keyHint: 'Get a key at openrouter.ai/keys; one key runs every model below',
  },
};

export const PROVIDERS = Object.keys(AI_PROVIDERS) as AiProvider[];

export interface AiModel {
  id: string;
  label: string;
  /** An OpenRouter model's maker, for its logo. */
  maker?: Maker;
  /**
   * How the model reasons: by thinking level (the default), always on with no levels to
   * choose ('on'), or not at all ('none').
   */
  reasoning?: 'levels' | 'on' | 'none';
  /** The reasoning efforts an OpenRouter model accepts, when not every level; a level is sent as the nearest. */
  efforts?: string[];
  /** The output cap (reasoning included) asked of OpenRouter, within what the model's providers allow. */
  maxTokens?: number;
}

/**
 * Models each provider's generals can run on; the first is the default. The OpenRouter list
 * is a selection of capable models from several makers, most of them open weights (October
 * 2026); any other OpenRouter model can be named by its ID.
 */
export const AI_MODELS: Record<AiProvider, AiModel[]> = {
  gemini: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  ],
  claude: [
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (strongest, slower)' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest, cheapest)' },
  ],
  openai: [
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra (strongest, slower)' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna (fastest, cheapest)' },
  ],
  openrouter: [
    { id: 'z-ai/glm-5.3', label: 'GLM 5.3 (Z.ai, open weights)', maker: 'zai', efforts: ['max', 'high', 'low'], maxTokens: 32000 },
    { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick (Meta, open weights, no reasoning)', maker: 'meta', reasoning: 'none', maxTokens: 16384 },
    { id: 'meta/muse-spark-1.3', label: 'Muse Spark 1.3 (Meta)', maker: 'meta', maxTokens: 32000 },
    { id: 'google/gemma-4-31b-it', label: 'Gemma 4 31B (Google, open weights)', maker: 'gemma', reasoning: 'on', maxTokens: 16384 },
    { id: 'deepseek/deepseek-v4-pro-0813', label: 'DeepSeek V4 Pro (open weights)', maker: 'deepseek', efforts: ['max', 'high', 'low'], maxTokens: 32000 },
    { id: 'qwen/qwen3.8-max-0902', label: 'Qwen3.8 Max (Alibaba)', maker: 'qwen', maxTokens: 32000 },
    { id: 'moonshotai/kimi-k3', label: 'Kimi K3 (Moonshot AI, open weights)', maker: 'kimi', efforts: ['max', 'high', 'low'], maxTokens: 32000 },
    { id: 'mistralai/mistral-large-4-0', label: 'Mistral Large 4 (Mistral AI)', maker: 'mistral', efforts: ['high', 'none'], maxTokens: 32000 },
    { id: 'openai/gpt-oss-120b', label: 'gpt-oss-120b (OpenAI, open weights)', maker: 'openai', maxTokens: 32000 },
    { id: 'nvidia/nemotron-3-ultra-550b-a55b', label: 'Nemotron 3 Ultra (NVIDIA, open weights)', maker: 'nvidia', efforts: ['high', 'medium'], maxTokens: 32000 },
    { id: 'x-ai/grok-4.7', label: 'Grok 4.7 (xAI)', maker: 'xai', maxTokens: 32000 },
    { id: 'minimax/minimax-m3', label: 'MiniMax M3 (open weights)', maker: 'minimax', reasoning: 'on', maxTokens: 32000 },
  ],
};
export const DEFAULT_MODELS = Object.fromEntries(PROVIDERS.map(p => [p, AI_MODELS[p][0].id])) as Record<AiProvider, string>;

/** A thinking level is always sent where the model takes one: Gemini 3.8 Flash rejects an empty thinking config. */
export const THINKING_LEVELS: { id: ThinkingLevelSetting; label: string; hint: string }[] = [
  { id: 'low', label: 'Low', hint: 'Fastest replies, least deliberation' },
  { id: 'medium', label: 'Medium', hint: 'Balanced (default)' },
  { id: 'high', label: 'High', hint: 'Deepest planning, slowest turns' },
];
export const DEFAULT_THINKING_LEVEL: ThinkingLevelSetting = 'medium';

/** Where each provider's key and model live in a general's config. */
const KEY_FIELD = { gemini: 'apiKey', claude: 'claudeApiKey', openai: 'openaiApiKey', openrouter: 'openrouterApiKey' } as const;
const MODEL_FIELD = { gemini: 'model', claude: 'claudeModel', openai: 'openaiModel', openrouter: 'openrouterModel' } as const;
export const keyPatch = (provider: AiProvider, key: string): Partial<AiConfig> => ({ [KEY_FIELD[provider]]: key });
export const modelPatch = (provider: AiProvider, model: string): Partial<AiConfig> => ({ [MODEL_FIELD[provider]]: model });

/** Any OpenRouter model ID: "z-ai/glm-5.3", "google/gemma-4-31b-it:free", "~openai/gpt-astra-latest"… */
export const isOpenRouterId = (id: string) => id.length <= 100 && /^~?[a-z0-9][\w.-]*\/[\w.:-]+$/i.test(id);

/** Makers by the first part of an OpenRouter ID, for the logo of a model that is not in the list. */
const MAKER_PREFIX: Record<string, Maker> = {
  'meta-llama': 'meta', meta: 'meta', 'z-ai': 'zai', thudm: 'zai', deepseek: 'deepseek', qwen: 'qwen', moonshotai: 'kimi',
  mistralai: 'mistral', nvidia: 'nvidia', 'x-ai': 'xai', minimax: 'minimax', openai: 'openai', anthropic: 'claude',
};
const makerFromId = (id: string): Maker => {
  const prefix = id.replace(/^~/, '').split('/')[0].toLowerCase();
  if (prefix === 'google') return /gemma/i.test(id) ? 'gemma' : 'gemini';
  return MAKER_PREFIX[prefix] ?? 'openrouter';
};

/** A listed model, or what the ID alone says of any other OpenRouter model. */
export const modelInfo = (provider: AiProvider, id: string): AiModel =>
  AI_MODELS[provider].find(m => m.id === id) ?? { id, label: id, maker: provider === 'openrouter' ? makerFromId(id) : undefined };

/** Whose logo to show for a general: the provider's, or for OpenRouter, the model maker's. */
export const makerOf = (provider: AiProvider, model?: string): Maker =>
  provider === 'openrouter' ? (model ? modelInfo(provider, model).maker ?? 'openrouter' : 'openrouter') : provider;

const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** The reasoning effort sent for a level: the level itself, or the nearest the model accepts (the higher on a tie). */
export const effortFor = (m: AiModel, level: ThinkingLevelSetting): string => {
  const accepted = m.efforts?.filter(e => e !== 'none');
  if (!accepted?.length || accepted.includes(level)) return level;
  const at = EFFORTS.indexOf(level), rank = (e: string) => EFFORTS.indexOf(e);
  return [...accepted].sort((a, b) => Math.abs(rank(a) - at) - Math.abs(rank(b) - at) || rank(b) - rank(a))[0];
};

/**
 * A level as the model will take it: of the levels sent as the same effort, the one named
 * after it, else the highest. So medium on GLM 5.3 (efforts low, high and max) counts as high.
 */
const effectiveLevel = (m: AiModel, level: ThinkingLevelSetting): ThinkingLevelSetting => {
  const effort = effortFor(m, level);
  const same = THINKING_LEVELS.map(l => l.id).filter(l => effortFor(m, l) === effort);
  return same.find(l => l === effort) ?? same[same.length - 1];
};

/** The thinking levels that make a difference on a model; none for one that reasons without levels or not at all. */
export const thinkingLevelsFor = (m: AiModel): ThinkingLevelSetting[] =>
  m.reasoning === 'on' || m.reasoning === 'none' ? [] : THINKING_LEVELS.map(l => l.id).filter(l => effectiveLevel(m, l) === l);

/**
 * The provider, key, model and thinking level a config will actually run with. Unknown or
 * retired models fall back to the provider's default, except that OpenRouter takes any
 * model ID. The thinking level is left out for a model without levels.
 */
export const resolveAiModel = (config: AiConfig) => {
  const provider: AiProvider = PROVIDERS.includes(config.provider as AiProvider) ? config.provider! : 'gemini';
  const wanted = config[MODEL_FIELD[provider]]?.trim();
  const usable = !!wanted && (AI_MODELS[provider].some(m => m.id === wanted) || (provider === 'openrouter' && isOpenRouterId(wanted)));
  const model = usable ? wanted! : DEFAULT_MODELS[provider];
  const info = modelInfo(provider, model);
  const level = THINKING_LEVELS.some(l => l.id === config.thinkingLevel) ? config.thinkingLevel! : DEFAULT_THINKING_LEVEL;
  return {
    provider,
    apiKey: (config[KEY_FIELD[provider]] ?? '').trim(),
    model,
    info,
    thinkingLevel: thinkingLevelsFor(info).length ? effectiveLevel(info, level) : undefined,
  };
};

/** Just the model's name, e.g. "Claude Sonnet 5.5", or an unlisted OpenRouter model's ID. */
export const modelName = (config: AiConfig) => resolveAiModel(config).info.label.replace(/ \(.*\)$/, '');

/** A general's model and thinking level for display, e.g. "Claude Sonnet 5.5 · medium". */
export const describeModel = (config: AiConfig) => {
  const level = resolveAiModel(config).thinkingLevel;
  return level ? `${modelName(config)} · ${level}` : modelName(config);
};
