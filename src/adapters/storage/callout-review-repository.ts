/**
 * CalloutReviewRepository
 * 노트 본문의 접힌 콜아웃에 복습 데이터 저장
 *
 * ⚠️ CRITICAL: CrossPlatformFileUtils 사용 필수
 *
 * 콜아웃 구조:
 * > [!srs]- 📊 복습 데이터
 * > ```json
 * > {"noteId":"abc12345","repetition":3,...}
 * > ```
 *
 * 장점:
 * - Obsidian Properties와 충돌 없음 (플랫 속성만 허용)
 * - 기본 접힘 상태로 본문 방해 최소화
 * - JSON으로 구조화된 데이터 저장
 */

import { App, normalizePath } from 'obsidian';
import type {
  IReviewRepository,
  ReviewStatistics,
  ReviewHistoryEntry,
} from '../../core/domain/interfaces/review-repository.interface';
import type {
  ReviewCard,
  SM2State,
  RetentionLevel,
  ReviewRecord,
} from '../../core/domain/entities/review-card';
import type { VaultEmbeddingsReader } from '../embeddings/vault-embeddings-reader';
import { CrossPlatformFileUtils } from '../obsidian/cross-platform-file-utils';

// =============================================================================
// Types
// =============================================================================

interface SRSCalloutData {
  noteId: string;
  repetition: number;
  interval: number;
  easeFactor: number;
  nextReview: string;
  retentionLevel: RetentionLevel;
  reviewHistory?: SRSReviewHistory[];
}

interface SRSReviewHistory {
  date: string;
  quality: number;
  mode: string;
  quizScore?: number;
}

// Callout regex patterns
const CALLOUT_PATTERN = /^> \[!srs\][+-]? .*\n(?:> .*\n?)*/gm;
const CALLOUT_JSON_PATTERN = /> ```json\n> ([^\n]+)\n> ```/;

// =============================================================================
// Repository Implementation
// =============================================================================

export class CalloutReviewRepository implements IReviewRepository {
  private fileUtils: CrossPlatformFileUtils;
  private cache: Map<string, ReviewCard> = new Map();
  private cacheInitialized = false;
  private embeddingsReader: VaultEmbeddingsReader | null = null;

  constructor(private app: App) {
    this.fileUtils = new CrossPlatformFileUtils(app);
  }

  /**
   * VaultEmbeddingsReader 설정 (플러그인 초기화 시 호출)
   */
  setEmbeddingsReader(reader: VaultEmbeddingsReader): void {
    this.embeddingsReader = reader;
  }

  /**
   * 특정 노트의 복습 카드 조회
   */
  async getCard(noteId: string): Promise<ReviewCard | null> {
    // 캐시 확인
    if (this.cache.has(noteId)) {
      return this.cache.get(noteId)!;
    }

    // 캐시 미초기화 시 전체 스캔
    if (!this.cacheInitialized) {
      await this.initializeCache();
      return this.cache.get(noteId) ?? null;
    }

    return null;
  }

  /**
   * 전체 복습 카드 조회
   */
  async getAllCards(): Promise<ReviewCard[]> {
    if (!this.cacheInitialized) {
      await this.initializeCache();
    }
    return Array.from(this.cache.values());
  }

  /**
   * 복습 카드 저장
   */
  async saveCard(card: ReviewCard): Promise<void> {
    const exists = await this.fileUtils.fileExists(card.notePath);
    if (!exists) {
      throw new Error(`Note not found: ${card.notePath}`);
    }

    // 파일 내용 읽기
    const content = await this.fileUtils.readFile(card.notePath);
    if (content === null) {
      throw new Error(`Failed to read note: ${card.notePath}`);
    }

    // 콜아웃 업데이트
    const updatedContent = this.updateCallout(content, card);
    await this.fileUtils.writeFile(card.notePath, updatedContent);

    // 캐시 업데이트
    this.cache.set(card.noteId, card);
  }

  /**
   * 복습 카드 삭제
   */
  async deleteCard(noteId: string): Promise<void> {
    const card = this.cache.get(noteId);
    if (!card) return;

    const content = await this.fileUtils.readFile(card.notePath);
    if (content === null) return;

    // 콜아웃 제거
    const updatedContent = this.removeCallout(content);
    await this.fileUtils.writeFile(card.notePath, updatedContent);

    // 캐시에서 제거
    this.cache.delete(noteId);
  }

