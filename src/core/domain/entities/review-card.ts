/**
 * ReviewCard Entity
 * SRS 복습 대상 노트의 핵심 엔티티
 */

export interface ReviewCard {
  noteId: string;           // hash-based ID (Vault Embeddings 호환)
  notePath: string;         // 원본 파일 경로
  noteTitle: string;
  sm2State: SM2State;
  retentionLevel: RetentionLevel;
  reviewHistory: ReviewRecord[];
  tags: string[];
  createdAt: Date;
  lastModified: Date;
}

export interface SM2State {
  repetition: number;       // 연속 성공 횟수
  interval: number;         // 현재 간격 (일)
  easeFactor: number;       // 난이도 계수 (1.3 ~ 2.5, 초기 2.5)
  nextReview: Date;         // 다음 복습일
}

export interface ReviewRecord {
  reviewedAt: Date;
  quality: number;          // 0-5 (SM-2 quality rating)
  mode: ReviewMode;
  quizScore?: number;       // 퀴즈 모드일 때 점수
}

export type ReviewMode = 'quick' | 'deep' | 'quiz';

export type RetentionLevel = 'novice' | 'learning' | 'intermediate' | 'advanced' | 'mastered';

/**
 * SM2State 기본값 생성
 */
export function createDefaultSM2State(): SM2State {
  return {
    repetition: 0,
    interval: 0,
    easeFactor: 2.5,
    nextReview: new Date(),
  };
}

/**
 * RetentionLevel 우선순위 (정렬용)
 */
export const RETENTION_LEVEL_ORDER: Record<RetentionLevel, number> = {
  novice: 0,
  learning: 1,
  intermediate: 2,
  advanced: 3,
  mastered: 4,
};
