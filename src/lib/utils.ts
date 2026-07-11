// ============================================
// 工具函數 — AI 英語學習平台
// ============================================

/**
 * 格式化日期（支援中英雙語 + 無效日期保護）
 */
export function formatDate(dateStr: string, lang: string = 'zh'): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  if (lang === 'en') {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 格式化日期為簡短格式
 */
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 計算剩餘天數
 */
export function daysRemaining(dueDateStr: string): number {
  const now = new Date();
  const due = new Date(dueDateStr);
  const diff = due.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * 取得狀態對應顏色類別
 */
export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    'not-started': 'bg-gray-100 text-gray-600',
    'in-progress': 'bg-blue-100 text-blue-700',
    'completed': 'bg-green-100 text-green-700',
    'overdue': 'bg-red-100 text-red-700',
    'pending': 'bg-yellow-100 text-yellow-700',
    'reviewed': 'bg-green-100 text-green-700',
    'returned': 'bg-orange-100 text-orange-700',
  };
  return map[status] || 'bg-gray-100 text-gray-600';
}

/**
 * 取得風險等級顏色
 */
export function getRiskColor(risk: string): string {
  const map: Record<string, string> = {
    'high': 'bg-red-100 text-red-700',
    'medium': 'bg-yellow-100 text-yellow-700',
    'low': 'bg-green-100 text-green-700',
  };
  return map[risk] || 'bg-gray-100 text-gray-600';
}

/**
 * 取得熟悉度顏色
 */
export function getFamiliarityColor(familiarity: string): string {
  const map: Record<string, string> = {
    'new': 'bg-red-100 text-red-700',
    'learning': 'bg-yellow-100 text-yellow-700',
    'familiar': 'bg-blue-100 text-blue-700',
    'mastered': 'bg-green-100 text-green-700',
  };
  return map[familiarity] || 'bg-gray-100 text-gray-600';
}

/**
 * 取得熟悉度標籤（支援中英雙語）
 */
export function getFamiliarityLabel(familiarity: string, lang: string = 'zh'): string {
  const map: Record<string, { zh: string; en: string }> = {
    'new': { zh: '新學', en: 'New' },
    'learning': { zh: '學習中', en: 'Learning' },
    'familiar': { zh: '已熟悉', en: 'Familiar' },
    'mastered': { zh: '已掌握', en: 'Mastered' },
  };
  const entry = map[familiarity];
  if (!entry) return familiarity;
  return lang === 'en' ? entry.en : entry.zh;
}

/**
 * 截斷文字
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

/**
 * 打招呼語（根據香港時段 UTC+8，確保 SSR/CSR 一致）
 */
export function getGreeting(): string {
  // 使用 UTC 時間 +8 小時模擬香港時區，避免伺服器/客戶端時區差異導致 hydration mismatch
  const now = new Date();
  const hkHour = (now.getUTCHours() + 8) % 24;
  if (hkHour < 12) return '早晨';
  if (hkHour < 18) return '午安';
  return '晚安';
}
