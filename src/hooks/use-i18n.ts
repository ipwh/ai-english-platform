// ============================================
// useT() — React Hook for i18n (Client Component only)
// 響應式讀取 Zustand language store
// 用法: const { t, language } = useT();
//       t('key')           → 純翻譯
//       t('key', {n:5})    → 含變數替換
// ============================================
'use client';

import { useAppStore } from '@/store/appStore';
import { t } from '@/lib/i18n';

export function useT() {
  const language = useAppStore((s) => s.language);
  return {
    t: (key: string, vars?: Record<string, string | number>) => {
      let text = t(key, language);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    language,
  };
}
