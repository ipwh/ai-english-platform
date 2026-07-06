// ============================================
// 教師端 — 個人檔案頁面
// TODO: connect to API
// ============================================
'use client';

import { useRouter } from 'next/navigation';
import { LogOut, User, Settings, Shield, Mail, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { mockTeacher } from '@/lib/mock-data';
import { formatDate } from '@/lib/utils';

export default function TeacherProfilePage() {
  const router = useRouter();
  const { logout } = useAppStore();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const teacher = mockTeacher;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">👤 個人檔案</h1>

      {/* 基本資料卡 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
        <div className="w-20 h-20 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl font-bold text-blue-600 dark:text-blue-300">{teacher.nameZh.charAt(0)}</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{teacher.nameZh}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{teacher.nameEn}</p>
        <div className="flex items-center justify-center gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> {teacher.email}</span>
        </div>
        <div className="flex items-center justify-center gap-2 mt-2 text-sm text-gray-600">
          <span>{teacher.subjects.join('、')}</span>
        </div>
        <div className="flex items-center justify-center gap-2 mt-2 text-sm text-gray-500">
          <span>任教班別：{teacher.classes.join('、')}</span>
        </div>
        <div className="text-xs text-gray-400 mt-3">加入日期：{formatDate(teacher.joinedAt)}</div>
      </div>

      {/* 設定選項 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {[
          { icon: User, label: '編輯個人資料' },
          { icon: Settings, label: '帳號設定' },
          { icon: Shield, label: '私隱設定' },
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
      <button onClick={handleLogout} className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2">
        <LogOut className="w-4 h-4" /> 登出
      </button>

      <button onClick={() => router.push('/role-select')} className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-200 transition-colors">
        切換身份
      </button>
    </div>
  );
}
