// ============================================
// 教師端 — 學生搜尋列表
// TODO: connect to API
// ============================================
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, ChevronRight } from 'lucide-react';
import { mockClassStudents } from '@/lib/mock-data';
import ProgressBar from '@/components/shared/ProgressBar';
import { getRiskColor } from '@/lib/utils';

export default function TeacherStudentsPage() {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');

  const filtered = mockClassStudents.filter(s => {
    if (search && !s.nameZh.includes(search) && !s.nameEn.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">👨‍🎓 學生分析</h1>

      {/* 搜尋 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋學生姓名..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 學生列表 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-gray-500 font-medium">姓名</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">完成率</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">正確率</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">最弱技能</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">最後登入</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">風險</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-xs font-bold">{s.nameZh.charAt(0)}</div>
                      <span className="font-medium text-gray-900 dark:text-white">{s.nameZh}</span>
                    </div>
                  </td>
                  <td className="text-center py-3 px-4">{s.completionRate}%</td>
                  <td className="text-center py-3 px-4">
                    <span className={s.accuracy >= 70 ? 'text-green-600' : s.accuracy >= 50 ? 'text-yellow-600' : 'text-red-600'}>{s.accuracy}%</span>
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-500">{s.weakSkillZh}</td>
                  <td className="py-3 px-4 text-xs text-gray-400">{s.lastLogin}</td>
                  <td className="text-center py-3 px-4">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getRiskColor(s.riskLevel)}`}>
                      {s.riskLevel === 'high' ? '高' : s.riskLevel === 'medium' ? '中' : '低'}
                    </span>
                  </td>
                  <td className="text-right py-3 px-4">
                    <Link href={`/teacher/students/${s.id}`} className="text-blue-600 text-xs hover:underline flex items-center justify-end gap-1">
                      詳情 <ChevronRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
