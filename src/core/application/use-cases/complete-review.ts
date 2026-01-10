/**
 * CompleteReviewUseCase
 * 복습 완료 처리 및 SM-2 상태 업데이트
 */

import type { IScheduler } from '../../domain/interfaces/scheduler.interface';
import type { IReviewRepository } from '../../domain/interfaces/review-repository.interface';
import type { ReviewCard, ReviewMode, ReviewRecord } from '../../domain/entities/review-card';

export interface CompleteReviewInput {
  noteId: string;
  quality: number;           // 0-5 (SM-2 quality rating)
  mode: ReviewMode;
  quizScore?: number;        // 퀴즈 모드일 때 점수
}

export interface CompleteReviewOutput {
  updatedCard: ReviewCard;
  previousLevel: string;
  newLevel: string;
  nextReviewDate: Date;
  intervalDays: number;
}

export class CompleteReviewUseCase {
  constructor(
    private scheduler: IScheduler,
    private repository: IReviewRepository
  ) {}

  async execute(input: CompleteReviewInput): Promise<CompleteReviewOutput> {
    const { noteId, quality, mode, quizScore } = input;

    // 기존 카드 조회
    const card = await this.repository.getCard(noteId);
    if (!card) {
      throw new Error(`Card not found: ${noteId}`);
    }

    // 이전 정착도 레벨 저장
    const previousLevel = card.retentionLevel;

    // SM-2 알고리즘으로 새 상태 계산
    const newSM2State = this.scheduler.calculateNext(card, quality);

    // 새 정착도 레벨 추정
    const newLevel = this.scheduler.estimateRetentionLevel({
      ...card,
      sm2State: newSM2State,
    });

    // 복습 기록 추가
    const reviewRecord: ReviewRecord = {
      reviewedAt: new Date(),
      quality,
      mode,
      quizScore,
    };

    // 카드 업데이트
    const updatedCard: ReviewCard = {
      ...card,
      sm2State: newSM2State,
      retentionLevel: newLevel,
      reviewHistory: [...card.reviewHistory, reviewRecord],
      lastModified: new Date(),
    };

    // 저장
    await this.repository.saveCard(updatedCard);

    return {
      updatedCard,
      previousLevel,
      newLevel,
      nextReviewDate: newSM2State.nextReview,
      intervalDays: newSM2State.interval,
    };
  }
}
