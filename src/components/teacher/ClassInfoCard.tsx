// ============================================
// 教師端可重用元件 — 班級資訊卡片
// ============================================
'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface ClassInfoCardProps {
  id: string;
  name: string;
  studentCount?: number;
  gradeLevel?: string;
  href?: string;
}

export default function ClassInfoCard({ id, name, studentCount, gradeLevel, href }: ClassInfoCardProps) {
  const link = href || `/teacher/classes/${id}`;

  return (
    <Link
      href={link}
      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
    >
      <div className="w-9 h-9 bg-teal-100 dark:bg-teal-900/30 rounded-full flex items-center justify-center text-sm font-bold text-teal-700 dark:text-teal-300 flex-shrink-0">
        {name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900 dark:text-white">{name}</span>
        {(studentCount !== undefined || gradeLevel) && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {gradeLevel && `${gradeLevel} · `}{studentCount ?? 0} 名學生
          </p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400" />
    </Link>
  );
}
