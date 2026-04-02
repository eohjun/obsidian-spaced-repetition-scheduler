/**
 * GrokProvider
 * xAI Grok API 프로바이더 — 공유 빌더/파서 사용 (OpenAI 호환)
 */

import type {
  LLMMessage,
  LLMResponse,
  LLMGenerateOptions,
} from '../../core/domain/interfaces/llm-provider.interface';
import { BaseProvider } from './base-provider';
import {
  buildGrokBody,
  parseGrokResponse,
} from 'obsidian-llm-shared';

const GROK_API_ENDPOINT = 'https://api.x.ai/v1/chat/completions';

export class GrokProvider extends BaseProvider {
  readonly name = 'Grok';

  async generate(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<LLMResponse> {
    if (!this.isAvailable()) {
      return { success: false, content: '', error: 'API 키가 설정되지 않았습니다.' };
    }

    try {
      const body = buildGrokBody(messages, this.model, {
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
      });

      const json = await this.makeRequest<Record<string, unknown>>({
        url: GROK_API_ENDPOINT,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = parseGrokResponse(json);
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
    try {
      const response = await this.makeRequest<{ data?: unknown[] }>({
        url: 'https://api.x.ai/v1/models',
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return Array.isArray(response?.data);
    } catch {
      return false;
    }
  }
}
