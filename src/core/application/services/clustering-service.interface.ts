/**
 * IClusteringService Interface
 * 임베딩 기반 클러스터링 서비스
 * Application Layer에서 정의, Adapters Layer에서 구현
 */

import type { NoteGroup, GroupingResult } from '../../domain/entities/note-group';

export interface IClusteringService {
  /**
   * 노트 벡터를 기반으로 클러스터링 수행
   * @param notes 노트 ID와 벡터 목록
   * @param options 클러스터링 옵션
   */
  cluster(
    notes: NoteWithVector[],
    options: ClusteringOptions
  ): Promise<GroupingResult>;

  /**
   * 두 벡터 간 코사인 유사도 계산
   */
  cosineSimilarity(vectorA: number[], vectorB: number[]): number;

  /**
   * 가장 유사한 노트 N개 조회
   * @param targetVector 대상 벡터
   * @param candidates 후보 노트 목록
   * @param topK 반환할 개수
   */
  findMostSimilar(
    targetVector: number[],
    candidates: NoteWithVector[],
    topK: number
  ): SimilarNote[];
}

export interface NoteWithVector {
  noteId: string;
  vector: number[];
}

export interface ClusteringOptions {
  threshold: number;             // 유사도 임계값
  maxGroupSize: number;          // 그룹 최대 크기
  inferTopicNames?: boolean;     // 주제명 추론 여부
  algorithm?: ClusteringAlgorithm;
}

export type ClusteringAlgorithm = 'hierarchical' | 'kmeans' | 'dbscan';

export interface SimilarNote {
  noteId: string;
  similarity: number;            // 0-1
}

/**
 * 기본 클러스터링 옵션
 */
export const DEFAULT_CLUSTERING_OPTIONS: ClusteringOptions = {
  threshold: 0.3,
  maxGroupSize: 10,
  inferTopicNames: false,
  algorithm: 'hierarchical',
};
