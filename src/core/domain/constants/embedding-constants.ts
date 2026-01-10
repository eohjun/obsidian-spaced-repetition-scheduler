/**
 * Embedding Constants
 * Vault Embeddings 연동 및 배치 처리 관련 상수
 */

// Vault Embeddings 저장소 구조
export const EMBEDDING_FOLDER = '09_Embedded';
export const INDEX_FILE = 'index.json';
export const EMBEDDINGS_SUBFOLDER = 'embeddings';

// 배치 처리 설정
export const BATCH_SIZE = 50;                         // 한 번에 읽을 임베딩 수
export const CACHE_TTL_MS = 60 * 1000;                // 캐시 유효 시간 (1분)

// 유사도 설정
export const VECTOR_SIMILARITY_THRESHOLD = 0.3;       // 최소 코사인 유사도
export const GROUP_COHESION_THRESHOLD = 0.5;          // 그룹 응집도 임계값
export const MAX_GROUP_SIZE = 10;                     // 그룹 최대 노트 수

// 임베딩 모델 기본값
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DEFAULT_DIMENSIONS = 1536;

// 경로 헬퍼
export function getIndexPath(): string {
  return `${EMBEDDING_FOLDER}/${INDEX_FILE}`;
}

export function getEmbeddingPath(safeId: string): string {
  return `${EMBEDDING_FOLDER}/${EMBEDDINGS_SUBFOLDER}/${safeId}.json`;
}