  /**
   * 복습 통계 조회
   */
  async getStatistics(): Promise<ReviewStatistics> {
    const cards = await this.getAllCards();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const stats: ReviewStatistics = {
      totalCards: cards.length,
      byRetentionLevel: {
        novice: 0,
        learning: 0,
        intermediate: 0,
        advanced: 0,
        mastered: 0,
      },
      averageEaseFactor: 0,
      reviewsToday: 0,
      reviewsThisWeek: 0,
      streak: 0,
      longestStreak: 0,
      totalReviewCount: 0,
      averageQuality: 0,
    };

    if (cards.length === 0) return stats;

    let totalEaseFactor = 0;
    let totalQuality = 0;
    let qualityCount = 0;

    for (const card of cards) {
      stats.byRetentionLevel[card.retentionLevel]++;
      totalEaseFactor += card.sm2State.easeFactor;

      for (const review of card.reviewHistory) {
        stats.totalReviewCount++;
        totalQuality += review.quality;
        qualityCount++;

        const reviewDate = new Date(review.reviewedAt);
        if (reviewDate >= todayStart) {
          stats.reviewsToday++;
        }
        if (reviewDate >= weekStart) {
          stats.reviewsThisWeek++;
        }
      }
    }

    stats.averageEaseFactor = totalEaseFactor / cards.length;
    stats.averageQuality = qualityCount > 0 ? totalQuality / qualityCount : 0;

    // 스트릭 계산
    const { streak, longestStreak } = this.calculateStreak(cards);
    stats.streak = streak;
    stats.longestStreak = longestStreak;

    return stats;
  }

  /**
   * 오늘 복습 예정 카드 수 조회
   */
  async getDueTodayCount(): Promise<number> {
    const cards = await this.getAllCards();
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    return cards.filter((card) => {
      const nextReview = new Date(card.sm2State.nextReview);
      return nextReview <= todayEnd;
    }).length;
  }

  /**
   * 특정 기간 내 복습 기록 조회
   */
  async getReviewHistory(startDate: Date, endDate: Date): Promise<ReviewHistoryEntry[]> {
    const cards = await this.getAllCards();
    const entries: ReviewHistoryEntry[] = [];

    for (const card of cards) {
      for (const review of card.reviewHistory) {
        const reviewDate = new Date(review.reviewedAt);
        if (reviewDate >= startDate && reviewDate <= endDate) {
          entries.push({
            noteId: card.noteId,
            noteTitle: card.noteTitle,
            reviewedAt: reviewDate,
            quality: review.quality,
            mode: review.mode,
          });
        }
      }
    }

    // 날짜순 정렬
    entries.sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime());

