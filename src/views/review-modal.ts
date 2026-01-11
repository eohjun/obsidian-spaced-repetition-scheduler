/**
 * ReviewModal
 * Review Session Modal
 */

import { App, Modal, TFile, MarkdownRenderer, Notice } from 'obsidian';
import type SRSPlugin from '../main';
import type { ReviewCard, ReviewMode, RetentionLevel } from '../core/domain/entities/review-card';
import { SM2_QUALITY, type SM2Quality } from '../core/domain/interfaces/scheduler.interface';
import { QuizModal } from './quiz-modal';

export class ReviewModal extends Modal {
  private plugin: SRSPlugin;
  private cards: ReviewCard[] = [];
  private currentIndex = 0;
  private reviewMode: ReviewMode = 'quick';
  private isAnswerShown = false;
  private startTime: number = 0;

  constructor(app: App, plugin: SRSPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.addClass('srs-review-modal');

    // Load review cards
    await this.loadDueCards();

    if (this.cards.length === 0) {
      this.renderNoCards();
      return;
    }

    this.startTime = Date.now();
    this.renderCard();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  // ===========================================================================
  // Card Loading
  // ===========================================================================

  private async loadDueCards(): Promise<void> {
    // Select cards based on session manager
    const { reviewCards, newCardsToIntroduce } = await this.plugin.selectTodayReviewCards();

    // Combine review cards + newly introduced cards
    this.cards = [...reviewCards];

    // Add newly introduced cards to today's review (introduceNewCard sets nextReview to today)
    for (const card of newCardsToIntroduce) {
      if (!this.cards.find((c) => c.noteId === card.noteId)) {
        // Reload to reflect updated nextReview
        const updatedCard = await this.plugin.getReviewRepository().getCard(card.noteId);
        if (updatedCard) {
          this.cards.push(updatedCard);
        }
      }
    }

    // Sort by retention level (lowest first)
    this.cards.sort((a, b) => {
      const order = { novice: 0, learning: 1, intermediate: 2, advanced: 3, mastered: 4 };
      return order[a.retentionLevel] - order[b.retentionLevel];
    });
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  private renderNoCards(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('div', {
      cls: 'srs-review-complete',
    }).innerHTML = `
      <h2>🎉 Review Complete!</h2>
      <p>No notes to review today.</p>
    `;

    const closeBtn = contentEl.createEl('button', {
      text: 'Close',
      cls: 'mod-cta',
    });
    closeBtn.onclick = () => this.close();
  }

  private renderCard(): void {
    const { contentEl } = this;
    contentEl.empty();

    const card = this.cards[this.currentIndex];
    if (!card) {
      this.renderSessionComplete();
      return;
    }

    // Progress
    this.renderProgress(contentEl);

    // Review mode toggle
    this.renderModeToggle(contentEl);

    // Card content
    this.renderCardContent(contentEl, card);

    // Button area
    if (!this.isAnswerShown) {
      this.renderShowAnswerButton(contentEl);
    } else {
      this.renderQualityButtons(contentEl);
    }
  }

  private renderProgress(container: HTMLElement): void {
    const progressEl = container.createEl('div', { cls: 'srs-review-progress' });

    const current = this.currentIndex + 1;
    const total = this.cards.length;
    const percent = Math.round((this.currentIndex / total) * 100);

    // Get session info
    const sessionManager = this.plugin.getSessionManager();
    const queue = sessionManager.getDailyQueue();
    const focusSession = queue.focusSession;

    let sessionInfo = '';
    if (focusSession && focusSession.status === 'active') {
      const remaining = focusSession.remainingNoteIds.length;
      sessionInfo = `<div class="srs-session-info">📌 ${focusSession.clusterLabel} (${remaining} remaining)</div>`;
    }

    progressEl.innerHTML = `
      ${sessionInfo}
      <div class="srs-progress-text">${current} / ${total}</div>
      <div class="srs-progress-bar">
        <div class="srs-progress-fill" style="width: ${percent}%"></div>
      </div>
      <div class="srs-daily-info">Today: ${queue.reviewedCount}/${queue.dailyLimit} | New: ${queue.newCardsIntroduced}/${queue.newCardsLimit}</div>
    `;
  }

  private renderModeToggle(container: HTMLElement): void {
    const toggleEl = container.createEl('div', { cls: 'srs-mode-toggle' });

    const quickBtn = toggleEl.createEl('button', {
      text: '⚡ Quick Review',
      cls: this.reviewMode === 'quick' ? 'is-active' : '',
    });
    quickBtn.onclick = () => {
      this.reviewMode = 'quick';
      this.renderCard();
    };

    const deepBtn = toggleEl.createEl('button', {
      text: '🔍 Deep Review',
      cls: this.reviewMode === 'deep' ? 'is-active' : '',
    });
    deepBtn.onclick = () => {
      this.reviewMode = 'deep';
      this.renderCard();
    };

    if (this.plugin.settings.quiz.enabled) {
      const quizBtn = toggleEl.createEl('button', {
        text: '📝 Quiz',
        cls: this.reviewMode === 'quiz' ? 'is-active' : '',
      });
      quizBtn.onclick = () => {
        this.reviewMode = 'quiz';
        this.startQuiz();
      };
    }
  }

  private async renderCardContent(container: HTMLElement, card: ReviewCard): Promise<void> {
    const cardEl = container.createEl('div', { cls: 'srs-card' });

    // Header
    const headerEl = cardEl.createEl('div', { cls: 'srs-card-header' });
    headerEl.createEl('h3', { text: card.noteTitle });
    this.renderRetentionBadge(headerEl, card.retentionLevel);

    // Content
    const contentArea = cardEl.createEl('div', { cls: 'srs-card-content' });

    if (this.reviewMode === 'quick') {
      // Quick review: show title only
      contentArea.createEl('p', { text: 'Do you remember this note?' });
    } else {
      // Deep review: show note content preview
      await this.renderNotePreview(contentArea, card);
    }

    // Hidden answer area
    if (this.isAnswerShown) {
      const answerEl = cardEl.createEl('div', { cls: 'srs-card-answer' });
      answerEl.createEl('hr');

      // Open note link
      const linkEl = answerEl.createEl('a', {
        text: '📄 Open Note',
        cls: 'srs-note-link',
      });
      linkEl.onclick = async () => {
        const file = this.app.vault.getAbstractFileByPath(card.notePath);
        if (file instanceof TFile) {
          await this.app.workspace.getLeaf().openFile(file);
        }
      };

      // Display SM-2 state
      this.renderSM2Info(answerEl, card);
    }
  }

  private renderRetentionBadge(container: HTMLElement, level: RetentionLevel): void {
    const badges: Record<RetentionLevel, { text: string; cls: string }> = {
      novice: { text: '🌱 Novice', cls: 'srs-badge-novice' },
      learning: { text: '📚 Learning', cls: 'srs-badge-learning' },
      intermediate: { text: '🔄 Intermediate', cls: 'srs-badge-intermediate' },
      advanced: { text: '⭐ Advanced', cls: 'srs-badge-advanced' },
      mastered: { text: '🏆 Mastered', cls: 'srs-badge-mastered' },
    };

    const badge = badges[level];
    container.createEl('span', {
      text: badge.text,
      cls: `srs-retention-badge ${badge.cls}`,
    });
  }

  private async renderNotePreview(container: HTMLElement, card: ReviewCard): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(card.notePath);
      if (!(file instanceof TFile)) return;

      const content = await this.app.vault.cachedRead(file);

      // Remove frontmatter and extract first 500 characters
      const bodyContent = content.replace(/^---[\s\S]*?---\n*/, '');
      const preview = bodyContent.slice(0, 500) + (bodyContent.length > 500 ? '...' : '');

      // Render markdown (Plugin extends Component)
      await MarkdownRenderer.render(
        this.app,
        preview,
        container,
        card.notePath,
        this.plugin
      );
    } catch (error) {
      container.createEl('p', { text: 'Unable to load note content.' });
    }
  }

