/**
 * IScheduler Interface
 * SM-2 스케줄링 알고리즘 인터페이스
 */

import type { ReviewCard, SM2State, RetentionLevel } from '../entities/review-card';

export interface IScheduler {
  /**
   * SM-2 알고리즘으로 다음 복습 상태 계산
   * @param card 현재 카드
   * @param quality 사용자 평가 (0-5)
   * @returns 새로운 SM2 상태
   */
  calculateNext(card: ReviewCard, quality: number): SM2State;

  /**
   * 오늘 복습 예정인 카드 필터링
   * @param cards 전체 카드 목록
   * @param date 기준 날짜 (기본: 오늘)
   */
  getDueCards(cards: ReviewCard[], date?: Date): ReviewCard[];

  /**
   * 기한이 지난 카드 필터링
   * @param cards 전체 카드 목록
   * @param date 기준 날짜 (기본: 오늘)
   */
  getOverdueCards(cards: ReviewCard[], date?: Date): ReviewCard[];

  /**
   * 카드의 정착도 레벨 추정
   * @param card 대상 카드
   */
  estimateRetentionLevel(card: ReviewCard): RetentionLevel;

  /**
   * 복습 순서 최적화
   * 기한 지난 것 우선, 같은 레벨 내에서는 easeFactor 낮은 것 우선
   * @param cards 정렬할 카드 목록
   */
  optimizeReviewOrder(cards: ReviewCard[]): ReviewCard[];
}

/**
 * SM-2 Quality Rating 상수
 */
export const SM2_QUALITY = {
  COMPLETE_BLACKOUT: 0,      // 완전히 기억 안 남
  WRONG_REMEMBERED: 1,       // 틀림, 정답 보고 "아!" 반응
  WRONG_EASY: 2,             // 틀림, 정답 보니 쉬워 보임
  CORRECT_DIFFICULT: 3,      // 맞음, 어려움
  CORRECT_HESITATION: 4,     // 맞음, 약간 망설임
  PERFECT: 5,                // 완벽, 즉시 기억
} as const;

export type SM2Quality = typeof SM2_QUALITY[keyof typeof SM2_QUALITY];
