/**
 * MODEL_CONFIGS
 * LLM 모델별 설정 상수
 *
 * CRITICAL:
 * - Reasoning 모델 (gpt-5.x)은 temperature 파라미터 미지원!
 * - Reasoning 모델은 max_tokens 대신 max_completion_tokens 사용
 */

export interface ModelConfig {
  id: string;
  displayName: string;
  provider: 'claude' | 'openai' | 'gemini' | 'grok';
  maxTokens: number;
  contextWindow: number;
  isReasoning: boolean;  // CRITICAL: Reasoning 모델은 temperature 미지원
}

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // Claude Models
  'claude-opus-4-6': {
    id: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
    provider: 'claude',
    maxTokens: 128000,
    contextWindow: 200000,
    isReasoning: false,
  },
  'claude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    provider: 'claude',
    maxTokens: 64000,
    contextWindow: 200000,
    isReasoning: false,
  },
  'claude-haiku-4-5-20251001': {
    id: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    provider: 'claude',
    maxTokens: 64000,
    contextWindow: 200000,
    isReasoning: false,
  },

  // OpenAI Models - GPT-5 시리즈 CRITICAL: Reasoning 모델! temperature 미지원!
  'gpt-5.4': {
    id: 'gpt-5.4',
    displayName: 'GPT-5.4',
    provider: 'openai',
    maxTokens: 128000,
    contextWindow: 1050000,
    isReasoning: true,  // max_completion_tokens 사용, temperature 금지!
  },
  'gpt-5-mini': {
    id: 'gpt-5-mini',
    displayName: 'GPT-5 Mini',
    provider: 'openai',
    maxTokens: 128000,
    contextWindow: 400000,
    isReasoning: true,  // max_completion_tokens 사용, temperature 금지!
  },
  'gpt-5-nano': {
    id: 'gpt-5-nano',
    displayName: 'GPT-5 Nano',
    provider: 'openai',
    maxTokens: 128000,
    contextWindow: 400000,
    isReasoning: true,  // max_completion_tokens 사용, temperature 금지!
  },

  // Gemini Models
  'gemini-3.1-pro-preview': {
    id: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro',
    provider: 'gemini',
    maxTokens: 65536,
    contextWindow: 1000000,
    isReasoning: false,
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    provider: 'gemini',
    maxTokens: 65536,
    contextWindow: 1000000,
    isReasoning: false,
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    provider: 'gemini',
    maxTokens: 8192,
    contextWindow: 1000000,
    isReasoning: false,
  },

  // Grok Models
  'grok-4-1-fast': {
    id: 'grok-4-1-fast',
    displayName: 'Grok 4.1 Fast',
    provider: 'grok',
    maxTokens: 16384,
    contextWindow: 2000000,
    isReasoning: false,
  },
  'grok-4-1-fast-non-reasoning': {
    id: 'grok-4-1-fast-non-reasoning',
    displayName: 'Grok 4.1 Fast (Non-Reasoning)',
    provider: 'grok',
    maxTokens: 16384,
    contextWindow: 2000000,
    isReasoning: false,
  },
};

/**
 * 모델 설정 조회
 */
export function getModelConfig(modelId: string): ModelConfig | undefined {
  return MODEL_CONFIGS[modelId];
}

/**
 * Reasoning 모델 여부 확인
 * Reasoning 모델은 temperature 파라미터 미지원
 */
export function isReasoningModel(modelId: string): boolean {
  return MODEL_CONFIGS[modelId]?.isReasoning ?? false;
}

/**
 * Provider별 모델 목록 조회
 */
export function getModelsByProvider(provider: ModelConfig['provider']): ModelConfig[] {
  return Object.values(MODEL_CONFIGS).filter((m) => m.provider === provider);
}

/**
 * 모델 ID 목록
 */
export function getAllModelIds(): string[] {
  return Object.keys(MODEL_CONFIGS);
}
