/**
 * BaseProvider
 * LLM 프로바이더 추상 클래스
 *
 * ⚠️ CRITICAL:
 * - Obsidian의 requestUrl 사용 (fetch 금지!)
 * - normalizeError() - HTTP 코드별 사용자 친화적 메시지
 * - getMaxTokensParam() - Reasoning 모델 분기
 * - isReasoningModel() - 모델 타입 감지
 */

import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import type {
  ILLMProvider,
  LLMMessage,
  LLMResponse,
  LLMGenerateOptions,
} from '../../core/domain/interfaces/llm-provider.interface';
import { isReasoningModel as checkReasoningModel } from '../../core/domain/constants/model-configs';

export interface ProviderError {
  message: string;
  code: string;
}

export abstract class BaseProvider implements ILLMProvider {
  protected apiKey: string = '';
  protected model: string = '';

  abstract readonly name: string;

  abstract generate(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<LLMResponse>;

  abstract testApiKey(apiKey: string): Promise<boolean>;

  /**
   * API 키 설정
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * 모델 설정
   */
  setModel(modelId: string): void {
    this.model = modelId;
  }

  /**
   * 사용 가능 여부 (API 키 설정됨)
   */
  isAvailable(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /**
   * 현재 모델 ID
   */
  get modelId(): string {
    return this.model;
  }

  // =========================================================================
  // Protected Methods
  // =========================================================================

  /**
   * ⚠️ Obsidian requestUrl 사용 필수!
   * fetch 직접 사용 금지
   */
  protected async makeRequest<T>(options: RequestUrlParam): Promise<T> {
    try {
      const response: RequestUrlResponse = await requestUrl(options);
      return response.json as T;
    } catch (error) {
      // Obsidian requestUrl 에러에서 응답 본문 추출 시도
      const errorDetail = this.extractErrorDetail(error);
      if (errorDetail) {
        throw { message: errorDetail, code: 'API_ERROR' } as ProviderError;
      }
      throw this.normalizeError(error);
    }
  }

  /**
   * API 에러 응답에서 상세 메시지 추출
   */
  private extractErrorDetail(error: unknown): string | null {
    if (!error || typeof error !== 'object') return null;

    const err = error as Record<string, unknown>;

    // Obsidian requestUrl은 에러 시 response body를 포함할 수 있음
    if ('response' in err && err.response) {
      try {
        const resp = err.response as string;
        const parsed = JSON.parse(resp);
        // Claude API 에러 형식
        if (parsed.error?.message) {
          return `API Error: ${parsed.error.message}`;
        }
        // OpenAI API 에러 형식
        if (parsed.error?.message) {
          return `API Error: ${parsed.error.message}`;
        }
        return JSON.stringify(parsed);
      } catch {
        return err.response as string;
      }
    }

    // status와 함께 에러 메시지가 있는 경우
    if ('status' in err && 'message' in err) {
      return `Status ${err.status}: ${err.message}`;
    }

    return null;
  }

  /**
   * Reasoning 모델 감지
   * o1, o3, gpt-5.x 등은 temperature 미지원
   */
  protected isReasoningModel(): boolean {
    return checkReasoningModel(this.model);
  }

  /**
   * Token 파라미터 분기
   * Reasoning 모델: max_completion_tokens
   * 일반 모델: max_tokens
   */
  protected getMaxTokensParam(maxTokens: number): Record<string, number> {
    if (this.isReasoningModel()) {
      return { max_completion_tokens: maxTokens };
    }
    return { max_tokens: maxTokens };
  }

  /**
   * ⚠️ HTTP 코드별 사용자 친화적 에러 메시지
   */
  protected normalizeError(error: unknown): ProviderError {
    console.error('[SRS Plugin] API Error:', error);

    // 이미 ProviderError인 경우 그대로 반환
    if (this.isProviderError(error)) {
      return error;
    }

    if (error instanceof Error) {
      const msg = error.message.toLowerCase();

      // Rate limit (429)
      if (msg.includes('429') || msg.includes('rate')) {
        return {
          message: 'API 요청 한도 초과. 잠시 후 다시 시도해주세요.',
          code: 'RATE_LIMIT',
        };
      }

      // Auth error (401, 403)
      if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) {
        return {
          message: 'API 키가 유효하지 않습니다. 설정에서 확인해주세요.',
          code: 'AUTH_ERROR',
        };
      }

      // Timeout
      if (msg.includes('timeout') || msg.includes('etimedout')) {
        return {
          message: '요청 시간이 초과되었습니다. 네트워크를 확인해주세요.',
          code: 'TIMEOUT',
        };
      }

      // Model not found (404)
      if (msg.includes('404') || msg.includes('model')) {
        return {
          message: '선택한 모델을 찾을 수 없습니다.',
          code: 'MODEL_NOT_FOUND',
        };
      }

      // Insufficient quota (402)
      if (msg.includes('402') || msg.includes('quota') || msg.includes('billing')) {
        return {
          message: 'API 사용량 한도에 도달했습니다. 결제 정보를 확인해주세요.',
          code: 'QUOTA_EXCEEDED',
        };
      }

      // Server error (5xx)
      if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
        return {
          message: 'API 서버에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
          code: 'SERVER_ERROR',
        };
      }

      return { message: error.message, code: 'UNKNOWN' };
    }

    // 객체에서 에러 정보 추출 시도
    if (error && typeof error === 'object') {
      const errorObj = error as Record<string, unknown>;
      // Obsidian requestUrl 에러 형식
      if ('status' in errorObj) {
        const status = errorObj.status as number;
        if (status === 401 || status === 403) {
          return {
            message: 'API 키가 유효하지 않습니다. 설정에서 확인해주세요.',
            code: 'AUTH_ERROR',
          };
        }
        if (status === 429) {
          return {
            message: 'API 요청 한도 초과. 잠시 후 다시 시도해주세요.',
            code: 'RATE_LIMIT',
          };
        }
        if (status === 402) {
          return {
            message: 'API 사용량 한도에 도달했습니다. 결제 정보를 확인해주세요.',
            code: 'QUOTA_EXCEEDED',
          };
        }
        if (status >= 500) {
          return {
            message: 'API 서버에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
            code: 'SERVER_ERROR',
          };
        }
      }
      // 에러 메시지 필드가 있는 경우
      if ('message' in errorObj && typeof errorObj.message === 'string') {
        return { message: errorObj.message, code: 'UNKNOWN' };
      }
    }

    return { message: '알 수 없는 오류가 발생했습니다.', code: 'UNKNOWN' };
  }

  /**
   * ProviderError 타입 가드
   */
  private isProviderError(error: unknown): error is ProviderError {
    return (
      error !== null &&
      typeof error === 'object' &&
      'message' in error &&
      'code' in error &&
      typeof (error as ProviderError).message === 'string' &&
      typeof (error as ProviderError).code === 'string'
    );
  }

  /**
   * 에러 응답 생성
   */
  protected handleError(error: unknown): LLMResponse {
    const normalized = this.normalizeError(error);
    return {
      success: false,
      content: '',
      error: normalized.message,
    };
  }

  /**
   * 메시지 배열에서 시스템 프롬프트 추출
   */
  protected extractSystemPrompt(messages: LLMMessage[]): string | undefined {
    const systemMessage = messages.find((m) => m.role === 'system');
    return systemMessage?.content;
  }

  /**
   * 시스템 메시지 제외한 메시지 배열
   */
  protected filterNonSystemMessages(messages: LLMMessage[]): LLMMessage[] {
    return messages.filter((m) => m.role !== 'system');
  }
}
