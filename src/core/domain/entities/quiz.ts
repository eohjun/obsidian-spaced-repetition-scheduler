/**
 * Quiz Entity
 * AI 생성 퀴즈 관련 엔티티
 */

export interface Quiz {
  noteId: string;
  questions: QuizQuestion[];
  generatedAt: Date;
  model: string;               // 생성에 사용된 LLM 모델
  noteTitle?: string;
}

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];          // 객관식용
  correctAnswer: string;
  explanation?: string;
  difficulty: QuestionDifficulty;
}

export type QuestionType = 'open_ended' | 'multiple_choice' | 'true_false' | 'fill_blank';

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface QuizResult {
  quizId: string;
  noteId: string;
  answers: QuizAnswer[];
  score: number;               // 0-100
  completedAt: Date;
  timeTaken: number;           // 초 단위
}

export interface QuizAnswer {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  timeTaken: number;           // 초 단위
}

/**
 * 퀴즈 점수 계산
 */
export function calculateQuizScore(answers: QuizAnswer[]): number {
  if (answers.length === 0) return 0;
  const correct = answers.filter((a) => a.isCorrect).length;
  return Math.round((correct / answers.length) * 100);
}

/**
 * 퀴즈 점수를 SM-2 quality로 변환
 * 0-100 점수를 0-5 quality로 매핑
 */
export function quizScoreToQuality(score: number): number {
  if (score >= 90) return 5;       // Perfect
  if (score >= 75) return 4;       // Correct after hesitation
  if (score >= 60) return 3;       // Correct with difficulty
  if (score >= 40) return 2;       // Incorrect, but correct seemed easy
  if (score >= 20) return 1;       // Incorrect, remembered after seeing
  return 0;                        // Complete blackout
}
