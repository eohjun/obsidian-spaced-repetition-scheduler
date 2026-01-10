/**
 * ReviewModal
 * 복습 세션 모달
 */

import { App, Modal, TFile, MarkdownRenderer, Notice } from 'obsidian';
import type SRSPlugin from '../main';
import type { ReviewCard, ReviewMode, RetentionLevel } from '../core/domain/entities/review-card';
import { SM2_QUALITY, type SM2Quality } from '../core/domain/interfaces/scheduler.interface';

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

    // 복습 카드 로드
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
    const allCards = await this.plugin.getReviewRepository().getAllCards();
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    this.cards = allCards
      .filter((card) => {
        const nextReview = new Date(card.sm2State.nextReview);
        return nextReview <= todayEnd;
      })
      .slice(0, this.plugin.settings.review.dailyLimit);

    // 정착도 낮은 순으로 정렬
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
      <h2>🎉 복습 완료!</h2>
      <p>오늘 복습할 노트가 없습니다.</p>
    `;

    const closeBtn = contentEl.createEl('button', {
      text: '닫기',
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

    // 진행 상황
    this.renderProgress(contentEl);

    // 복습 모드 토글
    this.renderModeToggle(contentEl);

    // 카드 내용
    this.renderCardContent(contentEl, card);

    // 버튼 영역
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

    progressEl.innerHTML = `
      <div class="srs-progress-text">${current} / ${total}</div>
      <div class="srs-progress-bar">
        <div class="srs-progress-fill" style="width: ${percent}%"></div>
      </div>
    `;
  }

  private renderModeToggle(container: HTMLElement): void {
    const toggleEl = container.createEl('div', { cls: 'srs-mode-toggle' });

    const quickBtn = toggleEl.createEl('button', {
      text: '⚡ 빠른 복습',
      cls: this.reviewMode === 'quick' ? 'is-active' : '',
    });
    quickBtn.onclick = () => {
      this.reviewMode = 'quick';
      this.renderCard();
    };

    const deepBtn = toggleEl.createEl('button', {
      text: '🔍 깊은 복습',
      cls: this.reviewMode === 'deep' ? 'is-active' : '',
    });
    deepBtn.onclick = () => {
      this.reviewMode = 'deep';
      this.renderCard();
    };

    if (this.plugin.settings.quiz.enabled) {
      const quizBtn = toggleEl.createEl('button', {
        text: '📝 퀴즈',
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

    // 헤더
    const headerEl = cardEl.createEl('div', { cls: 'srs-card-header' });
    headerEl.createEl('h3', { text: card.noteTitle });
    this.renderRetentionBadge(headerEl, card.retentionLevel);

    // 내용
    const contentArea = cardEl.createEl('div', { cls: 'srs-card-content' });

    if (this.reviewMode === 'quick') {
      // 빠른 복습: 제목만 표시
      contentArea.createEl('p', { text: '이 노트를 기억하시나요?' });
    } else {
      // 깊은 복습: 노트 내용 일부 표시
      await this.renderNotePreview(contentArea, card);
    }

    // 숨겨진 답변 영역
    if (this.isAnswerShown) {
      const answerEl = cardEl.createEl('div', { cls: 'srs-card-answer' });
      answerEl.createEl('hr');

      // 노트 열기 링크
      const linkEl = answerEl.createEl('a', {
        text: '📄 노트 열기',
        cls: 'srs-note-link',
      });
      linkEl.onclick = async () => {
        const file = this.app.vault.getAbstractFileByPath(card.notePath);
        if (file instanceof TFile) {
          await this.app.workspace.getLeaf().openFile(file);
        }
      };

      // SM-2 상태 표시
      this.renderSM2Info(answerEl, card);
    }
  }

  private renderRetentionBadge(container: HTMLElement, level: RetentionLevel): void {
    const badges: Record<RetentionLevel, { text: string; cls: string }> = {
      novice: { text: '🌱 초보', cls: 'srs-badge-novice' },
      learning: { text: '📚 학습중', cls: 'srs-badge-learning' },
      intermediate: { text: '🔄 중간', cls: 'srs-badge-intermediate' },
      advanced: { text: '⭐ 고급', cls: 'srs-badge-advanced' },
      mastered: { text: '🏆 마스터', cls: 'srs-badge-mastered' },
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

      // 프론트매터 제거 및 첫 500자 추출
      const bodyContent = content.replace(/^---[\s\S]*?---\n*/, '');
      const preview = bodyContent.slice(0, 500) + (bodyContent.length > 500 ? '...' : '');

      // 마크다운 렌더링 (Plugin은 Component를 확장)
      await MarkdownRenderer.render(
        this.app,
        preview,
        container,
        card.notePath,
        this.plugin
      );
    } catch (error) {
      container.createEl('p', { text: '노트 내용을 불러올 수 없습니다.' });
    }
  }

  private renderSM2Info(container: HTMLElement, card: ReviewCard): void {
    const infoEl = container.createEl('div', { cls: 'srs-sm2-info' });

    const { sm2State } = card;
    infoEl.innerHTML = `
      <div class="srs-sm2-stat">
        <span>연속 성공:</span> <strong>${sm2State.repetition}회</strong>
      </div>
      <div class="srs-sm2-stat">
        <span>현재 간격:</span> <strong>${sm2State.interval}일</strong>
      </div>
      <div class="srs-sm2-stat">
        <span>난이도 계수:</span> <strong>${sm2State.easeFactor.toFixed(2)}</strong>
      </div>
    `;
  }

  private renderShowAnswerButton(container: HTMLElement): void {
    const btnArea = container.createEl('div', { cls: 'srs-button-area' });

    const showBtn = btnArea.createEl('button', {
      text: '답변 보기',
      cls: 'mod-cta srs-show-answer-btn',
    });
    showBtn.onclick = () => {
      this.isAnswerShown = true;
      this.renderCard();
    };
  }

  private renderQualityButtons(container: HTMLElement): void {
    const btnArea = container.createEl('div', { cls: 'srs-quality-buttons' });

    const qualities = [
      { q: SM2_QUALITY.COMPLETE_BLACKOUT, text: '😵 전혀 모름', cls: 'srs-q-0' },
      { q: SM2_QUALITY.WRONG_REMEMBERED, text: '😟 틀림', cls: 'srs-q-1' },
      { q: SM2_QUALITY.WRONG_EASY, text: '😐 어려움', cls: 'srs-q-2' },
      { q: SM2_QUALITY.CORRECT_DIFFICULT, text: '🤔 힘들게 맞춤', cls: 'srs-q-3' },
      { q: SM2_QUALITY.CORRECT_HESITATION, text: '😊 약간 고민', cls: 'srs-q-4' },
      { q: SM2_QUALITY.PERFECT, text: '🎉 완벽!', cls: 'srs-q-5' },
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

    // SM-2 계산
    const scheduler = this.plugin.getScheduler();
    const newState = scheduler.calculateNext(card, quality);

    // 업데이트된 카드로 정착도 레벨 계산
    const updatedCard = { ...card, sm2State: newState };
    const newLevel = scheduler.estimateRetentionLevel(updatedCard);

    // 복습 기록 추가
    card.reviewHistory.push({
      reviewedAt: new Date(),
      quality,
      mode: this.reviewMode,
    });

    // 카드 업데이트
    card.sm2State = newState;
    card.retentionLevel = newLevel;
    card.lastModified = new Date();

    // 저장
    await this.plugin.getReviewRepository().saveCard(card);

    // 다음 카드
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
      <h2>🎉 복습 세션 완료!</h2>
      <div class="srs-session-stats">
        <div class="srs-stat">
          <span class="srs-stat-value">${reviewed}</span>
          <span class="srs-stat-label">복습 완료</span>
        </div>
      </div>
      <p>수고하셨습니다!</p>
    `;

    const closeBtn = contentEl.createEl('button', {
      text: '닫기',
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
      new Notice('노트를 찾을 수 없습니다.');
      return;
    }

    // QuizModal로 전환 (Task 4.6에서 구현)
    new Notice('퀴즈 기능은 별도 모달에서 제공됩니다.');
    // this.close();
    // new QuizModal(this.app, this.plugin, file).open();
  }
}
