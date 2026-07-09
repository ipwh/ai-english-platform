// ============================================
// 角色選擇頁面（僅教師/管理員使用；學生會被自動導向）
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/hooks/use-i18n';
import { GraduationCap, Users, Shield } from 'lucide-react';

export default function RoleSelectPage() {
  const { t } = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // 檢查當前 session 的角色：學生不應看到此頁
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(data => {
        if (data?.user?.role === 'student' || data?.role === 'student') {
          router.replace('/student/dashboard');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('role.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('role.subtitle')}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 學生 */}
          <form action="/api/auth/role" method="post">
            <input type="hidden" name="role" value="student" />
            <button
              type="submit"
              className="group w-full bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border-2 border-transparent hover:border-teal-400 dark:hover:border-teal-500 transition-all text-center"
            >
              <div className="w-16 h-16 bg-teal-100 dark:bg-teal-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <GraduationCap className="w-8 h-8 text-teal-600 dark:text-teal-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('role.student')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('role.studentDesc')}</p>
            </button>
          </form>

          {/* 教師 */}
          <form action="/api/auth/role" method="post">
            <input type="hidden" name="role" value="teacher" />
            <button
              type="submit"
              className="group w-full bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border-2 border-transparent hover:border-blue-400 dark:hover:border-blue-500 transition-all text-center"
            >
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('role.teacher')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('role.teacherDesc')}</p>
            </button>
          </form>

          {/* 管理員 */}
          <form action="/api/auth/role" method="post">
            <input type="hidden" name="role" value="admin" />
            <button
              type="submit"
              className="group w-full bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border-2 border-transparent hover:border-purple-400 dark:hover:border-purple-500 transition-all text-center"
            >
              <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Shield className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('role.admin')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('role.adminDesc')}</p>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
