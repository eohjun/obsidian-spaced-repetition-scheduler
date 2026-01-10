/**
 * ReviewSchedule Value Object
 * 복습 일정 및 세션 관리
 */

import type { ReviewCard, ReviewMode } from '../entities/review-card';

export interface ReviewSchedule {
  dueToday: ReviewCard[];       // 오늘 복습 예정
  overdue: ReviewCard[];        // 기한 지난 복습
  upcoming: ReviewCard[];       // 다음 7일 내 예정
  totalDue: number;             // 총 복습 필요 카드 수
  suggestedOrder: string[];     // noteId 순서 (최적화된)
}

export interface ReviewSession {
  id: string;
  startedAt: Date;
  cards: ReviewCard[];
  currentIndex: number;
  completedCards: string[];     // 완료된 noteId 목록
  mode: ReviewMode;
  endedAt?: Date;
}

export interface SessionProgress {
  completed: number;
  total: number;
  percentage: number;
  averageQuality: number;
  estimatedTimeRemaining: number;  // 분 단위
}

/**
 * 빈 ReviewSchedule 생성
 */
export function createEmptySchedule(): ReviewSchedule {
  return {
    dueToday: [],
    overdue: [],
    upcoming: [],
    totalDue: 0,
    suggestedOrder: [],
  };
}

/**
 * 새 ReviewSession 생성
 */
export function createSession(cards: ReviewCard[], mode: ReviewMode): ReviewSession {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date(),
    cards,
    currentIndex: 0,
    completedCards: [],
    mode,
  };
}
