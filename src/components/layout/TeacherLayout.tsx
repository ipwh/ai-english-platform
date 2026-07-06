// ============================================
// 教師端佈局 — 左側 Sidebar + 頂部 Header
// ============================================
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Sun, Moon, Menu, X, Search } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { teacherNavSections } from '@/lib/nav';
import { mockTeacher } from '@/lib/mock-data';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isDarkMode, toggleDarkMode, sidebarOpen, toggleSidebar, notifications, unreadCount } = useAppStore();
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* ========== 側欄 ========== */}
      <aside className={`fixed inset-y-0 left-0 z-30 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ${
        sidebarOpen ? 'w-64' : 'w-20'
      }`}>
        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-gray-100 dark:border-gray-700 ${!sidebarOpen && 'justify-center'}`}>
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">E</div>
          {sidebarOpen && (
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">AI 英語學習平台</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">教師版</p>
            </div>
          )}
        </div>

        {/* 導航 */}
        <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
          {teacherNavSections.map((section) => (
            <div key={section.title}>
              {sidebarOpen && section.title && (
                <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">{section.title}</p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/teacher/dashboard' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      } ${!sidebarOpen && 'justify-center'}`}
                      title={!sidebarOpen ? item.label : undefined}
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {sidebarOpen && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* 底部使用者 */}
        <div className={`px-4 py-4 border-t border-gray-100 dark:border-gray-700 ${!sidebarOpen && 'flex justify-center'}`}>
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center text-blue-700 dark:text-blue-300 text-sm font-bold">
                {mockTeacher.nameZh.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{mockTeacher.nameZh}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">英文科教師</p>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center text-blue-700 dark:text-blue-300 text-sm font-bold">
              {mockTeacher.nameZh.charAt(0)}
            </div>
          )}
        </div>
      </aside>

      {/* ========== 主內容區 ========== */}
      <div className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
        {/* 頂部 Header */}
        <header className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 lg:px-6 py-3">
            <div className="flex items-center gap-3">
              <button onClick={toggleSidebar} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <Menu className="w-5 h-5 text-gray-500" />
              </button>
              {/* 搜尋欄 */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜尋學生、班別、任務..."
                  className="bg-transparent border-none outline-none text-sm text-gray-700 dark:text-gray-300 w-48 lg:w-64 placeholder:text-gray-400"
                />
              </div>
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
              <Link href="/teacher/profile" className="w-8 h-8 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center text-blue-700 dark:text-blue-300 text-sm font-bold ml-2">
                {mockTeacher.nameZh.charAt(0)}
              </Link>
            </div>
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
                <div key={n.id} className={`p-2 rounded-lg text-sm ${n.read ? 'bg-gray-50 dark:bg-gray-700' : 'bg-blue-50 dark:bg-blue-900/20'}`}>
                  <p className="font-medium text-gray-800 dark:text-gray-200">{n.title}</p>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{n.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 頁面內容 */}
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
