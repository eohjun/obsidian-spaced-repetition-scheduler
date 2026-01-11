/**
 * SRS Plugin Settings
 * Plugin settings types and default values
 */

import type { QuestionType } from '../core/domain/entities/quiz';
import type { AIProvider } from '../core/application/services/ai-service';

// =============================================================================
// Settings Interface
// =============================================================================

export interface SRSSettings {
  // LLM settings
  ai: AISettings;

  // Review settings
  review: ReviewSettings;

  // Quiz settings
  quiz: QuizSettings;

  // Notification settings
  notifications: NotificationSettings;

  // Exclude folders
  excludeFolders: string[];

  // Advanced settings
  advanced: AdvancedSettings;
}

export interface AISettings {
  provider: AIProvider;
  apiKeys: Partial<Record<AIProvider, string>>;
  model: string;
}

export interface ReviewSettings {
  dailyLimit: number;           // Max daily reviews (default 20)
  newCardsPerDay: number;       // New cards per day (default 10)
  groupSimilar: boolean;        // Group similar notes (default true)
  similarityThreshold: number;  // Similarity threshold (default 0.7)
  // Auto-registration not needed due to VE integration (autoRegister removed)
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
  reminderTime: string;         // "09:00" format
  showBadge: boolean;           // Show today's review count badge
}

export interface AdvancedSettings {
  debugMode: boolean;
  cacheEmbeddings: boolean;
  maxHistorySize: number;       // Max history entries to store
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
    { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', description: 'Best quality' },
    { id: 'claude-sonnet-4-5-20250514', name: 'Claude Sonnet 4.5', description: 'Balanced quality' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fast' },
  ],
  openai: [
    { id: 'gpt-5.2', name: 'GPT-5.2', description: 'Latest flagship' },
    { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', description: 'Coding specialized' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and economical' },
    { id: 'gpt-4o', name: 'GPT-4o', description: 'High quality' },
    { id: 'o3-mini', name: 'O3 Mini', description: 'Reasoning model' },
  ],
  gemini: [
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: 'Fast' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', description: 'Best quality' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Stable' },
  ],
  grok: [
    { id: 'grok-4-1-fast', name: 'Grok 4.1 Fast', description: 'Latest xAI model' },
  ],
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Validate settings
 */
export function validateSettings(settings: SRSSettings): string[] {
  const errors: string[] = [];

  // Validate review settings
  if (settings.review.dailyLimit < 1 || settings.review.dailyLimit > 100) {
    errors.push('Daily review limit must be between 1-100.');
  }

  if (settings.review.similarityThreshold < 0.5 || settings.review.similarityThreshold > 1) {
    errors.push('Similarity threshold must be between 0.5-1.0.');
  }

  // Validate quiz settings
  if (settings.quiz.enabled && settings.quiz.questionCount < 1) {
    errors.push('Quiz question count must be at least 1.');
  }

  // Validate notification settings
  if (settings.notifications.enabled) {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(settings.notifications.reminderTime)) {
      errors.push('Reminder time format is invalid (HH:MM).');
    }
  }

  return errors;
}

/**
 * Migrate settings (for version upgrades)
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
