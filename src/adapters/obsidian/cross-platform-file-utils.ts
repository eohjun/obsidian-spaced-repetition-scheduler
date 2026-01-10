/**
 * CrossPlatformFileUtils
 * iOS/Android/Git 동기화 환경에서 안정적으로 동작하는 파일 유틸리티
 *
 * ⚠️ CRITICAL: 모든 파일 작업에서 이 유틸리티 사용 필수
 *
 * 문제 상황:
 * 1. Git sync 후 Obsidian 인덱스 미갱신 → getAbstractFileByPath() null 반환
 * 2. iOS/Android에서 파일 존재하는데 인덱스에 없음
 *
 * 해결책:
 * 1. getAbstractFileByPath() 먼저 시도 (데스크톱)
 * 2. 실패 시 vault.adapter 폴백 (모바일/Git sync)
 * 3. "already exists" 에러를 성공으로 처리
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';

export class CrossPlatformFileUtils {
  constructor(private app: App) {}

  /**
   * 크로스 플랫폼 파일 읽기
   * 1. Obsidian 인덱스 확인 (데스크톱)
   * 2. adapter 폴백 (iOS/Android/Git sync)
   */
  async readFile(path: string): Promise<string | null> {
    const normalizedPath = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalizedPath);

    if (file instanceof TFile) {
      return await this.app.vault.read(file);
    }

    // adapter 폴백 - Git sync 후 인덱스 미갱신 대응
    try {
      return await this.app.vault.adapter.read(normalizedPath);
    } catch {
      return null;
    }
  }

  /**
   * 크로스 플랫폼 파일 존재 확인
   */
  async fileExists(path: string): Promise<boolean> {
    const normalizedPath = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalizedPath);

    if (file instanceof TFile) return true;

    try {
      return await this.app.vault.adapter.exists(normalizedPath);
    } catch {
      return false;
    }
  }

  /**
   * 크로스 플랫폼 폴더 존재 확인
   */
  async folderExists(path: string): Promise<boolean> {
    const normalizedPath = normalizePath(path);
    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

    if (folder instanceof TFolder) return true;

    try {
      return await this.app.vault.adapter.exists(normalizedPath);
    } catch {
      return false;
    }
  }

  /**
   * 크로스 플랫폼 파일 쓰기
   * "already exists" 에러를 성공으로 처리
   */
  async writeFile(path: string, content: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalizedPath);

    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
      return;
    }

    try {
      await this.app.vault.create(normalizedPath, content);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      // ⚠️ "already exists" → adapter로 직접 쓰기 (Git sync 대응)
      if (msg.toLowerCase().includes('already exists')) {
        await this.app.vault.adapter.write(normalizedPath, content);
        return;
      }
      throw error;
    }
  }

  /**
   * 크로스 플랫폼 폴더 생성
   * "already exists" 에러를 성공으로 처리
   */
  async ensureFolder(path: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);

    if (existing instanceof TFolder) return;
    if (existing instanceof TFile) {
      throw new Error(`Path exists as file: ${normalizedPath}`);
    }

    try {
      await this.app.vault.createFolder(normalizedPath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      // ⚠️ "already exists" → 성공으로 처리 (Git sync 대응)
      if (msg.toLowerCase().includes('already exists')) {
        return; // OK - 폴더는 이미 존재함
      }
      throw error;
    }
  }

  /**
   * 파일 삭제 (존재하지 않아도 에러 없음)
   */
  async deleteFile(path: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalizedPath);

    if (file instanceof TFile) {
      await this.app.vault.delete(file);
      return;
    }

    // adapter로 직접 삭제 시도
    try {
      const exists = await this.app.vault.adapter.exists(normalizedPath);
      if (exists) {
        await this.app.vault.adapter.remove(normalizedPath);
      }
    } catch {
      // 파일이 없으면 무시
    }
  }

  /**
   * TFile 객체 가져오기 (존재하는 경우)
   */
  getFile(path: string): TFile | null {
    const normalizedPath = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalizedPath);
    return file instanceof TFile ? file : null;
  }

  /**
   * TFolder 객체 가져오기 (존재하는 경우)
   */
  getFolder(path: string): TFolder | null {
    const normalizedPath = normalizePath(path);
    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
    return folder instanceof TFolder ? folder : null;
  }
}
