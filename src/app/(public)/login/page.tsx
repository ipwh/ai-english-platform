// ============================================
// 登入頁面 — 真實 JWT 認證 + Google OAuth
// 支援繁體中文 / English 切換
// ============================================
'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';
import SchoolBrand from '@/components/shared/SchoolBrand';
import { LogIn, Eye, EyeOff, Loader2, Languages } from 'lucide-react';
import { signIn } from 'next-auth/react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, language, toggleLanguage } = useAppStore();
  const { t } = useT();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || t('login.loginFailed'));
        return;
      }

      // 更新 Zustand store
      if (json.user) {
        login(json.user.role);
      }

      // 重導向 — 非學生身份先到根路徑，由 root page 判斷角色導向
      const redirect = searchParams.get('redirect');
      if (redirect) {
        router.push(redirect);
      } else if (json.user?.role === 'student') {
        router.push('/student/dashboard');
      } else {
        // admin / teacher → 根路徑 → role-select
        router.push('/');
      }
    } catch {
      setError(t('login.networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md">
        {/* Language Toggle */}
        <div className="flex justify-end mb-4">
          <button onClick={toggleLanguage} className="p-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1 transition-colors">
            <Languages className="w-4 h-4" />
            <span className="font-bold">{language === 'zh' ? '中' : 'EN'}</span>
          </button>
        </div>

        {/* 校徽 + 校名（中英並列） */}
        <div className="text-center mb-8">
          <SchoolBrand variant="stacked" className="mb-5" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('login.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('login.subtitle')}</p>
        </div>

        {/* 登入表單 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('login.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('login.emailPlaceholder')}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('login.password')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none pr-10"
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {loading ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>

          {/* Google OAuth 登入 */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => { setGoogleLoading(true); signIn('google', { callbackUrl: '/', redirect: true }); }}
              disabled={googleLoading}
              className="w-full py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-700 dark:text-gray-200 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {googleLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {t('login.googleSignIn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
