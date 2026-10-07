// ============================================
// IELTS 組別偏好 — 「記住上次組別」（client hook）
// ============================================
// 2026-10-07（使用者要求）：學生選過學術組／通用組之後，下次進入 IELTS
// 備考頁不必重新選擇（頁面仍可一鍵「更改組別」）。
//
// 以 `useSyncExternalStore` 讀取 localStorage：server snapshot 固定 `null`，
// 客戶端 hydration 後才套用真實值 → 不可能產生 hydration mismatch，
// 亦不需要 setState-in-effect（避免多餘 render 與 cascading render）。
// localStorage 不可用（隱私模式／停用）時一律回 `null`：只失去「記住」能力，
// 絕不影響練習。
'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type IeltsVariantPreference = 'ACADEMIC' | 'GENERAL_TRAINING';

/** 偏好鍵（版本化：日後改格式時換 key，不會讀到舊格式）。 */
export const IELTS_VARIANT_PREFERENCE_KEY = 'ielts.preferredVariant.v1';

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== 'undefined') window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', listener);
  };
}

/** 讀取已記住的組別；無法讀取或值不合法一律 `null`（絕不拋錯）。 */
export function readPreferredIeltsVariant(): IeltsVariantPreference | null {
  try {
    const raw = window.localStorage.getItem(IELTS_VARIANT_PREFERENCE_KEY);
    return raw === 'ACADEMIC' || raw === 'GENERAL_TRAINING' ? raw : null;
  } catch {
    return null;
  }
}

/** 記住組別（同分頁訂閱者會即時收到通知）。 */
export function writePreferredIeltsVariant(variant: IeltsVariantPreference): void {
  try {
    window.localStorage.setItem(IELTS_VARIANT_PREFERENCE_KEY, variant);
  } catch {
    /* 隱私模式：只失去「記住」能力，不影響練習 */
  }
  for (const listener of listeners) listener();
}

const getSnapshot = (): IeltsVariantPreference | null => readPreferredIeltsVariant();
const getServerSnapshot = (): IeltsVariantPreference | null => null;

/**
 * 回傳 `[記住的組別, 記住新選擇]`。
 * 首帧（server snapshot）為 `null`，hydration 後修正為實際偏好。
 */
export function usePreferredIeltsVariant(): [
  IeltsVariantPreference | null,
  (variant: IeltsVariantPreference) => void,
] {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const remember = useCallback((variant: IeltsVariantPreference) => {
    writePreferredIeltsVariant(variant);
  }, []);
  return [stored, remember];
}
