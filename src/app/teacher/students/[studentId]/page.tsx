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
import { gradeLabels, getGradeLabel } from '@/lib/nav';
import { useT } from '@/hooks/use-i18n';
import { useAppStore } from '@/store/appStore';

interface StudentData {
  id: string;
  nameZh?: string;
  nameEn?: string;
  email: string;
  level?: string;
  classNumber?: number;
  overallAccuracy?: number;
  class?: { name: string } | null;
}

interface PracticeSessionData {
  skillZh?: string;
  skill?: string;
  totalQuestions: number;
  correctCount: number;
  startedAt: string;
}

export default function StudentDetailPage() {
  const { t } = useT();
  const store = useAppStore();
  const params = useParams();
  const router = useRouter();
  const studentId = params.studentId as string;

  const [student, setStudent] = useState<StudentData | null>(null);
  const [practiceSessions, setPracticeSessions] = useState<PracticeSessionData[]>([]);
  const [mistakes, setMistakes] = useState<{ id: string }[]>([]);
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
        const found = allStudents.find((s) => s.id === studentId);
        if (found) {
          setStudent(found);
        } else {
          setLoadError(t('teacher.studentDetail.notFound'));
        }
        setPracticeSessions(practiceData.sessions || []);
        setMistakes(mistakesData.mistakes || []);
      })
      .catch(() => setLoadError(t('teacher.studentDetail.loadFailed')))
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
        <p className="text-gray-500">{loadError || t('teacher.studentDetail.notFound')}</p>
        <button onClick={() => router.back()} className="mt-3 text-blue-600 hover:underline text-sm">
          {t('teacher.studentDetail.back')}
        </button>
      </div>
    );
  }

  const totalQuestions = practiceSessions.reduce((sum, s) => sum + (s.totalQuestions || 0), 0);
  const totalCorrect = practiceSessions.reduce((sum, s) => sum + (s.correctCount || 0), 0);
  const sessionAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {student.nameZh || student.nameEn || t('teacher.studentDetail.fallback')}
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
            <p className="text-xs text-gray-500">{t('teacher.studentDetail.class')}</p>
            <p className="font-semibold text-gray-900 dark:text-white">{student.class?.name || '—'}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">{t('teacher.studentDetail.grade')}</p>
            <p className="font-semibold text-gray-900 dark:text-white">{getGradeLabel(student.level, store.language) || student.level || '—'}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">{t('teacher.studentDetail.studentNo')}</p>
            <p className="font-semibold text-gray-900 dark:text-white">{student.classNumber || '—'}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">{t('teacher.studentDetail.accuracy')}</p>
            <p className="font-semibold text-teal-600">{student.overallAccuracy ? Math.round(student.overallAccuracy) + '%' : '—'}</p>
          </div>
        </div>
      </div>

      {/* 練習統計 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('teacher.studentDetail.practiceCount'), value: practiceSessions.length, unit: t('teacher.studentDetail.sessionsUnit'), icon: Hash },
          { label: t('teacher.studentDetail.totalAnswered'), value: totalQuestions, unit: t('teacher.studentDetail.questionsUnit'), icon: BookOpen },
          { label: t('teacher.studentDetail.practiceAccuracy'), value: sessionAccuracy, unit: '%', icon: Target },
          { label: t('teacher.studentDetail.mistakeCount'), value: mistakes.length, unit: t('teacher.studentDetail.questionsUnit'), icon: AlertCircle },
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
          <Clock className="w-5 h-5 text-blue-500" /> {t('teacher.studentDetail.recentPractice')}
        </h3>
        {practiceSessions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">{t('teacher.studentDetail.noPractice')}</p>
        ) : (
          <div className="space-y-2">
            {practiceSessions.slice(0, 10).map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.skillZh || s.skill || t('teacher.studentDetail.practiceLabel')}</p>
                  <p className="text-xs text-gray-400">{s.totalQuestions || 0} {t('teacher.studentDetail.questionsUnit')} · {formatDate(s.startedAt)}</p>
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
