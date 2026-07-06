// ============================================
// 學生端 — 個人檔案頁面
// ============================================
'use client';

import { useRouter } from 'next/navigation';
import { User, Settings, LogOut, Shield, Mail, Calendar, Award, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { mockStudent, mockBadges } from '@/lib/mock-data';
import { formatDate } from '@/lib/utils';

export default function StudentProfilePage() {
  const router = useRouter();
  const { logout } = useAppStore();

  const handleLogout = () => {
    logout();
    // TODO: connect to API — 實際登出由後端處理
    router.push('/login');
  };

  const student = mockStudent;
  const unlockedBadges = mockBadges.filter(b => b.unlocked);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">👤 個人檔案</h1>

      {/* 基本資料卡 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
        <div className="w-20 h-20 bg-teal-100 dark:bg-teal-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl font-bold text-teal-600 dark:text-teal-300">{student.nameZh.charAt(0)}</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{student.nameZh}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{student.nameEn}</p>
        <div className="flex items-center justify-center gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> {student.email}</span>
        </div>
        <div className="flex items-center justify-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
          <span>{student.className} · {student.classNumber}號</span>
          <span>·</span>
          <span>{student.level}（中{student.level.slice(1)}）</span>
        </div>
        <div className="flex items-center justify-center gap-4 mt-2 text-sm">
          <span className="text-teal-600 font-medium">🔥 連續 {student.streakDays} 天</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-600">正確率 {student.overallAccuracy}%</span>
        </div>
        <div className="text-xs text-gray-400 mt-3">加入日期：{formatDate(student.joinedAt)}</div>
      </div>

      {/* 已解鎖徽章 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Award className="w-5 h-5 text-yellow-500" /> 已解鎖徽章
        </h3>
        {unlockedBadges.length > 0 ? (
          <div className="flex gap-3 flex-wrap">
            {unlockedBadges.map((b) => (
              <div key={b.id} className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl px-3 py-2 text-center">
                <span className="text-xl">{b.icon}</span>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{b.name}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">尚無解鎖徽章，繼續努力！</p>
        )}
      </section>

      {/* 設定選項 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {[
          { icon: User, label: '編輯個人資料', href: '#' },
          { icon: Settings, label: '帳號設定', href: '#' },
          { icon: Shield, label: '私隱設定', href: '#' },
        ].map((item, i) => (
          <button key={i} className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0">
            <div className="flex items-center gap-3">
              <item.icon className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        ))}
      </section>

      {/* 登出 */}
      <button
        onClick={handleLogout}
        className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" />
        登出
      </button>

      <button
        onClick={() => router.push('/role-select')}
        className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-200 transition-colors"
      >
        切換身份
      </button>
    </div>
  );
}
