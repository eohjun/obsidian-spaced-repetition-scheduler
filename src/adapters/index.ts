/**
 * Adapters Layer
 * External integrations and infrastructure implementations
 */

// Obsidian
export { CrossPlatformFileUtils } from './obsidian';

// Scheduling
export { SM2Scheduler } from './scheduling';

// Embeddings
export { VaultEmbeddingsReader } from './embeddings';

// Clustering
export { CosineSimilarityClusteringService } from './clustering';

// LLM
export { BaseProvider, ClaudeProvider, OpenAIProvider, LLMQuizGenerator } from './llm';

// Storage
export { FrontmatterReviewRepository } from './storage';
