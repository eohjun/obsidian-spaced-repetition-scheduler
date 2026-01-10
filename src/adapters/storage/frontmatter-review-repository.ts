/**
 * FrontmatterReviewRepository
 * 노트 프론트매터에 복습 데이터 저장
 *
 * ⚠️ CRITICAL: CrossPlatformFileUtils 사용 필수
 *
 * 프론트매터 구조:
 * ---
 * srs:
 *   noteId: "abc12345"
 *   repetition: 3
 *   interval: 7
 *   easeFactor: 2.5
 *   nextReview: "2025-01-15"
 *   retentionLevel: "intermediate"
 *   reviewHistory:
 *     - date: "2025-01-08"
 *       quality: 4
 *       mode: "quick"
 * ---
 */

import { App, TFile, normalizePath } from 'obsidian';
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

interface SRSFrontmatter {
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

// =============================================================================
// Repository Implementation
// =============================================================================

export class FrontmatterReviewRepository implements IReviewRepository {
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
    const file = this.fileUtils.getFile(card.notePath);
    if (!file) {
      throw new Error(`Note not found: ${card.notePath}`);
    }

    // 파일 내용 읽기
    const content = await this.fileUtils.readFile(card.notePath);
    if (content === null) {
      throw new Error(`Failed to read note: ${card.notePath}`);
    }

    // 프론트매터 업데이트
    const updatedContent = this.updateFrontmatter(content, card);
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

    // 프론트매터에서 srs 제거
    const updatedContent = this.removeSRSFromFrontmatter(content);
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

    // VE 없으면 기존 방식 (frontmatter에 srs가 있는 노트만)
    await this.initializeCacheFromFrontmatter();
    this.cacheInitialized = true;
  }

