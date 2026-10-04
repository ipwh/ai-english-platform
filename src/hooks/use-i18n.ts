// ============================================
// useT() — React Hook for i18n (Client Component only)
// 響應式讀取 Zustand language store
// 用法: const { t, language } = useT();
//       t('key')           → 純翻譯
//       t('key', {n:5})    → 含變數替換
// ============================================
'use client';

import { useCallback } from 'react';
import { useUIStore } from '@/store/uiStore';
import { t as translate } from '@/shared/utils/i18n';

export function useT() {
  const language = useUIStore((s) => s.language);
  // Identity must be stable per language: callers put `t` in useCallback/useMemo/
  // useEffect dependency arrays, so a fresh function each render re-fires their
  // effects (infinite fetch loops, e.g. POST /api/ielts/attempts → 429).
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      if (!key) return '';
      let text = translate(key, language);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return text;
    },
    [language],
  );

  return { t, language };
}
