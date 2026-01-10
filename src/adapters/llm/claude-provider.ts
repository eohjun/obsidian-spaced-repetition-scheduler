/**
 * ClaudeProvider
 * Anthropic Claude API 프로바이더
 */

import type {
  LLMMessage,
  LLMResponse,
  LLMGenerateOptions,
} from '../../core/domain/interfaces/llm-provider.interface';
import { BaseProvider } from './base-provider';

const CLAUDE_API_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_VERSION = '2023-06-01';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class ClaudeProvider extends BaseProvider {
  readonly name = 'Claude';

  /**
   * Claude API로 텍스트 생성
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
      // 시스템 프롬프트 추출
      const systemPrompt = this.extractSystemPrompt(messages);
      const claudeMessages = this.formatMessages(messages);

      const requestBody: Record<string, unknown> = {
        model: this.model,
        messages: claudeMessages,
        max_tokens: options?.maxTokens ?? 4096,
      };

      // 시스템 프롬프트가 있으면 추가
      if (systemPrompt) {
        requestBody.system = systemPrompt;
      }

      // temperature 설정 (Claude는 모든 모델에서 지원)
      if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature;
      }

      // stop sequences
      if (options?.stopSequences?.length) {
        requestBody.stop_sequences = options.stopSequences;
      }

      const response = await this.makeRequest<ClaudeResponse>({
        url: CLAUDE_API_ENDPOINT,
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': CLAUDE_API_VERSION,
          'content-type': 'application/json',
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
    this.apiKey = apiKey;

    try {
      const response = await this.generate(
        [{ role: 'user', content: 'Hello' }],
        { maxTokens: 10 }
      );

      this.apiKey = originalKey;
      return response.success;
    } catch {
      this.apiKey = originalKey;
      return false;
    }
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * LLMMessage를 Claude 형식으로 변환
   */
  private formatMessages(messages: LLMMessage[]): ClaudeMessage[] {
    return this.filterNonSystemMessages(messages).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  }

  /**
   * Claude 응답 파싱
   */
  private parseResponse(response: ClaudeResponse): LLMResponse {
    const content = response.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');

    return {
      success: true,
      content,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}
