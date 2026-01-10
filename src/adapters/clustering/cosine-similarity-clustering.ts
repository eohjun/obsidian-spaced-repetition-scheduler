/**
 * CosineSimilarityClusteringService
 * 코사인 유사도 기반 노트 클러스터링
 */

import type {
  IClusteringService,
  NoteWithVector,
  ClusteringOptions,
  SimilarNote,
} from '../../core/application/services/clustering-service.interface';
import type { NoteGroup, GroupingResult, GroupingMetadata } from '../../core/domain/entities/note-group';
import { createNoteGroup, calculateGroupCohesion } from '../../core/domain/entities/note-group';

export class CosineSimilarityClusteringService implements IClusteringService {
  /**
   * 노트 벡터를 기반으로 클러스터링 수행
   */
  async cluster(
    notes: NoteWithVector[],
    options: ClusteringOptions
  ): Promise<GroupingResult> {
    const { threshold, maxGroupSize } = options;

    if (notes.length < 2) {
      return this.createEmptyResult(notes.map((n) => n.noteId));
    }

    // 유사도 행렬 계산
    const similarityMatrix = this.buildSimilarityMatrix(notes);

    // 계층적 클러스터링 (단일 연결법)
    const groups = this.hierarchicalClustering(
      notes,
      similarityMatrix,
      threshold,
      maxGroupSize
    );

    // 그룹에 포함되지 않은 노트
    const groupedNoteIds = new Set(groups.flatMap((g) => g.noteIds));
    const ungroupedNotes = notes
      .filter((n) => !groupedNoteIds.has(n.noteId))
      .map((n) => n.noteId);

    // 메타데이터 생성
    const metadata = this.createMetadata(notes, groups, threshold);

    return {
      groups,
      ungroupedNotes,
      metadata,
    };
  }

  /**
   * 두 벡터 간 코사인 유사도 계산
   */
  cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 가장 유사한 노트 N개 조회
   */
  findMostSimilar(
    targetVector: number[],
    candidates: NoteWithVector[],
    topK: number
  ): SimilarNote[] {
    const similarities: SimilarNote[] = candidates.map((note) => ({
      noteId: note.noteId,
      similarity: this.cosineSimilarity(targetVector, note.vector),
    }));

    // 유사도 높은 순 정렬 후 상위 K개 반환
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * 유사도 행렬 생성
   */
  private buildSimilarityMatrix(notes: NoteWithVector[]): number[][] {
    const n = notes.length;
    const matrix: number[][] = Array.from({ length: n }, () =>
      Array(n).fill(0)
    );

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const similarity = this.cosineSimilarity(
          notes[i].vector,
          notes[j].vector
        );
        matrix[i][j] = similarity;
        matrix[j][i] = similarity;
      }
      matrix[i][i] = 1; // 자기 자신과의 유사도
    }

    return matrix;
  }

  /**
   * 계층적 클러스터링 (단일 연결법)
   */
  private hierarchicalClustering(
    notes: NoteWithVector[],
    similarityMatrix: number[][],
    threshold: number,
    maxGroupSize: number
  ): NoteGroup[] {
    const n = notes.length;
    const clusters: Set<number>[] = notes.map((_, i) => new Set([i]));
    const active = new Set(Array.from({ length: n }, (_, i) => i));

    while (active.size > 1) {
      // 가장 유사한 클러스터 쌍 찾기
      let maxSim = -1;
      let mergeI = -1;
      let mergeJ = -1;

      const activeArray = Array.from(active);
      for (let i = 0; i < activeArray.length; i++) {
        for (let j = i + 1; j < activeArray.length; j++) {
          const ci = activeArray[i];
          const cj = activeArray[j];

          // 병합 시 크기 초과 확인
          if (clusters[ci].size + clusters[cj].size > maxGroupSize) continue;

          // 단일 연결: 클러스터 간 최대 유사도
          const sim = this.maxLinkSimilarity(
            clusters[ci],
            clusters[cj],
            similarityMatrix
          );

          if (sim > maxSim) {
            maxSim = sim;
            mergeI = ci;
            mergeJ = cj;
          }
        }
      }

      // 임계값 이하면 중단
      if (maxSim < threshold || mergeI === -1) break;

      // 클러스터 병합
      clusters[mergeJ].forEach((idx) => clusters[mergeI].add(idx));
      active.delete(mergeJ);
    }

    // 결과 그룹 생성 (크기 2 이상만)
    const groups: NoteGroup[] = [];

    for (const clusterIdx of active) {
      const cluster = clusters[clusterIdx];
      if (cluster.size < 2) continue;

      const noteIds = Array.from(cluster).map((i) => notes[i].noteId);
      const vectors = Array.from(cluster).map((i) => notes[i].vector);
      const centroid = this.calculateCentroid(vectors);

      // 응집도 계산
      const similarities: number[] = [];
      const clusterArray = Array.from(cluster);
      for (let i = 0; i < clusterArray.length; i++) {
        for (let j = i + 1; j < clusterArray.length; j++) {
          similarities.push(similarityMatrix[clusterArray[i]][clusterArray[j]]);
        }
      }
      const cohesion = calculateGroupCohesion(similarities);

      const group = createNoteGroup(noteIds, centroid);
      group.cohesion = cohesion;

      groups.push(group);
    }

    return groups;
  }

  /**
   * 단일 연결 유사도 (클러스터 간 최대 유사도)
   */
  private maxLinkSimilarity(
    clusterA: Set<number>,
    clusterB: Set<number>,
    matrix: number[][]
  ): number {
    let maxSim = -1;

    for (const i of clusterA) {
      for (const j of clusterB) {
        if (matrix[i][j] > maxSim) {
          maxSim = matrix[i][j];
        }
      }
    }

    return maxSim;
  }

  /**
   * 중심 벡터 계산
   */
  private calculateCentroid(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];

    const dim = vectors[0].length;
    const centroid = Array(dim).fill(0);

    for (const vec of vectors) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += vec[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= vectors.length;
    }

    return centroid;
  }

  /**
   * 빈 결과 생성
   */
  private createEmptyResult(noteIds: string[]): GroupingResult {
    return {
      groups: [],
      ungroupedNotes: noteIds,
      metadata: {
        algorithm: 'hierarchical',
        threshold: 0,
        totalNotes: noteIds.length,
        groupedNotes: 0,
        averageCohesion: 0,
        processedAt: new Date(),
      },
    };
  }

  /**
   * 메타데이터 생성
   */
  private createMetadata(
    notes: NoteWithVector[],
    groups: NoteGroup[],
    threshold: number
  ): GroupingMetadata {
    const groupedNotes = groups.reduce((sum, g) => sum + g.noteIds.length, 0);
    const averageCohesion =
      groups.length > 0
        ? groups.reduce((sum, g) => sum + g.cohesion, 0) / groups.length
        : 0;

    return {
      algorithm: 'hierarchical',
      threshold,
      totalNotes: notes.length,
      groupedNotes,
      averageCohesion,
      processedAt: new Date(),
    };
  }
}
