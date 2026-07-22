// ============================================
// 統一側欄佈局 — 支援 Desktop (可收合) & Mobile (覆蓋抽屜)
// 供 StudentLayout / TeacherLayout 共用
// ============================================
'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Sun, Moon, Menu, X, Languages, ChevronLeft, Shuffle, LogOut } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';
import { getNavLabel, getSectionTitle, studentTabItems } from '@/shared/utils/nav';
import type { NavItem, NavSection } from '@/shared/utils/nav';

// ============================================
// Types
// ============================================

interface SidebarLayoutProps {
  children: ReactNode;
  /** 'student' | 'teacher' */
  role: 'student' | 'teacher';
  /** 桌面端側欄導航項目（平鋪列表） */
  navItems?: NavItem[];
  /** 桌面端側欄導航區塊（分組列表） */
  navSections?: NavSection[];
  /** 主題色 */
  accentColor?: 'teal' | 'blue';
  /** 標題後綴（如「教師版」） */
  subtitle?: string;
}

// ============================================
// Sub-components
// ============================================

/** 桌面端側欄 Logo 區 */
function SidebarLogo({
  collapsed,
  accentColor,
  subtitle,
  language,
}: {
  collapsed: boolean;
  accentColor: 'teal' | 'blue';
  subtitle: string;
  language: string;
}) {
  const bgClass = accentColor === 'teal' ? 'bg-teal-600' : 'bg-blue-600';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-5 border-b border-gray-100 dark:border-gray-700 ${
        collapsed && 'justify-center'
      }`}
    >
      <div
        className={`w-9 h-9 ${bgClass} rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}
      >
        E
      </div>
      {!collapsed && (
        <div>
          <p className="font-semibold text-gray-900 dark:text-white text-sm">
            AI English Platform
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
        </div>
      )}
    </div>
  );
}

/** 桌面端側欄使用者資訊 */
function SidebarUserInfo({
  collapsed,
  displayName,
  accentColor,
}: {
  collapsed: boolean;
  displayName: string;
  accentColor: 'teal' | 'blue';
}) {
  const bgClass =
    accentColor === 'teal'
      ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';

  return (
    <div className="p-4 border-t border-gray-100 dark:border-gray-700">
      <div
        className={`flex items-center gap-3 ${collapsed && 'justify-center'}`}
      >
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm ${bgClass}`}
        >
          {displayName.charAt(0)}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {displayName}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** 桌面端導航項目 */
function SidebarNavItem({
  item,
  isActive,
  collapsed,
  accentColor,
  lang,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  accentColor: 'teal' | 'blue';
  lang: string;
  onClick?: () => void;
}) {
  const activeBg =
    accentColor === 'teal'
      ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
      : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';

  return (
    <Link
      key={item.href}
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
        isActive
          ? activeBg
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
      } ${collapsed && 'justify-center'}`}
      title={collapsed ? getNavLabel(item, lang) : undefined}
    >
      <item.icon className="w-5 h-5 flex-shrink-0" />
      {!collapsed && <span>{getNavLabel(item, lang)}</span>}
    </Link>
  );
}

// ============================================
// Main Component
// ============================================

