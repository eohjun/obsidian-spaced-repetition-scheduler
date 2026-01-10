/**
 * SRS Migration Service
 * Frontmatter에서 Callout으로 SRS 데이터 마이그레이션
 *
 * 마이그레이션 과정:
 * 1. frontmatter의 srs: 섹션 파싱
 * 2. 콜아웃 형식으로 변환
 * 3. frontmatter에서 srs 제거
 * 4. 노트 끝에 콜아웃 추가
 */

import { App, Notice } from 'obsidian';
import { CrossPlatformFileUtils } from '../obsidian/cross-platform-file-utils';
import type { RetentionLevel } from '../../core/domain/entities/review-card';

// =============================================================================
// Types
// =============================================================================

interface LegacyFrontmatterSRS {
  noteId: string;
  repetition: number;
  interval: number;
  easeFactor: number;
  nextReview: string;
  retentionLevel: RetentionLevel;
  reviewHistory?: LegacyReviewHistory[];
}

interface LegacyReviewHistory {
  date: string;
  quality: number;
  mode: string;
  quizScore?: number;
}

interface MigrationResult {
  totalFiles: number;
  migratedFiles: number;
  skippedFiles: number;
  errors: string[];
}

// =============================================================================
// Migration Service
// =============================================================================

export class SRSMigrationService {
  private fileUtils: CrossPlatformFileUtils;

  constructor(private app: App) {
    this.fileUtils = new CrossPlatformFileUtils(app);
  }

  /**
   * 전체 Vault 마이그레이션 실행
   */
  async migrateAll(): Promise<MigrationResult> {
    const result: MigrationResult = {
      totalFiles: 0,
      migratedFiles: 0,
      skippedFiles: 0,
      errors: [],
    };

    const files = this.app.vault.getMarkdownFiles();
    result.totalFiles = files.length;

    for (const file of files) {
      try {
        const migrated = await this.migrateFile(file.path);
        if (migrated) {
          result.migratedFiles++;
        } else {
          result.skippedFiles++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`${file.path}: ${message}`);
      }
    }

    return result;
  }

  /**
   * 단일 파일 마이그레이션
   * @returns true if migrated, false if skipped (no frontmatter SRS or already migrated)
   */
  async migrateFile(path: string): Promise<boolean> {
    const content = await this.fileUtils.readFile(path);
    if (content === null) return false;

    // 이미 콜아웃이 있으면 스킵
    if (this.hasCalloutSRS(content)) {
      // frontmatter에 srs가 남아 있으면 제거
      if (this.hasFrontmatterSRS(content)) {
        const cleanedContent = this.removeFrontmatterSRS(content);
        await this.fileUtils.writeFile(path, cleanedContent);
        return true;
      }
      return false;
    }

    // frontmatter SRS가 없으면 스킵
    const srsData = this.parseFrontmatterSRS(content);
    if (!srsData) return false;

    // 마이그레이션 실행
    const migratedContent = this.performMigration(content, srsData);
    await this.fileUtils.writeFile(path, migratedContent);

    return true;
  }

  /**
   * 마이그레이션이 필요한 파일 수 확인
   */
  async countFilesToMigrate(): Promise<{ needsMigration: number; alreadyMigrated: number }> {
    const files = this.app.vault.getMarkdownFiles();
    let needsMigration = 0;
    let alreadyMigrated = 0;

    for (const file of files) {
      const content = await this.fileUtils.readFile(file.path);
      if (content === null) continue;

      if (this.hasFrontmatterSRS(content)) {
        needsMigration++;
      } else if (this.hasCalloutSRS(content)) {
        alreadyMigrated++;
      }
    }

    return { needsMigration, alreadyMigrated };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Frontmatter에 SRS 데이터가 있는지 확인
   */
  private hasFrontmatterSRS(content: string): boolean {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return false;
    return /^srs:\s*$/m.test(fmMatch[1]);
  }

  /**
   * 콜아웃에 SRS 데이터가 있는지 확인
   */
  private hasCalloutSRS(content: string): boolean {
    return /^> \[!srs\]/m.test(content);
  }

  /**
   * Frontmatter에서 SRS 데이터 파싱
   */
  private parseFrontmatterSRS(content: string): LegacyFrontmatterSRS | null {
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
      console.error('[SRS Migration] Failed to parse frontmatter:', error);
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
  private parseReviewHistory(content: string): LegacyReviewHistory[] {
    const histories: LegacyReviewHistory[] = [];
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
   * 마이그레이션 실행: frontmatter 제거 + 콜아웃 추가
   */
  private performMigration(content: string, srs: LegacyFrontmatterSRS): string {
    // 1. frontmatter에서 srs 제거
    let result = this.removeFrontmatterSRS(content);

    // 2. 콜아웃 생성 및 추가
    const callout = this.buildCallout(srs);
    result = result.trimEnd() + '\n\n' + callout + '\n';

    return result;
  }

  /**
   * Frontmatter에서 SRS 섹션 제거
   */
  private removeFrontmatterSRS(content: string): string {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return content;

    const existingFm = fmMatch[1];

    // srs 섹션 제거 (히스토리 포함)
    const cleanedFm = existingFm
      .replace(/^srs:\s*\n(?:  (?:.|\n(?=  ))*?)(?=\n[^ \n]|\n?$)/m, '')
      .trim();

    if (!cleanedFm) {
      // 프론트매터가 비면 제거
      return content.replace(/^---\n[\s\S]*?\n---\n*/, '');
    }

    return content.replace(/^---\n[\s\S]*?\n---/, `---\n${cleanedFm}\n---`);
  }

  /**
   * SRS 콜아웃 블록 생성
   */
  private buildCallout(srs: LegacyFrontmatterSRS): string {
    const data = {
      noteId: srs.noteId,
      repetition: srs.repetition,
      interval: srs.interval,
      easeFactor: parseFloat(srs.easeFactor.toFixed(2)),
      nextReview: srs.nextReview,
      retentionLevel: srs.retentionLevel,
      ...(srs.reviewHistory && srs.reviewHistory.length > 0 && {
        reviewHistory: srs.reviewHistory.slice(-20), // 최근 20개만
      }),
    };

    const json = JSON.stringify(data);

    return `> [!srs]- 📊 복습 데이터
> \`\`\`json
> ${json}
> \`\`\``;
  }
}

/**
 * 마이그레이션 실행 헬퍼 함수
 */
export async function runMigration(app: App): Promise<void> {
  const service = new SRSMigrationService(app);

  // 먼저 마이그레이션 필요 여부 확인
  const { needsMigration, alreadyMigrated } = await service.countFilesToMigrate();

  if (needsMigration === 0) {
    new Notice(`마이그레이션 완료됨 (이미 ${alreadyMigrated}개 파일 처리됨)`);
    return;
  }

  new Notice(`마이그레이션 시작: ${needsMigration}개 파일...`);

  const result = await service.migrateAll();

  if (result.errors.length > 0) {
    console.error('[SRS Migration] Errors:', result.errors);
    new Notice(
      `마이그레이션 완료: ${result.migratedFiles}개 성공, ${result.errors.length}개 오류`
    );
  } else {
    new Notice(`마이그레이션 완료: ${result.migratedFiles}개 파일 처리됨`);
  }
}
