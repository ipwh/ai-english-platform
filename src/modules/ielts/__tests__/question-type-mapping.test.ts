// ============================================
// 2026-10-08：IELTS 題型名稱對照契約測試（resolveIeltsQuestionType — 單一 owner）
//
// 事故（學生回報「未能生成完整組件（40 題）」→ 422 GENERATION_EMPTY）：
// AI 出題提示詞（`ai/prompts/ielts/question-generation.ts`）使用**不帶技能前綴**的
// 官方題型名稱（sentence_completion…），而正典（validator／scorer／資料庫）一律使用
// **帶技能前綴**的名稱（reading_sentence_completion…）。兩者之間**沒有任何對照**，
// 於是 AI 產出的每一題都被機器屏檢判 QUESTION_TYPE_NOT_ALLOWED；若繞過屏檢，
// 評分器則判 `ungradable` → VERIFY_ANSWER_MISMATCH ⇒ 整份組件全軍覆沒。
//
// 本測試以「提示詞實際使用的名稱」逐一驗證對照結果（清單必須與提示詞同步更新）。
// ============================================
import { describe, expect, it } from 'vitest';
import { isIeltsObjectiveType, resolveIeltsQuestionType } from '../domain/types';
import { scoreIeltsItem } from '../scoring/objective-scorer';

/** AI 提示詞實際使用的題型名稱（不帶技能前綴；見 prompts/ielts/question-generation.ts） */
const PROMPT_VOCABULARY = {
  READING: [
    'true_false_not_given',
    'yes_no_not_given',
    'multiple_choice',
    'matching_information',
    'matching_headings',
    'matching_features',
    'matching_sentence_endings',
    'sentence_completion',
    'summary_note_table_flowchart_completion',
    'short_answer',
  ],
  LISTENING: [
    'multiple_choice',
    'matching',
    'form_note_table_flowchart_completion',
    'sentence_completion',
    'short_answer',
    'plan_map_diagram_labelling',
  ],
} as const;

describe('resolveIeltsQuestionType — 提示詞詞彙 → 正典名稱', () => {
  for (const [skill, names] of Object.entries(PROMPT_VOCABULARY)) {
    for (const name of names) {
      it(`${skill}: ${name} → ${skill.toLowerCase()}_${name}`, () => {
        const canonical = resolveIeltsQuestionType(skill as 'READING' | 'LISTENING', name);
        expect(canonical).toBe(`${skill.toLowerCase()}_${name}`);
        // 對照後必須是可評分（非 ungradable）的客觀題型 —— 這正是事故的關鍵。
        expect(canonical && isIeltsObjectiveType(canonical)).toBe(true);
      });
    }
  }

  it('觀題型即使未經對照也會被判 ungradable（事故的評分器端症狀）', () => {
    const scored = scoreIeltsItem('TRUE', {
      questionType: 'true_false_not_given' as never,
      answerKey: 'TRUE',
    });
    expect(scored.verdict).toBe('ungradable');
  });

  it('對照後同一個答案可正常評分', () => {
    const scored = scoreIeltsItem('TRUE', {
      questionType: 'reading_true_false_not_given',
      answerKey: 'TRUE',
    });
    expect(scored.verdict).toBe('correct');
  });

  it('已帶前綴（或正規化後）的名稱原樣接受', () => {
    expect(resolveIeltsQuestionType('READING', 'reading_sentence_completion')).toBe('reading_sentence_completion');
    expect(resolveIeltsQuestionType('LISTENING', 'Listening-Multiple Choice')).toBe('listening_multiple_choice');
    expect(resolveIeltsQuestionType('LISTENING', '  FORM_NOTE_TABLE_FLOWCHART_COMPLETION ')).toBe('listening_form_note_table_flowchart_completion');
  });

  it('未知題型回 null（呼叫端必須逐題丟棄，fail-closed）', () => {
    expect(resolveIeltsQuestionType('READING', 'essay_writing')).toBeNull();
    expect(resolveIeltsQuestionType('READING', '')).toBeNull();
    // 跨技能不得誤判：閱讀技能不得產生 listening_* 題型
    expect(resolveIeltsQuestionType('READING', 'listening_short_answer')).toBeNull();
  });

  it('寫作／口說任務單元亦由同一 owner 解析', () => {
    expect(resolveIeltsQuestionType('WRITING', 'writing_task')).toBe('writing_task');
    expect(resolveIeltsQuestionType('SPEAKING', 'speaking_task')).toBe('speaking_task');
  });
});
