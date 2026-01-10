/**
 * Quiz Generation Prompts
 * AI 퀴즈 생성용 프롬프트 템플릿
 */

import type { QuestionType, QuestionDifficulty } from '../../../core/domain/entities/quiz';
import type { QuizOptions } from '../../../core/domain/interfaces/quiz-generator.interface';

// =============================================================================
// System Prompts
// =============================================================================

export const QUIZ_SYSTEM_PROMPT_KO = `당신은 학습 효과를 극대화하는 퀴즈 생성 전문가입니다.

주어진 노트 내용을 분석하여 학습자의 이해도를 테스트하는 고품질 퀴즈를 생성합니다.

규칙:
1. 질문은 노트의 핵심 개념을 정확히 테스트해야 합니다
2. 답변은 노트 내용에서 직접 도출 가능해야 합니다
3. 객관식의 경우 오답도 그럴듯해야 합니다
4. 설명은 학습에 도움이 되어야 합니다
5. JSON 형식으로만 응답하세요`;

export const QUIZ_SYSTEM_PROMPT_EN = `You are an expert quiz generator focused on maximizing learning effectiveness.

Analyze the given note content and create high-quality quizzes to test learner comprehension.

Rules:
1. Questions must accurately test core concepts from the note
2. Answers must be directly derivable from the note content
3. For multiple choice, wrong options should be plausible
4. Explanations should aid learning
5. Respond only in JSON format`;

// =============================================================================
// User Prompt Templates
// =============================================================================

export function buildQuizUserPrompt(
  noteContent: string,
  options: QuizOptions
): string {
  const isKorean = options.language === 'ko';

  const typeDescriptions = isKorean
    ? buildTypeDescriptionsKo(options.types)
    : buildTypeDescriptionsEn(options.types);

  const difficultyInstruction = isKorean
    ? buildDifficultyInstructionKo(options.difficulty)
    : buildDifficultyInstructionEn(options.difficulty);

  const focusInstruction = options.focusKeywords?.length
    ? isKorean
      ? `\n특히 다음 키워드에 집중: ${options.focusKeywords.join(', ')}`
      : `\nFocus especially on these keywords: ${options.focusKeywords.join(', ')}`
    : '';

  if (isKorean) {
    return `다음 노트 내용을 기반으로 ${options.questionCount}개의 퀴즈 질문을 생성하세요.

## 노트 제목
${options.noteTitle || '(제목 없음)'}

## 노트 내용
${noteContent}

## 요구사항
- 질문 수: ${options.questionCount}개
- 허용 유형: ${typeDescriptions}
${difficultyInstruction}${focusInstruction}

## 응답 형식 (JSON)
{
  "questions": [
    {
      "type": "multiple_choice" | "true_false" | "open_ended" | "fill_blank",
      "question": "질문 내용",
      "options": ["선택지1", "선택지2", ...],  // 객관식만
      "correctAnswer": "정답",
      "explanation": "설명",
      "difficulty": "easy" | "medium" | "hard"
    }
  ]
}`;
  } else {
    return `Generate ${options.questionCount} quiz questions based on the following note content.

## Note Title
${options.noteTitle || '(Untitled)'}

## Note Content
${noteContent}

## Requirements
- Question count: ${options.questionCount}
- Allowed types: ${typeDescriptions}
${difficultyInstruction}${focusInstruction}

## Response Format (JSON)
{
  "questions": [
    {
      "type": "multiple_choice" | "true_false" | "open_ended" | "fill_blank",
      "question": "Question text",
      "options": ["Option1", "Option2", ...],  // multiple choice only
      "correctAnswer": "Correct answer",
      "explanation": "Explanation",
      "difficulty": "easy" | "medium" | "hard"
    }
  ]
}`;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function buildTypeDescriptionsKo(types: QuestionType[]): string {
  const typeMap: Record<QuestionType, string> = {
    multiple_choice: '객관식 (4지선다)',
    true_false: '참/거짓',
    open_ended: '서술형',
    fill_blank: '빈칸 채우기',
  };
  return types.map((t) => typeMap[t]).join(', ');
}

function buildTypeDescriptionsEn(types: QuestionType[]): string {
  const typeMap: Record<QuestionType, string> = {
    multiple_choice: 'Multiple Choice (4 options)',
    true_false: 'True/False',
    open_ended: 'Open-ended',
    fill_blank: 'Fill in the blank',
  };
  return types.map((t) => typeMap[t]).join(', ');
}

function buildDifficultyInstructionKo(
  difficulty: QuestionDifficulty | 'mixed'
): string {
  if (difficulty === 'mixed') {
    return '- 난이도: 쉬움/중간/어려움을 골고루 섞어서';
  }
  const diffMap: Record<QuestionDifficulty, string> = {
    easy: '쉬움 (기본 개념 확인)',
    medium: '중간 (적용 및 분석)',
    hard: '어려움 (종합 및 평가)',
  };
  return `- 난이도: ${diffMap[difficulty]}`;
}

function buildDifficultyInstructionEn(
  difficulty: QuestionDifficulty | 'mixed'
): string {
  if (difficulty === 'mixed') {
    return '- Difficulty: Mix of easy/medium/hard';
  }
  const diffMap: Record<QuestionDifficulty, string> = {
    easy: 'Easy (basic concept verification)',
    medium: 'Medium (application and analysis)',
    hard: 'Hard (synthesis and evaluation)',
  };
  return `- Difficulty: ${diffMap[difficulty]}`;
}

// =============================================================================
// Response Parsing
// =============================================================================

export interface ParsedQuizQuestion {
  type: QuestionType;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
  difficulty: QuestionDifficulty;
}

export interface ParsedQuizResponse {
  questions: ParsedQuizQuestion[];
}

/**
 * LLM 응답에서 JSON 추출 및 파싱
 */
export function parseQuizResponse(response: string): ParsedQuizResponse | null {
  try {
    // JSON 블록 추출 (```json ... ``` 또는 { ... })
    let jsonStr = response;

    // 마크다운 코드 블록 제거
    const jsonBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      jsonStr = jsonBlockMatch[1].trim();
    } else {
      // { } 사이 내용 추출
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
    }

    const parsed = JSON.parse(jsonStr) as ParsedQuizResponse;

    // 유효성 검사
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      console.error('[SRS] Invalid quiz response: missing questions array');
      return null;
    }

    // 각 질문 유효성 검사 및 정규화
    const validQuestions = parsed.questions.filter((q) => {
      if (!q.question || !q.correctAnswer || !q.type) {
        return false;
      }
      // 객관식은 options 필수
      if (q.type === 'multiple_choice' && (!q.options || q.options.length < 2)) {
        return false;
      }
      return true;
    });

    // 난이도 기본값 설정
    validQuestions.forEach((q) => {
      if (!['easy', 'medium', 'hard'].includes(q.difficulty)) {
        q.difficulty = 'medium';
      }
    });

    return { questions: validQuestions };
  } catch (error) {
    console.error('[SRS] Failed to parse quiz response:', error);
    return null;
  }
}

/**
 * 시스템 프롬프트 선택
 */
export function getSystemPrompt(language: 'en' | 'ko'): string {
  return language === 'ko' ? QUIZ_SYSTEM_PROMPT_KO : QUIZ_SYSTEM_PROMPT_EN;
}
