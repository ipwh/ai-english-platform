// ============================================
// 教師端 — 任務派發中心（列表）
// ============================================
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Clock, Users, ChevronRight, Loader2 } from 'lucide-react';
import { mockTeacherAssignments } from '@/lib/mock-data';
import ProgressBar from '@/components/shared/ProgressBar';
import SkillChip from '@/components/shared/SkillChip';
import { formatDate, daysRemaining } from '@/lib/utils';
import { statusLabels } from '@/lib/nav';
import { useT } from '@/hooks/use-i18n';

export default function TeacherAssignmentsPage() {
  const { t } = useT();
  const [assignments, setAssignments] = useState(mockTeacherAssignments);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/assignments')
      .then(r => r.json())
      .then(d => { if (d.assignments?.length) setAssignments(d.assignments); })
      .catch(() => { /* fallback to mock */ })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📋 任務派發中心</h1>
        <Link
          href="/teacher/assignments/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> 建立新任務
        </Link>
      </div>

      <div className="space-y-3">
        {assignments.map((a) => {
          const remaining = daysRemaining(a.dueDate);
          return (
            <Link
              key={a.id}
              href={`/teacher/assignments`}
              className="block bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">{a.title}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600">{a.className}</span>
                    <SkillChip grammarItem={a.grammarItem} languageSkill={a.languageSkill} />
                    <span className="text-xs text-gray-400">{a.questionType} · {a.questionCount} 題</span>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  a.status === 'completed' ? 'bg-green-100 text-green-700' :
                  a.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {statusLabels[a.status]}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 截止：{formatDate(a.dueDate)}</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {a.className}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">完成率</span>
                  <div className="w-24">
                    <ProgressBar value={a.completionRate} size="sm" showPercentage={true} />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
