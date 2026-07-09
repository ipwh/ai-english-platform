// ============================================
// 教師端 — 單一班級詳情（真實資料版）
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users, ChevronRight, RefreshCw } from 'lucide-react';
import ProgressBar from '@/components/shared/ProgressBar';
import { useT } from '@/hooks/use-i18n';

interface RealStudent {
  id: string;
  email: string;
  nameZh: string;
  nameEn: string;
  level: string;
  classNumber?: string;
  overallAccuracy: number;
  class?: { id: string; name: string; gradeLevel: string } | null;
  _count?: { sessions: number; mistakes: number };
}

export default function ClassDetailPage() {
  const { t } = useT();
  const params = useParams();
  const classId = params.classId as string;

  const [cls, setCls] = useState<any>(null);
  const [students, setStudents] = useState<RealStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/classes').then(r => r.json()),
      fetch('/api/teacher/students').then(r => r.json()),
    ]).then(([classData, studentData]) => {
      const found = (classData.classes || []).find((c: any) => c.id === classId);
      setCls(found || null);
      const classStudents = (studentData.students || []).filter(
        (s: RealStudent) => s.class?.id === classId
      );
      setStudents(classStudents);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [classId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">找不到此班級</p>
        <Link href="/teacher/classes" className="text-blue-600 hover:underline mt-2 inline-block">
          <ArrowLeft className="w-4 h-4 inline mr-1" />返回班級列表
        </Link>
      </div>
    );
  }

  const avgAccuracy = students.length > 0
    ? Math.round(students.reduce((sum, s) => sum + (s.overallAccuracy || 0), 0) / students.length)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/teacher/classes" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{cls.name} 班級詳情</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {cls.gradeLevel} · {students.length} 名學生
          </p>
        </div>
      </div>

      {/* 班級摘要卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: '學生人數', value: students.length, unit: '人', icon: Users, color: 'text-blue-600' },
          { label: '平均正確率', value: avgAccuracy, unit: '%', icon: ArrowLeft, color: 'text-green-600' },
          { label: '練習總次數', value: students.reduce((s, stu) => s + (stu._count?.sessions || 0), 0), unit: '次', icon: ChevronRight, color: 'text-teal-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-xs text-gray-500">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stat.value}<span className="text-sm text-gray-400 ml-1">{stat.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 學生列表 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">學生列表（依班號排序）</h2>
        {students.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">此班級暫無學生</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left py-2 text-gray-500 font-medium w-12">班號</th>
                  <th className="text-left py-2 text-gray-500 font-medium">中文姓名</th>
                  <th className="text-left py-2 text-gray-500 font-medium hidden sm:table-cell">英文姓名</th>
                  <th className="text-center py-2 text-gray-500 font-medium">正確率</th>
                  <th className="text-center py-2 text-gray-500 font-medium hidden sm:table-cell">練習次數</th>
                  <th className="text-right py-2 text-gray-500 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {students
                  .sort((a, b) => (a.classNumber || '99').localeCompare(b.classNumber || '99'))
                  .map((s) => (
                    <tr key={s.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-3 text-gray-500 text-xs">{s.classNumber || '-'}</td>
                      <td className="py-3">
                        <span className="font-medium text-gray-900 dark:text-white">{s.nameZh}</span>
                      </td>
                      <td className="py-3 text-xs text-gray-500 hidden sm:table-cell">{s.nameEn}</td>
                      <td className="text-center py-3">
                        <span className={`font-medium text-sm ${(s.overallAccuracy || 0) >= 70 ? 'text-green-600' : (s.overallAccuracy || 0) >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {s.overallAccuracy || 0}%
                        </span>
                      </td>
                      <td className="text-center py-3 text-xs text-gray-500 hidden sm:table-cell">
                        {s._count?.sessions || 0}
                      </td>
                      <td className="text-right py-3">
                        <Link href={`/teacher/students/${s.id}`}
                          className="text-blue-600 text-xs hover:underline flex items-center justify-end gap-1">
                          詳情 <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
