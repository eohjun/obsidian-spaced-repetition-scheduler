/**
 * OpenAIProvider
 * OpenAI API 프로바이더 — 공유 빌더/파서 사용
 *
 * 공유 패키지가 처리하는 것:
 * - Reasoning 모델 감지 (max_completion_tokens vs max_tokens)
 * - Reasoning 모델 temperature 차단
 * - 토큰 자동 조정 (getEffectiveMaxTokens)
 * - 안전한 응답 파싱 (optional chaining)
 */

import type {
  LLMMessage,
  LLMResponse,
  LLMGenerateOptions,
} from '../../core/domain/interfaces/llm-provider.interface';
import { BaseProvider } from './base-provider';
import {
  buildOpenAIBody,
  parseOpenAIResponse,
  getOpenAIHeaders,
} from 'obsidian-llm-shared';

const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export class OpenAIProvider extends BaseProvider {
  readonly name = 'OpenAI';

  async generate(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<LLMResponse> {
    if (!this.isAvailable()) {
      return { success: false, content: '', error: 'API 키가 설정되지 않았습니다.' };
    }

    try {
      const body = buildOpenAIBody(messages, this.model, {
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
      });

      const json = await this.makeRequest<Record<string, unknown>>({
        url: OPENAI_API_ENDPOINT,
        method: 'POST',
        headers: getOpenAIHeaders(this.apiKey),
        body: JSON.stringify(body),
      });

      const result = parseOpenAIResponse(json);
      if (!result.success) {
        return { success: false, content: '', error: result.error };
      }

      return {
        success: true,
        content: result.text,
        usage: {
          promptTokens: result.usage.inputTokens,
          completionTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        },
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async testApiKey(apiKey: string): Promise<boolean> {
    const originalKey = this.apiKey;
    const originalModel = this.model;
    this.apiKey = apiKey;
    this.model = 'gpt-5-nano';

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
}
