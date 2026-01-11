/**
 * DashboardView
 * SRS Dashboard Sidebar View
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type SRSPlugin from '../main';
import type { ReviewCard, RetentionLevel } from '../core/domain/entities/review-card';

export const DASHBOARD_VIEW_TYPE = 'srs-dashboard-view';

interface DashboardStats {
  totalCards: number;
  dueToday: number;
  dueThisWeek: number;
  overdue: number;
  retentionDistribution: Record<RetentionLevel, number>;
  recentReviews: { date: string; count: number }[];
  streakDays: number;
}

export class DashboardView extends ItemView {
  private plugin: SRSPlugin;
  private stats: DashboardStats | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: SRSPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'SRS Dashboard';
  }

  getIcon(): string {
    return 'brain';
  }

  async onOpen(): Promise<void> {
    await this.loadStats();
    this.render();

    // Auto-refresh every 5 minutes
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, 5 * 60 * 1000);
  }

  async onClose(): Promise<void> {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async refresh(): Promise<void> {
    await this.loadStats();
    this.render();
  }

  // ===========================================================================
  // Data Loading
  // ===========================================================================

  private async loadStats(): Promise<void> {
    const repository = this.plugin.getReviewRepository();
    const cards = await repository.getAllCards();
    const scheduler = this.plugin.getScheduler();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Calculate due counts
    const dueCards = scheduler.getDueCards(cards);
    const overdueCards = scheduler.getOverdueCards(cards);

    const dueThisWeek = cards.filter((card) => {
      const nextReview = new Date(card.sm2State.nextReview);
      return nextReview >= today && nextReview <= weekEnd;
    }).length;

    // Retention distribution
    const retentionDistribution: Record<RetentionLevel, number> = {
      novice: 0,
      learning: 0,
      intermediate: 0,
      advanced: 0,
      mastered: 0,
    };

    cards.forEach((card) => {
      retentionDistribution[card.retentionLevel]++;
    });

    // Recent reviews (last 7 days)
    const recentReviews = this.calculateRecentReviews(cards);

    // Streak calculation
    const streakDays = this.calculateStreak(cards);

    this.stats = {
      totalCards: cards.length,
      dueToday: dueCards.length,
      dueThisWeek,
      overdue: overdueCards.length,
      retentionDistribution,
      recentReviews,
      streakDays,
    };
  }

  private calculateRecentReviews(cards: ReviewCard[]): { date: string; count: number }[] {
    const reviewsByDate = new Map<string, number>();

    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      reviewsByDate.set(dateStr, 0);
    }

    // Count reviews
    cards.forEach((card) => {
      card.reviewHistory.forEach((review) => {
        const dateStr = new Date(review.reviewedAt).toISOString().split('T')[0];
        if (reviewsByDate.has(dateStr)) {
          reviewsByDate.set(dateStr, (reviewsByDate.get(dateStr) || 0) + 1);
        }
      });
    });

    return Array.from(reviewsByDate.entries()).map(([date, count]) => ({
      date,
      count,
    }));
  }

  private calculateStreak(cards: ReviewCard[]): number {
    const reviewDates = new Set<string>();

    cards.forEach((card) => {
      card.reviewHistory.forEach((review) => {
        const dateStr = new Date(review.reviewedAt).toISOString().split('T')[0];
        reviewDates.add(dateStr);
      });
    });

    let streak = 0;
    const today = new Date();

    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];

      if (reviewDates.has(dateStr)) {
        streak++;
      } else if (i > 0) {
        // Allow skipping today if not reviewed yet
        break;
      }
    }

    return streak;
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('srs-dashboard');

    if (!this.stats) {
      container.createEl('div', { text: 'Loading...', cls: 'srs-loading' });
      return;
    }

    // Header
    this.renderHeader(container);

    // Quick Stats
    this.renderQuickStats(container);

    // Due Overview
    this.renderDueOverview(container);

    // Retention Distribution
    this.renderRetentionChart(container);

    // Recent Activity
    this.renderRecentActivity(container);

    // Quick Actions
    this.renderQuickActions(container);
  }

  private renderHeader(container: HTMLElement): void {
    const headerEl = container.createEl('div', { cls: 'srs-dashboard-header' });
    headerEl.createEl('h4', { text: 'Review Dashboard' });

    const refreshBtn = headerEl.createEl('button', {
      cls: 'srs-refresh-btn',
      attr: { 'aria-label': 'Refresh' },
    });
    refreshBtn.innerHTML = '🔄';
    refreshBtn.onclick = () => this.refresh();
  }

  private renderQuickStats(container: HTMLElement): void {
    if (!this.stats) return;

    const statsEl = container.createEl('div', { cls: 'srs-quick-stats' });

    // Streak
    if (this.stats.streakDays > 0) {
      const streakEl = statsEl.createEl('div', { cls: 'srs-streak' });
      streakEl.innerHTML = `🔥 ${this.stats.streakDays} day streak`;
    }

    // Stats grid
    const gridEl = statsEl.createEl('div', { cls: 'srs-stats-grid' });

    this.renderStatCard(gridEl, {
      value: this.stats.totalCards.toString(),
      label: 'Total Cards',
      icon: '📚',
    });

    this.renderStatCard(gridEl, {
      value: this.stats.dueToday.toString(),
      label: 'Due Today',
      icon: '📅',
      highlight: this.stats.dueToday > 0,
    });

    if (this.stats.overdue > 0) {
      this.renderStatCard(gridEl, {
        value: this.stats.overdue.toString(),
        label: 'Overdue',
        icon: '⚠️',
        warning: true,
      });
    }
  }

  private renderStatCard(
    container: HTMLElement,
    config: { value: string; label: string; icon: string; highlight?: boolean; warning?: boolean }
  ): void {
    const cardEl = container.createEl('div', {
      cls: `srs-stat-card ${config.highlight ? 'is-highlight' : ''} ${config.warning ? 'is-warning' : ''}`,
    });

    cardEl.createEl('span', { text: config.icon, cls: 'srs-stat-icon' });
    cardEl.createEl('div', { text: config.value, cls: 'srs-stat-value' });
    cardEl.createEl('div', { text: config.label, cls: 'srs-stat-label' });
  }

  private renderDueOverview(container: HTMLElement): void {
    if (!this.stats) return;

    const sectionEl = container.createEl('div', { cls: 'srs-section' });
    sectionEl.createEl('h5', { text: 'Review Schedule' });

    const listEl = sectionEl.createEl('div', { cls: 'srs-due-list' });

    const items = [
      { label: 'Today', count: this.stats.dueToday, cls: 'srs-due-today' },
      { label: 'This Week', count: this.stats.dueThisWeek, cls: 'srs-due-week' },
    ];

    if (this.stats.overdue > 0) {
      items.unshift({
        label: 'Overdue',
        count: this.stats.overdue,
        cls: 'srs-due-overdue',
      });
    }

    items.forEach((item) => {
      const itemEl = listEl.createEl('div', { cls: `srs-due-item ${item.cls}` });
      itemEl.createEl('span', { text: item.label });
      itemEl.createEl('span', {
        text: `${item.count}`,
        cls: 'srs-due-count',
      });
    });
  }

  private renderRetentionChart(container: HTMLElement): void {
    if (!this.stats) return;

    const sectionEl = container.createEl('div', { cls: 'srs-section' });
    sectionEl.createEl('h5', { text: 'Retention Distribution' });

    const chartEl = sectionEl.createEl('div', { cls: 'srs-retention-chart' });

    const levels: { level: RetentionLevel; emoji: string; name: string }[] = [
      { level: 'novice', emoji: '🌱', name: 'Novice' },
      { level: 'learning', emoji: '📚', name: 'Learning' },
      { level: 'intermediate', emoji: '🔄', name: 'Intermediate' },
      { level: 'advanced', emoji: '⭐', name: 'Advanced' },
      { level: 'mastered', emoji: '🏆', name: 'Mastered' },
    ];

    const total = this.stats.totalCards || 1;

    levels.forEach(({ level, emoji, name }) => {
      const count = this.stats!.retentionDistribution[level];
      const percent = Math.round((count / total) * 100);

      const barEl = chartEl.createEl('div', { cls: 'srs-retention-bar' });

      barEl.createEl('div', { cls: 'srs-bar-label' }).innerHTML = `
        <span class="srs-bar-emoji">${emoji}</span>
        <span class="srs-bar-name">${name}</span>
      `;

      const trackEl = barEl.createEl('div', { cls: 'srs-bar-track' });
      const fillEl = trackEl.createEl('div', {
        cls: `srs-bar-fill srs-level-${level}`,
      });
      fillEl.style.width = `${percent}%`;

      barEl.createEl('span', {
        text: `${count}`,
        cls: 'srs-bar-count',
      });
    });
  }

  private renderRecentActivity(container: HTMLElement): void {
    if (!this.stats) return;

    const sectionEl = container.createEl('div', { cls: 'srs-section' });
    sectionEl.createEl('h5', { text: 'Last 7 Days Activity' });

    const chartEl = sectionEl.createEl('div', { cls: 'srs-activity-chart' });

    const maxCount = Math.max(...this.stats.recentReviews.map((r) => r.count), 1);

    this.stats.recentReviews.forEach((review) => {
      const dayEl = chartEl.createEl('div', { cls: 'srs-activity-day' });

      const height = (review.count / maxCount) * 60;
      const barEl = dayEl.createEl('div', { cls: 'srs-activity-bar' });
      barEl.style.height = `${Math.max(height, 4)}px`;

      if (review.count > 0) {
        barEl.addClass('is-active');
      }

      // Day label (Mon, Tue, etc.)
      const date = new Date(review.date);
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      dayEl.createEl('span', {
        text: dayNames[date.getDay()],
        cls: 'srs-activity-label',
      });
    });
  }

  private renderQuickActions(container: HTMLElement): void {
    const sectionEl = container.createEl('div', { cls: 'srs-section srs-actions' });

    // Start review button
    const reviewBtn = sectionEl.createEl('button', {
      cls: 'mod-cta srs-action-btn',
    });
    reviewBtn.innerHTML = `📝 Start Review`;
    reviewBtn.onclick = () => {
      this.plugin.startReviewSession();
    };

    // Manual registration button not needed due to VE-based automatic tracking
  }
}
