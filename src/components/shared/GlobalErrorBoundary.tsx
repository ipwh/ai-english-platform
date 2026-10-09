'use client';

// ============================================
// GlobalErrorBoundary — 包裝整個 App，防止未捕獲錯誤導致白畫面
// 取代分散在各頁面的 try/catch，提供統一的 fallback UI
// ============================================

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

function getLang(): 'zh' | 'en' {
  if (typeof window === 'undefined') return 'zh';
  try {
    const stored = localStorage.getItem('lang');
    return stored === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

const MSG = {
  title: { zh: '發生錯誤', en: 'Something went wrong' },
  description: { zh: '請嘗試重新載入頁面。如果問題持續，請聯絡技術支援。', en: 'Please try reloading the page. If the problem persists, contact support.' },
  reload: { zh: '重新載入', en: 'Reload Page' },
  goHome: { zh: '返回首頁', en: 'Go Home' },
};

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[GlobalErrorBoundary] Uncaught error:', error, errorInfo.componentStack);
    this.setState({ errorInfo: errorInfo.componentStack || '' });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    // Deliberate FULL document navigation: this is the global error boundary, so
    // the React tree (and therefore the client router) is untrustworthy —
    // `useRouter().push()` cannot be relied on here. `replace()` rather than
    // `href = '/'` so the crashed page does not stay in history (Back must not
    // return the user to a broken screen).
    window.location.replace('/');
  };

  render() {
    if (this.state.hasError) {
      const lang = getLang();
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
              <span className="text-3xl">⚠️</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{MSG.title[lang]}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{MSG.description[lang]}</p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-left mt-2">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Error details</summary>
                <pre className="mt-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/10 p-2 rounded-lg overflow-auto max-h-40">
                  {this.state.error.message}
                  {this.state.error.stack?.slice(0, 500)}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={this.handleReload}
                className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-xl font-medium transition-colors"
              >
                {MSG.reload[lang]}
              </button>
              <button
                onClick={this.handleGoHome}
                className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {MSG.goHome[lang]}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
