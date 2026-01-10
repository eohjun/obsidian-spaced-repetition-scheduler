/**
 * NoteGroup Entity
 * 임베딩 기반 유사 노트 그룹
 */

export interface NoteGroup {
  id: string;
  name: string;                  // 추론된 주제명
  noteIds: string[];             // 그룹에 속한 노트 ID 목록
  centroid: number[];            // 그룹 중심 벡터
  cohesion: number;              // 그룹 응집도 (0-1)
  createdAt: Date;
}

export interface GroupingResult {
  groups: NoteGroup[];
  ungroupedNotes: string[];      // 그룹에 속하지 않은 노트
  metadata: GroupingMetadata;
}

export interface GroupingMetadata {
  algorithm: string;             // 사용된 클러스터링 알고리즘
  threshold: number;             // 유사도 임계값
  totalNotes: number;
  groupedNotes: number;
  averageCohesion: number;
  processedAt: Date;
}

/**
 * 그룹 생성 헬퍼
 */
export function createNoteGroup(
  noteIds: string[],
  centroid: number[],
  name?: string
): NoteGroup {
  return {
    id: crypto.randomUUID(),
    name: name ?? `Group ${noteIds.length} notes`,
    noteIds,
    centroid,
    cohesion: 0,
    createdAt: new Date(),
  };
}

/**
 * 그룹 응집도 계산 (평균 유사도)
 */
export function calculateGroupCohesion(
  similarities: number[]
): number {
  if (similarities.length === 0) return 0;
  const sum = similarities.reduce((a, b) => a + b, 0);
  return sum / similarities.length;
}
