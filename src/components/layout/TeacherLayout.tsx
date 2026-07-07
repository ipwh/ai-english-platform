// Teacher Layout
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Sun, Moon, Menu, Languages } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { teacherNavSections, getNavLabel, getSectionTitle } from '@/lib/nav';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isDarkMode, toggleDarkMode, language, toggleLanguage, sidebarOpen, toggleSidebar, notifications, unreadCount, initSession, userDisplayName } = useAppStore();
  useEffect(() => { initSession(); }, [initSession]);
  const displayName = userDisplayName || 'Teacher';
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <aside className={`fixed inset-y-0 left-0 z-30 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-gray-100 dark:border-gray-700 ${!sidebarOpen && 'justify-center'}`}>
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">E</div>
          {sidebarOpen && <div><p className="font-semibold text-gray-900 dark:text-white text-sm">AI English Platform</p><p className="text-xs text-gray-500 dark:text-gray-400">{language === 'zh' ? '教師版' : 'Teacher'}</p></div>}
        </div>
        <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
          {teacherNavSections.map((section) => (
            <div key={section.title}>
              {sidebarOpen && section.title && <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">{getSectionTitle(section, language)}</p>}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/teacher/dashboard' && pathname.startsWith(item.href));
                  return (
                    <Link key={item.href} href={item.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'} ${!sidebarOpen && 'justify-center'}`}
                      title={!sidebarOpen ? getNavLabel(item, language) : undefined}>
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {sidebarOpen && <span>{getNavLabel(item, language)}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-100 dark:border-gray-700">
          <div className={`flex items-center gap-3 ${!sidebarOpen && 'justify-center'}`}>
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-700 dark:text-blue-300 font-medium text-sm">{displayName.charAt(0)}</div>
            {sidebarOpen && <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900 dark:text-white truncate">{displayName}</p></div>}
          </div>
        </div>
      </aside>
      <div className={`transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 lg:px-6 h-16">
            <button onClick={toggleSidebar} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><Menu className="w-5 h-5" /></button>
            <div className="flex items-center gap-2">
              <button onClick={toggleLanguage} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1"><Languages className="w-5 h-5" /><span className="text-xs font-bold">{language === 'zh' ? '中' : 'EN'}</span></button>
              <button onClick={toggleDarkMode} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">{isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button>
            </div>
          </div>
        </header>
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
