// ============================================
// 學生端 — 我的作業頁面
// ============================================
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Clock, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { mockStudentAssignments } from '@/lib/mock-data';
import SkillChip from '@/components/shared/SkillChip';
import ProgressBar from '@/components/shared/ProgressBar';
import { formatDate, daysRemaining, getStatusColor } from '@/lib/utils';
import { statusLabels } from '@/lib/nav';
import type { AssignmentStatus } from '@/lib/types';
import EmptyState from '@/components/shared/EmptyState';

export default function StudentAssignmentsPage() {
  const [filter, setFilter] = useState<AssignmentStatus | 'all'>('all');
  const [assignments, setAssignments] = useState(mockStudentAssignments);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/assignments')
      .then(r => r.json())
      .then(d => { if (d.assignments?.length) setAssignments(d.assignments.map((a: { id: string; title: string; className: string; difficulty: string; grammarItem?: string; languageSkill?: string; dueDate?: string; status?: string; questionCount?: number }) => ({ ...a, status: (a.status || 'not-started') as AssignmentStatus, questionCount: a.questionCount || 5, score: null, submittedAt: a.dueDate }))); })
      .catch(() => { /* fallback to mock */ })
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? assignments : assignments.filter(a => a.status === filter);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📝 我的作業</h1>

      {/* 統計摘要 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '全部', value: assignments.length, status: 'all' as const, color: 'text-gray-600' },
          { label: '未開始', value: assignments.filter(a => a.status === 'not-started').length, status: 'not-started' as const, color: 'text-gray-600' },
          { label: '進行中', value: assignments.filter(a => a.status === 'in-progress').length, status: 'in-progress' as const, color: 'text-blue-600' },
          { label: '已完成', value: assignments.filter(a => a.status === 'completed').length, status: 'completed' as const, color: 'text-green-600' },
        ].map((stat, i) => (
          <button
            key={i}
            onClick={() => setFilter(filter === stat.status ? 'all' : stat.status)}
            className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border text-left transition-colors ${
              filter === stat.status ? 'border-teal-400 ring-1 ring-teal-400' : 'border-gray-100 dark:border-gray-700'
            }`}
          >
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* 篩選標籤 */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'not-started', 'in-progress', 'completed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s === 'all' ? 'all' : s)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              filter === s ? 'bg-teal-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
            }`}
          >
            {s === 'all' ? '全部' : statusLabels[s]}
          </button>
        ))}
      </div>

      {/* 作業列表 */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <EmptyState title="暫無作業" description="目前沒有相關的作業。" icon={<FileText className="w-8 h-8" />} />
        ) : (
          filtered.map((a) => {
            const remaining = daysRemaining(a.dueDate);
            const isOverdue = remaining < 0 && a.status !== 'completed';
            return (
              <Link
                key={a.id}
                href={`/student/practice?assignment=${a.id}`}
                className="block bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-teal-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{a.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <SkillChip grammarItem={a.grammarItem} languageSkill={a.languageSkill} />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(a.status)}`}>
                        {statusLabels[a.status]}
                      </span>
                    </div>
                  </div>
                  {a.score !== undefined && (
                    <span className="text-lg font-bold text-teal-600">{a.score} 分</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-2">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    截止：{formatDate(a.dueDate)}
                  </span>
                  {isOverdue ? (
                    <span className="flex items-center gap-1 text-red-500 font-medium">
                      <AlertCircle className="w-3 h-3" /> 已逾期
                    </span>
                  ) : remaining <= 3 && a.status !== 'completed' ? (
                    <span className="flex items-center gap-1 text-orange-500 font-medium">
                      <AlertCircle className="w-3 h-3" /> 尚餘 {remaining} 天
                    </span>
                  ) : null}
                </div>
                {a.teacherFeedback && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg">
                    💬 教師評語：{a.teacherFeedback}
                  </p>
                )}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
