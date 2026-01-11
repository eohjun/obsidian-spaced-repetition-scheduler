/**
 * SRS Settings Tab
 * Sectioned settings UI
 */

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type SRSPlugin from '../main';
import type { AIProvider } from '../core/application/services/ai-service';
import type { QuestionType } from '../core/domain/entities/quiz';
import { PROVIDER_MODELS } from './settings';

export class SRSSettingTab extends PluginSettingTab {
  plugin: SRSPlugin;

  constructor(app: App, plugin: SRSPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('srs-settings');

    // Header
    containerEl.createEl('h1', { text: 'Spaced Repetition Scheduler' });
    containerEl.createEl('p', {
      text: 'Spaced repetition learning system based on SM-2 algorithm',
      cls: 'setting-item-description',
    });

    // Render sections
    this.renderAISection(containerEl);
    this.renderReviewSection(containerEl);
    this.renderQuizSection(containerEl);
    this.renderNotificationSection(containerEl);
    this.renderAdvancedSection(containerEl);
  }

  // ===========================================================================
  // AI Settings Section
  // ===========================================================================

  private renderAISection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'AI Settings' });

    const aiContainer = containerEl.createDiv('srs-settings-section');

    // Provider selection
    new Setting(aiContainer)
      .setName('LLM Provider')
      .setDesc('AI service to use for quiz generation')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('openai', 'OpenAI')
          .addOption('claude', 'Anthropic Claude')
          .addOption('gemini', 'Google Gemini')
          .addOption('grok', 'xAI Grok')
          .setValue(this.plugin.settings.ai.provider)
          .onChange(async (value) => {
            this.plugin.settings.ai.provider = value as AIProvider;
            // Change to default model
            const models = PROVIDER_MODELS[value as AIProvider];
            if (models && models.length > 0) {
              this.plugin.settings.ai.model = models[0].id;
            }
            await this.plugin.saveSettings();
            this.display(); // Refresh UI
          });
      });

    // API Key
    const provider = this.plugin.settings.ai.provider;
    const apiKeyName = this.getProviderDisplayName(provider);

    new Setting(aiContainer)
      .setName(`${apiKeyName} API Key`)
      .setDesc(`Enter your ${apiKeyName} API key`)
      .addText((text) => {
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.ai.apiKeys[provider] || '')
          .onChange(async (value) => {
            this.plugin.settings.ai.apiKeys[provider] = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      })
      .addExtraButton((button) => {
        button
          .setIcon('external-link')
          .setTooltip(`Get ${apiKeyName} API key`)
          .onClick(() => {
            window.open(this.getProviderApiUrl(provider), '_blank');
          });
      });

    // Model selection
    const models = PROVIDER_MODELS[provider] || [];
    new Setting(aiContainer)
      .setName('Model')
      .setDesc('AI model to use')
      .addDropdown((dropdown) => {
        models.forEach((model) => {
          dropdown.addOption(model.id, `${model.name}${model.description ? ` - ${model.description}` : ''}`);
        });
        dropdown
          .setValue(this.plugin.settings.ai.model)
          .onChange(async (value) => {
            this.plugin.settings.ai.model = value;
            await this.plugin.saveSettings();
          });
      });

    // API test button
    new Setting(aiContainer)
      .setName('Test API Connection')
      .setDesc('Verify that your API key is valid')
      .addButton((button) => {
        button
          .setButtonText('Test')
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText('Testing...');

            try {
              const success = await this.plugin.testApiConnection();
              if (success) {
                new Notice('API connection successful!');
              } else {
                new Notice('API connection failed. Please check your key.');
              }
            } catch (error) {
              new Notice(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

            button.setDisabled(false);
            button.setButtonText('Test');
          });
      });
  }

  // ===========================================================================
  // Review Settings Section
  // ===========================================================================

  private renderReviewSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Review Settings' });

    const reviewContainer = containerEl.createDiv('srs-settings-section');

    // Daily review limit
    new Setting(reviewContainer)
      .setName('Daily Review Limit')
      .setDesc('Maximum number of cards to review per day')
      .addSlider((slider) => {
        slider
          .setLimits(5, 100, 5)
          .setValue(this.plugin.settings.review.dailyLimit)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.review.dailyLimit = value;
            await this.plugin.saveSettings();
          });
      });

    // New cards limit
    new Setting(reviewContainer)
      .setName('Daily New Cards')
      .setDesc('Number of new cards to introduce per day')
      .addSlider((slider) => {
        slider
          .setLimits(1, 50, 1)
          .setValue(this.plugin.settings.review.newCardsPerDay)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.review.newCardsPerDay = value;
            await this.plugin.saveSettings();
          });
      });

    // Similar notes grouping
    new Setting(reviewContainer)
      .setName('Group Similar Notes')
      .setDesc('Review similar notes together based on embeddings (requires Vault Embeddings)')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.review.groupSimilar)
          .onChange(async (value) => {
            this.plugin.settings.review.groupSimilar = value;
            await this.plugin.saveSettings();
          });
      });

    // Similarity threshold
    if (this.plugin.settings.review.groupSimilar) {
      new Setting(reviewContainer)
        .setName('Similarity Threshold')
        .setDesc('Minimum similarity required for grouping (0.5 - 1.0)')
        .addSlider((slider) => {
          slider
            .setLimits(0.5, 1.0, 0.05)
            .setValue(this.plugin.settings.review.similarityThreshold)
            .setDynamicTooltip()
            .onChange(async (value) => {
              this.plugin.settings.review.similarityThreshold = value;
              await this.plugin.saveSettings();
            });
        });
    }

    // Automatic registration not needed due to VE integration (Vault Embeddings automatically tracks all notes)

    // Exclude folders
    new Setting(reviewContainer)
      .setName('Exclude Folders')
      .setDesc('Folders to exclude from review (comma-separated)')
      .addText((text) => {
        text
          .setPlaceholder('templates, attachments')
          .setValue(this.plugin.settings.excludeFolders.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.excludeFolders = value
              .split(',')
              .map((f) => f.trim())
              .filter((f) => f.length > 0);
            await this.plugin.saveSettings();
          });
      });
  }

  // ===========================================================================
  // Quiz Settings Section
  // ===========================================================================

  private renderQuizSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Quiz Settings' });

    const quizContainer = containerEl.createDiv('srs-settings-section');

    // Enable quiz
    new Setting(quizContainer)
      .setName('Enable Quiz')
      .setDesc('Enable deep review mode with AI-generated quizzes')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.quiz.enabled)
          .onChange(async (value) => {
            this.plugin.settings.quiz.enabled = value;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (!this.plugin.settings.quiz.enabled) return;

    // Question count
    new Setting(quizContainer)
      .setName('Question Count')
      .setDesc('Number of quiz questions to generate per note')
      .addSlider((slider) => {
        slider
          .setLimits(1, 10, 1)
          .setValue(this.plugin.settings.quiz.questionCount)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.quiz.questionCount = value;
            await this.plugin.saveSettings();
          });
      });

    // Question types header
    new Setting(quizContainer)
      .setName('Question Types')
      .setDesc('Select the types of questions to generate (at least 1 required)')
      .setHeading();

    // Multiple choice
    new Setting(quizContainer)
      .setName('Multiple Choice')
      .setDesc('4-option multiple choice questions')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.quiz.types.includes('multiple_choice'))
          .onChange(async (value) => {
            this.updateQuizTypes('multiple_choice', value);
          });
      });

    // True/False
    new Setting(quizContainer)
      .setName('True/False')
      .setDesc('Questions to select true or false')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.quiz.types.includes('true_false'))
          .onChange(async (value) => {
            this.updateQuizTypes('true_false', value);
          });
      });

    // Open-ended
    new Setting(quizContainer)
      .setName('Open-ended')
      .setDesc('Questions requiring written answers')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.quiz.types.includes('open_ended'))
          .onChange(async (value) => {
            this.updateQuizTypes('open_ended', value);
          });
      });

    // Language
    new Setting(quizContainer)
      .setName('Language')
      .setDesc('Language for quiz generation')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('ko', 'Korean')
          .addOption('en', 'English')
          .setValue(this.plugin.settings.quiz.language)
          .onChange(async (value) => {
            this.plugin.settings.quiz.language = value as 'ko' | 'en';
            await this.plugin.saveSettings();
          });
      });

    // Difficulty
    new Setting(quizContainer)
      .setName('Difficulty')
      .setDesc('Quiz difficulty level')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('easy', 'Easy')
          .addOption('medium', 'Medium')
          .addOption('hard', 'Hard')
          .addOption('mixed', 'Mixed')
          .setValue(this.plugin.settings.quiz.difficulty)
          .onChange(async (value) => {
            this.plugin.settings.quiz.difficulty = value as 'easy' | 'medium' | 'hard' | 'mixed';
            await this.plugin.saveSettings();
          });
      });
  }

  // ===========================================================================
  // Notification Settings Section
  // ===========================================================================

  private renderNotificationSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Notification Settings' });

    const notifContainer = containerEl.createDiv('srs-settings-section');

    // Enable notifications
    new Setting(notifContainer)
      .setName('Enable Notifications')
      .setDesc('Receive review reminders')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.notifications.enabled)
          .onChange(async (value) => {
            this.plugin.settings.notifications.enabled = value;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (!this.plugin.settings.notifications.enabled) return;

    // Reminder time
    new Setting(notifContainer)
      .setName('Reminder Time')
      .setDesc('Time to receive review reminders (HH:MM)')
      .addText((text) => {
        text
          .setPlaceholder('09:00')
          .setValue(this.plugin.settings.notifications.reminderTime)
          .onChange(async (value) => {
            const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
            if (timeRegex.test(value)) {
              this.plugin.settings.notifications.reminderTime = value;
              await this.plugin.saveSettings();
            }
          });
      });

    // Show badge
    new Setting(notifContainer)
      .setName('Show Badge')
      .setDesc('Show today\'s review count on the ribbon icon')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.notifications.showBadge)
          .onChange(async (value) => {
            this.plugin.settings.notifications.showBadge = value;
            await this.plugin.saveSettings();
          });
      });
  }

  // ===========================================================================
  // Advanced Settings Section
  // ===========================================================================

  private renderAdvancedSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Advanced Settings' });

    const advContainer = containerEl.createDiv('srs-settings-section');

    // Debug mode
    new Setting(advContainer)
      .setName('Debug Mode')
      .setDesc('Output detailed logs to console')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.advanced.debugMode)
          .onChange(async (value) => {
            this.plugin.settings.advanced.debugMode = value;
            await this.plugin.saveSettings();
          });
      });

    // Embedding cache
    new Setting(advContainer)
      .setName('Embedding Cache')
      .setDesc('Cache embedding data in memory for improved performance')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.advanced.cacheEmbeddings)
          .onChange(async (value) => {
            this.plugin.settings.advanced.cacheEmbeddings = value;
            await this.plugin.saveSettings();
          });
      });

    // History size
    new Setting(advContainer)
      .setName('History Size')
      .setDesc('Maximum number of review records to store per note')
      .addSlider((slider) => {
        slider
          .setLimits(10, 100, 10)
          .setValue(this.plugin.settings.advanced.maxHistorySize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.advanced.maxHistorySize = value;
            await this.plugin.saveSettings();
          });
      });

    // Reset settings
    new Setting(advContainer)
      .setName('Reset Settings')
      .setDesc('Reset all settings to default values')
      .addButton((button) => {
        button
          .setButtonText('Reset')
          .setWarning()
          .onClick(async () => {
            await this.plugin.resetSettings();
            new Notice('Settings have been reset.');
            this.display();
          });
      });
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private getProviderDisplayName(provider: AIProvider): string {
    const names: Record<AIProvider, string> = {
      openai: 'OpenAI',
      claude: 'Anthropic',
      gemini: 'Google',
      grok: 'xAI',
    };
    return names[provider];
  }

  private getProviderApiUrl(provider: AIProvider): string {
    const urls: Record<AIProvider, string> = {
      openai: 'https://platform.openai.com/api-keys',
      claude: 'https://console.anthropic.com/settings/keys',
      gemini: 'https://aistudio.google.com/app/apikey',
      grok: 'https://console.x.ai/',
    };
    return urls[provider];
  }

  private async updateQuizTypes(type: QuestionType, enabled: boolean): Promise<void> {
    const types = new Set(this.plugin.settings.quiz.types);

    if (enabled) {
      types.add(type);
    } else {
      types.delete(type);
    }

    // At least one must be selected
    if (types.size === 0) {
      types.add('multiple_choice');
    }

    this.plugin.settings.quiz.types = Array.from(types);
    await this.plugin.saveSettings();
  }
}
