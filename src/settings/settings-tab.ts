/**
 * SRS Settings Tab
 * 섹션화된 설정 UI
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

    // 헤더
    containerEl.createEl('h1', { text: 'Spaced Repetition Scheduler' });
    containerEl.createEl('p', {
      text: 'SM-2 알고리즘 기반 간격 반복 학습 시스템',
      cls: 'setting-item-description',
    });

    // 섹션 렌더링
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
    containerEl.createEl('h2', { text: 'AI 설정' });

    const aiContainer = containerEl.createDiv('srs-settings-section');

    // Provider 선택
    new Setting(aiContainer)
      .setName('LLM Provider')
      .setDesc('퀴즈 생성에 사용할 AI 서비스')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('openai', 'OpenAI')
          .addOption('claude', 'Anthropic Claude')
          .addOption('gemini', 'Google Gemini')
          .addOption('grok', 'xAI Grok')
          .setValue(this.plugin.settings.ai.provider)
          .onChange(async (value) => {
            this.plugin.settings.ai.provider = value as AIProvider;
            // 기본 모델로 변경
            const models = PROVIDER_MODELS[value as AIProvider];
            if (models && models.length > 0) {
              this.plugin.settings.ai.model = models[0].id;
            }
            await this.plugin.saveSettings();
            this.display(); // UI 새로고침
          });
      });

    // API Key
    const provider = this.plugin.settings.ai.provider;
    const apiKeyName = this.getProviderDisplayName(provider);

    new Setting(aiContainer)
      .setName(`${apiKeyName} API Key`)
      .setDesc(`${apiKeyName} API 키를 입력하세요`)
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
          .setTooltip(`${apiKeyName} API 키 발급`)
          .onClick(() => {
            window.open(this.getProviderApiUrl(provider), '_blank');
          });
      });

    // Model 선택
    const models = PROVIDER_MODELS[provider] || [];
    new Setting(aiContainer)
      .setName('모델')
      .setDesc('사용할 AI 모델')
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

    // API 테스트 버튼
    new Setting(aiContainer)
      .setName('API 연결 테스트')
      .setDesc('API 키가 올바른지 확인합니다')
      .addButton((button) => {
        button
          .setButtonText('테스트')
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText('테스트 중...');

            try {
              const success = await this.plugin.testApiConnection();
              if (success) {
                new Notice('API 연결 성공!');
              } else {
                new Notice('API 연결 실패. 키를 확인해주세요.');
              }
            } catch (error) {
              new Notice(`오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
            }

            button.setDisabled(false);
            button.setButtonText('테스트');
          });
      });
  }

  // ===========================================================================
  // Review Settings Section
  // ===========================================================================

  private renderReviewSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: '복습 설정' });

    const reviewContainer = containerEl.createDiv('srs-settings-section');

    // 일일 복습 제한
    new Setting(reviewContainer)
      .setName('일일 복습 제한')
      .setDesc('하루에 복습할 최대 카드 수')
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

    // 새 카드 제한
    new Setting(reviewContainer)
      .setName('일일 새 카드')
      .setDesc('하루에 등록할 새 카드 수')
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

    // 유사 노트 그룹핑
    new Setting(reviewContainer)
      .setName('유사 노트 그룹핑')
      .setDesc('임베딩 기반으로 유사한 노트를 함께 복습 (Vault Embeddings 필요)')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.review.groupSimilar)
          .onChange(async (value) => {
            this.plugin.settings.review.groupSimilar = value;
            await this.plugin.saveSettings();
          });
      });

    // 유사도 임계값
    if (this.plugin.settings.review.groupSimilar) {
      new Setting(reviewContainer)
        .setName('유사도 임계값')
        .setDesc('그룹핑에 필요한 최소 유사도 (0.5 ~ 1.0)')
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

    // 새 노트 자동 등록
    new Setting(reviewContainer)
      .setName('새 노트 자동 등록')
      .setDesc('새로 생성된 노트를 자동으로 복습 대상에 추가')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.review.autoRegister)
          .onChange(async (value) => {
            this.plugin.settings.review.autoRegister = value;
            await this.plugin.saveSettings();
          });
      });

    // 제외 폴더
    new Setting(reviewContainer)
      .setName('제외 폴더')
      .setDesc('복습에서 제외할 폴더 (쉼표로 구분)')
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
    containerEl.createEl('h2', { text: '퀴즈 설정' });

    const quizContainer = containerEl.createDiv('srs-settings-section');

    // 퀴즈 활성화
    new Setting(quizContainer)
      .setName('퀴즈 활성화')
      .setDesc('AI 생성 퀴즈로 깊은 복습 모드 활성화')
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

    // 질문 수
    new Setting(quizContainer)
      .setName('질문 수')
      .setDesc('노트당 생성할 퀴즈 질문 수')
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

    // 질문 유형
    new Setting(quizContainer)
      .setName('질문 유형')
      .setDesc('생성할 질문 유형 선택')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.quiz.types.includes('multiple_choice'))
          .setTooltip('객관식')
          .onChange(async (value) => {
            this.updateQuizTypes('multiple_choice', value);
          });
      })
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.quiz.types.includes('true_false'))
          .setTooltip('참/거짓')
          .onChange(async (value) => {
            this.updateQuizTypes('true_false', value);
          });
      })
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.quiz.types.includes('open_ended'))
          .setTooltip('서술형')
          .onChange(async (value) => {
            this.updateQuizTypes('open_ended', value);
          });
      });

    // 언어
    new Setting(quizContainer)
      .setName('언어')
      .setDesc('퀴즈 생성 언어')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('ko', '한국어')
          .addOption('en', 'English')
          .setValue(this.plugin.settings.quiz.language)
          .onChange(async (value) => {
            this.plugin.settings.quiz.language = value as 'ko' | 'en';
            await this.plugin.saveSettings();
          });
      });

    // 난이도
    new Setting(quizContainer)
      .setName('난이도')
      .setDesc('퀴즈 난이도')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('easy', '쉬움')
          .addOption('medium', '중간')
          .addOption('hard', '어려움')
          .addOption('mixed', '혼합')
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
    containerEl.createEl('h2', { text: '알림 설정' });

    const notifContainer = containerEl.createDiv('srs-settings-section');

    // 알림 활성화
    new Setting(notifContainer)
      .setName('알림 활성화')
      .setDesc('복습 알림 받기')
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

    // 알림 시간
    new Setting(notifContainer)
      .setName('알림 시간')
      .setDesc('복습 알림을 받을 시간 (HH:MM)')
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

    // 배지 표시
    new Setting(notifContainer)
      .setName('배지 표시')
      .setDesc('리본 아이콘에 오늘 복습 수 표시')
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
    containerEl.createEl('h2', { text: '고급 설정' });

    const advContainer = containerEl.createDiv('srs-settings-section');

    // 디버그 모드
    new Setting(advContainer)
      .setName('디버그 모드')
      .setDesc('콘솔에 상세 로그 출력')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.advanced.debugMode)
          .onChange(async (value) => {
            this.plugin.settings.advanced.debugMode = value;
            await this.plugin.saveSettings();
          });
      });

    // 임베딩 캐시
    new Setting(advContainer)
      .setName('임베딩 캐시')
      .setDesc('임베딩 데이터를 메모리에 캐시하여 성능 향상')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.advanced.cacheEmbeddings)
          .onChange(async (value) => {
            this.plugin.settings.advanced.cacheEmbeddings = value;
            await this.plugin.saveSettings();
          });
      });

    // 히스토리 크기
    new Setting(advContainer)
      .setName('히스토리 크기')
      .setDesc('노트당 저장할 최대 복습 기록 수')
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

    // 설정 초기화
    new Setting(advContainer)
      .setName('설정 초기화')
      .setDesc('모든 설정을 기본값으로 되돌립니다')
      .addButton((button) => {
        button
          .setButtonText('초기화')
          .setWarning()
          .onClick(async () => {
            await this.plugin.resetSettings();
            new Notice('설정이 초기화되었습니다.');
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

    // 최소 하나는 선택되어야 함
    if (types.size === 0) {
      types.add('multiple_choice');
    }

    this.plugin.settings.quiz.types = Array.from(types);
    await this.plugin.saveSettings();
  }
}
