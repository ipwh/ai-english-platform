// ============================================
// 角色選擇頁面（Google OAuth 首次登入後使用）
// 支援繁體中文 / English 切換
// ============================================
'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';
import { GraduationCap, Users, Loader2 } from 'lucide-react';
import type { UserRole } from '@/lib/types';

export default function RoleSelectPage() {
  const { switchRole } = useAppStore();
  const { t } = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSelect = async (role: UserRole) => {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          setError(t('role.sessionExpired'));
          setTimeout(() => { window.location.href = '/login'; }, 600);
          return;
        }
        setError(t('role.saveFailed'));
        return;
      }

      switchRole(role);

      // 使用 window.location.href 做全頁面跳轉，確保 middleware / auth 狀態從伺服器重新載入
      const target = role === 'student' ? '/student/dashboard' : '/teacher/dashboard';
      window.location.href = target;
    } catch {
      setError(t('login.networkError'));
    } finally {
      setLoading(false);
    }
  };

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 學生 */}
          <button
            onClick={() => handleSelect('student')}
            disabled={loading}
            className="group bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border-2 border-transparent hover:border-teal-400 dark:hover:border-teal-500 transition-all text-center"
          >
            <div className="w-16 h-16 bg-teal-100 dark:bg-teal-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <GraduationCap className="w-8 h-8 text-teal-600 dark:text-teal-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('role.student')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('role.studentDesc')}</p>
            {loading && <Loader2 className="w-4 h-4 animate-spin mx-auto mt-3 text-teal-500" />}
          </button>

          {/* 教師 */}
          <button
            onClick={() => handleSelect('teacher')}
            disabled={loading}
            className="group bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border-2 border-transparent hover:border-blue-400 dark:hover:border-blue-500 transition-all text-center"
          >
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <Users className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('role.teacher')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('role.teacherDesc')}</p>
            {loading && <Loader2 className="w-4 h-4 animate-spin mx-auto mt-3 text-blue-500" />}
          </button>
        </div>
      </div>
    </div>
  );
}
