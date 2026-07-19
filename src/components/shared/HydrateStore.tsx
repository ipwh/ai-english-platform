'use client';

// ============================================
// HydrateStore — 在客戶端 mount 後載入 localStorage 偏好設定
// 避免 SSR hydration mismatch（React Error #418）
// ============================================

import { useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';

export function HydrateStore() {
  const hydrateStoredPrefs = useUIStore((s) => s.hydrateStoredPrefs);

  useEffect(() => {
    hydrateStoredPrefs();
  }, [hydrateStoredPrefs]);

  return null;
}