  private renderSM2Info(container: HTMLElement, card: ReviewCard): void {
    const infoEl = container.createEl('div', { cls: 'srs-sm2-info' });

    const { sm2State } = card;
    infoEl.innerHTML = `
      <div class="srs-sm2-stat">
        <span>Consecutive Success:</span> <strong>${sm2State.repetition}</strong>
      </div>
      <div class="srs-sm2-stat">
        <span>Current Interval:</span> <strong>${sm2State.interval} days</strong>
      </div>
      <div class="srs-sm2-stat">
        <span>Ease Factor:</span> <strong>${sm2State.easeFactor.toFixed(2)}</strong>
      </div>
    `;
  }

  private renderShowAnswerButton(container: HTMLElement): void {
    const btnArea = container.createEl('div', { cls: 'srs-button-area' });

    const showBtn = btnArea.createEl('button', {
      text: 'Show Answer',
      cls: 'mod-cta srs-show-answer-btn',
    });
    showBtn.onclick = () => {
      this.isAnswerShown = true;
      this.renderCard();
    };
  }

  private renderQualityButtons(container: HTMLElement): void {
    const btnArea = container.createEl('div', { cls: 'srs-quality-buttons' });

    // Intuitive recall level choices (mapped to SM-2 grades 0-5)
    const qualities = [
      { q: SM2_QUALITY.COMPLETE_BLACKOUT, text: '😵 No recall', cls: 'srs-q-0' },
      { q: SM2_QUALITY.WRONG_REMEMBERED, text: '😟 Vague', cls: 'srs-q-1' },
      { q: SM2_QUALITY.WRONG_EASY, text: '😐 Barely', cls: 'srs-q-2' },
      { q: SM2_QUALITY.CORRECT_DIFFICULT, text: '🤔 With effort', cls: 'srs-q-3' },
      { q: SM2_QUALITY.CORRECT_HESITATION, text: '😊 Good', cls: 'srs-q-4' },
      { q: SM2_QUALITY.PERFECT, text: '🎉 Perfect', cls: 'srs-q-5' },
    ];

    qualities.forEach(({ q, text, cls }) => {
      const btn = btnArea.createEl('button', { text, cls });
      btn.onclick = () => this.handleQualityResponse(q);
    });
  }

