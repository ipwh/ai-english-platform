// ============================================
// 教師端 — 任務派發中心（列表）
// ============================================
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Clock, Users, ChevronRight, Loader2 } from 'lucide-react';

import ProgressBar from '@/components/shared/ProgressBar';
import SkillChip from '@/components/shared/SkillChip';
import { formatDate } from '@/shared/utils/utils';
import { statusLabels } from '@/shared/utils/nav';
import type { Assignment } from '@/shared/types/types';
import { useT } from '@/hooks/use-i18n';

export default function TeacherAssignmentsPage() {
  const { t } = useT();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadAssignments = () => {
    setLoading(true);
    setLoadError(false);
    fetch('/api/assignments')
      .then(r => r.json())
      .then(d => { if (d.assignments?.length) setAssignments(d.assignments); })
      .catch((e) => { console.error('Failed to load assignments:', e); setLoadError(true); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAssignments(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.assignments.title')}</h1>
        <Link
          href="/teacher/assignments/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> {t('teacher.assignments.new')}
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      )}

      {!loading && loadError && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center shadow-sm border">
          <p className="text-gray-500 mb-3">{t('teacher.loadAssignmentsFailed')}</p>
          <button onClick={loadAssignments} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm">{t('common.retry')}</button>
        </div>
      )}

      {!loading && !loadError && assignments.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center shadow-sm border">
          <p className="text-gray-400">{t('teacher.noAssignments')}</p>
          <Link href="/teacher/assignments/new" className="mt-3 inline-block px-4 py-2 bg-blue-500 text-white rounded-lg text-sm">{t('teacher.createFirst')}</Link>
        </div>
      )}

      {!loading && !loadError && assignments.length > 0 && (
      <div className="space-y-3">
        {assignments.map((a) => {
          return (
            <div
              key={a.id}
              className="block bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">{a.title}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600">{a.className}</span>
                    <SkillChip grammarItem={a.grammarItem} languageSkill={a.languageSkill} />
                    <span className="text-xs text-gray-400">{a.questionType} · {a.questionCount} {t('generic.questions')}</span>
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
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {t('teacher.assignments.dueDate', { date: formatDate(a.dueDate) })}</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {a.className}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{t('teacher.assignments.completionRate')}</span>
                  <div className="w-24">
                    <ProgressBar value={a.completionRate} size="sm" showPercentage={true} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
