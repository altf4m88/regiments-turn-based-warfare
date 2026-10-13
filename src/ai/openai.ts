import OpenAI from 'openai';
import { toResponseInputItem } from 'openai/lib/responses/ResponseInputItems';
import type { ResponseInputItem, ResponseOutputItem } from 'openai/resources/responses/responses';
import { AiSession, AiSessionOptions, shortReason } from './session';

/** The output items to send back next time (the reply and its encrypted reasoning), skipping any the SDK cannot replay. */
const replayable = (output: ResponseOutputItem[]) =>
  output.flatMap(item => {
    try {
      const input = toResponseInputItem(item);
      return input ? [input] : [];
    } catch {
      return [];
    }
  });

/**
 * A GPT conversation over OpenAI's Responses API, straight from the browser with the
 * player's own key. Nothing is stored at OpenAI (store: false): the session keeps the
 * history and resends it, with the model's encrypted reasoning, so each reply in a turn
 * builds on the reasoning before it, as Claude's do.
 */
export const startOpenAiSession = ({ apiKey, model, thinkingLevel, systemInstruction }: AiSessionOptions): AiSession => {
  // The key goes only from this browser to api.openai.com; the SDK needs this opt-in to run in a browser.
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  const history: ResponseInputItem[] = [];
  return {
    async send(message) {
      const turn: ResponseInputItem = { role: 'user', content: message };
      const response = await client.responses.create({
        model,
        instructions: systemInstruction,
        input: [...history, turn],
        reasoning: { effort: thinkingLevel ?? 'medium' },
        // Reasoning counts against this; OpenAI suggests leaving at least 25,000 for it.
        max_output_tokens: 32000,
        store: false,
        include: ['reasoning.encrypted_content'],
      });
      history.push(turn, ...replayable(response.output));
      const refused = response.output.some(item => item.type === 'message' && item.content.some(part => part.type === 'refusal'));
      if (response.incomplete_details?.reason === 'content_filter' || (refused && !response.output_text)) {
        return { text: '', refusal: { category: refused ? null : 'content filter' } };
      }
      if (!response.output_text && response.incomplete_details?.reason === 'max_output_tokens') {
        throw new Error('The model used all its output tokens reasoning and gave no orders.');
      }
      return { text: response.output_text };
    },
    // Out of quota is a 429 too, but waiting will not help.
    isRateLimit: error =>
      (error instanceof OpenAI.RateLimitError && (error as { code?: unknown }).code !== 'insufficient_quota') ||
      (error instanceof OpenAI.APIError && error.status === 503),
    explain: error => (error instanceof Error ? shortReason(error.message) : undefined),
  };
};
