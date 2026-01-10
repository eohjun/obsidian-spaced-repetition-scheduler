/**
 * Spaced Repetition Scheduler Plugin
 * SM-2 알고리즘 기반 간격 반복 학습 플러그인
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

// 세션 데이터 저장 키
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

    // 설정 로드
    await this.loadSettings();

    // 서비스 초기화
    await this.initializeServices();

    // AI 서비스 초기화 (API 키가 있는 경우)
    this.initializeAI();

    // View 등록
    this.registerViews();

    // 명령어 등록
    this.registerCommands();

    // 설정 탭 등록
    this.addSettingTab(new SRSSettingTab(this.app, this));

    // 리본 아이콘 추가
    this.setupRibbonIcon();

    // 이벤트 리스너 등록
    this.registerEvents();

    // 초기 상태 업데이트
    await this.updateBadge();
  }

  async onunload(): Promise<void> {
    console.log('[SRS] Unloading Spaced Repetition Scheduler plugin');

    // 세션 데이터 저장
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

    // AI 서비스 설정 업데이트
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

    // VE 연동: 자동 노트 추적
    this.reviewRepository.setEmbeddingsReader(this.embeddingsReader);

    // 세션 매니저 초기화 (영속화된 데이터 로드)
    const persistedSession = await this.loadSessionData();
    const sessionConfig: Partial<ReviewSessionConfig> = {
      dailyLimit: this.settings.review.dailyLimit,
      newCardsPerDay: this.settings.review.newCardsPerDay,
      similarityThreshold: this.settings.review.similarityThreshold,
    };
    this.sessionManager = new ReviewSessionManager(persistedSession, sessionConfig);
  }

  /**
   * 세션 데이터 로드
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
   * 세션 데이터 저장
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
    // 복습 시작
    this.addCommand({
      id: 'start-review',
      name: '복습 시작 (Start Review Session)',
      callback: () => this.startReviewSession(),
    });

    // 대시보드 열기
    this.addCommand({
      id: 'open-dashboard',
      name: '대시보드 열기 (Open Dashboard)',
      callback: () => this.activateDashboard(),
    });

    // 현재 노트 퀴즈
    this.addCommand({
      id: 'generate-quiz',
      name: '이 노트 퀴즈 생성 (Generate Quiz)',
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

    // 오늘 복습 목록
    this.addCommand({
      id: 'show-due-today',
      name: '오늘 복습할 노트 (Due Today)',
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

    // 세션 기반 남은 복습 수 표시
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
    // VE 기반 자동 추적으로 수동 이벤트 불필요
    // Vault Embeddings가 노트 생성/수정을 자동 추적함
  }

  // ===========================================================================
  // Core Actions
  // ===========================================================================

  async startReviewSession(): Promise<void> {
    // 세션 기반 복습 가능 여부 확인
    const queue = this.sessionManager.getDailyQueue();
    const remainingReviews = queue.dailyLimit - queue.reviewedCount;
    const remainingNewCards = queue.newCardsLimit - queue.newCardsIntroduced;

    // 오늘 복습할 수 있는 노트가 있는지 확인
    const dueCount = await this.reviewRepository.getDueTodayCount();
    const unintroducedCount = (await this.reviewRepository.getUnintroducedCards()).length;

    // 복습 가능 조건: (due 카드가 있거나 도입 가능한 신규 카드가 있음) AND 일일 한도 내
    const hasAvailableCards = (dueCount > 0 || (unintroducedCount > 0 && remainingNewCards > 0));
    const hasRemainingSlots = remainingReviews > 0;

    if (!hasAvailableCards || !hasRemainingSlots) {
      if (!hasRemainingSlots) {
        new Notice(`오늘 복습 한도(${queue.dailyLimit}개)를 완료했습니다!`);
      } else {
        new Notice('오늘 복습할 노트가 없습니다!');
      }
      return;
    }

    new ReviewModal(this.app, this).open();
  }

  async generateQuizForNote(file: TFile): Promise<void> {
    if (!this.settings.quiz.enabled) {
      new Notice('퀴즈 기능이 비활성화되어 있습니다. 설정에서 활성화해주세요.');
      return;
    }

    const aiService = getAIService();
    if (!aiService || !aiService.hasApiKey()) {
      new Notice('AI 서비스가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.');
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

    // 오늘 복습 가능한 노트 수 계산
    const availableDue = Math.min(dueCount, remainingReviews);
    const availableNew = Math.min(unintroducedCards.length, remainingNewCards, remainingReviews - availableDue);
    const totalAvailable = availableDue + availableNew;

    if (totalAvailable === 0) {
      if (remainingReviews === 0) {
        new Notice(`오늘 복습 한도(${queue.dailyLimit}개)를 완료했습니다! 🎉`);
      } else {
        new Notice('오늘 복습할 노트가 없습니다!');
      }
      return;
    }

    const sessionInfo = queue.focusSession?.status === 'active'
      ? `📌 포커스: ${queue.focusSession.clusterLabel}\n`
      : '';

    new Notice(
      `${sessionInfo}오늘 복습 현황:\n` +
      `• 완료: ${queue.reviewedCount}/${queue.dailyLimit}\n` +
      `• 신규 도입: ${queue.newCardsIntroduced}/${queue.newCardsLimit}\n` +
      `• 남은 due: ${dueCount}개\n` +
      `• 미도입 노트: ${unintroducedCards.length}개`,
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
        // 다른 프로바이더는 나중에 구현
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
   * 클러스터 기반 오늘 복습할 노트 선택
   * - 세션 매니저가 dailyLimit과 newCardsPerDay 적용
   * - VE 클러스터링으로 관련 노트 그룹핑
   */
  async selectTodayReviewCards(): Promise<{
    reviewCards: import('./core/domain/entities/review-card').ReviewCard[];
    newCardsToIntroduce: import('./core/domain/entities/review-card').ReviewCard[];
  }> {
    // 모든 카드 로드
    const allCards = await this.reviewRepository.getAllCards();

    // VE 임베딩 기반 클러스터링
    const embeddings = await this.embeddingsReader.readAllEmbeddings();

    // NoteEmbedding → NoteWithVector 변환
    const notesWithVectors = Array.from(embeddings.values()).map((emb) => ({
      noteId: emb.noteId,
      vector: emb.vector,
    }));

    // 클러스터링 수행
    const clusterResult = await this.clusteringService.cluster(notesWithVectors, {
      threshold: this.settings.review.similarityThreshold,
      maxGroupSize: 20,
    });
    const noteGroups = clusterResult.groups;

    // NoteGroup → NoteCluster 변환
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const dueCards = allCards.filter((card) => {
      const nextReview = new Date(card.sm2State.nextReview);
      return nextReview <= todayEnd;
    });
    const clusters = convertToNoteClusters(noteGroups, dueCards);

    // 세션 매니저로 오늘 복습 노트 선택
    const reviewCards = this.sessionManager.selectTodayReviewNotes(allCards, clusters);

    // 신규 노트 도입 선택
    const unintroducedCards = await this.reviewRepository.getUnintroducedCards();
    const newCardsToIntroduce = this.sessionManager.selectNewCardsToIntroduce(
      unintroducedCards,
      clusters
    );

    // 선택된 신규 노트 도입 (nextReview를 오늘로 설정)
    for (const card of newCardsToIntroduce) {
      await this.reviewRepository.introduceNewCard(card.noteId);
    }

    return { reviewCards, newCardsToIntroduce };
  }
}