    return entries;
  }

  /**
   * 캐시 초기화 (Vault Embeddings 기반)
   * VE index에 있는 모든 노트를 복습 대상으로 관리
   */
  async initializeCache(): Promise<void> {
    this.cache.clear();

    // Vault Embeddings 사용 가능한 경우 VE 기반으로 초기화
    if (this.embeddingsReader) {
      const available = await this.embeddingsReader.isAvailable();
      if (available) {
        await this.initializeCacheFromVE();
        this.cacheInitialized = true;
        return;
      }
    }

    // VE 없으면 기존 방식 (콜아웃이 있는 노트만)
    await this.initializeCacheFromCallouts();
    this.cacheInitialized = true;
  }

  /**
   * Vault Embeddings 기반 캐시 초기화
   * - VE index의 모든 노트가 복습 대상
   * - 콜아웃 없으면 기본 SM2 상태로 초기화
   *
   * ⚠️ Cross-platform: TFile 대신 경로 직접 사용 (iOS/Git sync 대응)
   */
  private async initializeCacheFromVE(): Promise<void> {
    if (!this.embeddingsReader) return;

    const index = await this.embeddingsReader.readIndex();
    if (!index) return;

    const noteEntries = Object.entries(index.notes);

    for (const [noteId, entry] of noteEntries) {
      // ⚠️ Cross-platform: fileExists 사용 (adapter 폴백 포함)
      const exists = await this.fileUtils.fileExists(entry.path);
      if (!exists) continue;

      const content = await this.fileUtils.readFile(entry.path);
      if (content === null) continue;

      // 콜아웃에서 기존 srs 데이터 확인
      const srsData = this.parseCallout(content);

      if (srsData) {
        // 기존 SM2 상태 사용
        const card = await this.toReviewCardFromPath(entry.path, srsData);
        this.cache.set(card.noteId, card);
      } else {
        // 새 노트: 기본 SM2 상태로 초기화 (nextReview = 먼 미래)
        const card = await this.createDefaultCardFromPath(noteId, entry.path);
        this.cache.set(noteId, card);
      }
    }
  }

  /**
   * 콜아웃 기반 캐시 초기화 (VE 없을 때 폴백)
   */
  private async initializeCacheFromCallouts(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      const content = await this.fileUtils.readFile(file.path);
      if (content === null) continue;

      const srsData = this.parseCallout(content);
      if (!srsData) continue;

      const card = await this.toReviewCardFromPath(file.path, srsData);
      this.cache.set(card.noteId, card);
    }
  }

  /**
   * 기본 SM2 상태의 새 카드 생성 (경로 사용 - Cross-platform)
   * ⚠️ adapter.stat 사용으로 iOS/Git sync 대응
   *
   * 신규 노트는 nextReview = 미래로 설정하여 점진적 도입 지원
   * - repetition: 0 = 신규 카드 (아직 학습 시작 안함)
   * - nextReview: 미래 = 자동으로 due 목록에 안 뜸
   * - ReviewSessionManager가 도입 시점에 nextReview 업데이트
   */
  private async createDefaultCardFromPath(noteId: string, path: string): Promise<ReviewCard> {
    const normalizedPath = normalizePath(path);
    const now = new Date();

    // 신규 카드: 먼 미래로 설정 (9999년) - 점진적 도입 전까지 due에 안 뜸
    const farFuture = new Date('9999-12-31');

    const sm2State: SM2State = {
      repetition: 0,
      interval: 0,
      easeFactor: 2.5,
      nextReview: farFuture, // 도입 전까지 due에 안 뜸
    };

    // adapter.stat으로 파일 메타데이터 조회 (cross-platform)
    let ctime = now;
    let mtime = now;
    try {
      const stat = await this.app.vault.adapter.stat(normalizedPath);
      if (stat) {
        ctime = new Date(stat.ctime);
        mtime = new Date(stat.mtime);
      }
    } catch {
      // stat 실패 시 현재 시간 사용
    }

    // basename 추출 (경로에서)
    const basename = normalizedPath.split('/').pop()?.replace(/\.md$/, '') || noteId;

    return {
      noteId,
      notePath: normalizedPath,
      noteTitle: basename,
      sm2State,
      retentionLevel: 'novice',
      reviewHistory: [],
      tags: [],
      createdAt: ctime,
      lastModified: mtime,
    };
  }

  /**
   * SRSCalloutData를 ReviewCard로 변환 (경로 사용 - Cross-platform)
   */
  private async toReviewCardFromPath(path: string, srs: SRSCalloutData): Promise<ReviewCard> {
    const normalizedPath = normalizePath(path);
    const sm2State: SM2State = {
      repetition: srs.repetition,
      interval: srs.interval,
      easeFactor: srs.easeFactor,
      nextReview: new Date(srs.nextReview),
    };

    const reviewHistory: ReviewRecord[] = (srs.reviewHistory || []).map((h) => ({
      reviewedAt: new Date(h.date),
      quality: h.quality,
      mode: h.mode as 'quick' | 'deep' | 'quiz',
      quizScore: h.quizScore,
    }));

    // adapter.stat으로 파일 메타데이터 조회 (cross-platform)
    let ctime = new Date();
    let mtime = new Date();
    try {
      const stat = await this.app.vault.adapter.stat(normalizedPath);
      if (stat) {
        ctime = new Date(stat.ctime);
        mtime = new Date(stat.mtime);
      }
    } catch {
      // stat 실패 시 현재 시간 사용
    }

    // basename 추출 (경로에서)
    const basename = normalizedPath.split('/').pop()?.replace(/\.md$/, '') || srs.noteId;

    return {
      noteId: srs.noteId,
      notePath: normalizedPath,
      noteTitle: basename,
      sm2State,
      retentionLevel: srs.retentionLevel,
      reviewHistory,
      tags: [],
      createdAt: ctime,
      lastModified: mtime,
    };
  }

  /**
   * 캐시 무효화
   */
  invalidateCache(): void {
    this.cacheInitialized = false;
    this.cache.clear();
  }

  /**
   * 신규 카드 도입 - nextReview를 오늘로 설정
   * ReviewSessionManager가 newCardsPerDay 한도 내에서 호출
   *
   * @param noteId 도입할 노트 ID
   * @returns 성공 여부
   */
  async introduceNewCard(noteId: string): Promise<boolean> {
    const card = this.cache.get(noteId);
    if (!card) return false;

    // 이미 도입된 카드 (repetition > 0 또는 nextReview가 합리적인 날짜)
    const isAlreadyIntroduced =
      card.sm2State.repetition > 0 ||
      card.sm2State.nextReview.getFullYear() < 9999;

    if (isAlreadyIntroduced) return true;

    // nextReview를 오늘로 설정하여 due 목록에 나타나게 함
    card.sm2State.nextReview = new Date();
    await this.saveCard(card);

    return true;
  }

  /**
   * 아직 도입되지 않은 신규 카드 조회
   * - repetition = 0
   * - nextReview = 9999년 (먼 미래)
   */
  async getUnintroducedCards(): Promise<ReviewCard[]> {
    const allCards = await this.getAllCards();
    return allCards.filter(
      (card) =>
        card.sm2State.repetition === 0 &&
        card.sm2State.nextReview.getFullYear() === 9999
    );
  }

  /**
   * 도입된 카드 (학습 시작됨) 조회
   */
  async getIntroducedCards(): Promise<ReviewCard[]> {
    const allCards = await this.getAllCards();
    return allCards.filter(
      (card) =>
        card.sm2State.repetition > 0 ||
        card.sm2State.nextReview.getFullYear() < 9999
    );
  }

  // ===========================================================================
  // Callout Parsing & Generation
  // ===========================================================================

  /**
   * 콜아웃에서 SRS 데이터 파싱
   */
  private parseCallout(content: string): SRSCalloutData | null {
    const calloutMatch = content.match(CALLOUT_PATTERN);
    if (!calloutMatch) return null;

    const calloutContent = calloutMatch[0];
    const jsonMatch = calloutContent.match(CALLOUT_JSON_PATTERN);
    if (!jsonMatch) return null;

    try {
      const json = jsonMatch[1].trim();
      const data = JSON.parse(json) as SRSCalloutData;

      // 필수 필드 확인
      if (!data.noteId || !data.nextReview) return null;

      return {
        noteId: data.noteId,
        repetition: data.repetition ?? 0,
        interval: data.interval ?? 0,
        easeFactor: data.easeFactor ?? 2.5,
        nextReview: data.nextReview,
        retentionLevel: data.retentionLevel ?? 'novice',
        reviewHistory: data.reviewHistory,
      };
    } catch (error) {
      console.error('[SRS] Failed to parse callout JSON:', error);
      return null;
    }
  }

  /**
   * 콜아웃 업데이트 또는 추가
   */
  private updateCallout(content: string, card: ReviewCard): string {
    const calloutBlock = this.buildCalloutBlock(card);
    const existingMatch = content.match(CALLOUT_PATTERN);

    if (existingMatch) {
      // 기존 콜아웃 교체
      return content.replace(CALLOUT_PATTERN, calloutBlock);
    } else {
      // 새 콜아웃 추가 (본문 끝에)
      const trimmedContent = content.trimEnd();
      return `${trimmedContent}\n\n${calloutBlock}\n`;
    }
  }

  /**
   * 콜아웃 제거
   */
  private removeCallout(content: string): string {
    // 콜아웃과 앞뒤 빈 줄 제거
    return content
      .replace(/\n*> \[!srs\][+-]? .*\n(?:> .*\n?)*/gm, '')
      .trimEnd() + '\n';
  }

  /**
   * SRS 콜아웃 블록 생성
   */
  private buildCalloutBlock(card: ReviewCard): string {
    // 최근 20개 히스토리만 저장
    const recentHistory = card.reviewHistory.slice(-20).map((h) => ({
      date: this.formatDate(h.reviewedAt),
      quality: h.quality,
      mode: h.mode,
      ...(h.quizScore !== undefined && { quizScore: h.quizScore }),
    }));

    const data: SRSCalloutData = {
      noteId: card.noteId,
      repetition: card.sm2State.repetition,
      interval: card.sm2State.interval,
      easeFactor: parseFloat(card.sm2State.easeFactor.toFixed(2)),
      nextReview: this.formatDate(card.sm2State.nextReview),
      retentionLevel: card.retentionLevel,
      ...(recentHistory.length > 0 && { reviewHistory: recentHistory }),
    };

    const json = JSON.stringify(data);

    return `> [!srs]- 📊 복습 데이터
> \`\`\`json
> ${json}
> \`\`\``;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * 날짜 포맷팅
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * 스트릭 계산
   */
  private calculateStreak(cards: ReviewCard[]): { streak: number; longestStreak: number } {
    // 모든 복습 날짜 수집
    const reviewDates = new Set<string>();

    for (const card of cards) {
      for (const review of card.reviewHistory) {
        reviewDates.add(this.formatDate(new Date(review.reviewedAt)));
      }
    }

    if (reviewDates.size === 0) {
      return { streak: 0, longestStreak: 0 };
    }

    const sortedDates = Array.from(reviewDates).sort().reverse();

    let streak = 0;
    let longestStreak = 0;
    let currentStreak = 0;

    // 오늘부터 연속 복습일 계산
    for (let i = 0; i < sortedDates.length; i++) {
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - i);
      const expected = this.formatDate(expectedDate);

      if (sortedDates.includes(expected)) {
        streak++;
      } else {
        break;
      }
    }

    // 최장 스트릭 계산
    const allDates = Array.from(reviewDates).sort();
    for (let i = 0; i < allDates.length; i++) {
      if (i === 0) {
        currentStreak = 1;
      } else {
        const prevDate = new Date(allDates[i - 1]);
        const currDate = new Date(allDates[i]);
        const diff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

        if (diff === 1) {
          currentStreak++;
        } else {
          longestStreak = Math.max(longestStreak, currentStreak);
          currentStreak = 1;
        }
      }
    }
    longestStreak = Math.max(longestStreak, currentStreak);

    return { streak, longestStreak };
  }
}
