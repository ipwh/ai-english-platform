// ============================================
// 難度解析（伺服器權威）— 2026-09-28
// ============================================
// 病根：`POST /api/gamification` 從前直接採信客戶端 `event.difficulty`，
// 只要送 `difficulty: 'challenge'` 即可取得 1.5× XP（且無任何驗證）。
//
// 原則（與 `practice-authority-resolution.ts` 一致）：**難度由伺服器解析，
// 不信客戶端自報**。
//
// 已知限制（誠實記錄）：**只有 `GrammarQuestion` 有 `difficulty` 欄位**；
// `ReadingQuestion` / `ListeningQuestion` 的 schema 沒有難度概念 →
// 一律視為 `core`。無法解析（舊資料／mock 題／查詢失敗）亦回 `core`
// ——寧可少給，不可讓客戶端自行放大。
// ============================================

import { resolveGrammarQuestionDefinitions } from './grammar-question-service';

export type PracticeDifficulty = 'remedial' | 'core' | 'challenge';

/** 將任意字串正規化為已知難度（未知 ⇒ `core`）。 */
export function normalizePracticeDifficulty(value: unknown): PracticeDifficulty {
  return normalizeDifficulty(value) ?? 'core';
}

function normalizeDifficulty(value: unknown): PracticeDifficulty | null {
  return value === 'remedial' || value === 'core' || value === 'challenge' ? value : null;
}

/** 由單一正典題目解析難度（解析不到 ⇒ `core`）。 */
export async function resolveQuestionDifficulty(questionId: string): Promise<PracticeDifficulty> {
  const resolved = await resolveQuestionDifficulties([questionId]);
  return resolved.get(questionId.trim()) ?? 'core';
}

/**
 * 批次解析題目難度。回傳的 Map 只包含**解析得到難度**的題目
 * （閱讀／聆聽／未知 id 不會出現）。
 */
export async function resolveQuestionDifficulties(
  questionIds: string[],
): Promise<Map<string, PracticeDifficulty>> {
  const map = new Map<string, PracticeDifficulty>();
  const unique = Array.from(new Set(
    questionIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map(id => id.trim()),
  ));
  if (unique.length === 0) return map;
  try {
    const definitions = await resolveGrammarQuestionDefinitions(unique);
    for (const [id, def] of definitions) {
      const difficulty = normalizeDifficulty(def.difficulty);
      if (difficulty) map.set(id, difficulty);
    }
  } catch {
    // 查詢失敗一律回退 core（永不採信客戶端、也不阻斷 XP 流程）
  }
  return map;
}
