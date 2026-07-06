// ============================================
// 工具函數 — AI 英語學習平台
// ============================================

/**
 * 格式化日期為繁體中文格式
 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 格式化日期為簡短格式
 */
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
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
 * 取得熟悉度中文標籤
 */
export function getFamiliarityLabel(familiarity: string): string {
  const map: Record<string, string> = {
    'new': '新學',
    'learning': '學習中',
    'familiar': '已熟悉',
    'mastered': '已掌握',
  };
  return map[familiarity] || familiarity;
}

/**
 * 截斷文字
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

/**
 * 打招呼語（根據時段）
 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return '早晨';
  if (hour < 18) return '午安';
  return '晚安';
}
