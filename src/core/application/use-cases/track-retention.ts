/**
 * TrackRetentionUseCase
 * 정착도 추적 및 리포트 생성
 */

import type { IReviewRepository, ReviewStatistics } from '../../domain/interfaces/review-repository.interface';
import type { RetentionLevel } from '../../domain/entities/review-card';

export interface TrackRetentionOutput {
  statistics: ReviewStatistics;
  report: RetentionReport;
  recommendations: string[];
}

export interface RetentionReport {
  distribution: RetentionDistribution;
  trend: RetentionTrend;
  healthScore: number;           // 0-100
  lastUpdated: Date;
}

export interface RetentionDistribution {
  byLevel: Record<RetentionLevel, number>;
  percentages: Record<RetentionLevel, number>;
}

export interface RetentionTrend {
  direction: 'improving' | 'stable' | 'declining';
  changePercent: number;
  period: string;                // "last 7 days", "last 30 days"
}

export class TrackRetentionUseCase {
  constructor(
    private repository: IReviewRepository
  ) {}

  async execute(): Promise<TrackRetentionOutput> {
    const statistics = await this.repository.getStatistics();

    // 분포 계산
    const distribution = this.calculateDistribution(statistics);

    // 트렌드 분석 (간소화된 버전)
    const trend = this.analyzeTrend(statistics);

    // 건강 점수 계산
    const healthScore = this.calculateHealthScore(statistics, distribution);

    // 보고서 생성
    const report: RetentionReport = {
      distribution,
      trend,
      healthScore,
      lastUpdated: new Date(),
    };

    // 추천 액션 생성
    const recommendations = this.generateRecommendations(statistics, distribution, trend);

    return {
      statistics,
      report,
      recommendations,
    };
  }

  private calculateDistribution(stats: ReviewStatistics): RetentionDistribution {
    const total = stats.totalCards || 1; // 0으로 나누기 방지

    const percentages: Record<RetentionLevel, number> = {
      novice: Math.round((stats.byRetentionLevel.novice / total) * 100),
      learning: Math.round((stats.byRetentionLevel.learning / total) * 100),
      intermediate: Math.round((stats.byRetentionLevel.intermediate / total) * 100),
      advanced: Math.round((stats.byRetentionLevel.advanced / total) * 100),
      mastered: Math.round((stats.byRetentionLevel.mastered / total) * 100),
    };

    return {
      byLevel: stats.byRetentionLevel,
      percentages,
    };
  }

  private analyzeTrend(stats: ReviewStatistics): RetentionTrend {
    // 간소화된 트렌드 분석
    // 실제 구현에서는 과거 데이터와 비교 필요
    const avgQuality = stats.averageQuality || 3;

    if (avgQuality >= 4) {
      return { direction: 'improving', changePercent: 5, period: 'last 7 days' };
    } else if (avgQuality >= 3) {
      return { direction: 'stable', changePercent: 0, period: 'last 7 days' };
    } else {
      return { direction: 'declining', changePercent: -5, period: 'last 7 days' };
    }
  }

  private calculateHealthScore(
    stats: ReviewStatistics,
    distribution: RetentionDistribution
  ): number {
    let score = 50; // 기본 점수

    // 정착도 분포 기반 점수
    score += distribution.percentages.mastered * 0.5;
    score += distribution.percentages.advanced * 0.3;
    score += distribution.percentages.intermediate * 0.1;
    score -= distribution.percentages.novice * 0.2;

    // 연속 복습 보너스
    score += Math.min(stats.streak, 10);

    // 평균 품질 점수
    const avgQuality = stats.averageQuality || 3;
    score += (avgQuality - 3) * 5;

    // 범위 제한 (0-100)
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private generateRecommendations(
    stats: ReviewStatistics,
    distribution: RetentionDistribution,
    trend: RetentionTrend
  ): string[] {
    const recommendations: string[] = [];

    // 오늘 복습 필요
    if (stats.reviewsToday === 0 && stats.totalCards > 0) {
      recommendations.push('오늘 복습을 시작해보세요! 꾸준한 복습이 기억력 향상에 도움됩니다.');
    }

    // 초보 수준 노트가 많을 때
    if (distribution.percentages.novice > 30) {
      recommendations.push('새로운 노트가 많습니다. 초기 복습을 더 자주 해보세요.');
    }

    // 마스터 수준이 적을 때
    if (distribution.percentages.mastered < 10 && stats.totalCards > 20) {
      recommendations.push('마스터 수준의 노트가 적습니다. 일관된 복습 습관을 유지해보세요.');
    }

    // 트렌드가 하락 중일 때
    if (trend.direction === 'declining') {
      recommendations.push('최근 복습 품질이 하락했습니다. 복습 빈도를 늘려보세요.');
    }

    // 연속 복습 격려
    if (stats.streak >= 7) {
      recommendations.push(`${stats.streak}일 연속 복습 중! 훌륭한 습관입니다.`);
    }

    return recommendations;
  }
}
