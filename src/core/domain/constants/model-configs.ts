/**
 * MODEL_CONFIGS
 * LLM 모델별 설정 상수
 *
 * ⚠️ CRITICAL:
 * - Reasoning 모델 (o1, o3, gpt-5.x)은 temperature 파라미터 미지원!
 * - Reasoning 모델은 max_tokens 대신 max_completion_tokens 사용
 */

export interface ModelConfig {
  id: string;
  displayName: string;
  provider: 'claude' | 'openai' | 'gemini' | 'grok';
  maxTokens: number;
  contextWindow: number;
  isReasoning: boolean;  // ⚠️ CRITICAL: Reasoning 모델은 temperature 미지원
}

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // Claude Models
  'claude-sonnet-4-5-20250929': {
    id: 'claude-sonnet-4-5-20250929',
    displayName: 'Claude Sonnet 4.5',
    provider: 'claude',
    maxTokens: 16384,
    contextWindow: 200000,
    isReasoning: false,
  },
  'claude-3-5-sonnet-20241022': {
    id: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet',
    provider: 'claude',
    maxTokens: 8192,
    contextWindow: 200000,
    isReasoning: false,
  },
  'claude-3-5-haiku-20241022': {
    id: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku',
    provider: 'claude',
    maxTokens: 8192,
    contextWindow: 200000,
    isReasoning: false,
  },

  // OpenAI Models - 일반 (temperature 지원)
  'gpt-4o': {
    id: 'gpt-4o',
    displayName: 'GPT-4o',
    provider: 'openai',
    maxTokens: 16384,
    contextWindow: 128000,
    isReasoning: false,
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    provider: 'openai',
    maxTokens: 16384,
    contextWindow: 128000,
    isReasoning: false,
  },

  // OpenAI Models - Reasoning ⚠️ CRITICAL: temperature 미지원!
  'o3-mini': {
    id: 'o3-mini',
    displayName: 'O3 Mini',
    provider: 'openai',
    maxTokens: 65536,
    contextWindow: 128000,
    isReasoning: true,  // ⚠️ max_completion_tokens 사용, temperature 금지!
  },
  'o1': {
    id: 'o1',
    displayName: 'O1',
    provider: 'openai',
    maxTokens: 65536,
    contextWindow: 128000,
    isReasoning: true,  // ⚠️ max_completion_tokens 사용, temperature 금지!
  },
  'o1-mini': {
    id: 'o1-mini',
    displayName: 'O1 Mini',
    provider: 'openai',
    maxTokens: 65536,
    contextWindow: 128000,
    isReasoning: true,  // ⚠️ max_completion_tokens 사용, temperature 금지!
  },
  'gpt-5.2': {
    id: 'gpt-5.2',
    displayName: 'GPT-5.2',
    provider: 'openai',
    maxTokens: 32768,
    contextWindow: 128000,
    isReasoning: true,  // ⚠️ max_completion_tokens 사용, temperature 금지!
  },

  // Gemini Models
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    provider: 'gemini',
    maxTokens: 8192,
    contextWindow: 1000000,
    isReasoning: false,
  },
  'gemini-1.5-pro': {
    id: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    provider: 'gemini',
    maxTokens: 8192,
    contextWindow: 2000000,
    isReasoning: false,
  },

  // Grok Models
  'grok-2': {
    id: 'grok-2',
    displayName: 'Grok 2',
    provider: 'grok',
    maxTokens: 8192,
    contextWindow: 131072,
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
