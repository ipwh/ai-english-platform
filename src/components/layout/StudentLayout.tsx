// ============================================
// 學生端佈局 — 手機底部 Tab + 桌面側欄
// ============================================
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Sun, Moon, LogOut, Menu, X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { studentNavItems, studentTabItems } from '@/lib/nav';
import { getGreeting } from '@/lib/utils';
import { mockStudent } from '@/lib/mock-data';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isDarkMode, toggleDarkMode, notifications, unreadCount } = useAppStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const greeting = getGreeting();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* ========== 桌面版側欄 ========== */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-30">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100 dark:border-gray-700">
          <div className="w-9 h-9 bg-teal-500 rounded-xl flex items-center justify-center text-white font-bold text-lg">E</div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white text-sm">AI 英語學習平台</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">學生版</p>
          </div>
        </div>

        {/* 導航 */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {studentNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* 底部資訊 */}
        <div className="px-4 py-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-teal-100 dark:bg-teal-800 rounded-full flex items-center justify-center text-teal-700 dark:text-teal-300 text-sm font-bold">
              {mockStudent.nameZh.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{mockStudent.nameZh}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{mockStudent.className} · {mockStudent.classNumber}號</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ========== 主內容區 ========== */}
      <div className="lg:pl-64">
        {/* 頂部 Header（手機版） */}
        <header className="sticky top-0 z-20 lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => setMobileSidebarOpen(true)} className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 dark:text-white text-sm">AI 英語學習</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={toggleDarkMode} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                {isDarkMode ? <Sun className="w-5 h-5 text-gray-500" /> : <Moon className="w-5 h-5 text-gray-500" />}
              </button>
              <button onClick={() => setShowNotifications(!showNotifications)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 relative">
                <Bell className="w-5 h-5 text-gray-500" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* 桌面版 Header */}
        <header className="hidden lg:flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{greeting}，{mockStudent.nameZh} 👋</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">連續學習 {mockStudent.streakDays} 天 · 加油！</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleDarkMode} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              {isDarkMode ? <Sun className="w-5 h-5 text-gray-500" /> : <Moon className="w-5 h-5 text-gray-500" />}
            </button>
            <button onClick={() => setShowNotifications(!showNotifications)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 relative">
              <Bell className="w-5 h-5 text-gray-500" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            <Link href="/student/profile" className="w-8 h-8 bg-teal-100 dark:bg-teal-800 rounded-full flex items-center justify-center text-teal-700 dark:text-teal-300 text-sm font-bold ml-2">
              {mockStudent.nameZh.charAt(0)}
            </Link>
          </div>
        </header>

        {/* 通知面板 */}
        {showNotifications && (
          <div className="absolute right-4 top-14 z-40 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">通知</h3>
              <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notifications.slice(0, 5).map((n) => (
                <div key={n.id} className={`p-2 rounded-lg text-sm ${n.read ? 'bg-gray-50 dark:bg-gray-700' : 'bg-teal-50 dark:bg-teal-900/20'}`}>
                  <p className="font-medium text-gray-800 dark:text-gray-200">{n.title}</p>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{n.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 頁面內容 */}
        <main className="p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>

      {/* ========== 手機版底部 Tab Bar ========== */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-30 safe-bottom">
        <div className="flex items-center justify-around py-2">
          {studentTabItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/student/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${
                  isActive ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ========== 手機版側欄（滑出式） ========== */}
      {mobileSidebarOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setMobileSidebarOpen(false)} />
          <div className="lg:hidden fixed inset-y-0 left-0 w-72 bg-white dark:bg-gray-800 z-50 shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center text-white font-bold">E</div>
                <span className="font-semibold text-gray-900 dark:text-white">AI 英語學習平台</span>
              </div>
              <button onClick={() => setMobileSidebarOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <nav className="px-3 py-4 space-y-1">
              {studentNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                      isActive ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
