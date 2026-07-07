// ============================================
// 角色選擇頁面（Google OAuth 首次登入後使用）
// ============================================
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import { GraduationCap, Users, Loader2 } from 'lucide-react';
import type { UserRole } from '@/lib/types';

export default function RoleSelectPage() {
  const router = useRouter();
  const { switchRole } = useAppStore();
  const [loading, setLoading] = useState(false);

  const handleSelect = async (role: UserRole) => {
    setLoading(true);
    try {
      // 儲存角色到後端 DB
      await fetch('/api/auth/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
    } catch { /* 即使失敗也繼續 */ }

    switchRole(role);
    if (role === 'student') {
      router.push('/student/dashboard');
    } else {
      router.push('/teacher/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">選擇身份</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">請選擇你要使用的身份進入平台</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 學生 */}
          <button
            onClick={() => handleSelect('student')}
            className="group bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border-2 border-transparent hover:border-teal-400 dark:hover:border-teal-500 transition-all text-center"
          >
            <div className="w-16 h-16 bg-teal-100 dark:bg-teal-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <GraduationCap className="w-8 h-8 text-teal-600 dark:text-teal-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">🧑‍🎓 學生</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">進行練習、查看進度、溫習錯題</p>
          </button>

          {/* 教師 */}
          <button
            onClick={() => handleSelect('teacher')}
            className="group bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border-2 border-transparent hover:border-blue-400 dark:hover:border-blue-500 transition-all text-center"
          >
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <Users className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">👩‍🏫 教師</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">管理班級、派發任務、覆核批改</p>
          </button>
        </div>
      </div>
    </div>
  );
}
