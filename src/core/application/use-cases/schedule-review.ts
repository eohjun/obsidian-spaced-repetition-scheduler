/**
 * ScheduleReviewUseCase
 * 오늘 복습 예정 카드를 조회하고 최적 순서로 정렬
 */

import type { IScheduler } from '../../domain/interfaces/scheduler.interface';
import type { IReviewRepository } from '../../domain/interfaces/review-repository.interface';
import type { ReviewSchedule } from '../../domain/value-objects/review-schedule';
import type { ReviewCard } from '../../domain/entities/review-card';
import { createEmptySchedule } from '../../domain/value-objects/review-schedule';

export interface ScheduleReviewInput {
  includeUpcoming?: boolean;   // 다음 7일 예정 포함 여부
  upcomingDays?: number;       // 예정 카드 조회 일수 (기본: 7)
}

export interface ScheduleReviewOutput {
  schedule: ReviewSchedule;
  optimizedOrder: ReviewCard[];
}

export class ScheduleReviewUseCase {
  constructor(
    private scheduler: IScheduler,
    private repository: IReviewRepository
  ) {}

  async execute(input: ScheduleReviewInput = {}): Promise<ScheduleReviewOutput> {
    const { includeUpcoming = true, upcomingDays = 7 } = input;

    // 전체 카드 조회
    const allCards = await this.repository.getAllCards();

    if (allCards.length === 0) {
      return {
        schedule: createEmptySchedule(),
        optimizedOrder: [],
      };
    }

    const today = new Date();

    // 오늘 복습 예정 카드
    const dueToday = this.scheduler.getDueCards(allCards, today);

    // 기한 지난 카드
    const overdue = this.scheduler.getOverdueCards(allCards, today);

    // 예정 카드 (다음 N일)
    let upcoming: ReviewCard[] = [];
    if (includeUpcoming) {
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + upcomingDays);

      upcoming = allCards.filter((card) => {
        const nextReview = new Date(card.sm2State.nextReview);
        return nextReview > today && nextReview <= futureDate;
      });
    }

    // 복습 필요 카드 (overdue + dueToday)
    const needsReview = [...overdue, ...dueToday];

    // 최적 순서로 정렬
    const optimizedOrder = this.scheduler.optimizeReviewOrder(needsReview);

    const schedule: ReviewSchedule = {
      dueToday,
      overdue,
      upcoming,
      totalDue: needsReview.length,
      suggestedOrder: optimizedOrder.map((c) => c.noteId),
    };

    return { schedule, optimizedOrder };
  }
}
