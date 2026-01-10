/**
 * ReviewSessionManager
 * 포커스 세션 및 일일 복습 큐 관리
 *
 * 핵심 기능:
 * 1. 클러스터 기반 포커스 세션 관리
 * 2. 일일 복습 한도 (dailyLimit) 적용
 * 3. 신규 노트 점진적 도입 (newCardsPerDay)
 * 4. 세션 상태 영속화
 */

import type { ReviewCard } from '../../domain/entities/review-card';
import type {
  FocusSession,
  NoteCluster,
  DailyReviewQueue,
  PersistedSessionData,
} from '../../domain/entities/focus-session';
import { DEFAULT_PERSISTED_SESSION } from '../../domain/entities/focus-session';

export interface ReviewSessionConfig {
  dailyLimit: number;
  newCardsPerDay: number;
  similarityThreshold: number;
  clusterMinSize: number;
}

export const DEFAULT_SESSION_CONFIG: ReviewSessionConfig = {
  dailyLimit: 20,
  newCardsPerDay: 10,
  similarityThreshold: 0.7,
  clusterMinSize: 3,
};

export class ReviewSessionManager {
  private sessionData: PersistedSessionData;
  private config: ReviewSessionConfig;

  constructor(
    persistedData: PersistedSessionData | null,
    config: Partial<ReviewSessionConfig> = {}
  ) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };

    // 날짜 변경 시 세션 데이터 리셋
    const today = this.getTodayString();
    if (persistedData && persistedData.lastActiveDate === today) {
      this.sessionData = persistedData;
    } else {
      // 새로운 날: 일일 카운터 리셋, 세션은 유지
      this.sessionData = {
        currentSession: persistedData?.currentSession || null,
        lastActiveDate: today,
        reviewedTodayIds: [],
        newCardsIntroducedIds: [],
        clusterLastReviewed: persistedData?.clusterLastReviewed || {},
      };
    }
  }

  /**
   * 오늘의 복습 큐 조회
   */
  getDailyQueue(): DailyReviewQueue {
    return {
      date: this.sessionData.lastActiveDate,
      focusSession: this.sessionData.currentSession,
      reviewedCount: this.sessionData.reviewedTodayIds.length,
      dailyLimit: this.config.dailyLimit,
      newCardsIntroduced: this.sessionData.newCardsIntroducedIds.length,
      newCardsLimit: this.config.newCardsPerDay,
    };
  }

  /**
   * 오늘 복습할 노트 선택
   * - 일일 한도 적용
   * - 포커스 세션 우선
   * - 신규 노트 점진 도입
   */
  selectTodayReviewNotes(
    allCards: ReviewCard[],
    clusters: NoteCluster[]
  ): ReviewCard[] {
    const today = new Date();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    // 1. 이미 복습한 노트 제외
    const reviewedSet = new Set(this.sessionData.reviewedTodayIds);

    // 2. Due 노트 필터링 (오늘 이전 또는 오늘까지)
    const dueCards = allCards.filter((card) => {
      if (reviewedSet.has(card.noteId)) return false;
      const nextReview = new Date(card.sm2State.nextReview);
      return nextReview <= todayEnd;
    });

    // 3. 일일 한도 확인
    const remainingSlots = this.config.dailyLimit - this.sessionData.reviewedTodayIds.length;
    if (remainingSlots <= 0) {
      return []; // 오늘 한도 도달
    }

    // 4. 포커스 세션이 있으면 해당 클러스터 노트 우선
    if (this.sessionData.currentSession?.status === 'active') {
      const sessionNotes = this.getSessionNotes(dueCards);
      if (sessionNotes.length > 0) {
        return sessionNotes.slice(0, remainingSlots);
      }
      // 세션 내 노트가 없으면 세션 완료 처리
      this.completeCurrentSession();
    }

    // 5. 새 포커스 세션 시작
    const newSession = this.startNewSession(dueCards, clusters);
    if (newSession) {
      const sessionNotes = this.getSessionNotes(dueCards);
      return sessionNotes.slice(0, remainingSlots);
    }

    // 6. 클러스터 없으면 due 순서대로
    return this.sortByPriority(dueCards).slice(0, remainingSlots);
  }

  /**
   * 신규 노트 중 오늘 도입할 노트 선택
   * - newCardsPerDay 한도 적용
   * - 클러스터 기반 우선순위
   */
  selectNewCardsToIntroduce(
    newCards: ReviewCard[],
    clusters: NoteCluster[]
  ): ReviewCard[] {
    const remainingNewSlots =
      this.config.newCardsPerDay - this.sessionData.newCardsIntroducedIds.length;

    if (remainingNewSlots <= 0) {
      return [];
    }

    // 이미 도입된 노트 제외
    const introducedSet = new Set(this.sessionData.newCardsIntroducedIds);
    const candidates = newCards.filter((c) => !introducedSet.has(c.noteId));

    // 현재 포커스 클러스터와 같은 클러스터의 노트 우선
    if (this.sessionData.currentSession) {
      const clusterId = this.sessionData.currentSession.clusterId;
      const cluster = clusters.find((c) => c.id === clusterId);
      if (cluster) {
        const clusterNoteSet = new Set(cluster.noteIds);
        const sameClusterNew = candidates.filter((c) => clusterNoteSet.has(c.noteId));
        const otherNew = candidates.filter((c) => !clusterNoteSet.has(c.noteId));
        return [...sameClusterNew, ...otherNew].slice(0, remainingNewSlots);
      }
    }

    return candidates.slice(0, remainingNewSlots);
  }

  /**
   * 노트 복습 완료 기록
   */
  markReviewed(noteId: string, isNewCard: boolean): void {
    if (!this.sessionData.reviewedTodayIds.includes(noteId)) {
      this.sessionData.reviewedTodayIds.push(noteId);
    }

    if (isNewCard && !this.sessionData.newCardsIntroducedIds.includes(noteId)) {
      this.sessionData.newCardsIntroducedIds.push(noteId);
    }

    // 포커스 세션 업데이트
    if (this.sessionData.currentSession) {
      const session = this.sessionData.currentSession;
      session.remainingNoteIds = session.remainingNoteIds.filter((id) => id !== noteId);
      if (!session.reviewedTodayIds.includes(noteId)) {
        session.reviewedTodayIds.push(noteId);
      }
      session.lastActiveAt = new Date();

      // 세션 완료 체크
      if (session.remainingNoteIds.length === 0) {
        this.completeCurrentSession();
      }
    }
  }

  /**
   * 현재 포커스 세션 조회
   */
  getCurrentSession(): FocusSession | null {
    return this.sessionData.currentSession;
  }

  /**
   * 세션 데이터 영속화용 반환
   */
  getPersistedData(): PersistedSessionData {
    return { ...this.sessionData };
  }

  /**
   * 포커스 세션 수동 시작
   */
  startSessionForCluster(cluster: NoteCluster, dueNoteIds: string[]): FocusSession {
    const session: FocusSession = {
      id: `session_${Date.now()}`,
      clusterId: cluster.id,
      clusterLabel: cluster.label,
      noteIds: [...cluster.noteIds],
      remainingNoteIds: dueNoteIds.filter((id) => cluster.noteIds.includes(id)),
      reviewedTodayIds: [],
      startedAt: new Date(),
      lastActiveAt: new Date(),
      status: 'active',
    };

    this.sessionData.currentSession = session;
    return session;
  }

  /**
   * 포커스 세션 일시 정지
   */
  pauseCurrentSession(): void {
    if (this.sessionData.currentSession) {
      this.sessionData.currentSession.status = 'paused';
    }
  }

  /**
   * 설정 업데이트
   */
  updateConfig(config: Partial<ReviewSessionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private getTodayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  private getSessionNotes(dueCards: ReviewCard[]): ReviewCard[] {
    if (!this.sessionData.currentSession) return [];

    const remainingSet = new Set(this.sessionData.currentSession.remainingNoteIds);
    return dueCards.filter((card) => remainingSet.has(card.noteId));
  }

  private completeCurrentSession(): void {
    if (this.sessionData.currentSession) {
      this.sessionData.currentSession.status = 'completed';
      this.sessionData.clusterLastReviewed[this.sessionData.currentSession.clusterId] =
        this.getTodayString();
      this.sessionData.currentSession = null;
    }
  }

  private startNewSession(
    dueCards: ReviewCard[],
    clusters: NoteCluster[]
  ): FocusSession | null {
    if (clusters.length === 0) return null;

    const dueNoteIds = new Set(dueCards.map((c) => c.noteId));

    // 가장 최근에 복습하지 않은 클러스터 중 due 노트가 있는 것 선택
    const eligibleClusters = clusters
      .map((cluster) => ({
        cluster,
        dueCount: cluster.noteIds.filter((id) => dueNoteIds.has(id)).length,
        lastReviewed: this.sessionData.clusterLastReviewed[cluster.id] || '1970-01-01',
      }))
      .filter((c) => c.dueCount > 0)
      .sort((a, b) => {
        // 마지막 복습 오래된 것 우선
        if (a.lastReviewed !== b.lastReviewed) {
          return a.lastReviewed.localeCompare(b.lastReviewed);
        }
        // due 노트 많은 것 우선
        return b.dueCount - a.dueCount;
      });

    if (eligibleClusters.length === 0) return null;

    const selected = eligibleClusters[0];
    return this.startSessionForCluster(
      selected.cluster,
      Array.from(dueNoteIds)
    );
  }

  private sortByPriority(cards: ReviewCard[]): ReviewCard[] {
    return [...cards].sort((a, b) => {
      // 1. Due date 오래된 것 우선
      const aDue = new Date(a.sm2State.nextReview).getTime();
      const bDue = new Date(b.sm2State.nextReview).getTime();
      if (aDue !== bDue) return aDue - bDue;

      // 2. easeFactor 낮은 것 우선 (어려운 카드)
      if (a.sm2State.easeFactor !== b.sm2State.easeFactor) {
        return a.sm2State.easeFactor - b.sm2State.easeFactor;
      }

      // 3. repetition 낮은 것 우선 (덜 복습된 카드)
      return a.sm2State.repetition - b.sm2State.repetition;
    });
  }
}
