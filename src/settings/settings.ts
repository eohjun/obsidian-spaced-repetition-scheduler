/**
 * SRS Plugin Settings
 * 플러그인 설정 타입 및 기본값
 */

import type { QuestionType } from '../core/domain/entities/quiz';
import type { AIProvider } from '../core/application/services/ai-service';

// =============================================================================
// Settings Interface
// =============================================================================

export interface SRSSettings {
  // LLM 설정
  ai: AISettings;

  // 복습 설정
  review: ReviewSettings;

  // 퀴즈 설정
  quiz: QuizSettings;

  // 알림 설정
  notifications: NotificationSettings;

  // 제외 폴더
  excludeFolders: string[];

  // 고급 설정
  advanced: AdvancedSettings;
}

export interface AISettings {
  provider: AIProvider;
  apiKeys: Partial<Record<AIProvider, string>>;
  model: string;
}

export interface ReviewSettings {
  dailyLimit: number;           // 하루 최대 복습 (기본 20)
  newCardsPerDay: number;       // 하루 새 카드 (기본 10)
  groupSimilar: boolean;        // 유사 노트 그룹핑 (기본 true)
  similarityThreshold: number;  // 유사도 임계값 (기본 0.7)
  autoRegister: boolean;        // 새 노트 자동 등록 (기본 false)
}

export interface QuizSettings {
  enabled: boolean;
  questionCount: number;
  types: QuestionType[];
  language: 'en' | 'ko';
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
}

export interface NotificationSettings {
  enabled: boolean;
  reminderTime: string;         // "09:00" 형식
  showBadge: boolean;           // 오늘 복습 수 배지 표시
}

export interface AdvancedSettings {
  debugMode: boolean;
  cacheEmbeddings: boolean;
  maxHistorySize: number;       // 최대 히스토리 저장 수
}

// =============================================================================
// Default Settings
// =============================================================================

export const DEFAULT_SETTINGS: SRSSettings = {
  ai: {
    provider: 'openai',
    apiKeys: {},
    model: 'gpt-4o-mini',
  },

  review: {
    dailyLimit: 20,
    newCardsPerDay: 10,
    groupSimilar: true,
    similarityThreshold: 0.7,
    autoRegister: false,
  },

  quiz: {
    enabled: true,
    questionCount: 5,
    types: ['multiple_choice', 'true_false', 'open_ended'],
    language: 'ko',
    difficulty: 'mixed',
  },

  notifications: {
    enabled: true,
    reminderTime: '09:00',
    showBadge: true,
  },

  excludeFolders: ['templates', 'attachments'],

  advanced: {
    debugMode: false,
    cacheEmbeddings: true,
    maxHistorySize: 20,
  },
};

// =============================================================================
// Provider Models
// =============================================================================

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
}

export const PROVIDER_MODELS: Record<AIProvider, ModelOption[]> = {
  claude: [
    { id: 'claude-sonnet-4-5-20250514', name: 'Claude Sonnet 4.5', description: '고품질 균형' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: '빠른 속도' },
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '빠르고 경제적' },
    { id: 'gpt-4o', name: 'GPT-4o', description: '고품질' },
    { id: 'o3-mini', name: 'O3 Mini', description: 'Reasoning 모델' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: '빠른 속도' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '고품질' },
  ],
  grok: [
    { id: 'grok-2', name: 'Grok 2', description: 'xAI 최신 모델' },
  ],
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * 설정 검증
 */
export function validateSettings(settings: SRSSettings): string[] {
  const errors: string[] = [];

  // 복습 설정 검증
  if (settings.review.dailyLimit < 1 || settings.review.dailyLimit > 100) {
    errors.push('일일 복습 제한은 1-100 사이여야 합니다.');
  }

  if (settings.review.similarityThreshold < 0.5 || settings.review.similarityThreshold > 1) {
    errors.push('유사도 임계값은 0.5-1.0 사이여야 합니다.');
  }

  // 퀴즈 설정 검증
  if (settings.quiz.enabled && settings.quiz.questionCount < 1) {
    errors.push('퀴즈 질문 수는 최소 1개 이상이어야 합니다.');
  }

  // 알림 설정 검증
  if (settings.notifications.enabled) {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(settings.notifications.reminderTime)) {
      errors.push('알림 시간 형식이 올바르지 않습니다 (HH:MM).');
    }
  }

  return errors;
}

/**
 * 설정 마이그레이션 (버전 업그레이드 시)
 */
export function migrateSettings(oldSettings: Partial<SRSSettings>): SRSSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...oldSettings,
    ai: { ...DEFAULT_SETTINGS.ai, ...oldSettings.ai },
    review: { ...DEFAULT_SETTINGS.review, ...oldSettings.review },
    quiz: { ...DEFAULT_SETTINGS.quiz, ...oldSettings.quiz },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...oldSettings.notifications },
    advanced: { ...DEFAULT_SETTINGS.advanced, ...oldSettings.advanced },
  };
}
