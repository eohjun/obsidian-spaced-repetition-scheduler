/**
 * ClaudeProvider
 * Anthropic Claude API 프로바이더 — 공유 빌더/파서 사용
 *
 * 공유 패키지가 처리하는 것:
 * - Extended thinking 지원 (Opus 4.6 adaptive / Sonnet 4.6 enabled)
 * - Thinking 활성 시 temperature 자동 차단
 * - System 메시지 → top-level system 파라미터 분리
 * - Thinking 블록 필터링 (응답에서 text만 추출)
 * - 토큰 자동 조정 (thinking budget < max_tokens 보장)
 */

import type {
  LLMMessage,
  LLMResponse,
  LLMGenerateOptions,
} from '../../core/domain/interfaces/llm-provider.interface';
import { BaseProvider } from './base-provider';
import {
  buildAnthropicBody,
  parseAnthropicResponse,
  getAnthropicHeaders,
} from 'obsidian-llm-shared';

const CLAUDE_API_ENDPOINT = 'https://api.anthropic.com/v1/messages';

export class ClaudeProvider extends BaseProvider {
  readonly name = 'Claude';

  async generate(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<LLMResponse> {
    if (!this.isAvailable()) {
      return { success: false, content: '', error: 'API 키가 설정되지 않았습니다.' };
    }

    try {
      const body = buildAnthropicBody(messages, this.model, {
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
      });

      const json = await this.makeRequest<Record<string, unknown>>({
        url: CLAUDE_API_ENDPOINT,
        method: 'POST',
        headers: getAnthropicHeaders(this.apiKey),
        body: JSON.stringify(body),
      });

      const result = parseAnthropicResponse(json);
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
        url: 'https://api.anthropic.com/v1/models',
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      return Array.isArray(response?.data);
    } catch {
      return false;
    }
  }
}
