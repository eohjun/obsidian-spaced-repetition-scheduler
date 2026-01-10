/**
 * RegisterNoteUseCase
 * 새 노트를 복습 시스템에 등록
 */

import type { IReviewRepository } from '../../domain/interfaces/review-repository.interface';
import type { ReviewCard } from '../../domain/entities/review-card';
import { createDefaultSM2State } from '../../domain/entities/review-card';
import { generateNoteId } from '../../domain/utils/note-id';

export interface RegisterNoteInput {
  notePath: string;
  noteTitle: string;
  tags?: string[];
  initialNextReview?: Date;      // 첫 복습일 (기본: 오늘)
}

export interface RegisterNoteOutput {
  card: ReviewCard;
  isNew: boolean;                // 새로 등록된 경우 true
}

export class RegisterNoteUseCase {
  constructor(
    private repository: IReviewRepository
  ) {}

  async execute(input: RegisterNoteInput): Promise<RegisterNoteOutput> {
    const { notePath, noteTitle, tags = [], initialNextReview } = input;

    // Vault Embeddings 호환 noteId 생성
    const noteId = generateNoteId(notePath);

    // 기존 카드 확인
    const existingCard = await this.repository.getCard(noteId);

    if (existingCard) {
      // 이미 등록된 노트 - 제목/태그만 업데이트
      const updatedCard: ReviewCard = {
        ...existingCard,
        noteTitle,
        tags,
        lastModified: new Date(),
      };

      await this.repository.saveCard(updatedCard);

      return {
        card: updatedCard,
        isNew: false,
      };
    }

    // 새 카드 생성
    const now = new Date();
    const defaultSM2 = createDefaultSM2State();

    const newCard: ReviewCard = {
      noteId,
      notePath,
      noteTitle,
      sm2State: {
        ...defaultSM2,
        nextReview: initialNextReview ?? now,
      },
      retentionLevel: 'novice',
      reviewHistory: [],
      tags,
      createdAt: now,
      lastModified: now,
    };

    await this.repository.saveCard(newCard);

    return {
      card: newCard,
      isNew: true,
    };
  }

  /**
   * 여러 노트를 한 번에 등록
   */
  async executeBatch(inputs: RegisterNoteInput[]): Promise<RegisterNoteOutput[]> {
    const results: RegisterNoteOutput[] = [];

    for (const input of inputs) {
      const result = await this.execute(input);
      results.push(result);
    }

    return results;
  }
}
