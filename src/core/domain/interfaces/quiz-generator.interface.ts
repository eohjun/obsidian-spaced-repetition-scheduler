/**
 * IQuizGenerator Interface
 * AI 기반 퀴즈 생성 인터페이스
 */

import type { Quiz, QuizQuestion, QuestionType, QuestionDifficulty } from '../entities/quiz';

export interface IQuizGenerator {
  /**
   * 노트 내용 기반 퀴즈 생성
   * @param noteContent 노트 마크다운 내용
   * @param options 퀴즈 생성 옵션
   */
  generate(noteContent: string, options: QuizOptions): Promise<Quiz>;

  /**
   * 사용자 답변 검증
   * @param question 질문
   * @param answer 사용자 답변
   */
  validateAnswer(question: QuizQuestion, answer: string): AnswerResult;
}

export interface QuizOptions {
  noteId: string;
  noteTitle?: string;
  questionCount: number;         // 생성할 질문 수
  types: QuestionType[];         // 허용할 질문 유형
  difficulty: QuestionDifficulty | 'mixed';
  language: 'en' | 'ko';
  focusKeywords?: string[];      // 집중할 키워드
}

export interface AnswerResult {
  isCorrect: boolean;
  similarity?: number;           // 서술형 답변의 유사도 (0-1)
  feedback: string;
  correctAnswer: string;
}

/**
 * 기본 퀴즈 옵션
 */
export const DEFAULT_QUIZ_OPTIONS: Omit<QuizOptions, 'noteId'> = {
  questionCount: 5,
  types: ['multiple_choice', 'true_false', 'open_ended'],
  difficulty: 'mixed',
  language: 'ko',
};
