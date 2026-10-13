import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { ThinkingLevelSetting } from '../game/types';
import { DEFAULT_THINKING_LEVEL } from './models';
import { AiSession, AiSessionOptions } from './session';

/** Our thinking level setting as the Gemini SDK's enum. */
const GEMINI_THINKING: Record<ThinkingLevelSetting, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

export const startGeminiSession = ({ apiKey, model, thinkingLevel, systemInstruction, useVertexAI }: AiSessionOptions): AiSession => {
  const ai = new GoogleGenAI({ apiKey, vertexai: useVertexAI });
  // The chat keeps the history, so each message sees the turn so far.
  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: GEMINI_THINKING[thinkingLevel ?? DEFAULT_THINKING_LEVEL] },
    },
  });
  return {
    async send(message) {
      const response = await chat.sendMessage({ message });
      return { text: response.text ?? '' };
    },
    isRateLimit: (error: any) => error?.message?.includes('429') || error?.status === 429 || JSON.stringify(error).includes('429'),
  };
};
