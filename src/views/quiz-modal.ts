/**
 * QuizModal
 * AI 생성 퀴즈 모달
 */

import { App, Modal, TFile, Notice } from 'obsidian';
import type SRSPlugin from '../main';
import type {
  Quiz,
  QuizQuestion,
  QuizAnswer,
} from '../core/domain/entities/quiz';
import { calculateQuizScore, quizScoreToQuality } from '../core/domain/entities/quiz';
import type { IQuizGenerator, AnswerResult } from '../core/domain/interfaces/quiz-generator.interface';
import { LLMQuizGenerator } from '../adapters/llm/llm-quiz-generator';
import type { ILLMProvider } from '../core/domain/interfaces/llm-provider.interface';
import { ClaudeProvider } from '../adapters/llm/claude-provider';
import { OpenAIProvider } from '../adapters/llm/openai-provider';
import { generateNoteId } from '../core/domain/utils/note-id';
import type { SM2Quality } from '../core/domain/interfaces/scheduler.interface';

type QuizState = 'loading' | 'ready' | 'question' | 'feedback' | 'result' | 'error';

export class QuizModal extends Modal {
  private plugin: SRSPlugin;
  private file: TFile;

  // Quiz state
  private state: QuizState = 'loading';
  private quiz: Quiz | null = null;
  private quizGenerator: IQuizGenerator | null = null;

  // Session state
  private currentIndex = 0;
  private answers: QuizAnswer[] = [];
  private questionStartTime = 0;
  private sessionStartTime = 0;

  // Current answer state
  private currentAnswer = '';
  private currentResult: AnswerResult | null = null;

  // Error state
  private errorMessage = '';

