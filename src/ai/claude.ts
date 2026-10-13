import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_THINKING_LEVEL } from './models';
import { AiSession, AiSessionOptions } from './session';

/**
 * Models whose declined requests Anthropic can re-run on another model, server
 * side, in the same call. Claude Haiku 5.5 has no server-side fallback.
 */
const SERVER_FALLBACK = new Set(['claude-sonnet-5-5', 'claude-opus-5-5']);

/**
 * A Claude conversation, straight from the browser with the player's own key.
 * The Messages API keeps no state, so the session holds the history and sends
 * all of it each time.
 */
export const startClaudeSession = ({ apiKey, model, thinkingLevel, systemInstruction }: AiSessionOptions): AiSession => {
  // The key goes only from this browser to api.anthropic.com; the SDK needs this opt-in to run in a browser.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const history: Anthropic.Beta.BetaMessageParam[] = [];
  return {
    async send(message) {
      const turn: Anthropic.Beta.BetaMessageParam = { role: 'user', content: message };
      const response = await client.beta.messages.stream({
        model,
        max_tokens: 16000,
        // The instructions and the turn so far are resent every iteration; caching makes the repeats cheap.
        cache_control: { type: 'ephemeral' },
        system: systemInstruction,
        // Thinking is always on for these models; the thinking level sets the effort.
        thinking: { type: 'adaptive' },
        output_config: { effort: thinkingLevel ?? DEFAULT_THINKING_LEVEL },
        messages: [...history, turn],
        ...(SERVER_FALLBACK.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      }).finalMessage();
      // History only ever grows, and the reply goes back exactly as it came (thinking blocks included).
      history.push(turn, { role: 'assistant', content: response.content });
      if (response.stop_reason === 'refusal') {
        return { text: '', refusal: { category: response.stop_details?.category ?? null } };
      }
      return { text: response.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n') };
    },
    isRateLimit: error =>
      error instanceof Anthropic.RateLimitError || (error instanceof Anthropic.APIError && error.status === 529),
  };
};
