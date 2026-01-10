/**
 * VaultEmbeddingsReader
 * Vault Embeddings 플러그인의 임베딩 데이터 읽기
 *
 * ⚠️ CRITICAL:
 * - generateNoteId() 사용 필수
 * - safeId 변환 (파일명 저장 시)
 * - Cross-platform 이중 접근 패턴
 */

import { normalizePath, Vault } from 'obsidian';
import type {
  IEmbeddingReader,
  NoteEmbedding,
  EmbeddingIndex,
} from '../../core/domain/interfaces/embedding-reader.interface';
import {
  EMBEDDING_FOLDER,
  INDEX_FILE,
  EMBEDDINGS_SUBFOLDER,
  BATCH_SIZE,
  CACHE_TTL_MS,
} from '../../core/domain/constants/embedding-constants';
import { toSafeId } from '../../core/domain/utils/note-id';

export class VaultEmbeddingsReader implements IEmbeddingReader {
  private cachedIndex: EmbeddingIndex | null = null;
  private indexCacheTime: number = 0;
  private embeddingsCache: Map<string, NoteEmbedding> = new Map();

  constructor(private vault: Vault) {}

  /**
   * Vault Embeddings 플러그인 사용 가능 여부
   */
  async isAvailable(): Promise<boolean> {
    const indexPath = normalizePath(`${EMBEDDING_FOLDER}/${INDEX_FILE}`);

    try {
      // Cross-platform: adapter 직접 사용
      return await this.vault.adapter.exists(indexPath);
    } catch {
      return false;
    }
  }

  /**
   * 임베딩 인덱스 읽기
   */
  async readIndex(): Promise<EmbeddingIndex | null> {
    // 캐시 유효성 확인
    const now = Date.now();
    if (this.cachedIndex && now - this.indexCacheTime < CACHE_TTL_MS) {
      return this.cachedIndex;
    }

    const indexPath = normalizePath(`${EMBEDDING_FOLDER}/${INDEX_FILE}`);

    try {
      // 1차: Obsidian 인덱스 확인 (데스크톱)
      const file = this.vault.getAbstractFileByPath(indexPath);

      // 2차: adapter 폴백 (iOS/Android/Git sync)
      if (!file) {
        const exists = await this.vault.adapter.exists(indexPath);
        if (!exists) return null;
      }

      // adapter.read()는 항상 동작
      const content = await this.vault.adapter.read(indexPath);
      this.cachedIndex = JSON.parse(content);
      this.indexCacheTime = now;

      return this.cachedIndex;
    } catch (error) {
      console.error('[SRS] Failed to read embedding index:', error);
      return null;
    }
  }

  /**
   * 특정 노트의 임베딩 읽기
   */
  async readEmbedding(noteId: string): Promise<NoteEmbedding | null> {
    // 캐시 확인
    const cached = this.embeddingsCache.get(noteId);
    if (cached) return cached;

    // ⚠️ safeId 변환 - 파일명에 안전한 문자만 사용
    const safeId = toSafeId(noteId);
    const embeddingPath = normalizePath(
      `${EMBEDDING_FOLDER}/${EMBEDDINGS_SUBFOLDER}/${safeId}.json`
    );

    try {
      // Cross-platform: adapter 직접 사용
      const exists = await this.vault.adapter.exists(embeddingPath);
      if (!exists) return null;

      const content = await this.vault.adapter.read(embeddingPath);
      const embedding: NoteEmbedding = JSON.parse(content);

      // 캐시 저장
      this.embeddingsCache.set(noteId, embedding);

      return embedding;
    } catch (error) {
      console.error(`[SRS] Failed to read embedding for ${noteId}:`, error);
      return null;
    }
  }

  /**
   * 전체 임베딩 읽기 (배치 처리)
   */
  async readAllEmbeddings(): Promise<Map<string, NoteEmbedding>> {
    const index = await this.readIndex();
    if (!index) return new Map();

    const noteIds = Object.keys(index.notes);

    // 배치 단위로 읽기 (BATCH_SIZE = 50)
    for (let i = 0; i < noteIds.length; i += BATCH_SIZE) {
      const batch = noteIds.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((id) => this.readEmbedding(id)));
    }

    return this.embeddingsCache;
  }

  /**
   * 특정 노트 ID 목록의 임베딩만 읽기 (배치)
   */
  async readEmbeddingsBatch(noteIds: string[]): Promise<Map<string, NoteEmbedding>> {
    const result = new Map<string, NoteEmbedding>();

    // 배치 단위로 읽기
    for (let i = 0; i < noteIds.length; i += BATCH_SIZE) {
      const batch = noteIds.slice(i, i + BATCH_SIZE);
      const embeddings = await Promise.all(
        batch.map((id) => this.readEmbedding(id))
      );

      batch.forEach((id, idx) => {
        const embedding = embeddings[idx];
        if (embedding) {
          result.set(id, embedding);
        }
      });
    }

    return result;
  }

  /**
   * 캐시 초기화
   */
  clearCache(): void {
    this.cachedIndex = null;
    this.indexCacheTime = 0;
    this.embeddingsCache.clear();
  }
}