  constructor(app: App, plugin: SRSPlugin, file: TFile) {
    super(app);
    this.plugin = plugin;
    this.file = file;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.addClass('srs-quiz-modal');

    // Initialize quiz generator
    this.initializeQuizGenerator();

    if (!this.quizGenerator) {
      this.state = 'error';
      this.errorMessage = 'AI 서비스가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.';
      this.render();
      return;
    }

    this.sessionStartTime = Date.now();
    this.render();

    // Generate quiz
    await this.generateQuiz();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  private initializeQuizGenerator(): void {
    const settings = this.plugin.settings;
    const apiKey = settings.ai.apiKeys[settings.ai.provider];

    if (!apiKey) {
      return;
    }

    let provider: ILLMProvider;

    switch (settings.ai.provider) {
      case 'claude':
        provider = new ClaudeProvider();
        provider.setApiKey(apiKey);
        provider.setModel(settings.ai.model);
        break;
      case 'openai':
        provider = new OpenAIProvider();
        provider.setApiKey(apiKey);
        provider.setModel(settings.ai.model);
        break;
      default:
        // Other providers not yet implemented
        return;
    }

    this.quizGenerator = new LLMQuizGenerator(provider);
  }

  private async generateQuiz(): Promise<void> {
    try {
      // Read note content
      const content = await this.app.vault.cachedRead(this.file);

      // Remove frontmatter
      const bodyContent = content.replace(/^---[\s\S]*?---\n*/, '');

      const settings = this.plugin.settings;

      // Generate quiz
      this.quiz = await this.quizGenerator!.generate(bodyContent, {
        noteId: generateNoteId(this.file.path),
        noteTitle: this.file.basename,
        questionCount: settings.quiz.questionCount,
        types: settings.quiz.types,
        difficulty: settings.quiz.difficulty,
        language: settings.quiz.language,
      });

      this.state = 'ready';
      this.render();
    } catch (error) {
      console.error('[SRS] Quiz generation failed:', error);
      this.state = 'error';
      this.errorMessage = error instanceof Error
        ? error.message
        : '퀴즈 생성 중 오류가 발생했습니다.';
      this.render();
    }
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    switch (this.state) {
      case 'loading':
        this.renderLoading();
        break;
      case 'ready':
        this.renderReady();
        break;
      case 'question':
        this.renderQuestion();
        break;
      case 'feedback':
        this.renderFeedback();
        break;
      case 'result':
        this.renderResult();
        break;
      case 'error':
        this.renderError();
        break;
    }
  }

  private renderLoading(): void {
    const { contentEl } = this;

    const loadingEl = contentEl.createEl('div', { cls: 'srs-quiz-loading' });
    loadingEl.createEl('div', { cls: 'srs-loading-spinner' });
    loadingEl.createEl('h3', { text: '퀴즈 생성 중...' });
    loadingEl.createEl('p', {
      text: `"${this.file.basename}" 노트를 분석하고 있습니다.`
    });
  }

  private renderReady(): void {
    const { contentEl } = this;

    if (!this.quiz) return;

    const readyEl = contentEl.createEl('div', { cls: 'srs-quiz-ready' });

    readyEl.createEl('h2', { text: '퀴즈 준비 완료!' });
    readyEl.createEl('p', { text: `"${this.file.basename}"` });

    const statsEl = readyEl.createEl('div', { cls: 'srs-quiz-stats' });
    statsEl.createEl('div', { cls: 'srs-stat' }).innerHTML = `
      <span class="srs-stat-value">${this.quiz.questions.length}</span>
      <span class="srs-stat-label">문제 수</span>
    `;

    // Question type breakdown
    const types = this.quiz.questions.reduce((acc, q) => {
      acc[q.type] = (acc[q.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const typeLabels: Record<string, string> = {
      multiple_choice: '객관식',
      true_false: '참/거짓',
      open_ended: '서술형',
      fill_blank: '빈칸',
    };

    const typesText = Object.entries(types)
      .map(([t, c]) => `${typeLabels[t] || t}: ${c}개`)
      .join(', ');

    readyEl.createEl('p', {
      text: typesText,
      cls: 'srs-quiz-types'
    });

    const startBtn = readyEl.createEl('button', {
      text: '시작하기',
      cls: 'mod-cta srs-start-btn',
    });
    startBtn.onclick = () => this.startQuiz();

    const cancelBtn = readyEl.createEl('button', {
      text: '취소',
      cls: 'srs-cancel-btn',
    });
    cancelBtn.onclick = () => this.close();
  }

  private renderQuestion(): void {
    const { contentEl } = this;

    if (!this.quiz) return;

    const question = this.quiz.questions[this.currentIndex];
    if (!question) return;

    // Progress
    this.renderProgress(contentEl);

    // Question card
    const cardEl = contentEl.createEl('div', { cls: 'srs-quiz-card' });

    // Question header
    const headerEl = cardEl.createEl('div', { cls: 'srs-quiz-header' });
    this.renderQuestionTypeBadge(headerEl, question);
    this.renderDifficultyBadge(headerEl, question);

    // Question text
    cardEl.createEl('div', {
      cls: 'srs-quiz-question',
      text: question.question,
    });

    // Answer input
    const inputArea = cardEl.createEl('div', { cls: 'srs-quiz-input-area' });
    this.renderAnswerInput(inputArea, question);

    // Submit button
    const btnArea = contentEl.createEl('div', { cls: 'srs-button-area' });
    const submitBtn = btnArea.createEl('button', {
      text: '제출',
      cls: 'mod-cta srs-submit-btn',
    });
    submitBtn.onclick = () => this.submitAnswer();

    const skipBtn = btnArea.createEl('button', {
      text: '건너뛰기',
      cls: 'srs-skip-btn',
    });
    skipBtn.onclick = () => this.skipQuestion();
  }

  private renderProgress(container: HTMLElement): void {
    if (!this.quiz) return;

    const progressEl = container.createEl('div', { cls: 'srs-quiz-progress' });

    const current = this.currentIndex + 1;
    const total = this.quiz.questions.length;
    const percent = Math.round((this.currentIndex / total) * 100);

    progressEl.innerHTML = `
      <div class="srs-progress-text">${current} / ${total}</div>
      <div class="srs-progress-bar">
        <div class="srs-progress-fill" style="width: ${percent}%"></div>
      </div>
    `;
  }

  private renderQuestionTypeBadge(container: HTMLElement, question: QuizQuestion): void {
    const typeLabels: Record<string, string> = {
      multiple_choice: '객관식',
      true_false: '참/거짓',
      open_ended: '서술형',
      fill_blank: '빈칸 채우기',
    };

    container.createEl('span', {
      text: typeLabels[question.type] || question.type,
      cls: `srs-question-type srs-type-${question.type}`,
    });
  }

  private renderDifficultyBadge(container: HTMLElement, question: QuizQuestion): void {
    const diffLabels: Record<string, string> = {
      easy: '쉬움',
      medium: '보통',
      hard: '어려움',
    };

    container.createEl('span', {
      text: diffLabels[question.difficulty] || question.difficulty,
      cls: `srs-difficulty srs-diff-${question.difficulty}`,
    });
  }

  private renderAnswerInput(container: HTMLElement, question: QuizQuestion): void {
    this.currentAnswer = '';

    switch (question.type) {
      case 'multiple_choice':
        this.renderMultipleChoice(container, question);
        break;
      case 'true_false':
        this.renderTrueFalse(container);
        break;
      case 'open_ended':
        this.renderOpenEnded(container);
        break;
      case 'fill_blank':
        this.renderFillBlank(container);
        break;
    }
  }

  private renderMultipleChoice(container: HTMLElement, question: QuizQuestion): void {
    if (!question.options) return;

    const optionsEl = container.createEl('div', { cls: 'srs-options' });

    question.options.forEach((option, index) => {
      const optionEl = optionsEl.createEl('label', { cls: 'srs-option' });

      const radio = optionEl.createEl('input', {
        type: 'radio',
        attr: { name: 'quiz-option', value: option },
      });
      radio.onchange = () => {
        this.currentAnswer = option;
        // Update visual selection
        optionsEl.querySelectorAll('.srs-option').forEach((el) => {
          el.removeClass('is-selected');
        });
        optionEl.addClass('is-selected');
      };

      optionEl.createEl('span', {
        text: `${String.fromCharCode(65 + index)}. ${option}`,
      });
    });
  }

  private renderTrueFalse(container: HTMLElement): void {
    const optionsEl = container.createEl('div', { cls: 'srs-tf-options' });

    const trueBtn = optionsEl.createEl('button', {
      text: '⭕ 참',
      cls: 'srs-tf-btn',
    });
    trueBtn.onclick = () => {
      this.currentAnswer = '참';
      optionsEl.querySelectorAll('.srs-tf-btn').forEach((b) => b.removeClass('is-selected'));
      trueBtn.addClass('is-selected');
    };

    const falseBtn = optionsEl.createEl('button', {
      text: '❌ 거짓',
      cls: 'srs-tf-btn',
    });
    falseBtn.onclick = () => {
      this.currentAnswer = '거짓';
      optionsEl.querySelectorAll('.srs-tf-btn').forEach((b) => b.removeClass('is-selected'));
      falseBtn.addClass('is-selected');
    };
  }

  private renderOpenEnded(container: HTMLElement): void {
    const textarea = container.createEl('textarea', {
      cls: 'srs-answer-textarea',
      attr: {
        placeholder: '답변을 입력하세요...',
        rows: '4',
      },
    });
    textarea.oninput = () => {
      this.currentAnswer = textarea.value;
    };
  }

  private renderFillBlank(container: HTMLElement): void {
    const input = container.createEl('input', {
      type: 'text',
      cls: 'srs-answer-input',
      attr: { placeholder: '빈칸에 들어갈 내용을 입력하세요...' },
    });
    input.oninput = () => {
      this.currentAnswer = input.value;
    };
  }

  private renderFeedback(): void {
    const { contentEl } = this;

    if (!this.quiz || !this.currentResult) return;

    const question = this.quiz.questions[this.currentIndex];
    if (!question) return;

    // Progress
    this.renderProgress(contentEl);

    // Feedback card
    const cardEl = contentEl.createEl('div', {
      cls: `srs-feedback-card ${this.currentResult.isCorrect ? 'is-correct' : 'is-incorrect'}`,
    });

    // Result icon
    const iconEl = cardEl.createEl('div', { cls: 'srs-feedback-icon' });
    iconEl.innerHTML = this.currentResult.isCorrect ? '✅' : '❌';

    // Question text
    cardEl.createEl('div', {
      cls: 'srs-quiz-question srs-feedback-question',
      text: question.question,
    });

    // User answer
    cardEl.createEl('div', { cls: 'srs-your-answer' }).innerHTML = `
      <strong>당신의 답:</strong> ${this.currentAnswer || '(건너뜀)'}
    `;

    // Correct answer (if wrong)
    if (!this.currentResult.isCorrect) {
      cardEl.createEl('div', { cls: 'srs-correct-answer' }).innerHTML = `
        <strong>정답:</strong> ${question.correctAnswer}
      `;
    }

    // Feedback text
    cardEl.createEl('div', {
      cls: 'srs-feedback-text',
      text: this.currentResult.feedback,
    });

    // Similarity score (for open-ended)
    if (this.currentResult.similarity !== undefined) {
      const percent = Math.round(this.currentResult.similarity * 100);
      cardEl.createEl('div', {
        cls: 'srs-similarity',
        text: `유사도: ${percent}%`,
      });
    }

    // Next button
    const btnArea = contentEl.createEl('div', { cls: 'srs-button-area' });
    const nextBtn = btnArea.createEl('button', {
      text: this.currentIndex < this.quiz.questions.length - 1 ? '다음 문제' : '결과 보기',
      cls: 'mod-cta',
    });
    nextBtn.onclick = () => this.nextQuestion();
  }

  private renderResult(): void {
    const { contentEl } = this;

    if (!this.quiz) return;

    const score = calculateQuizScore(this.answers);
    const quality = quizScoreToQuality(score);
    const totalTime = Math.floor((Date.now() - this.sessionStartTime) / 1000);

    const resultEl = contentEl.createEl('div', { cls: 'srs-quiz-result' });

    // Score display
    const scoreEl = resultEl.createEl('div', { cls: 'srs-result-score' });
    scoreEl.createEl('div', {
      cls: 'srs-score-value',
      text: `${score}점`,
    });
    scoreEl.createEl('div', {
      cls: 'srs-score-label',
      text: this.getScoreLabel(score),
    });

    // Stats
    const statsEl = resultEl.createEl('div', { cls: 'srs-result-stats' });

    const correctCount = this.answers.filter((a) => a.isCorrect).length;
    const totalQuestions = this.quiz.questions.length;

    statsEl.innerHTML = `
      <div class="srs-stat">
        <span class="srs-stat-value">${correctCount}/${totalQuestions}</span>
        <span class="srs-stat-label">정답</span>
      </div>
      <div class="srs-stat">
        <span class="srs-stat-value">${this.formatTime(totalTime)}</span>
        <span class="srs-stat-label">소요 시간</span>
      </div>
      <div class="srs-stat">
        <span class="srs-stat-value">${quality}</span>
        <span class="srs-stat-label">SM-2 점수</span>
      </div>
    `;

    // Question breakdown
    this.renderAnswerBreakdown(resultEl);

    // Action buttons
    const btnArea = resultEl.createEl('div', { cls: 'srs-button-area' });

    const applyBtn = btnArea.createEl('button', {
      text: '복습 기록에 반영',
      cls: 'mod-cta',
    });
    applyBtn.onclick = () => this.applyResultToReview(quality as SM2Quality);

    const closeBtn = btnArea.createEl('button', {
      text: '닫기',
    });
    closeBtn.onclick = () => this.close();
  }

  private renderAnswerBreakdown(container: HTMLElement): void {
    if (!this.quiz) return;

    const breakdownEl = container.createEl('div', { cls: 'srs-answer-breakdown' });
    breakdownEl.createEl('h4', { text: '문제별 결과' });

    const listEl = breakdownEl.createEl('div', { cls: 'srs-breakdown-list' });

    this.answers.forEach((answer, index) => {
      const question = this.quiz!.questions[index];
      if (!question) return;

      const itemEl = listEl.createEl('div', {
        cls: `srs-breakdown-item ${answer.isCorrect ? 'is-correct' : 'is-incorrect'}`,
      });

      itemEl.innerHTML = `
        <span class="srs-breakdown-icon">${answer.isCorrect ? '✅' : '❌'}</span>
        <span class="srs-breakdown-text">${this.truncate(question.question, 40)}</span>
        <span class="srs-breakdown-time">${answer.timeTaken}초</span>
      `;
    });
  }

  private renderError(): void {
    const { contentEl } = this;

    const errorEl = contentEl.createEl('div', { cls: 'srs-quiz-error' });
    errorEl.createEl('div', { cls: 'srs-error-icon', text: '⚠️' });
    errorEl.createEl('h3', { text: '오류 발생' });
    errorEl.createEl('p', { text: this.errorMessage });

    const btnArea = errorEl.createEl('div', { cls: 'srs-button-area' });

    const retryBtn = btnArea.createEl('button', {
      text: '다시 시도',
      cls: 'mod-cta',
    });
    retryBtn.onclick = async () => {
      this.state = 'loading';
      this.render();
      await this.generateQuiz();
    };

    const closeBtn = btnArea.createEl('button', {
      text: '닫기',
    });
    closeBtn.onclick = () => this.close();
  }

  // ===========================================================================
  // Actions
  // ===========================================================================

  private startQuiz(): void {
    this.currentIndex = 0;
    this.answers = [];
    this.questionStartTime = Date.now();
    this.state = 'question';
    this.render();
  }

  private submitAnswer(): void {
    if (!this.quiz || !this.quizGenerator) return;

    const question = this.quiz.questions[this.currentIndex];
    if (!question) return;

    // Validate answer
    this.currentResult = this.quizGenerator.validateAnswer(question, this.currentAnswer);

    // Record answer
    const timeTaken = Math.floor((Date.now() - this.questionStartTime) / 1000);
    this.answers.push({
      questionId: question.id,
      userAnswer: this.currentAnswer,
      isCorrect: this.currentResult.isCorrect,
      timeTaken,
    });

    this.state = 'feedback';
    this.render();
  }

  private skipQuestion(): void {
    if (!this.quiz) return;

    const question = this.quiz.questions[this.currentIndex];
    if (!question) return;

    // Record skipped answer as incorrect
    const timeTaken = Math.floor((Date.now() - this.questionStartTime) / 1000);
    this.answers.push({
      questionId: question.id,
      userAnswer: '',
      isCorrect: false,
      timeTaken,
    });

    this.currentResult = {
      isCorrect: false,
      feedback: '건너뛰었습니다.',
      correctAnswer: question.correctAnswer,
    };

    this.state = 'feedback';
    this.render();
  }

  private nextQuestion(): void {
    if (!this.quiz) return;

    this.currentIndex++;
    this.currentAnswer = '';
    this.currentResult = null;
    this.questionStartTime = Date.now();

    if (this.currentIndex >= this.quiz.questions.length) {
      this.state = 'result';
    } else {
      this.state = 'question';
    }

    this.render();
  }

  private async applyResultToReview(quality: SM2Quality): Promise<void> {
    try {
      const noteId = generateNoteId(this.file.path);
      const repository = this.plugin.getReviewRepository();
      const card = await repository.getCard(noteId);

      if (!card) {
        new Notice('복습 카드를 찾을 수 없습니다. 먼저 노트를 복습 대상으로 등록해주세요.');
        this.close();
        return;
      }

      // Calculate new SM-2 state
      const scheduler = this.plugin.getScheduler();
      const newState = scheduler.calculateNext(card, quality);

      // Update card
      const updatedCard = { ...card, sm2State: newState };
      const newLevel = scheduler.estimateRetentionLevel(updatedCard);

      // Add quiz review record
      card.reviewHistory.push({
        reviewedAt: new Date(),
        quality,
        mode: 'quiz',
      });

      card.sm2State = newState;
      card.retentionLevel = newLevel;
      card.lastModified = new Date();

      await repository.saveCard(card);

      new Notice(`퀴즈 결과가 반영되었습니다! 다음 복습: ${newState.interval}일 후`);
      this.plugin.updateBadge();
      this.close();
    } catch (error) {
      console.error('[SRS] Failed to apply quiz result:', error);
      new Notice('결과 반영 중 오류가 발생했습니다.');
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private getScoreLabel(score: number): string {
    if (score >= 90) return '완벽해요! 🎉';
    if (score >= 75) return '잘했어요! 👏';
    if (score >= 60) return '괜찮아요! 👍';
    if (score >= 40) return '더 노력해봐요! 💪';
    return '다시 복습해보세요! 📚';
  }

  private formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}초`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}분 ${secs}초`;
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}
