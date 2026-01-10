/**
 * SM2Scheduler
 * SuperMemo 2 알고리즘 구현
 *
 * SM-2 알고리즘:
 * - quality 0-2: 실패 → 처음부터 다시
 * - quality 3-5: 성공 → 간격 증가
 * - easeFactor: 난이도 계수 (1.3 ~ 2.5)
 */

import type { IScheduler, SM2Quality } from '../../core/domain/interfaces/scheduler.interface';
import type {
  ReviewCard,
  SM2State,
  RetentionLevel,
} from '../../core/domain/entities/review-card';
import { RETENTION_LEVEL_ORDER } from '../../core/domain/entities/review-card';

export class SM2Scheduler implements IScheduler {
  /**
   * SM-2 알고리즘으로 다음 복습 상태 계산
   * @param card 현재 카드
   * @param quality 사용자 평가 (0-5)
   */
  calculateNext(card: ReviewCard, quality: SM2Quality): SM2State {
    const { sm2State } = card;

    // quality 0-2: 실패 → 처음부터 다시
    if (quality < 3) {
      return {
        repetition: 0,
        interval: 1,
        easeFactor: Math.max(1.3, sm2State.easeFactor - 0.2),
        nextReview: this.addDays(new Date(), 1),
      };
    }

    // quality 3-5: 성공 → 간격 증가
    let newInterval: number;
    if (sm2State.repetition === 0) {
      newInterval = 1;
    } else if (sm2State.repetition === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(sm2State.interval * sm2State.easeFactor);
    }

    // easeFactor 조정 공식
    // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    const newEF =
      sm2State.easeFactor +
      (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    return {
      repetition: sm2State.repetition + 1,
      interval: newInterval,
      easeFactor: Math.max(1.3, newEF),
      nextReview: this.addDays(new Date(), newInterval),
    };
  }

  /**
   * 오늘 복습 예정인 카드 필터링
   */
  getDueCards(cards: ReviewCard[], date = new Date()): ReviewCard[] {
    const today = this.startOfDay(date);

    return cards.filter((card) => {
      const nextReview = this.startOfDay(new Date(card.sm2State.nextReview));
      return nextReview <= today;
    });
  }

  /**
   * 기한이 지난 카드 필터링 (어제 이전)
   */
  getOverdueCards(cards: ReviewCard[], date = new Date()): ReviewCard[] {
    const yesterday = this.addDays(this.startOfDay(date), -1);

    return cards.filter((card) => {
      const nextReview = this.startOfDay(new Date(card.sm2State.nextReview));
      return nextReview < yesterday;
    });
  }

  /**
   * 카드의 정착도 레벨 추정
   */
  estimateRetentionLevel(card: ReviewCard): RetentionLevel {
    const { sm2State, reviewHistory } = card;
    const { repetition, easeFactor, interval } = sm2State;

    // 복습 기록이 없으면 novice
    if (reviewHistory.length === 0) {
      return 'novice';
    }

    // 최근 5개 복습의 평균 quality
    const recentReviews = reviewHistory.slice(-5);
    const avgQuality =
      recentReviews.reduce((sum, r) => sum + r.quality, 0) / recentReviews.length;

    // 마스터: 높은 repetition, 높은 easeFactor, 긴 interval
    if (repetition >= 5 && easeFactor >= 2.3 && interval >= 30 && avgQuality >= 4) {
      return 'mastered';
    }

    // 고급: 좋은 repetition, 적당한 easeFactor
    if (repetition >= 4 && easeFactor >= 2.0 && interval >= 14 && avgQuality >= 3.5) {
      return 'advanced';
    }

    // 중급: 몇 번 성공
    if (repetition >= 2 && easeFactor >= 1.8 && avgQuality >= 3) {
      return 'intermediate';
    }

    // 학습 중: 약간의 진전
    if (repetition >= 1 || reviewHistory.length >= 2) {
      return 'learning';
    }

    // 초보
    return 'novice';
  }

  /**
   * 복습 순서 최적화
   * 1. overdue 우선
   * 2. 같은 레벨 내에서 easeFactor 낮은 것 우선
   */
  optimizeReviewOrder(cards: ReviewCard[]): ReviewCard[] {
    const today = new Date();

    return [...cards].sort((a, b) => {
      // 1. overdue 우선
      const aOverdue = new Date(a.sm2State.nextReview) < today;
      const bOverdue = new Date(b.sm2State.nextReview) < today;
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      // 2. 정착도 레벨 (낮은 레벨 우선)
      const aLevel = RETENTION_LEVEL_ORDER[a.retentionLevel];
      const bLevel = RETENTION_LEVEL_ORDER[b.retentionLevel];
      if (aLevel !== bLevel) return aLevel - bLevel;

      // 3. easeFactor 낮은 것 우선 (더 어려운 카드)
      return a.sm2State.easeFactor - b.sm2State.easeFactor;
    });
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }
}
