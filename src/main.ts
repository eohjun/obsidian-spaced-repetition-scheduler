/**
 * Spaced Repetition Scheduler Plugin
 * Spaced repetition learning plugin based on SM-2 algorithm
 */

import { Plugin, Notice, TFile } from 'obsidian';
import {
  SRSSettings,
  DEFAULT_SETTINGS,
  SRSSettingTab,
  migrateSettings,
} from './settings';
import {
  initializeAIService,
  resetAIService,
  getAIService,
} from './core/application/services/ai-service';
import { CalloutReviewRepository } from './adapters/storage/callout-review-repository';
import { VaultEmbeddingsReader } from './adapters/embeddings/vault-embeddings-reader';
import { SM2Scheduler } from './adapters/scheduling/sm2-scheduler';
import { CosineSimilarityClusteringService } from './adapters/clustering/cosine-similarity-clustering';
import { ClaudeProvider } from './adapters/llm/claude-provider';
import { OpenAIProvider } from './adapters/llm/openai-provider';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './views/dashboard-view';
import { ReviewModal } from './views/review-modal';
import { QuizModal } from './views/quiz-modal';
import {
  ReviewSessionManager,
  type ReviewSessionConfig,
} from './core/application/services/review-session-manager';
import type { PersistedSessionData } from './core/domain/entities/focus-session';
import { convertToNoteClusters } from './core/application/services/cluster-adapter';

export { DASHBOARD_VIEW_TYPE };

// Session data storage key
const SESSION_DATA_KEY = 'srs-session-data';

export default class SRSPlugin extends Plugin {
  settings!: SRSSettings;

  // Services
  private reviewRepository!: CalloutReviewRepository;
  private embeddingsReader!: VaultEmbeddingsReader;
  private scheduler!: SM2Scheduler;
  private clusteringService!: CosineSimilarityClusteringService;
  private sessionManager!: ReviewSessionManager;

  // Ribbon element for badge
  private ribbonEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    console.log('[SRS] Loading Spaced Repetition Scheduler plugin');

    // Load settings
    await this.loadSettings();

    // Initialize services
    await this.initializeServices();

    // Initialize AI service (if API key is configured)
    this.initializeAI();

    // Register views
    this.registerViews();

    // Register commands
    this.registerCommands();

    // Register settings tab
    this.addSettingTab(new SRSSettingTab(this.app, this));

    // Add ribbon icon
    this.setupRibbonIcon();

    // Register event listeners
    this.registerEvents();

