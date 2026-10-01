// ============================================
// 練習歷史（月／日）顯示格式化 — 學生端與教師端共用（單一來源）
// ============================================
// 2026-10-01：學生「我的進度」與教師「學生詳情」共用同一個逐日歷史瀏覽 UI，
// 日／月標籤與時間格式必須一致（兩個頁面各自實作會漂移）。
// 日期字串皆以 UTC 解析（`YYYY-MM-DD`／`YYYY-MM` 本身就是香港日 key），
// 因此顯示時固定用 `timeZone: 'UTC'`，不會因瀏覽器時區而位移一天。

/** `YYYY-MM`（香港月 key）→ 本地化月份標籤（例：2026年10月 / October 2026） */
export function formatHistoryMonthLabel(month: string, language: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(
    language === 'en' ? 'en-US' : 'zh-HK',
    { year: 'numeric', month: 'long', timeZone: 'UTC' },
  );
}

/** `YYYY-MM-DD`（香港日 key）→ 本地化日標籤（例：10月1日週三 / Wed, Oct 1） */
export function formatHistoryDayLabel(dayKey: string, language: string): string {
  return new Date(`${dayKey}T00:00:00Z`).toLocaleDateString(
    language === 'en' ? 'en-US' : 'zh-HK',
    { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' },
  );
}

/** ISO 時刻 → 香港時區 HH:mm（練習場次的開始時間） */
export function formatHistoryTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-HK', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Hong_Kong',
  });
}
