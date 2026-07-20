// ============================================
// 教師導入頁面 — 已移至管理員後台
// ============================================

import Link from 'next/link';
import { ShieldAlert, ArrowRight } from 'lucide-react';

export default function ImportPage() {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center space-y-6">
      <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto">
        <ShieldAlert className="w-8 h-8 text-amber-600 dark:text-amber-400" />
      </div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">
        匯入功能已移至管理員後台
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        為確保資料安全，批量匯入學生及教師資料僅限管理員操作。
        如需匯入資料，請聯絡學校管理員或使用管理員帳號登入。
      </p>
      <Link
        href="/admin/import"
        className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 transition-colors"
      >
        前往管理員匯入頁面
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}


