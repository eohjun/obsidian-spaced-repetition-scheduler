/**
 * GenerateQuizUseCase
 * 노트 내용 기반 AI 퀴즈 생성
 */

import type { IQuizGenerator, QuizOptions } from '../../domain/interfaces/quiz-generator.interface';
import type { Quiz, QuestionType } from '../../domain/entities/quiz';
import { DEFAULT_QUIZ_OPTIONS } from '../../domain/interfaces/quiz-generator.interface';

export interface GenerateQuizInput {
  noteId: string;
  noteTitle?: string;
  noteContent: string;
  questionCount?: number;
  types?: QuestionType[];
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
  language?: 'en' | 'ko';
  focusKeywords?: string[];
}

export interface GenerateQuizOutput {
  quiz: Quiz;
  estimatedTime: number;     // 예상 소요 시간 (분)
}

export class GenerateQuizUseCase {
  constructor(
    private quizGenerator: IQuizGenerator
  ) {}

  async execute(input: GenerateQuizInput): Promise<GenerateQuizOutput> {
    const {
      noteId,
      noteTitle,
      noteContent,
      questionCount,
      types,
      difficulty,
      language,
      focusKeywords,
    } = input;

    // 옵션 병합
    const options: QuizOptions = {
      ...DEFAULT_QUIZ_OPTIONS,
      noteId,
      noteTitle,
      ...(questionCount !== undefined && { questionCount }),
      ...(types !== undefined && { types }),
      ...(difficulty !== undefined && { difficulty }),
      ...(language !== undefined && { language }),
      ...(focusKeywords !== undefined && { focusKeywords }),
    };

    // 퀴즈 생성
    const quiz = await this.quizGenerator.generate(noteContent, options);

    // 예상 소요 시간 계산 (질문당 1-2분)
    const estimatedTime = this.calculateEstimatedTime(quiz);

    return { quiz, estimatedTime };
  }

  /**
   * 퀴즈 예상 소요 시간 계산
   */
  private calculateEstimatedTime(quiz: Quiz): number {
    let totalMinutes = 0;

    for (const question of quiz.questions) {
      switch (question.type) {
        case 'true_false':
          totalMinutes += 0.5;
          break;
        case 'multiple_choice':
          totalMinutes += 1;
          break;
        case 'fill_blank':
          totalMinutes += 1.5;
          break;
        case 'open_ended':
          totalMinutes += 2;
          break;
        default:
          totalMinutes += 1;
      }
    }

    return Math.ceil(totalMinutes);
  }
}
