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
import { FrontmatterReviewRepository } from './adapters/storage/frontmatter-review-repository';
import { VaultEmbeddingsReader } from './adapters/embeddings/vault-embeddings-reader';
import { SM2Scheduler } from './adapters/scheduling/sm2-scheduler';
import { CosineSimilarityClusteringService } from './adapters/clustering/cosine-similarity-clustering';
import { ClaudeProvider } from './adapters/llm/claude-provider';
import { OpenAIProvider } from './adapters/llm/openai-provider';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './views/dashboard-view';
import { ReviewModal } from './views/review-modal';
import { QuizModal } from './views/quiz-modal';

export { DASHBOARD_VIEW_TYPE };

export default class SRSPlugin extends Plugin {
  settings!: SRSSettings;

  // Services
  private reviewRepository!: FrontmatterReviewRepository;
  private embeddingsReader!: VaultEmbeddingsReader;
  private scheduler!: SM2Scheduler;
  private clusteringService!: CosineSimilarityClusteringService;

  // Ribbon element for badge
  private ribbonEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    console.log('[SRS] Loading Spaced Repetition Scheduler plugin');

    // 설정 로드
    await this.loadSettings();

    // 서비스 초기화
    this.initializeServices();

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

  private initializeServices(): void {
    this.reviewRepository = new FrontmatterReviewRepository(this.app);
    this.embeddingsReader = new VaultEmbeddingsReader(this.app.vault);
    this.scheduler = new SM2Scheduler();
    this.clusteringService = new CosineSimilarityClusteringService();

    // VE 연동: 자동 노트 추적
    this.reviewRepository.setEmbeddingsReader(this.embeddingsReader);
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

    const dueCount = await this.reviewRepository.getDueTodayCount();

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
    const dueCount = await this.reviewRepository.getDueTodayCount();

    if (dueCount === 0) {
      new Notice('오늘 복습할 노트가 없습니다!');
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
    const cards = await this.reviewRepository.getAllCards();
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const dueCards = cards.filter((card) => {
      const nextReview = new Date(card.sm2State.nextReview);
      return nextReview <= todayEnd;
    });

    if (dueCards.length === 0) {
      new Notice('오늘 복습할 노트가 없습니다!');
      return;
    }

    const list = dueCards
      .slice(0, 5)
      .map((c) => `• ${c.noteTitle}`)
      .join('\n');

    const more = dueCards.length > 5 ? `\n... 외 ${dueCards.length - 5}개` : '';

    new Notice(`오늘 복습 (${dueCards.length}개):\n${list}${more}`, 5000);
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

  getReviewRepository(): FrontmatterReviewRepository {
    return this.reviewRepository;
  }

  getEmbeddingsReader(): VaultEmbeddingsReader {
    return this.embeddingsReader;
  }

  getClusteringService(): CosineSimilarityClusteringService {
    return this.clusteringService;
  }
}
