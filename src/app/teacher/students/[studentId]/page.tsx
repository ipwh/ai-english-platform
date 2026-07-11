// ============================================
// 教師端 — 個別學生詳情與學習數據
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Mail, GraduationCap, Target, BookOpen, AlertCircle,
  Loader2, TrendingUp, Clock, Hash,
} from 'lucide-react';
import ProgressBar from '@/components/shared/ProgressBar';
import { formatDate } from '@/lib/utils';
import { gradeLabels } from '@/lib/nav';
import { useT } from '@/hooks/use-i18n';

export default function StudentDetailPage() {
  const { t } = useT();
  const params = useParams();
  const router = useRouter();
  const studentId = params.studentId as string;

  const [student, setStudent] = useState<any>(null);
  const [practiceSessions, setPracticeSessions] = useState<any[]>([]);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    setLoadError('');

    Promise.all([
      fetch(`/api/teacher/students?className=`).then(r => r.json()),
      fetch(`/api/practice?studentId=${encodeURIComponent(studentId)}`).then(r => r.json().catch(() => ({ sessions: [] }))),
      fetch(`/api/mistakes?studentId=${encodeURIComponent(studentId)}`).then(r => r.json().catch(() => ({ mistakes: [] }))),
    ])
      .then(([studentsData, practiceData, mistakesData]) => {
        const allStudents = studentsData.students || [];
        const found = allStudents.find((s: any) => s.id === studentId);
        if (found) {
          setStudent(found);
        } else {
          setLoadError('找不到此學生');
        }
        setPracticeSessions(practiceData.sessions || []);
        setMistakes(mistakesData.mistakes || []);
      })
      .catch(() => setLoadError('載入失敗'))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (loadError || !student) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">{loadError || '找不到此學生'}</p>
        <button onClick={() => router.back()} className="mt-3 text-blue-600 hover:underline text-sm">
          ← 返回
        </button>
      </div>
    );
  }

  const totalQuestions = practiceSessions.reduce((sum: number, s: any) => sum + (s.totalQuestions || 0), 0);
  const totalCorrect = practiceSessions.reduce((sum: number, s: any) => sum + (s.correctCount || 0), 0);
  const sessionAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {student.nameZh || student.nameEn || 'Student'}
        </h1>
      </div>

      {/* 基本資料 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-2xl font-bold text-blue-600">
            {(student.nameZh || student.nameEn || 'S').charAt(0)}
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{student.nameZh}</h2>
            {student.nameEn && <p className="text-sm text-gray-500">{student.nameEn}</p>}
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
              <Mail className="w-3 h-3" /> {student.email}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">班級</p>
            <p className="font-semibold text-gray-900 dark:text-white">{student.class?.name || '—'}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">年級</p>
            <p className="font-semibold text-gray-900 dark:text-white">{gradeLabels[student.level] || student.level || '—'}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">學號</p>
            <p className="font-semibold text-gray-900 dark:text-white">{student.classNumber || '—'}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">準確率</p>
            <p className="font-semibold text-teal-600">{student.overallAccuracy ? Math.round(student.overallAccuracy) + '%' : '—'}</p>
          </div>
        </div>
      </div>

      {/* 練習統計 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '練習次數', value: practiceSessions.length, unit: '次', icon: Hash },
          { label: '總答題數', value: totalQuestions, unit: '題', icon: BookOpen },
          { label: '練習準確率', value: sessionAccuracy, unit: '%', icon: Target },
          { label: '錯題數', value: mistakes.length, unit: '題', icon: AlertCircle },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <stat.icon className="w-4 h-4 text-gray-400 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}<span className="text-sm font-normal text-gray-400 ml-1">{stat.unit}</span></p>
            <p className="text-xs text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* 最近練習 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-500" /> 最近練習
        </h3>
        {practiceSessions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">尚無練習記錄</p>
        ) : (
          <div className="space-y-2">
            {practiceSessions.slice(0, 10).map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.skillZh || s.skill || '練習'}</p>
                  <p className="text-xs text-gray-400">{s.totalQuestions || 0} 題 · {formatDate(s.startedAt)}</p>
                </div>
                <span className="text-sm font-bold text-teal-600">
                  {s.totalQuestions > 0 ? Math.round((s.correctCount / s.totalQuestions) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
