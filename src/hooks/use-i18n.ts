// ============================================
// useT() — React Hook for i18n (Client Component only)
// 響應式讀取 Zustand language store
// 用法: const { t, language } = useT();
// ============================================
'use client';

import { useAppStore } from '@/store/appStore';
import { t } from '@/lib/i18n';

export function useT() {
  const language = useAppStore((s) => s.language);
  return { t: (key: string) => t(key, language), language };
}