  /**
   * Vault Embeddings 기반 캐시 초기화
   * - VE index의 모든 노트가 복습 대상
   * - frontmatter에 srs 없으면 기본 SM2 상태로 초기화
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

      // frontmatter에서 기존 srs 데이터 확인
      const srsData = this.parseFrontmatter(content);

      if (srsData) {
        // 기존 SM2 상태 사용
        const card = await this.toReviewCardFromPath(entry.path, srsData);
        this.cache.set(card.noteId, card);
      } else {
        // 새 노트: 기본 SM2 상태로 초기화 (nextReview = 오늘)
        const card = await this.createDefaultCardFromPath(noteId, entry.path);
        this.cache.set(noteId, card);
      }
    }
  }

  /**
   * Frontmatter 기반 캐시 초기화 (VE 없을 때 폴백)
   */
  private async initializeCacheFromFrontmatter(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      const content = await this.fileUtils.readFile(file.path);
      if (content === null) continue;

      const srsData = this.parseFrontmatter(content);
      if (!srsData) continue;

      const card = this.toReviewCard(file, srsData);
      this.cache.set(card.noteId, card);
    }
  }

  /**
   * 기본 SM2 상태의 새 카드 생성 (TFile 사용)
   */
  private createDefaultCard(noteId: string, file: TFile): ReviewCard {
    const now = new Date();

    const sm2State: SM2State = {
      repetition: 0,
      interval: 0,
      easeFactor: 2.5,
      nextReview: now, // 오늘이 첫 복습일
    };

    return {
      noteId,
      notePath: file.path,
      noteTitle: file.basename,
      sm2State,
      retentionLevel: 'novice',
      reviewHistory: [],
      tags: [],
      createdAt: new Date(file.stat.ctime),
      lastModified: new Date(file.stat.mtime),
    };
  }

  /**
   * 기본 SM2 상태의 새 카드 생성 (경로 사용 - Cross-platform)
   * ⚠️ adapter.stat 사용으로 iOS/Git sync 대응
   */
  private async createDefaultCardFromPath(noteId: string, path: string): Promise<ReviewCard> {
    const normalizedPath = normalizePath(path);
    const now = new Date();

    const sm2State: SM2State = {
      repetition: 0,
      interval: 0,
      easeFactor: 2.5,
      nextReview: now,
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
   * SRSFrontmatter를 ReviewCard로 변환 (경로 사용 - Cross-platform)
   */
  private async toReviewCardFromPath(path: string, srs: SRSFrontmatter): Promise<ReviewCard> {
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

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * 프론트매터에서 SRS 데이터 파싱
   */
  private parseFrontmatter(content: string): SRSFrontmatter | null {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;

    const fmContent = fmMatch[1];

    // srs 섹션 찾기
    const srsMatch = fmContent.match(/^srs:\s*\n((?:  .+\n?)*)/m);
    if (!srsMatch) return null;

    try {
      const srsLines = srsMatch[1];

      // 간단한 YAML 파싱
      const noteId = this.extractValue(srsLines, 'noteId');
      const repetition = parseInt(this.extractValue(srsLines, 'repetition') || '0', 10);
      const interval = parseInt(this.extractValue(srsLines, 'interval') || '0', 10);
      const easeFactor = parseFloat(this.extractValue(srsLines, 'easeFactor') || '2.5');
      const nextReview = this.extractValue(srsLines, 'nextReview');
      const retentionLevel = this.extractValue(srsLines, 'retentionLevel') as RetentionLevel;

      if (!noteId || !nextReview) return null;

      // 복습 히스토리 파싱
      const reviewHistory = this.parseReviewHistory(srsLines);

      return {
        noteId,
        repetition,
        interval,
        easeFactor,
        nextReview,
        retentionLevel: retentionLevel || 'novice',
        reviewHistory,
      };
    } catch (error) {
      console.error('[SRS] Failed to parse frontmatter:', error);
      return null;
    }
  }

  /**
   * YAML 값 추출
   */
  private extractValue(content: string, key: string): string {
    const match = content.match(new RegExp(`^\\s*${key}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
    return match ? match[1].trim() : '';
  }

  /**
   * 복습 히스토리 파싱
   */
  private parseReviewHistory(content: string): SRSReviewHistory[] {
    const histories: SRSReviewHistory[] = [];
    const historyMatch = content.match(/reviewHistory:\s*\n((?:\s*-.+\n?)*)/);

    if (!historyMatch) return histories;

    const items = historyMatch[1].match(/-\s*\n(?:\s+.+\n?)*/g);
    if (!items) return histories;

    for (const item of items) {
      const date = this.extractValue(item, 'date');
      const quality = parseInt(this.extractValue(item, 'quality') || '0', 10);
      const mode = this.extractValue(item, 'mode');
      const quizScore = this.extractValue(item, 'quizScore');

      if (date && mode) {
        histories.push({
          date,
          quality,
          mode,
          quizScore: quizScore ? parseInt(quizScore, 10) : undefined,
        });
      }
    }

    return histories;
  }

  /**
   * SRSFrontmatter를 ReviewCard로 변환
   */
  private toReviewCard(file: TFile, srs: SRSFrontmatter): ReviewCard {
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

    return {
      noteId: srs.noteId,
      notePath: file.path,
      noteTitle: file.basename,
      sm2State,
      retentionLevel: srs.retentionLevel,
      reviewHistory,
      tags: [],
      createdAt: new Date(file.stat.ctime),
      lastModified: new Date(file.stat.mtime),
    };
  }

  /**
   * 프론트매터 업데이트
   */
  private updateFrontmatter(content: string, card: ReviewCard): string {
    const srsYaml = this.buildSRSYaml(card);

    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (!fmMatch) {
      // 프론트매터가 없는 경우 생성
      return `---\n${srsYaml}---\n\n${content}`;
    }

    const existingFm = fmMatch[1];

    // 기존 srs 섹션 제거
    const cleanedFm = existingFm.replace(/^srs:\s*\n(?:  .+\n?)*/m, '').trim();

    // 새 srs 섹션 추가
    const newFm = cleanedFm ? `${cleanedFm}\n${srsYaml}` : srsYaml;

    return content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFm}---`);
  }

  /**
   * SRS YAML 생성
   */
  private buildSRSYaml(card: ReviewCard): string {
    const lines = [
      'srs:',
      `  noteId: "${card.noteId}"`,
      `  repetition: ${card.sm2State.repetition}`,
      `  interval: ${card.sm2State.interval}`,
      `  easeFactor: ${card.sm2State.easeFactor.toFixed(2)}`,
      `  nextReview: "${this.formatDate(card.sm2State.nextReview)}"`,
      `  retentionLevel: "${card.retentionLevel}"`,
    ];

    if (card.reviewHistory.length > 0) {
      lines.push('  reviewHistory:');
      // 최근 20개만 저장
      const recentHistory = card.reviewHistory.slice(-20);
      for (const h of recentHistory) {
        lines.push('    -');
        lines.push(`      date: "${this.formatDate(h.reviewedAt)}"`);
        lines.push(`      quality: ${h.quality}`);
        lines.push(`      mode: "${h.mode}"`);
        if (h.quizScore !== undefined) {
          lines.push(`      quizScore: ${h.quizScore}`);
        }
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * 프론트매터에서 SRS 제거
   */
  private removeSRSFromFrontmatter(content: string): string {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return content;

    const existingFm = fmMatch[1];
    const cleanedFm = existingFm.replace(/^srs:\s*\n(?:  .+\n?)*/m, '').trim();

    if (!cleanedFm) {
      // 프론트매터가 비면 제거
      return content.replace(/^---\n[\s\S]*?\n---\n*/, '');
    }

    return content.replace(/^---\n[\s\S]*?\n---/, `---\n${cleanedFm}\n---`);
  }

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
