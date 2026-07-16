// ============================================
// Chinglish 檢測模組 — Rule-based 中式英文前置檢測
// 從 chinglish-rules.json 讀取規則，支援教師自訂
//
// 使用方式：
//   import { detectChinglish, loadChinglishRules } from '@/lib/chinglish';
//   const warnings = detectChinglish(studentText);
// ============================================

import chinglishRules from '@/lib/chinglish-rules.json';

export interface ChinglishWarning {
  /** 錯誤模式標籤 */
  pattern: string;
  /** 實際找到的文字 */
  found: string;
  /** 修正建議 */
  suggestion: string;
}

export interface ChinglishRule {
  id: string;
  pattern: string;
  flags: string;
  suggestion: string;
  label: string;
  enabled: boolean;
}

/**
 * 載入已啟用的 Chinglish 規則（從 JSON 設定檔）
 * 教師可編輯 chinglish-rules.json 來新增/修改/停用規則
 */
export function loadChinglishRules(): { regex: RegExp; suggestion: string; label: string }[] {
  return (chinglishRules.rules as ChinglishRule[])
    .filter(r => r.enabled)
    .map(r => ({
      regex: new RegExp(r.pattern, r.flags),
      suggestion: r.suggestion,
      label: r.label,
    }));
}

// 啟動時載入規則（快取，避免反覆讀取）
let _cachedRules: { regex: RegExp; suggestion: string; label: string }[] | null = null;

function getRules(): { regex: RegExp; suggestion: string; label: string }[] {
  if (!_cachedRules) {
    _cachedRules = loadChinglishRules();
  }
  return _cachedRules;
}

/**
 * 清除規則快取（用於測試或熱重載規則）
 */
export function clearRulesCache(): void {
  _cachedRules = null;
}

/**
 * 對學生寫作進行 rule-based Chinglish 前置檢測。
 * 回傳檢測到的警告清單，可在 AI 批改前或後補充使用。
 */
export function detectChinglish(text: string): ChinglishWarning[] {
  const rules = getRules();
  const warnings: ChinglishWarning[] = [];
  for (const rule of rules) {
    const match = text.match(rule.regex);
    if (match) {
      warnings.push({
        pattern: rule.label,
        found: match[0],
        suggestion: rule.suggestion,
      });
    }
  }
  return warnings;
}
