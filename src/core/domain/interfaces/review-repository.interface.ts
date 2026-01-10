/**
 * IReviewRepository Interface
 * 복습 카드 저장소 인터페이스
 */

import type { ReviewCard, RetentionLevel } from '../entities/review-card';

export interface IReviewRepository {
  /**
   * 특정 노트의 복습 카드 조회
   * @param noteId hash 기반 노트 ID
   */
  getCard(noteId: string): Promise<ReviewCard | null>;

  /**
   * 전체 복습 카드 조회
   */
  getAllCards(): Promise<ReviewCard[]>;

  /**
   * 복습 카드 저장 (생성 또는 업데이트)
   * @param card 저장할 카드
   */
  saveCard(card: ReviewCard): Promise<void>;

  /**
   * 복습 카드 삭제
   * @param noteId 삭제할 노트 ID
   */
  deleteCard(noteId: string): Promise<void>;

  /**
   * 복습 통계 조회
   */
  getStatistics(): Promise<ReviewStatistics>;

  /**
   * 오늘 복습 예정 카드 수 조회
   */
  getDueTodayCount(): Promise<number>;

  /**
   * 특정 기간 내 복습 기록 조회
   * @param startDate 시작일
   * @param endDate 종료일
   */
  getReviewHistory(startDate: Date, endDate: Date): Promise<ReviewHistoryEntry[]>;
}

export interface ReviewStatistics {
  totalCards: number;
  byRetentionLevel: Record<RetentionLevel, number>;
  averageEaseFactor: number;
  reviewsToday: number;
  reviewsThisWeek: number;
  streak: number;                    // 연속 복습 일수
  longestStreak: number;
  totalReviewCount: number;
  averageQuality: number;
}

export interface ReviewHistoryEntry {
  noteId: string;
  noteTitle: string;
  reviewedAt: Date;
  quality: number;
  mode: string;
}

/**
 * 빈 통계 객체 생성
 */
export function createEmptyStatistics(): ReviewStatistics {
  return {
    totalCards: 0,
    byRetentionLevel: {
      novice: 0,
      learning: 0,
      intermediate: 0,
      advanced: 0,
      mastered: 0,
    },
    averageEaseFactor: 2.5,
    reviewsToday: 0,
    reviewsThisWeek: 0,
    streak: 0,
    longestStreak: 0,
    totalReviewCount: 0,
    averageQuality: 0,
  };
}
