// ============================================
// XP 事件政策（伺服器端唯一 owner）
// ============================================
// 病根（2026-09-28 實證）：`POST /api/gamification` 從前直接採信客戶端送來的
// `event`（含 `type` / `difficulty` / `streakDays` / `metadata.idempotencyKey`），
// 且只有 `completeSession` 帶去重鍵。實測一名 S2 學生以反覆切換單字熟悉度
// （每次循環回到 mastered 即發 `masterWord`）刷出 **95,904 XP（佔其總分 94.7%）**，
// 同一分鐘最多 111 筆。
//
// 本檔為**純政策層**（無 DB、可單元測試），負責：
//   1. 事件白名單（未知事件一律拒絕）
//   2. 必填識別碼（questionId / mistakeId / wordId / attemptId / sessionId）
//   3. **伺服器建立**的去重鍵 —— 客戶端提供的 idempotencyKey 永不採用
//   4. 需要另設閘門的事件（每日登入／診斷＝每香港日一次）
//
// 難度與連續天數的「重新解析」需要 DB，於路由層完成（見
// `app/api/gamification/route.ts` + `exercise/services/question-difficulty-resolution.ts`），
// 本檔只負責「鍵」與「白名單」。
// ============================================

import { hkDayKey } from '@/shared/utils/hk-date';
import { isClientXpEventType, type ClientXpEventType } from './gamification';

export interface XpEventPolicy {
  type: ClientXpEventType;
  /**
   * 伺服器建立（永不採信客戶端）。**一律存在** —— 白名單內每個事件都有閘門
   * （識別碼去重或每香港日一次），不存在「無鍵可重複領取」的路徑。
   */
  idempotencyKey: string;
  /** 已驗證的識別碼（供審計寫入 metadata） */
  identifiers: Record<string, string>;
}

export type XpPolicyResult =
  | { ok: true; policy: XpEventPolicy }
  | { ok: false; error: string };

/** 需要識別碼才能去重的事件 → 鍵前綴 */
const REQUIRED_IDENTIFIER: Partial<Record<ClientXpEventType, { field: string; keyPrefix: string }>> = {
  answerCorrect: { field: 'questionId', keyPrefix: 'answer' },
  answerIncorrect: { field: 'questionId', keyPrefix: 'answer' },
  reviewMistake: { field: 'mistakeId', keyPrefix: 'mistake-review' },
  masterWord: { field: 'wordId', keyPrefix: 'master-word' },
  learnWord: { field: 'wordId', keyPrefix: 'learn-word' },
  completeSession: { field: 'sessionId', keyPrefix: 'practice-complete' },
};

function readMetadata(metadata: unknown): Record<string, unknown> {
  return typeof metadata === 'object' && metadata !== null ? (metadata as Record<string, unknown>) : {};
}

function readIdentifier(meta: Record<string, unknown>, field: string): string | null {
  const value = meta[field];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface XpPolicyContext {
  /**
   * 去重鍵必須**按學生界定** —— `XpTransaction.idempotencyKey` 是**全庫唯一**
   * 索引。若鍵不含學生 id，A 學生領過的鍵會令 B 學生永遠領不到
   * （共用 id 的 mock 題尤其明顯）。
   */
  studentId: string;
  /** 可注入以便測試香港日界線 */
  now?: Date;
}

/**
 * 解析並驗證一個客戶端 XP 事件。
 *
 * 注意：`metadata` 只用來取**識別碼**。客戶端送來的 `idempotencyKey`、
 * `streakDays`、`difficulty` 一律**忽略**（前者由伺服器重建，後兩者由路由
 * 重新解析）。
 */
export function resolveXpEventPolicy(
  rawType: unknown,
  metadata: unknown,
  context: XpPolicyContext,
): XpPolicyResult {
  if (!isClientXpEventType(rawType)) {
    return { ok: false, error: `未知的 XP 事件類型：${String(rawType ?? '(missing)')}` };
  }
  const meta = readMetadata(metadata);
  const now = context.now ?? new Date();
  const scope = context.studentId;

  // 每日登入：每香港日一次（鍵由伺服器建立；streakDays 由路由以 DB 重算）
  if (rawType === 'dailyLogin') {
    return {
      ok: true,
      policy: { type: rawType, idempotencyKey: `${scope}:daily-login:${hkDayKey(now)}`, identifiers: {} },
    };
  }

  // 診斷完成：每香港日一次（防止重複領取 50 XP）
  if (rawType === 'completeDiagnostic') {
    return {
      ok: true,
      policy: { type: rawType, idempotencyKey: `${scope}:diagnostic:${hkDayKey(now)}`, identifiers: {} },
    };
  }

  // 提交寫作：每香港日一次。
  // 刻意不依賴客戶端提供的 attemptId —— 客戶端可任意輪換 id，等於無限領取
  // 40 XP。以「每日一篇」為上限既不可繞過，亦符合「獎勵持續寫作、不獎勵連點」。
  if (rawType === 'submitWriting') {
    return {
      ok: true,
      policy: { type: rawType, idempotencyKey: `${scope}:writing:${hkDayKey(now)}`, identifiers: {} },
    };
  }

  const required = REQUIRED_IDENTIFIER[rawType];
  if (required) {
    const value = readIdentifier(meta, required.field);
    if (!value) {
      return { ok: false, error: `事件 ${rawType} 需要 metadata.${required.field}` };
    }
    return {
      ok: true,
      policy: {
        type: rawType,
        idempotencyKey: `${scope}:${required.keyPrefix}:${value}`,
        identifiers: { [required.field]: value },
      },
    };
  }

  // 白了但沒有閘門的事件 ⇒ 拒絕（防禦性；新增事件時必須同時加上閘門）
  return { ok: false, error: `事件 ${rawType} 未定義去重閘門，已拒絕` };
}
