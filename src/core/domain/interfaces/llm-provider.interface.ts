/**
 * ILLMProvider Interface
 * LLM 프로바이더 추상화 인터페이스
 */

export interface ILLMProvider {
  readonly name: string;

  /**
   * 텍스트 생성
   */
  generate(messages: LLMMessage[], options?: LLMGenerateOptions): Promise<LLMResponse>;

  /**
   * API 키 설정
   */
  setApiKey(apiKey: string): void;

  /**
   * 모델 설정
   */
  setModel(modelId: string): void;

  /**
   * 사용 가능 여부 (API 키 설정됨)
   */
  isAvailable(): boolean;

  /**
   * API 키 유효성 테스트
   */
  testApiKey(apiKey: string): Promise<boolean>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMGenerateOptions {
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface LLMResponse {
  success: boolean;
  content: string;
  error?: string;
  usage?: LLMTokenUsage;
}

export interface LLMTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
