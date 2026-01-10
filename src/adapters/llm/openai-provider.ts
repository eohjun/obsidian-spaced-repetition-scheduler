/**
 * OpenAIProvider
 * OpenAI API 프로바이더
 *
 * ⚠️ CRITICAL:
 * - Reasoning 모델 (o1, o3, gpt-5.x)은 temperature 미지원!
 * - Reasoning 모델은 max_completion_tokens 사용
 * - 일반 모델은 max_tokens 사용
 */

import type {
  LLMMessage,
  LLMResponse,
  LLMGenerateOptions,
} from '../../core/domain/interfaces/llm-provider.interface';
import { BaseProvider } from './base-provider';

const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIProvider extends BaseProvider {
  readonly name = 'OpenAI';

  /**
   * OpenAI API로 텍스트 생성
   *
   * ⚠️ CRITICAL: Reasoning 모델 분기 처리
   * - o1, o3, gpt-5.x: max_completion_tokens, NO temperature
   * - 일반 모델: max_tokens + temperature
   */
  async generate(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<LLMResponse> {
    if (!this.isAvailable()) {
      return {
        success: false,
        content: '',
        error: 'API 키가 설정되지 않았습니다.',
      };
    }

    try {
      const openaiMessages = this.formatMessages(messages);
      const isReasoning = this.isReasoningModel();

      // 기본 요청 본문
      const requestBody: Record<string, unknown> = {
        model: this.model,
        messages: openaiMessages,
      };

      // ⚠️ CRITICAL: Reasoning 모델 분기 처리
      if (isReasoning) {
        // Reasoning 모델: max_completion_tokens 사용
        requestBody.max_completion_tokens = options?.maxTokens ?? 4096;
        // ❌ temperature 설정 금지 - API 에러 발생!
      } else {
        // 일반 모델: max_tokens + temperature 사용
        requestBody.max_tokens = options?.maxTokens ?? 4096;

        if (options?.temperature !== undefined) {
          requestBody.temperature = options.temperature;
        } else {
          requestBody.temperature = 0.7; // 기본값
        }
      }

      // stop sequences (모든 모델 지원)
      if (options?.stopSequences?.length) {
        requestBody.stop = options.stopSequences;
      }

      const response = await this.makeRequest<OpenAIResponse>({
        url: OPENAI_API_ENDPOINT,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      return this.parseResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * API 키 유효성 테스트
   */
  async testApiKey(apiKey: string): Promise<boolean> {
    const originalKey = this.apiKey;
    const originalModel = this.model;

    // 테스트에는 저렴한 모델 사용
    this.apiKey = apiKey;
    this.model = 'gpt-4o-mini';

    try {
      const response = await this.generate(
        [{ role: 'user', content: 'Hello' }],
        { maxTokens: 10 }
      );

      this.apiKey = originalKey;
      this.model = originalModel;
      return response.success;
    } catch {
      this.apiKey = originalKey;
      this.model = originalModel;
      return false;
    }
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * LLMMessage를 OpenAI 형식으로 변환
   */
  private formatMessages(messages: LLMMessage[]): OpenAIMessage[] {
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * OpenAI 응답 파싱
   */
  private parseResponse(response: OpenAIResponse): LLMResponse {
    if (!response.choices?.length) {
      return {
        success: false,
        content: '',
        error: 'No response from API',
      };
    }

    const content = response.choices[0].message.content;

    return {
      success: true,
      content,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }
}
