'use client';

// ============================================
// Global Error Boundary (Next.js App Router)
// Catches unhandled errors in any page/route segment
//
// 這是「區段」錯誤邊界，渲染在 root layout 之內，因此**不可**再輸出
// html/body 標籤（只有 global-error.tsx 可以，見 Next docs
// 03-file-conventions/error.md）。2026-09-23：舊碼輸出巢狀 html/body，形成無效 DOM
// （html 出現在 body 之中），令之後的 React 調解更容易出現 removeChild 失敗。
// ============================================

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  /** Next 16 主要恢復入口：重新抓取並重新渲染區段（error-boundary.js 兩者皆會傳入）。 */
  unstable_retry?: () => void;
  /** 只清除錯誤狀態、不重新抓取；Next 16 仍會傳入，作為後備。 */
  reset?: () => void;
}

export default function GlobalError({ error, unstable_retry, reset }: GlobalErrorProps) {
  const retry = unstable_retry ?? reset;

  useEffect(() => {
    // Log to monitoring service (Sentry/Datadog) when added
    console.error('[GlobalError] Unhandled error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen p-8 bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            發生錯誤 Something went wrong
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {error.message || '請嘗試重新載入頁面，或返回首頁。'}
          </p>
          {error.digest && (
            <p className="text-xs text-gray-400 font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => retry?.()}
            className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-medium text-sm flex items-center gap-2 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            重新載入 Try Again
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Home className="w-4 h-4" />
            返回首頁 Home
          </Link>
        </div>
      </div>
    </div>
  );
}
