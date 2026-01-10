/**
 * IEmbeddingReader Interface
 * Vault Embeddings 플러그인 데이터 읽기 인터페이스
 */

export interface IEmbeddingReader {
  /**
   * 특정 노트의 임베딩 벡터 읽기
   * @param noteId hash 기반 노트 ID
   * @returns 임베딩 벡터 또는 null
   */
  readEmbedding(noteId: string): Promise<NoteEmbedding | null>;

  /**
   * 전체 임베딩 읽기
   * @returns noteId -> 임베딩 맵
   */
  readAllEmbeddings(): Promise<Map<string, NoteEmbedding>>;

  /**
   * 인덱스 읽기
   * @returns 임베딩 인덱스 또는 null
   */
  readIndex(): Promise<EmbeddingIndex | null>;

  /**
   * Vault Embeddings 플러그인 사용 가능 여부
   */
  isAvailable(): Promise<boolean>;

  /**
   * 특정 노트 ID 목록의 임베딩만 읽기 (배치)
   * @param noteIds 읽을 노트 ID 목록
   */
  readEmbeddingsBatch(noteIds: string[]): Promise<Map<string, NoteEmbedding>>;
}

export interface NoteEmbedding {
  noteId: string;
  notePath: string;
  vector: number[];
  model: string;
  dimensions: number;
  generatedAt?: Date;
}

export interface EmbeddingIndex {
  version: string;
  totalNotes: number;
  model: string;
  dimensions: number;
  notes: Record<string, EmbeddingIndexEntry>;
  lastUpdated: Date;
}

export interface EmbeddingIndexEntry {
  path: string;
  contentHash: string;
  embeddedAt: string;
}
