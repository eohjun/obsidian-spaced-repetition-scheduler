/**
 * GeminiProvider
 * Google Gemini API 프로바이더 — 공유 빌더/파서 사용
 */

import type {
  LLMMessage,
  LLMResponse,
  LLMGenerateOptions,
} from '../../core/domain/interfaces/llm-provider.interface';
import { BaseProvider } from './base-provider';
import {
  buildGeminiBody,
  parseGeminiResponse,
  getGeminiGenerateUrl,
} from 'obsidian-llm-shared';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiProvider extends BaseProvider {
  readonly name = 'Gemini';

  async generate(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<LLMResponse> {
    if (!this.isAvailable()) {
      return { success: false, content: '', error: 'API 키가 설정되지 않았습니다.' };
    }

    try {
      const body = buildGeminiBody(messages, this.model, {
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
      });

      const url = getGeminiGenerateUrl(this.model, this.apiKey, GEMINI_BASE_URL);

      const json = await this.makeRequest<Record<string, unknown>>({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = parseGeminiResponse(json);
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
      const response = await this.makeRequest<{ models?: unknown[] }>({
        url: `${GEMINI_BASE_URL}/models?key=${apiKey}`,
        method: 'GET',
      });
      return Array.isArray(response?.models);
    } catch {
      return false;
    }
  }
}
