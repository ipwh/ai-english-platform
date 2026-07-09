// ============================================
// 教師端 — 個別學生分析（待連接 API）
// ============================================
'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function StudentDetailPage() {
  return (
    <div className="text-center py-20">
      <p className="text-gray-500 dark:text-gray-400">請從班級列表選擇學生查看詳情</p>
      <Link href="/teacher/classes" className="text-blue-600 hover:underline mt-2 inline-block">
        <ArrowLeft className="w-4 h-4 inline mr-1" />返回班級列表
      </Link>
    </div>
  );
}