  // ===========================================================================
  // Actions
  // ===========================================================================

  private async handleQualityResponse(quality: SM2Quality): Promise<void> {
    const card = this.cards[this.currentIndex];
    if (!card) return;

    // SM-2 calculation
    const scheduler = this.plugin.getScheduler();
    const newState = scheduler.calculateNext(card, quality);

    // Calculate retention level with updated card
    const updatedCard = { ...card, sm2State: newState };
    const newLevel = scheduler.estimateRetentionLevel(updatedCard);

    // Check if new card (repetition was 0)
    const isNewCard = card.sm2State.repetition === 0;

    // Add review history
    card.reviewHistory.push({
      reviewedAt: new Date(),
      quality,
      mode: this.reviewMode,
    });

    // Update card
    card.sm2State = newState;
    card.retentionLevel = newLevel;
    card.lastModified = new Date();

    // Save
    await this.plugin.getReviewRepository().saveCard(card);

    // Record review completion in session manager
    const sessionManager = this.plugin.getSessionManager();
    sessionManager.markReviewed(card.noteId, isNewCard);

    // Save session data
    await this.plugin.saveSessionData();

    // Next card
    this.currentIndex++;
    this.isAnswerShown = false;
    this.startTime = Date.now();

    if (this.currentIndex >= this.cards.length) {
      this.renderSessionComplete();
    } else {
      this.renderCard();
    }
  }

  private renderSessionComplete(): void {
    const { contentEl } = this;
    contentEl.empty();

    const reviewed = this.currentIndex;

    contentEl.createEl('div', {
      cls: 'srs-session-complete',
    }).innerHTML = `
      <h2>🎉 Review Session Complete!</h2>
      <div class="srs-session-stats">
        <div class="srs-stat">
          <span class="srs-stat-value">${reviewed}</span>
          <span class="srs-stat-label">Reviews Done</span>
        </div>
      </div>
      <p>Great work!</p>
    `;

    const closeBtn = contentEl.createEl('button', {
      text: 'Close',
      cls: 'mod-cta',
    });
    closeBtn.onclick = () => {
      this.plugin.updateBadge();
      this.close();
    };
  }

  private startQuiz(): void {
    const card = this.cards[this.currentIndex];
    if (!card) return;

    const file = this.app.vault.getAbstractFileByPath(card.notePath);
    if (!(file instanceof TFile)) {
      new Notice('Note not found.');
      return;
    }

    // Check AI service
    if (!this.plugin.settings.quiz.enabled) {
      new Notice('Quiz feature is disabled. Please enable it in settings.');
      return;
    }

    // Switch to QuizModal
    this.close();
    new QuizModal(this.app, this.plugin, file).open();
  }
}
