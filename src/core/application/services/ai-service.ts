/**
 * AIService Singleton
 * LLM 프로바이더 통합 서비스
 *
 * ⚠️ CRITICAL: 4개 함수 모두 구현 필수
 * - initializeAIService()
 * - getAIService()
 * - updateAIServiceSettings()
 * - resetAIService()
 */

import type { ModelConfig } from '../../domain/constants/model-configs';
import { getModelConfig, isReasoningModel } from '../../domain/constants/model-configs';

// =============================================================================
// Types
// =============================================================================

export interface AISettings {
  provider: AIProvider;
  modelId: string;
  apiKeys: Partial<Record<AIProvider, string>>;
  temperature?: number;
  maxTokens?: number;
}

export type AIProvider = 'claude' | 'openai' | 'gemini' | 'grok';

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface GenerateResult {
  success: boolean;
  content: string;
  error?: string;
  usage?: TokenUsage;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// =============================================================================
// AIService Class
// =============================================================================

export class AIService {
  private settings: AISettings;
  private modelConfig: ModelConfig | undefined;

  constructor(settings: AISettings) {
    this.settings = settings;
    this.modelConfig = getModelConfig(settings.modelId);
  }

  /**
   * 설정 업데이트
   */
  updateSettings(settings: AISettings): void {
    this.settings = settings;
    this.modelConfig = getModelConfig(settings.modelId);
  }

  /**
   * 현재 설정 조회
   */
  getSettings(): AISettings {
    return { ...this.settings };
  }

  /**
   * 현재 모델이 Reasoning 모델인지 확인
   * Reasoning 모델은 temperature 파라미터 미지원
   */
  isCurrentModelReasoning(): boolean {
    return isReasoningModel(this.settings.modelId);
  }

  /**
   * API 키가 설정되어 있는지 확인
   */
  hasApiKey(): boolean {
    const key = this.settings.apiKeys[this.settings.provider];
    return !!key && key.length > 0;
  }

  /**
   * 현재 프로바이더의 API 키 조회
   */
  getApiKey(): string | undefined {
    return this.settings.apiKeys[this.settings.provider];
  }

  /**
   * 현재 모델 설정 조회
   */
  getModelConfig(): ModelConfig | undefined {
    return this.modelConfig;
  }

  /**
   * 텍스트 생성 (구현은 Adapters Layer에서)
   * 이 메서드는 LLM Provider 주입 후 사용
   */
  async generate(
    _messages: Message[],
    _options?: GenerateOptions
  ): Promise<GenerateResult> {
    // Adapters Layer에서 실제 구현
    // 여기서는 인터페이스만 정의
    throw new Error('AIService.generate() requires LLM provider injection');
  }

  /**
   * 간단한 텍스트 생성 (단일 프롬프트)
   */
  async simpleGenerate(
    prompt: string,
    systemPrompt?: string,
    options?: GenerateOptions
  ): Promise<GenerateResult> {
    const messages: Message[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    return this.generate(messages, options);
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

let aiServiceInstance: AIService | null = null;

/**
 * AIService 싱글톤 초기화
 * 플러그인 로드 시 호출
 */
export function initializeAIService(settings: AISettings): AIService {
  aiServiceInstance = new AIService(settings);
  return aiServiceInstance;
}

/**
 * AIService 인스턴스 반환
 * 초기화되지 않은 경우 null 반환
 */
export function getAIService(): AIService | null {
  return aiServiceInstance;
}

/**
 * AIService 설정 업데이트
 * 설정 변경 시 호출
 */
export function updateAIServiceSettings(settings: AISettings): void {
  if (aiServiceInstance) {
    aiServiceInstance.updateSettings(settings);
  }
}

/**
 * AIService 싱글톤 초기화 (리셋)
 * 테스트 및 플러그인 언로드 시 사용
 *
 * ⚠️ CRITICAL: 이 함수 반드시 포함!
 */
export function resetAIService(): void {
  aiServiceInstance = null;
}
