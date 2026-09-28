// ============================================
// Tests: XP 事件政策（反刷分閘門）
// ============================================
// 對應 2026-09-28 事故：`POST /api/gamification` 從前完全採信客戶端 event，
// 只有 completeSession 帶去重鍵 → 一名學生反覆切換單字熟悉度刷得 95,904 XP。

import { describe, it, expect } from 'vitest';
import { resolveXpEventPolicy } from '../services/xp-event-policy';
import { CLIENT_XP_EVENT_TYPES, isClientXpEventType } from '../services/gamification';

/** 固定時間：2026-09-28 12:00 香港（= 04:00 UTC） */
const NOW = new Date('2026-09-28T04:00:00.000Z');
const STUDENT = 'stu-1';

function policyOf(type: unknown, metadata?: unknown) {
  const result = resolveXpEventPolicy(type, metadata, { studentId: STUDENT, now: NOW });
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.policy;
}

describe('resolveXpEventPolicy — 白名單', () => {
  it('拒絕未知事件', () => {
    expect(resolveXpEventPolicy('hackThePlanet', {}, { studentId: STUDENT, now: NOW }).ok).toBe(false);
  });

  it('拒絕缺少 type / null / 非字串', () => {
    expect(resolveXpEventPolicy(undefined, {}, { studentId: STUDENT, now: NOW }).ok).toBe(false);
    expect(resolveXpEventPolicy(null, {}, { studentId: STUDENT, now: NOW }).ok).toBe(false);
    expect(resolveXpEventPolicy(123, {}, { studentId: STUDENT, now: NOW }).ok).toBe(false);
  });

  it('客戶端白名單**不包含** completeSpelling（只能由伺服器發放）', () => {
    expect(isClientXpEventType('completeSpelling')).toBe(false);
    expect(resolveXpEventPolicy('completeSpelling', { spellingSessionId: 's1' }, { studentId: STUDENT, now: NOW }).ok).toBe(false);
    expect(CLIENT_XP_EVENT_TYPES).not.toContain('completeSpelling');
  });
});

describe('resolveXpEventPolicy — 伺服器建立、按學生界定的去重鍵', () => {
  it('masterWord 以 wordId 去重（同一單字只能領一次）', () => {
    const p = policyOf('masterWord', { wordId: 'w-1' });
    expect(p.idempotencyKey).toBe('stu-1:master-word:w-1');
    expect(p.identifiers).toEqual({ wordId: 'w-1' });
  });

  it('learnWord 以 wordId 去重', () => {
    expect(policyOf('learnWord', { wordId: 'w-2' }).idempotencyKey).toBe('stu-1:learn-word:w-2');
  });

  it('reviewMistake 以 mistakeId 去重', () => {
    expect(policyOf('reviewMistake', { mistakeId: 'm-9' }).idempotencyKey).toBe('stu-1:mistake-review:m-9');
  });

  it('answerCorrect / answerIncorrect 以 questionId 去重', () => {
    expect(policyOf('answerCorrect', { questionId: 'q-1' }).idempotencyKey).toBe('stu-1:answer:q-1');
    expect(policyOf('answerIncorrect', { questionId: 'q-1' }).idempotencyKey).toBe('stu-1:answer:q-1');
  });

  it('completeSession 以 sessionId 去重', () => {
    expect(policyOf('completeSession', { sessionId: 'sess-1' }).idempotencyKey).toBe('stu-1:practice-complete:sess-1');
  });

  it('缺少必填識別碼 ⇒ 拒絕（不再有「無鍵可重複領取」的路徑）', () => {
    const ctx = { studentId: STUDENT, now: NOW };
    expect(resolveXpEventPolicy('masterWord', {}, ctx).ok).toBe(false);
    expect(resolveXpEventPolicy('learnWord', undefined, ctx).ok).toBe(false);
    expect(resolveXpEventPolicy('reviewMistake', { mistakeId: '   ' }, ctx).ok).toBe(false);
    expect(resolveXpEventPolicy('answerCorrect', { questionId: '' }, ctx).ok).toBe(false);
    expect(resolveXpEventPolicy('completeSession', {}, ctx).ok).toBe(false);
  });

  it('識別碼會 trim', () => {
    expect(policyOf('masterWord', { wordId: '  w-3  ' }).idempotencyKey).toBe('stu-1:master-word:w-3');
  });

  it('鍵按學生界定 —— XpTransaction.idempotencyKey 為全庫唯一索引', () => {
    const a = resolveXpEventPolicy('masterWord', { wordId: 'w-shared' }, { studentId: 'stu-A', now: NOW });
    const b = resolveXpEventPolicy('masterWord', { wordId: 'w-shared' }, { studentId: 'stu-B', now: NOW });
    expect(a.ok && a.policy.idempotencyKey).toBe('stu-A:master-word:w-shared');
    expect(b.ok && b.policy.idempotencyKey).toBe('stu-B:master-word:w-shared');
    expect(a.ok && b.ok && a.policy.idempotencyKey === b.policy.idempotencyKey).toBe(false);
  });
});

describe('resolveXpEventPolicy — 每香港日一次的閘門', () => {
  it('dailyLogin / completeDiagnostic / submitWriting 各為一日一鍵', () => {
    expect(policyOf('dailyLogin').idempotencyKey).toBe('stu-1:daily-login:2026-09-28');
    expect(policyOf('completeDiagnostic').idempotencyKey).toBe('stu-1:diagnostic:2026-09-28');
    expect(policyOf('submitWriting').idempotencyKey).toBe('stu-1:writing:2026-09-28');
  });

  it('submitWriting 不採用客戶端 attemptId（可輪換 → 可刷）', () => {
    const p = policyOf('submitWriting', { attemptId: 'attacker-controlled' });
    expect(p.idempotencyKey).toBe('stu-1:writing:2026-09-28');
    expect(p.idempotencyKey).not.toContain('attacker-controlled');
  });

  it('香港日界線：UTC 16:00 之後已是香港翌日', () => {
    const lateUtc = new Date('2026-09-28T16:00:00.000Z'); // HK 2026-09-29 00:00
    const result = resolveXpEventPolicy('dailyLogin', {}, { studentId: STUDENT, now: lateUtc });
    expect(result.ok && result.policy.idempotencyKey).toBe('stu-1:daily-login:2026-09-29');
  });
});

describe('resolveXpEventPolicy — 客戶端不可偽造去重鍵', () => {
  it('客戶端提供的 idempotencyKey 一律被忽略', () => {
    const p = policyOf('masterWord', { wordId: 'w-1', idempotencyKey: 'free-xp-please' });
    expect(p.idempotencyKey).toBe('stu-1:master-word:w-1');
  });

  it('每日閘門事件的客戶端 idempotencyKey 亦被忽略', () => {
    const p = policyOf('dailyLogin', { idempotencyKey: 'free-xp-please' });
    expect(p.idempotencyKey).toBe('stu-1:daily-login:2026-09-28');
  });
});
