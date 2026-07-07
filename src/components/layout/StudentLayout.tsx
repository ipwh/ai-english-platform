// Student Layout
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Sun, Moon, Menu, X, Languages } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { studentNavItems, studentTabItems, getNavLabel } from '@/lib/nav';
import { getGreeting } from '@/lib/utils';

function getInitials(name: string): string { return name ? name.charAt(0) : '?'; }

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const store = useAppStore();
  const { isDarkMode, toggleDarkMode, language, toggleLanguage, notifications, unreadCount, initSession, userDisplayName } = store;
  useEffect(() => { initSession(); }, [initSession]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const greeting = getGreeting();
  const displayName = userDisplayName || 'Student';
  const lang = language || 'zh';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-30">
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100 dark:border-gray-700">
          <div className="w-9 h-9 bg-teal-600 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">E</div>
          <div><p className="font-semibold text-gray-900 dark:text-white text-sm">AI English Platform</p><p className="text-xs text-gray-500 dark:text-gray-400">{lang === 'zh' ? 'Student' : 'Student'}</p></div>
        </div>
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {studentNavItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/student/dashboard' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                <item.icon className="w-5 h-5" />
                <span>{getNavLabel(item, lang)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-teal-100 dark:bg-teal-900/30 rounded-full flex items-center justify-center text-teal-700 dark:text-teal-300 font-medium text-sm">{getInitials(displayName)}</div>
            <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900 dark:text-white truncate">{displayName}</p></div>
          </div>
        </div>
      </aside>

      <div className="lg:ml-64">
        <header className="lg:hidden sticky top-0 z-20 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 h-14">
            <button onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              {mobileSidebarOpen ? <X className="w-5 h-5 text-gray-500" /> : <Menu className="w-5 h-5 text-gray-500" />}
            </button>
            <span className="font-semibold text-gray-900 dark:text-white text-sm">AI English</span>
            <div className="flex items-center gap-1">
              <button onClick={toggleLanguage} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1"><Languages className="w-5 h-5 text-gray-500" /><span className="text-xs font-bold text-gray-500">{lang === 'zh' ? 'ZH' : 'EN'}</span></button>
              <button onClick={toggleDarkMode} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">{isDarkMode ? <Sun className="w-5 h-5 text-gray-500" /> : <Moon className="w-5 h-5 text-gray-500" />}</button>
            </div>
          </div>
        </header>

        <header className="hidden lg:flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{greeting}, {displayName}!</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleLanguage} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1"><Languages className="w-5 h-5 text-gray-500" /><span className="text-xs font-bold text-gray-500">{lang === 'zh' ? 'ZH' : 'EN'}</span></button>
            <button onClick={toggleDarkMode} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">{isDarkMode ? <Sun className="w-5 h-5 text-gray-500" /> : <Moon className="w-5 h-5 text-gray-500" />}</button>
            <Link href="/student/profile" className="w-8 h-8 bg-teal-100 dark:bg-teal-800 rounded-full flex items-center justify-center"><span className="text-xs font-bold text-teal-700 dark:text-teal-300">{getInitials(displayName)}</span></Link>
          </div>
        </header>

        <main className="p-4 lg:p-6 pb-20 lg:pb-6">{children}</main>
      </div>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-bottom">
        <div className="flex justify-around py-2">
          {studentTabItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${isActive ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400'}`}>
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{getNavLabel(item, lang)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
