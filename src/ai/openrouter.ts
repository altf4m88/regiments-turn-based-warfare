import { effortFor, modelInfo } from './models';
import { AiSession, AiSessionOptions, shortReason } from './session';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** An error reply from OpenRouter, with its HTTP status or error code. */
export class OpenRouterError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** The model's reasoning blocks, passed back unchanged so its next reply can build on them. */
  reasoning_details?: unknown;
}

/** A reply's text, whether the content came as a string or as parts. */
const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(part => (typeof part?.text === 'string' ? part.text : '')).join('')
      : '';

/**
 * A conversation with any model on OpenRouter, over its OpenAI-style Chat Completions API,
 * straight from the browser with the player's own key. The session keeps the messages and
 * resends them, reasoning blocks included, each time.
 */
export const startOpenRouterSession = ({ apiKey, model, thinkingLevel, systemInstruction }: AiSessionOptions): AiSession => {
  const info = modelInfo('openrouter', model);
  // A thinking level becomes the nearest effort the model accepts; models with reasoning
  // but no levels are asked to reason; models without reasoning get no reasoning field.
  const reasoning = info.reasoning === 'none' ? undefined
    : info.reasoning === 'on' || !thinkingLevel ? { enabled: true }
    : { effort: effortFor(info, thinkingLevel) };
  const messages: Message[] = [{ role: 'system', content: systemInstruction }];
  return {
    async send(message) {
      const turn: Message = { role: 'user', content: message };
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // App attribution on OpenRouter (optional): where the requests come from, and the game's name.
          'HTTP-Referer': window.location.origin,
          'X-OpenRouter-Title': 'Regiments',
        },
        body: JSON.stringify({
          model,
          messages: [...messages, turn],
          ...(reasoning ? { reasoning } : {}),
          ...(info.maxTokens ? { max_tokens: info.maxTokens } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        const status = typeof data?.error?.code === 'number' ? data.error.code : res.status;
        throw new OpenRouterError(data?.error?.message ?? `OpenRouter answered ${res.status}`, status);
      }
      const choice = data?.choices?.[0];
      if (!choice || choice.finish_reason === 'error') {
        throw new OpenRouterError(choice?.error?.message ?? 'The model returned no answer', choice?.error?.code ?? 502);
      }
      const reply = choice.message ?? {};
      const text = textOf(reply.content);
      messages.push(turn, { role: 'assistant', content: text, ...(reply.reasoning_details ? { reasoning_details: reply.reasoning_details } : {}) });
      if (choice.finish_reason === 'content_filter' || (reply.refusal && !text)) {
        return { text: '', refusal: { category: reply.refusal ? null : 'content filter' } };
      }
      if (!text && choice.finish_reason === 'length') {
        throw new OpenRouterError('The model used all its output tokens reasoning and gave no orders.', 200);
      }
      return { text };
    },
    // Rate limits, timeouts, and a model or its providers being down for a moment.
    isRateLimit: error => error instanceof OpenRouterError && [408, 429, 502, 503].includes(error.status),
    explain: error => (error instanceof Error ? shortReason(error.message) : undefined),
  };
};
