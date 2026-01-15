# Spaced Repetition Scheduler

An Obsidian plugin for scientific spaced repetition learning with SM-2 algorithm, AI quiz generation, and review statistics.

## Features

- **SM-2 Algorithm**: Scientific review scheduling based on SuperMemo 2 algorithm
- **Flashcard System**: Create flashcards from notes or text selections
- **AI Quiz Generation**: Automatic quiz creation with multiple question types
- **Review Statistics**: Dashboard with heatmap visualization and learning analytics
- **Daily Review Limits**: Configurable daily review and new card limits
- **Similar Note Grouping**: Group related notes using embedding similarity

## PKM Workflow

```
Note Content → Spaced Repetition Scheduler → Long-term Memory
                       ↓
              ┌────────┴────────┐
              ↓                 ↓
         Flashcards         AI Quiz
              ↓                 ↓
         SM-2 Review       Statistics
         Scheduling        Dashboard
```

## Supported AI Providers

| Provider | Model | Notes |
|----------|-------|-------|
| **OpenAI** | GPT-4o-mini | Default, fast quiz generation |
| **OpenAI** | GPT-4o | Higher quality questions |
| **Google Gemini** | Gemini 1.5 Pro/Flash | Alternative provider |
| **Anthropic** | Claude 3.5 Sonnet | Deep understanding |

## Installation

### BRAT (Recommended)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Open BRAT settings
3. Click "Add Beta plugin"
4. Enter: `eohjun/obsidian-spaced-repetition-scheduler`
5. Enable the plugin

### Manual

1. Download `main.js`, `manifest.json`, `styles.css` from the latest release
2. Create folder: `<vault>/.obsidian/plugins/spaced-repetition-scheduler/`
3. Copy downloaded files to the folder
4. Enable the plugin in Obsidian settings

## Setup

### API Key Configuration

1. Open Settings → Spaced Repetition Scheduler
2. In **AI Provider** section:
   - Select AI Provider (OpenAI, Gemini, or Anthropic)
   - Enter API key

## Commands

| Command | Description |
|---------|-------------|
| **Start Review Session** | Begin today's review with flashcards |
| **Open Dashboard** | View statistics, heatmap, and analytics |
| **Generate Quiz for This Note** | Create AI-generated quiz for active note |
| **Show Notes Due Today** | List all notes due for review today |

## Usage Workflow

```
1. Create flashcards:
   - From note: Use command palette
   - From selection: Select text → Right-click → Create card
2. Start daily review session
3. Rate your recall (Again, Hard, Good, Easy)
4. SM-2 algorithm calculates next review date
5. Track progress on Dashboard
```

## SM-2 Algorithm

The plugin implements SuperMemo 2 algorithm:

- **Ease Factor**: Quality-based adjustment (1.3 - 2.5)
- **Interval Calculation**: `I(n) = I(n-1) × EF`
- **Quality Ratings**: 0-5 scale mapped to Again/Hard/Good/Easy

## Quiz Types

- **Multiple Choice**: 4 options, single correct answer
- **True/False**: Binary questions
- **Fill in the Blank**: Complete the sentence
- **Short Answer**: Open-ended questions

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **AI Provider** | Quiz generation provider | OpenAI |
| **API Key** | Provider API key | - |
| **Daily Limit** | Max reviews per day | 20 |
| **New Cards/Day** | New cards introduced daily | 10 |
| **Group Similar** | Group similar notes together | true |
| **Similarity Threshold** | Grouping similarity threshold | 0.7 |
| **Quiz Language** | Quiz question language | en |
| **Quiz Difficulty** | Question difficulty level | medium |
| **Reminder Time** | Daily review reminder | 09:00 |
| **Excluded Folders** | Folders to exclude | - |

## Related Plugins

This plugin works well with:

- **[Learning Path Generator](https://github.com/eohjun/obsidian-learning-path-generator)**: Review notes in learning path order
- **[Evergreen Note Cultivator](https://github.com/eohjun/obsidian-evergreen-note-cultivator)**: Prioritize high-quality notes for review
- **[Vault Embeddings](https://github.com/eohjun/obsidian-vault-embeddings)**: Similar note grouping (optional)

## Development

```bash
# Install dependencies
npm install

# Development with watch mode
npm run dev

# Production build
npm run build
```

## License

MIT
