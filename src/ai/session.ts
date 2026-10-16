import { AiProvider, ThinkingLevelSetting } from '../game/types';

export interface AiSessionOptions {
  provider: AiProvider;
  apiKey: string;
  model: string;
  /** Left out for a model that has no thinking levels. */
  thinkingLevel?: ThinkingLevelSetting;
  systemInstruction: string;
  /** Gemini only: call Gemini through Vertex AI (Google Cloud). */
  useVertexAI?: boolean;
}

export interface AiReply {
  text: string;
  /** Set when the model declined to answer, with the policy category if it gave one. */
  refusal?: { category: string | null };
}

/** One general's conversation for a turn: each message sees everything said before it. */
export interface AiSession {
  send(message: string): Promise<AiReply>;
  /** Whether an error from send() means "slow down" (rate limited or overloaded) rather than a real failure. */
  isRateLimit(error: unknown): boolean;
  /** A short reason for a failed send, for the battlefield log, when the provider gives a useful one. */
  explain?(error: unknown): string | undefined;
}

/** Starts a conversation. Each provider's code (and SDK) is only downloaded once a general first uses it. */
export const startAiSession = async (options: AiSessionOptions): Promise<AiSession> => {
  switch (options.provider) {
    case 'claude': return (await import('./claude')).startClaudeSession(options);
    case 'openai': return (await import('./openai')).startOpenAiSession(options);
    case 'openrouter': return (await import('./openrouter')).startOpenRouterSession(options);
    default: return (await import('./gemini')).startGeminiSession(options);
  }
};

/** An error message cut down for the battlefield log, with anything that looks like a key masked. */
export const shortReason = (message: string) =>
  message.replace(/\b(sk|or|key)-[\w*.-]{6,}/gi, '$1-…').replace(/\s+/g, ' ').trim().slice(0, 160);
