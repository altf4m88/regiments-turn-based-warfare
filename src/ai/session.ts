import { AiProvider, ThinkingLevelSetting } from '../game/types';

export interface AiSessionOptions {
  provider: AiProvider;
  apiKey: string;
  model: string;
  thinkingLevel: ThinkingLevelSetting;
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
}

/** Starts a conversation. Each provider's SDK is only downloaded once a general first uses it. */
export const startAiSession = async (options: AiSessionOptions): Promise<AiSession> =>
  options.provider === 'claude'
    ? (await import('./claude')).startClaudeSession(options)
    : (await import('./gemini')).startGeminiSession(options);
