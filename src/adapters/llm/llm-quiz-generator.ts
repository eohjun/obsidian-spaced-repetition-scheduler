/**
 * LLMQuizGenerator
 * AI 기반 퀴즈 생성기 구현
 */

import type {
  IQuizGenerator,
  QuizOptions,
  AnswerResult,
} from '../../core/domain/interfaces/quiz-generator.interface';
import type { Quiz, QuizQuestion } from '../../core/domain/entities/quiz';
import type { ILLMProvider } from '../../core/domain/interfaces/llm-provider.interface';
import {
  buildQuizUserPrompt,
  getSystemPrompt,
  parseQuizResponse,
} from './prompts/quiz-prompts';

export class LLMQuizGenerator implements IQuizGenerator {
  private provider: ILLMProvider;

  constructor(provider: ILLMProvider) {
    this.provider = provider;
  }

  /**
   * 노트 내용 기반 퀴즈 생성
   */
  async generate(noteContent: string, options: QuizOptions): Promise<Quiz> {
    // 프롬프트 생성
    const systemPrompt = getSystemPrompt(options.language);
    const userPrompt = buildQuizUserPrompt(noteContent, options);

    // LLM 호출
    const response = await this.provider.generate(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        maxTokens: 4096,
        temperature: 0.7,
      }
    );

    if (!response.success) {
      throw new Error(`Quiz generation failed: ${response.error}`);
    }

    // 응답 파싱
    const parsed = parseQuizResponse(response.content);

    if (!parsed || parsed.questions.length === 0) {
      throw new Error('Failed to parse quiz response from LLM');
    }

    // Quiz 엔티티 생성
    const questions: QuizQuestion[] = parsed.questions.map((q, index) => ({
      id: this.generateQuestionId(options.noteId, index),
      type: q.type,
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      difficulty: q.difficulty,
    }));

    return {
      noteId: options.noteId,
      questions,
      generatedAt: new Date(),
      model: this.provider.name,
      noteTitle: options.noteTitle,
    };
  }

  /**
   * 사용자 답변 검증
   */
  validateAnswer(question: QuizQuestion, answer: string): AnswerResult {
    const normalizedAnswer = answer.trim().toLowerCase();
    const normalizedCorrect = question.correctAnswer.trim().toLowerCase();

    switch (question.type) {
      case 'multiple_choice':
      case 'true_false':
        // 정확히 일치해야 정답
        return this.validateExactMatch(
          normalizedAnswer,
          normalizedCorrect,
          question
        );

      case 'fill_blank':
        // 정확히 일치 또는 유사해야 정답
        return this.validateFillBlank(
          normalizedAnswer,
          normalizedCorrect,
          question
        );

      case 'open_ended':
        // 키워드 기반 유사도 검사
        return this.validateOpenEnded(
          normalizedAnswer,
          normalizedCorrect,
          question
        );

      default:
        return {
          isCorrect: false,
          feedback: 'Unknown question type',
          correctAnswer: question.correctAnswer,
        };
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * 질문 ID 생성
   */
  private generateQuestionId(noteId: string, index: number): string {
    const timestamp = Date.now().toString(36);
    return `${noteId.substring(0, 8)}-q${index}-${timestamp}`;
  }

  /**
   * 정확히 일치 검증 (객관식, 참/거짓)
   */
  private validateExactMatch(
    answer: string,
    correct: string,
    question: QuizQuestion
  ): AnswerResult {
    const isCorrect = answer === correct;

    return {
      isCorrect,
      feedback: isCorrect
        ? this.getCorrectFeedback(question)
        : this.getIncorrectFeedback(question),
      correctAnswer: question.correctAnswer,
    };
  }

  /**
   * 빈칸 채우기 검증
   */
  private validateFillBlank(
    answer: string,
    correct: string,
    question: QuizQuestion
  ): AnswerResult {
    // 정확히 일치하거나 95% 이상 유사하면 정답
    const similarity = this.calculateSimpleSimilarity(answer, correct);
    const isCorrect = answer === correct || similarity >= 0.95;

    return {
      isCorrect,
      similarity,
      feedback: isCorrect
        ? this.getCorrectFeedback(question)
        : this.getIncorrectFeedback(question),
      correctAnswer: question.correctAnswer,
    };
  }

  /**
   * 서술형 검증 (키워드 기반)
   */
  private validateOpenEnded(
    answer: string,
    correct: string,
    question: QuizQuestion
  ): AnswerResult {
    // 키워드 추출 및 매칭
    const correctKeywords = this.extractKeywords(correct);
    const answerKeywords = this.extractKeywords(answer);

    const matchedCount = correctKeywords.filter((k) =>
      answerKeywords.includes(k)
    ).length;

    const similarity =
      correctKeywords.length > 0 ? matchedCount / correctKeywords.length : 0;

    // 50% 이상 키워드 매칭 시 정답으로 간주
    const isCorrect = similarity >= 0.5;

    return {
      isCorrect,
      similarity,
      feedback: isCorrect
        ? this.getCorrectFeedback(question)
        : this.getPartialFeedback(question, similarity),
      correctAnswer: question.correctAnswer,
    };
  }

  /**
   * 간단한 문자열 유사도 계산 (Levenshtein 기반)
   */
  private calculateSimpleSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const maxLen = Math.max(a.length, b.length);
    return 1 - matrix[b.length][a.length] / maxLen;
  }

  /**
   * 키워드 추출
   */
  private extractKeywords(text: string): string[] {
    // 불용어 제거 및 키워드 추출 (간단한 구현)
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'shall',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
      'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where',
      '은', '는', '이', '가', '을', '를', '의', '에', '와', '과',
      '도', '로', '으로', '에서', '까지', '부터', '처럼', '같이',
    ]);

    return text
      .split(/\s+/)
      .map((w) => w.replace(/[^\w가-힣]/g, '').toLowerCase())
      .filter((w) => w.length > 1 && !stopWords.has(w));
  }

  /**
   * 정답 피드백 생성
   */
  private getCorrectFeedback(question: QuizQuestion): string {
    if (question.explanation) {
      return `정답입니다! ${question.explanation}`;
    }
    return '정답입니다!';
  }

  /**
   * 오답 피드백 생성
   */
  private getIncorrectFeedback(question: QuizQuestion): string {
    if (question.explanation) {
      return `틀렸습니다. ${question.explanation}`;
    }
    return `틀렸습니다. 정답은 "${question.correctAnswer}"입니다.`;
  }

  /**
   * 부분 정답 피드백 생성
   */
  private getPartialFeedback(question: QuizQuestion, similarity: number): string {
    const percent = Math.round(similarity * 100);

    if (similarity >= 0.3) {
      return `일부 맞았습니다 (${percent}%). 정답: ${question.correctAnswer}`;
    }

    return this.getIncorrectFeedback(question);
  }
}
