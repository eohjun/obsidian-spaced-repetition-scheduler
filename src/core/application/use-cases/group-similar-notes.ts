/**
 * GroupSimilarNotesUseCase
 * 임베딩 기반 유사 노트 그룹핑
 */

import type { IEmbeddingReader } from '../../domain/interfaces/embedding-reader.interface';
import type { IClusteringService } from '../services/clustering-service.interface';
import type { NoteGroup, GroupingResult } from '../../domain/entities/note-group';
import { VECTOR_SIMILARITY_THRESHOLD } from '../../domain/constants/embedding-constants';

export interface GroupSimilarNotesInput {
  noteIds: string[];              // 그룹핑할 노트 ID 목록
  threshold?: number;             // 유사도 임계값 (기본: 0.3)
  maxGroupSize?: number;          // 그룹 최대 크기
  inferTopicNames?: boolean;      // 주제명 추론 여부
}

export interface GroupSimilarNotesOutput {
  groups: NoteGroup[];
  ungroupedNotes: string[];
  summary: GroupingSummary;
}

export interface GroupingSummary {
  totalNotes: number;
  groupedNotes: number;
  numberOfGroups: number;
  averageGroupSize: number;
  averageCohesion: number;
}

export class GroupSimilarNotesUseCase {
  constructor(
    private embeddingReader: IEmbeddingReader,
    private clusteringService: IClusteringService
  ) {}

  async execute(input: GroupSimilarNotesInput): Promise<GroupSimilarNotesOutput> {
    const {
      noteIds,
      threshold = VECTOR_SIMILARITY_THRESHOLD,
      maxGroupSize = 10,
      inferTopicNames = false,
    } = input;

    // 임베딩 사용 가능 여부 확인
    const isAvailable = await this.embeddingReader.isAvailable();
    if (!isAvailable) {
      return {
        groups: [],
        ungroupedNotes: noteIds,
        summary: this.createEmptySummary(noteIds.length),
      };
    }

    // 임베딩 로드
    const embeddings = await this.embeddingReader.readEmbeddingsBatch(noteIds);

    // 임베딩이 있는 노트만 필터링
    const notesWithEmbeddings: { noteId: string; vector: number[] }[] = [];
    const notesWithoutEmbeddings: string[] = [];

    for (const noteId of noteIds) {
      const embedding = embeddings.get(noteId);
      if (embedding) {
        notesWithEmbeddings.push({ noteId, vector: embedding.vector });
      } else {
        notesWithoutEmbeddings.push(noteId);
      }
    }

    // 그룹핑이 불가능한 경우
    if (notesWithEmbeddings.length < 2) {
      return {
        groups: [],
        ungroupedNotes: noteIds,
        summary: this.createEmptySummary(noteIds.length),
      };
    }

    // 클러스터링 수행
    const result: GroupingResult = await this.clusteringService.cluster(
      notesWithEmbeddings,
      {
        threshold,
        maxGroupSize,
        inferTopicNames,
      }
    );

    // 결과 생성
    const summary = this.createSummary(result, noteIds.length);

    return {
      groups: result.groups,
      ungroupedNotes: [...result.ungroupedNotes, ...notesWithoutEmbeddings],
      summary,
    };
  }

  private createEmptySummary(totalNotes: number): GroupingSummary {
    return {
      totalNotes,
      groupedNotes: 0,
      numberOfGroups: 0,
      averageGroupSize: 0,
      averageCohesion: 0,
    };
  }

  private createSummary(result: GroupingResult, totalNotes: number): GroupingSummary {
    const groupedNotes = result.groups.reduce((sum, g) => sum + g.noteIds.length, 0);
    const numberOfGroups = result.groups.length;
    const averageGroupSize = numberOfGroups > 0 ? groupedNotes / numberOfGroups : 0;
    const averageCohesion = result.metadata.averageCohesion;

    return {
      totalNotes,
      groupedNotes,
      numberOfGroups,
      averageGroupSize,
      averageCohesion,
    };
  }
}
