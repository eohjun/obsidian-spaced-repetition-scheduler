/**
 * ClusterAdapter
 * NoteGroup (VE 클러스터링 결과)를 NoteCluster (세션 관리용)로 변환
 *
 * 역할:
 * 1. NoteGroup → NoteCluster 변환
 * 2. Due 카드 수 계산
 * 3. 클러스터 필터링 (최소 크기, due 있는 클러스터만)
 */

import type { NoteGroup } from '../../domain/entities/note-group';
import type { NoteCluster } from '../../domain/entities/focus-session';
import type { ReviewCard } from '../../domain/entities/review-card';

export interface ClusterAdapterConfig {
  minClusterSize: number; // 최소 클러스터 크기 (기본 3)
}

const DEFAULT_CONFIG: ClusterAdapterConfig = {
  minClusterSize: 3,
};

/**
 * NoteGroup을 NoteCluster로 변환
 *
 * @param groups NoteGroup 배열 (클러스터링 서비스 결과)
 * @param dueCards 오늘 복습 예정 카드들
 * @param config 어댑터 설정
 * @returns NoteCluster 배열
 */
export function convertToNoteClusters(
  groups: NoteGroup[],
  dueCards: ReviewCard[],
  config: Partial<ClusterAdapterConfig> = {}
): NoteCluster[] {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const dueNoteIds = new Set(dueCards.map((c) => c.noteId));

  return groups
    .map((group) => {
      const dueCount = group.noteIds.filter((id) => dueNoteIds.has(id)).length;

      const cluster: NoteCluster = {
        id: group.id,
        label: group.name,
        noteIds: group.noteIds,
        centroid: group.centroid,
        dueCount,
        totalCount: group.noteIds.length,
      };

      return cluster;
    })
    .filter(
      (cluster) =>
        // 최소 크기 이상인 클러스터만
        cluster.totalCount >= mergedConfig.minClusterSize
    );
}

/**
 * Due 카드가 있는 클러스터만 필터링
 */
export function filterClustersWithDueCards(clusters: NoteCluster[]): NoteCluster[] {
  return clusters.filter((cluster) => cluster.dueCount > 0);
}

/**
 * 클러스터 우선순위 정렬
 * - dueCount 높은 순
 * - 같으면 totalCount 높은 순
 */
export function sortClustersByPriority(clusters: NoteCluster[]): NoteCluster[] {
  return [...clusters].sort((a, b) => {
    if (a.dueCount !== b.dueCount) {
      return b.dueCount - a.dueCount;
    }
    return b.totalCount - a.totalCount;
  });
}

/**
 * 특정 노트가 속한 클러스터 찾기
 */
export function findClusterForNote(
  noteId: string,
  clusters: NoteCluster[]
): NoteCluster | undefined {
  return clusters.find((cluster) => cluster.noteIds.includes(noteId));
}

/**
 * 클러스터 통계 계산
 */
export interface ClusterStats {
  totalClusters: number;
  clustersWithDue: number;
  totalNotes: number;
  totalDueNotes: number;
  averageClusterSize: number;
}

export function calculateClusterStats(clusters: NoteCluster[]): ClusterStats {
  if (clusters.length === 0) {
    return {
      totalClusters: 0,
      clustersWithDue: 0,
      totalNotes: 0,
      totalDueNotes: 0,
      averageClusterSize: 0,
    };
  }

  const totalNotes = clusters.reduce((sum, c) => sum + c.totalCount, 0);
  const totalDueNotes = clusters.reduce((sum, c) => sum + c.dueCount, 0);
  const clustersWithDue = clusters.filter((c) => c.dueCount > 0).length;

  return {
    totalClusters: clusters.length,
    clustersWithDue,
    totalNotes,
    totalDueNotes,
    averageClusterSize: totalNotes / clusters.length,
  };
}