    // Update initial state
    await this.updateBadge();
  }

  async onunload(): Promise<void> {
    console.log('[SRS] Unloading Spaced Repetition Scheduler plugin');

    // Save session data
    await this.saveSessionData();

    resetAIService();
  }

  // ===========================================================================
  // Settings
  // ===========================================================================

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = migrateSettings(data || {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);

    // Update AI service settings
    this.initializeAI();
  }

  async resetSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS };
    await this.saveSettings();
  }

  // ===========================================================================
  // Service Initialization
  // ===========================================================================

  private async initializeServices(): Promise<void> {
    this.reviewRepository = new CalloutReviewRepository(this.app);
    this.embeddingsReader = new VaultEmbeddingsReader(this.app.vault);
    this.scheduler = new SM2Scheduler();
    this.clusteringService = new CosineSimilarityClusteringService();

    // VE integration: automatic note tracking
    this.reviewRepository.setEmbeddingsReader(this.embeddingsReader);

    // Initialize session manager (load persisted data)
    const persistedSession = await this.loadSessionData();
    const sessionConfig: Partial<ReviewSessionConfig> = {
      dailyLimit: this.settings.review.dailyLimit,
      newCardsPerDay: this.settings.review.newCardsPerDay,
      similarityThreshold: this.settings.review.similarityThreshold,
    };
    this.sessionManager = new ReviewSessionManager(persistedSession, sessionConfig);
  }

  /**
   * Load session data
   */
  private async loadSessionData(): Promise<PersistedSessionData | null> {
    try {
      const data = await this.loadData();
      return data?.[SESSION_DATA_KEY] || null;
    } catch (error) {
      console.error('[SRS] Failed to load session data:', error);
      return null;
    }
  }

  /**
   * Save session data
   */
  async saveSessionData(): Promise<void> {
    try {
      const data = await this.loadData() || {};
      data[SESSION_DATA_KEY] = this.sessionManager.getPersistedData();
      await this.saveData(data);
    } catch (error) {
      console.error('[SRS] Failed to save session data:', error);
    }
  }

  private initializeAI(): void {
    const apiKey = this.settings.ai.apiKeys[this.settings.ai.provider];

    if (!apiKey) {
      if (this.settings.advanced.debugMode) {
        console.log('[SRS] No API key configured');
      }
      return;
    }

    initializeAIService({
      provider: this.settings.ai.provider,
      modelId: this.settings.ai.model,
      apiKeys: this.settings.ai.apiKeys,
    });

    if (this.settings.advanced.debugMode) {
      console.log('[SRS] AI Service initialized with', this.settings.ai.provider);
    }
  }

  // ===========================================================================
  // Views
  // ===========================================================================

  private registerViews(): void {
    this.registerView(
      DASHBOARD_VIEW_TYPE,
      (leaf) => new DashboardView(leaf, this)
    );
  }

  async activateDashboard(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  // ===========================================================================
  // Commands
  // ===========================================================================

  private registerCommands(): void {
    // Start review
    this.addCommand({
      id: 'start-review',
      name: 'Start Review Session',
      callback: () => this.startReviewSession(),
    });

    // Open dashboard
    this.addCommand({
      id: 'open-dashboard',
      name: 'Open Dashboard',
      callback: () => this.activateDashboard(),
    });

    // Generate quiz for current note
    this.addCommand({
      id: 'generate-quiz',
      name: 'Generate Quiz for This Note',
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (file && file.extension === 'md') {
          if (!checking) {
            this.generateQuizForNote(file);
          }
          return true;
        }
        return false;
      },
    });

    // Today's review list
    this.addCommand({
      id: 'show-due-today',
      name: 'Show Notes Due Today',
      callback: () => this.showDueToday(),
    });
  }

  // ===========================================================================
  // Ribbon
  // ===========================================================================

  private setupRibbonIcon(): void {
    this.ribbonEl = this.addRibbonIcon('brain', 'Spaced Repetition', () => {
      this.startReviewSession();
    });
  }

  async updateBadge(): Promise<void> {
    if (!this.settings.notifications.showBadge || !this.ribbonEl) return;

    // Display remaining reviews based on session
    const queue = this.sessionManager.getDailyQueue();
    const remaining = queue.dailyLimit - queue.reviewedCount;
    const dueCount = Math.max(0, remaining);

    if (dueCount > 0) {
      this.ribbonEl.setAttribute('data-srs-badge', dueCount.toString());
      this.ribbonEl.addClass('srs-has-badge');
    } else {
      this.ribbonEl.removeAttribute('data-srs-badge');
      this.ribbonEl.removeClass('srs-has-badge');
    }
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  private registerEvents(): void {
    // Manual events not needed due to VE-based automatic tracking
    // Vault Embeddings automatically tracks note creation/modification
  }

  // ===========================================================================
  // Core Actions
  // ===========================================================================

  async startReviewSession(): Promise<void> {
    // Check review availability based on session
    const queue = this.sessionManager.getDailyQueue();
    const remainingReviews = queue.dailyLimit - queue.reviewedCount;
    const remainingNewCards = queue.newCardsLimit - queue.newCardsIntroduced;

    // Check if there are notes available for review today
    const dueCount = await this.reviewRepository.getDueTodayCount();
    const unintroducedCount = (await this.reviewRepository.getUnintroducedCards()).length;

    // Review condition: (due cards exist OR new cards can be introduced) AND within daily limit
    const hasAvailableCards = (dueCount > 0 || (unintroducedCount > 0 && remainingNewCards > 0));
    const hasRemainingSlots = remainingReviews > 0;

    if (!hasAvailableCards || !hasRemainingSlots) {
      if (!hasRemainingSlots) {
        new Notice(`You've completed today's review limit (${queue.dailyLimit})!`);
      } else {
        new Notice('No notes to review today!');
      }
      return;
    }

    new ReviewModal(this.app, this).open();
  }

  async generateQuizForNote(file: TFile): Promise<void> {
    if (!this.settings.quiz.enabled) {
      new Notice('Quiz feature is disabled. Please enable it in settings.');
      return;
    }

    const aiService = getAIService();
    if (!aiService || !aiService.hasApiKey()) {
      new Notice('AI service is not configured. Please enter your API key in settings.');
      return;
    }

    new QuizModal(this.app, this, file).open();
  }

  async showDueToday(): Promise<void> {
    const queue = this.sessionManager.getDailyQueue();
    const unintroducedCards = await this.reviewRepository.getUnintroducedCards();
    const dueCount = await this.reviewRepository.getDueTodayCount();

    const remainingReviews = queue.dailyLimit - queue.reviewedCount;
    const remainingNewCards = queue.newCardsLimit - queue.newCardsIntroduced;

    // Calculate notes available for review today
    const availableDue = Math.min(dueCount, remainingReviews);
    const availableNew = Math.min(unintroducedCards.length, remainingNewCards, remainingReviews - availableDue);
    const totalAvailable = availableDue + availableNew;

    if (totalAvailable === 0) {
      if (remainingReviews === 0) {
        new Notice(`You've completed today's review limit (${queue.dailyLimit})! 🎉`);
      } else {
        new Notice('No notes to review today!');
      }
      return;
    }

    const sessionInfo = queue.focusSession?.status === 'active'
      ? `📌 Focus: ${queue.focusSession.clusterLabel}\n`
      : '';

    new Notice(
      `${sessionInfo}Today's Review Status:\n` +
      `• Completed: ${queue.reviewedCount}/${queue.dailyLimit}\n` +
      `• New Cards: ${queue.newCardsIntroduced}/${queue.newCardsLimit}\n` +
      `• Remaining Due: ${dueCount}\n` +
      `• Unintroduced: ${unintroducedCards.length}`,
      5000
    );
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  async testApiConnection(): Promise<boolean> {
    const provider = this.settings.ai.provider;
    const apiKey = this.settings.ai.apiKeys[provider];

    if (!apiKey) return false;

    try {
      let testProvider;

      if (provider === 'claude') {
        testProvider = new ClaudeProvider();
      } else if (provider === 'openai') {
        testProvider = new OpenAIProvider();
      } else {
        // Other providers to be implemented later
        return false;
      }

      return await testProvider.testApiKey(apiKey);
    } catch (error) {
      console.error('[SRS] API test failed:', error);
      return false;
    }
  }

  getScheduler(): SM2Scheduler {
    return this.scheduler;
  }

  getReviewRepository(): CalloutReviewRepository {
    return this.reviewRepository;
  }

  getEmbeddingsReader(): VaultEmbeddingsReader {
    return this.embeddingsReader;
  }

  getClusteringService(): CosineSimilarityClusteringService {
    return this.clusteringService;
  }

  getSessionManager(): ReviewSessionManager {
    return this.sessionManager;
  }

  /**
   * Select notes for today's review based on clustering
   * - Session manager applies dailyLimit and newCardsPerDay
   * - VE clustering groups related notes together
   */
  async selectTodayReviewCards(): Promise<{
    reviewCards: import('./core/domain/entities/review-card').ReviewCard[];
    newCardsToIntroduce: import('./core/domain/entities/review-card').ReviewCard[];
  }> {
    // Load all cards
    const allCards = await this.reviewRepository.getAllCards();

    // VE embedding-based clustering
    const embeddings = await this.embeddingsReader.readAllEmbeddings();

    // Convert NoteEmbedding → NoteWithVector
    const notesWithVectors = Array.from(embeddings.values()).map((emb) => ({
      noteId: emb.noteId,
      vector: emb.vector,
    }));

    // Perform clustering
    const clusterResult = await this.clusteringService.cluster(notesWithVectors, {
      threshold: this.settings.review.similarityThreshold,
      maxGroupSize: 20,
    });
    const noteGroups = clusterResult.groups;

    // Convert NoteGroup → NoteCluster
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const dueCards = allCards.filter((card) => {
      const nextReview = new Date(card.sm2State.nextReview);
      return nextReview <= todayEnd;
    });
    const clusters = convertToNoteClusters(noteGroups, dueCards);

    // Select today's review notes via session manager
    const reviewCards = this.sessionManager.selectTodayReviewNotes(allCards, clusters);

    // Select new cards to introduce
    const unintroducedCards = await this.reviewRepository.getUnintroducedCards();
    const newCardsToIntroduce = this.sessionManager.selectNewCardsToIntroduce(
      unintroducedCards,
      clusters
    );

    // Introduce selected new cards (set nextReview to today)
    for (const card of newCardsToIntroduce) {
      await this.reviewRepository.introduceNewCard(card.noteId);
    }

    return { reviewCards, newCardsToIntroduce };
  }
}
