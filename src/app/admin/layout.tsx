// ============================================
// 管理員後台佈局
// ============================================
'use client';

import { useState, useEffect, Component, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Upload, Users, BookOpen, LogOut,
  Menu, ChevronLeft, BarChart3, AlertTriangle, RefreshCw,
  Shuffle, Languages, UserCheck, Bell, Sun, Moon,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';

// ---- Error Boundary ----
class AdminErrorBoundary extends Component<
  { children: ReactNode; t: (key: string) => string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; t: (key: string) => string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className="max-w-lg mx-auto mt-20 p-8 bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-800 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t('admin.error.title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {this.state.error?.message || t('admin.error.unknown')}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t('admin.error.reload')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const adminNavItems = [
  { i18nKey: 'admin.nav.overview', href: '/admin', icon: LayoutDashboard },
  { i18nKey: 'admin.nav.import', href: '/admin/import', icon: Upload },
  { i18nKey: 'admin.nav.users', href: '/admin/users', icon: Users },
  { i18nKey: 'admin.nav.students', href: '/admin/students', icon: UserCheck },
  { i18nKey: 'admin.nav.reports', href: '/admin/reports', icon: BarChart3 },
  { i18nKey: 'admin.nav.classes', href: '/admin/classes', icon: BookOpen },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn, currentRole, initSession, userDisplayName, logout, toggleLanguage, language, isDarkMode, toggleDarkMode, notifications, unreadCount } = useAppStore();
  const { t } = useT();
  const [sidebarOpen, setSidebarOpen] = useState(false); // default closed on mobile
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    initSession().then(() => setAuthChecked(true));
  }, [initSession]);

  // 權限守衛：僅 admin 可訪問
  useEffect(() => {
    if (authChecked && (!isLoggedIn || currentRole !== 'admin')) {
      router.replace('/login');
    }
  }, [authChecked, isLoggedIn, currentRole, router]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isLoggedIn || currentRole !== 'admin') return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${sidebarOpen ? 'w-64' : 'lg:w-20'}
        `}
      >
        {/* Logo */}
        <div
          className={`flex items-center gap-3 px-4 py-5 border-b border-gray-100 dark:border-gray-700 ${
            !sidebarOpen && 'lg:justify-center'
          }`}
        >
          <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            A
          </div>
          <div className={`${!sidebarOpen ? 'hidden' : 'block'}`}>
            <p className="font-semibold text-gray-900 dark:text-white text-sm">
              AI English Platform
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('admin.layout.title')}</p>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto p-1 text-gray-400 hover:text-gray-600 rounded-lg lg:hidden"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {adminNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const label = t(item.i18nKey);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)} // close sidebar on mobile after navigation
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                } ${!sidebarOpen && 'lg:justify-center'}`}
                title={!sidebarOpen ? label : undefined}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className={`${!sidebarOpen && 'lg:hidden'}`}>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User info & logout */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-700">
          <div
            className={`flex items-center gap-3 ${!sidebarOpen && 'lg:justify-center'}`}
          >
            <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-purple-700 dark:text-purple-300 font-medium text-sm">
              {userDisplayName?.charAt(0) || 'A'}
            </div>
            <div className={`flex-1 min-w-0 ${!sidebarOpen && 'lg:hidden'}`}>
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {userDisplayName || 'Admin'}
              </p>
            </div>
            <button
              onClick={() => logout().then(() => router.push('/login'))}
              className={`p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${!sidebarOpen && 'lg:hidden'}`}
              title={t('profile.logout')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div
        className={`transition-all duration-300 lg:ml-20 ${
          sidebarOpen ? 'lg:ml-64' : ''
        }`}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 lg:px-6 h-16">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {sidebarOpen ? (
                <ChevronLeft className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                {/* Notifications */}
                <button
                  className="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 relative"
                  title={t('layout.notifications')}
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>
                {/* Language */}
                <button
                  onClick={toggleLanguage}
                  className="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1"
                  title={language === 'zh' ? 'Switch to English' : '切換至中文'}
                >
                  <Languages className="w-4 h-4" />
                  <span className="text-xs font-bold hidden sm:inline">
                    {language === 'zh' ? '中' : 'EN'}
                  </span>
                </button>
                {/* Dark Mode */}
                <button
                  onClick={toggleDarkMode}
                  className="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                {/* Role Switch */}
                <Link
                  href="/role-select"
                  className="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1"
                  title={t('profile.switchRole')}
                >
                  <Shuffle className="w-4 h-4" />
                  <span className="text-xs">{t('profile.switchRole')}</span>
                </Link>
                {/* Logout */}
                <button
                  onClick={() => logout().then(() => router.push('/login'))}
                  className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  title={t('profile.logout')}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <AdminErrorBoundary t={t}>{children}</AdminErrorBoundary>
        </main>
      </div>
    </div>
  );
}
