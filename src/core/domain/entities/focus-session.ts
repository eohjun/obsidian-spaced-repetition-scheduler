/**
 * FocusSession
 * 포커스 세션 엔티티 - 클러스터 기반 집중 복습 세션
 *
 * 동작 방식:
 * 1. 클러스터링으로 관련 노트 그룹 생성
 * 2. 하나의 클러스터를 포커스 세션으로 선택
 * 3. 해당 클러스터의 노트를 모두 복습할 때까지 유지
 * 4. 완료 후 다음 클러스터로 자동 전환
 */

export interface FocusSession {
  /** 세션 ID */
  id: string;

  /** 현재 포커스 클러스터 ID */
  clusterId: string;

  /** 클러스터 라벨 (대표 키워드/폴더명) */
  clusterLabel: string;

  /** 클러스터 내 전체 노트 ID 목록 */
  noteIds: string[];

  /** 아직 복습하지 않은 노트 ID 목록 */
  remainingNoteIds: string[];

  /** 오늘 복습한 노트 ID 목록 */
  reviewedTodayIds: string[];

  /** 세션 시작 일자 */
  startedAt: Date;

  /** 마지막 활동 일자 */
  lastActiveAt: Date;

  /** 세션 상태 */
  status: FocusSessionStatus;
}

export type FocusSessionStatus = 'active' | 'completed' | 'paused';

/**
 * 클러스터 정보
 */
export interface NoteCluster {
  /** 클러스터 ID */
  id: string;

  /** 클러스터 라벨 (대표 키워드 또는 폴더명) */
  label: string;

  /** 클러스터에 속한 노트 ID 목록 */
  noteIds: string[];

  /** 클러스터 중심점 (임베딩 평균) */
  centroid?: number[];

  /** 클러스터 내 due 노트 수 */
  dueCount: number;

  /** 클러스터 총 노트 수 */
  totalCount: number;
}

/**
 * 오늘의 복습 큐
 */
export interface DailyReviewQueue {
  /** 오늘 날짜 (YYYY-MM-DD) */
  date: string;

  /** 현재 포커스 세션 */
  focusSession: FocusSession | null;

  /** 오늘 복습 완료한 총 노트 수 */
  reviewedCount: number;

  /** 오늘 복습할 총 한도 */
  dailyLimit: number;

  /** 오늘 도입된 신규 노트 수 */
  newCardsIntroduced: number;

  /** 오늘 도입 가능한 신규 노트 한도 */
  newCardsLimit: number;
}

/**
 * 세션 영속화를 위한 데이터
 */
export interface PersistedSessionData {
  /** 현재 포커스 세션 */
  currentSession: FocusSession | null;

  /** 마지막 활동 날짜 */
  lastActiveDate: string;

  /** 오늘 복습한 노트 ID 목록 */
  reviewedTodayIds: string[];

  /** 오늘 도입된 신규 노트 ID 목록 */
  newCardsIntroducedIds: string[];

  /** 클러스터별 마지막 복습 일자 */
  clusterLastReviewed: Record<string, string>;
}

/**
 * 기본 영속화 데이터
 */
export const DEFAULT_PERSISTED_SESSION: PersistedSessionData = {
  currentSession: null,
  lastActiveDate: '',
  reviewedTodayIds: [],
  newCardsIntroducedIds: [],
  clusterLastReviewed: {},
};
