// ============================================
// 全新資料庫佈建前置判定 — 契約測試（Sprint 135，P0）
// ============================================
// 守住的四個情境（mandate 要求「足以區分空庫／既有庫／漂移／重跑」）：
//   1. 空庫                    → 允許佈建
//   2. 既有庫（有遷移歷史）     → 拒絕（歷史永不被覆蓋）
//   3. 半成品（有表、無歷史）   → 拒絕
//   4. 佈建腳本必須使用本判定（單一 owner，源碼掃描）
// 「重跑」與「漂移」由 `scripts/db-provision-fresh.ts` 的實作步驟 4、5 驗證
// （`migrate deploy` no-op ＋ `migrate diff --exit-code` = 0），本檔守住判定層。
// ============================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FRESH_PROVISION_REFUSED_EXIT_CODE,
  evaluateFreshProvisionPreflight,
} from '../fresh-provision-preflight';

describe('evaluateFreshProvisionPreflight', () => {
  it('允許完全空白的資料庫（無歷史、無資料表）', () => {
    const decision = evaluateFreshProvisionPreflight({
      hasMigrationHistory: false,
      existingTables: [],
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('EMPTY_DATABASE');
    expect(decision.reason).toContain('空白');
  });

  it('拒絕已有遷移歷史的資料庫（即使零張表）——既有歷史永不觸碰', () => {
    const decision = evaluateFreshProvisionPreflight({
      hasMigrationHistory: true,
      existingTables: [],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('HAS_MIGRATION_HISTORY');
    expect(decision.reason).toContain('_prisma_migrations');
  });

  it('歷史優先於資料表：兩者皆存在時回報遷移歷史', () => {
    const decision = evaluateFreshProvisionPreflight({
      hasMigrationHistory: true,
      existingTables: ['User', 'StudentMastery'],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('HAS_MIGRATION_HISTORY');
  });

  it('拒絕有資料表但無遷移歷史的半成品資料庫，並列出表名', () => {
    const decision = evaluateFreshProvisionPreflight({
      hasMigrationHistory: false,
      existingTables: ['User', 'Class'],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('HAS_EXISTING_TABLES');
    expect(decision.reason).toContain('User');
    expect(decision.reason).toContain('Class');
  });

  it('表名過多時只列前五張並附總數', () => {
    const tables = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'];
    const decision = evaluateFreshProvisionPreflight({
      hasMigrationHistory: false,
      existingTables: tables,
    });

    expect(decision.reason).toContain('共 8 張');
    expect(decision.reason).not.toContain('t6');
  });

  it('不變式：allowed 為 true 若且唯若 code 為 EMPTY_DATABASE', () => {
    const probes = [
      { hasMigrationHistory: false, existingTables: [] },
      { hasMigrationHistory: true, existingTables: [] },
      { hasMigrationHistory: false, existingTables: ['x'] },
      { hasMigrationHistory: true, existingTables: ['x'] },
    ] as const;

    for (const probe of probes) {
      const decision = evaluateFreshProvisionPreflight(probe);
      expect(decision.allowed).toBe(decision.code === 'EMPTY_DATABASE');
    }
  });

  it('不變式：判定為純函式，不更動傳入的資料表陣列', () => {
    const tables = ['Zeta', 'Alpha'];
    evaluateFreshProvisionPreflight({ hasMigrationHistory: false, existingTables: tables });

    expect(tables).toEqual(['Zeta', 'Alpha']);
  });

  it('拒絕退出碼與其他結果碼區分（3 ≠ 0/1/2）', () => {
    expect(FRESH_PROVISION_REFUSED_EXIT_CODE).toBe(3);
    expect(new Set([0, 1, 2, FRESH_PROVISION_REFUSED_EXIT_CODE]).size).toBe(4);
  });
});

describe('佈建腳本使用單一 owner 判定（源碼掃描）', () => {
  const scriptPath = join(
    import.meta.dirname ?? __dirname,
    '..', '..', '..', '..', 'scripts', 'db-provision-fresh.ts'
  );

  it('scripts/db-provision-fresh.ts 匯入並呼叫 evaluateFreshProvisionPreflight', () => {
    const source = readFileSync(scriptPath, 'utf8');

    // 規則一律解析 import 指定子（不得用整檔 includes 判斷匯入方向）
    expect(source).toMatch(
      /from\s+['"]@\/shared\/db\/fresh-provision-preflight['"]/
    );
    expect(source).toContain('evaluateFreshProvisionPreflight(');
    expect(source).toContain('FRESH_PROVISION_REFUSED_EXIT_CODE');
  });

  it('佈建腳本預設 dry-run：不得在非 --apply 路徑呼叫 resolve/deploy 的寫入', () => {
    const source = readFileSync(scriptPath, 'utf8');

    expect(source).toContain("'--apply'");
    expect(source).toMatch(/if\s*\(!apply\)/);
  });
});