export default function SidebarLayout({
  children,
  role,
  navItems,
  navSections,
  accentColor = 'blue',
  subtitle = '',
}: SidebarLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const store = useAppStore();
  const {
    isDarkMode,
    toggleDarkMode,
    language,
    toggleLanguage,
    sidebarOpen,
    toggleSidebar,
    notifications,
    unreadCount,
    initSession,
    userDisplayName,
    currentRole,
  } = store;

  const { t } = useT();
  const displayName = userDisplayName || t(role === 'student' ? 'common.studentFallback' : 'common.teacherFallback');
  const lang = language || 'zh';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // 點擊通知下拉選單外部時關閉
  useEffect(() => {
    if (!showNotifications) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotifications]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  // 🔔 智慧輪詢：有未讀通知時 15s，否則 60s
  useEffect(() => {
    const fetchNotifications = () => {
      fetch('/api/notifications')
        .then(r => r.json())
        .then(data => {
          if (data.notifications) {
            store.setNotifications(data.notifications, data.unreadCount);
          }
        })
        .catch(() => { /* 靜默失敗 */ });
    };
    fetchNotifications();

    const intervalMs = unreadCount > 0 ? 15_000 : 60_000;
    const interval = setInterval(fetchNotifications, intervalMs);
    return () => clearInterval(interval);
  }, [store, unreadCount]);

  // 切換路由時自動關閉 mobile 側欄
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // sidebarOpen=true → 側欄展開 (w-64)；sidebarOpen=false → 側欄收合為圖標 (w-20)
  const sidebarExpanded = sidebarOpen;
  const sidebarCollapsed = !sidebarExpanded;

  // ---- Sidebar content (shared between desktop & mobile) ----
  const sidebarContent = (
    <>
      <SidebarLogo
        collapsed={false}
        accentColor={accentColor}
        subtitle={subtitle}
        language={lang}
      />
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {navSections
          ? navSections.map(section => (
              <div key={section.title}>
                {section.title && (
                  <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {getSectionTitle(section, lang)}
                  </p>
                )}
                <div className="space-y-1">
                  {section.items.map(item => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== `/${role}/dashboard` &&
                        pathname.startsWith(item.href));
                    return (
                      <SidebarNavItem
                        key={item.href}
                        item={item}
                        isActive={isActive}
                        collapsed={false}
                        accentColor={accentColor}
                        lang={lang}
                        onClick={() => setMobileOpen(false)}
                      />
                    );
                  })}
                </div>
              </div>
            ))
          : navItems?.map(item => {
              const isActive =
                pathname === item.href ||
                (item.href !== `/${role}/dashboard` &&
                  pathname.startsWith(item.href));
              return (
                <SidebarNavItem
                  key={item.href}
                  item={item}
                  isActive={isActive}
                  collapsed={false}
                  accentColor={accentColor}
                  lang={lang}
                  onClick={() => setMobileOpen(false)}
                />
              );
            })}
      </nav>
      <SidebarUserInfo
        collapsed={false}
        displayName={displayName}
        accentColor={accentColor}
      />
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* ============================================ */}
      {/* Desktop 側欄 — 常駐可收合                       */}
      {/* ============================================ */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:z-30 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ${
          sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'
        }`}
      >
        <SidebarLogo
          collapsed={sidebarCollapsed}
          accentColor={accentColor}
          subtitle={subtitle}
          language={lang}
        />
        <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
          {navSections
            ? navSections.map(section => (
                <div key={section.title}>
                  {!sidebarCollapsed && section.title && (
                    <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {getSectionTitle(section, lang)}
                    </p>
                  )}
                  <div className="space-y-1">
                    {section.items.map(item => {
                      const isActive =
                        pathname === item.href ||
                        (item.href !== `/${role}/dashboard` &&
                          pathname.startsWith(item.href));
                      return (
                        <SidebarNavItem
                          key={item.href}
                          item={item}
                          isActive={isActive}
                          collapsed={sidebarCollapsed}
                          accentColor={accentColor}
                          lang={lang}
                        />
                      );
                    })}
                  </div>
                </div>
              ))
            : navItems?.map(item => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== `/${role}/dashboard` &&
                    pathname.startsWith(item.href));
                return (
                  <SidebarNavItem
                    key={item.href}
                    item={item}
                    isActive={isActive}
                    collapsed={sidebarCollapsed}
                    accentColor={accentColor}
                    lang={lang}
                  />
                );
              })}
        </nav>
        <SidebarUserInfo
          collapsed={sidebarCollapsed}
          displayName={displayName}
          accentColor={accentColor}
        />
      </aside>

      {/* ============================================ */}
      {/* Mobile 側欄 — Off-screen 抽屜 + 背景遮罩        */}
      {/* ============================================ */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-[min(288px,85vw)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transform transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <span className="font-semibold text-gray-900 dark:text-white text-sm">
            AI English Platform
          </span>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* ============================================ */}
      {/* 主要內容區域                                   */}
      {/* ============================================ */}
      <div
        className={`transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
        }`}
      >
        {/* ---- Top Header ---- */}
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 lg:px-6 h-16">
            {/* Left: hamburger */}
            <div className="flex items-center gap-2">
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden p-2.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 min-w-[40px] min-h-[40px] flex items-center justify-center"
              >
                <Menu className="w-5 h-5" />
              </button>
              {/* Desktop collapse toggle */}
              <button
                onClick={toggleSidebar}
                className="hidden lg:flex p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {sidebarCollapsed ? (
                  <Menu className="w-5 h-5" />
                ) : (
                  <ChevronLeft className="w-5 h-5" />
                )}
              </button>
              {/* Mobile title */}
              <span className="lg:hidden font-semibold text-gray-900 dark:text-white text-sm">
                AI English
              </span>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2">
              {/* Notifications */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 max-h-80 overflow-y-auto">
                    <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {t('layout.notifications')}
                      </p>
                      {unreadCount > 0 && (
                        <button
                          onClick={async () => {
                            await fetch('/api/notifications', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ markAllRead: true }),
                            });
                            store.setNotifications(
                              store.notifications.map(n => ({ ...n, read: true })),
                              0,
                            );
                          }}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          {t('layout.markAllRead')}
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <p className="p-4 text-sm text-gray-500 text-center">
                        {t('layout.noNotifications')}
                      </p>
                    ) : (
                      notifications.slice(0, 5).map(n => (
                        <div
                          key={n.id}
                          onClick={async () => {
                            if (!n.read) {
                              await fetch('/api/notifications', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ notificationId: n.id }),
                              });
                              store.setNotifications(
                                store.notifications.map(item =>
                                  item.id === n.id ? { ...item, read: true } : item
                                ),
                                Math.max(0, store.unreadCount - 1),
                              );
                            }
                            if (n.link) router.push(n.link);
                            setShowNotifications(false);
                          }}
                          className={`p-3 border-b border-gray-50 dark:border-gray-700 cursor-pointer transition-colors ${n.read ? 'opacity-60' : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                        >
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {!n.read && <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-1.5" />}
                            {n.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {n.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 角色切換 — DB 角色為 admin/teacher 的用戶, 在任何視圖（學生/教師）皆顯示 */}
              {(currentRole === 'admin' || currentRole === 'teacher') && (
                <Link
                  href="/role-select"
                  className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg flex items-center gap-1.5 transition-colors"
                  title={t('common.switchRole')}
                >
                  <Shuffle className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('common.switchRole')}</span>
                </Link>
              )}

              <button
                onClick={toggleLanguage}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1"
              >
                <Languages className="w-5 h-5" />
                <span className="text-xs font-bold hidden sm:inline">
                  {lang === 'zh' ? '中' : 'EN'}
                </span>
              </button>
              <button
                onClick={toggleDarkMode}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {isDarkMode ? (
                  <Sun className="w-5 h-5" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </button>
              {/* Logout */}
              <button
                onClick={async () => {
                  if (confirm(t('common.confirmLogout'))) {
                    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* logout is best-effort, proceed regardless */ }
                    router.push('/login');
                  }
                }}
                className="p-2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                title={t('common.logout')}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* ---- Page Content ---- */}
        <main className={`p-4 lg:p-6 ${role === 'student' ? 'pb-20 lg:pb-6' : ''}`}>
          {children}
        </main>
      </div>

      {/* ============================================ */}
      {/* 學生手機版底部快捷導航（僅學生角色顯示）            */}
      {/* ============================================ */}
      {role === 'student' && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-bottom">
          <div className="flex justify-around py-2">
            {studentTabItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href);
              const activeColor =
                accentColor === 'teal'
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-blue-600 dark:text-blue-400';
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                    isActive ? activeColor : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">
                    {getNavLabel(item, lang)}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
