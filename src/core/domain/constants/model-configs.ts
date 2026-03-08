/**
 * Model Configs — Re-exports from shared package (obsidian-llm-shared)
 *
 * All model data is centralized in the shared package.
 * To update models: modify obsidian-llm-shared, then `npm update` here.
 */
export {
  type AIProviderType,
  type AIProviderConfig,
  type ModelConfig,
  AI_PROVIDERS,
  MODEL_CONFIGS,
  getModelsByProvider,
  getModelConfig,
  getProviderConfig,
  isReasoningModel,
  getEffectiveMaxTokens,
  getThinkingConfig,
  calculateCost,
} from 'obsidian-llm-shared';
