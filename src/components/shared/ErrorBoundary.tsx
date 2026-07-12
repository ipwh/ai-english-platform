'use client';

// ============================================
// ErrorBoundary — 捕獲渲染錯誤，防止整頁崩潰
// ============================================

import { Component, type ReactNode } from 'react';
import { t } from '@/lib/i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function getLang(): string {
  if (typeof window === 'undefined') return 'zh';
  try {
    const stored = localStorage.getItem('language');
    return stored === 'en' ? 'en' : 'zh';
  } catch { return 'zh'; }
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const lang = getLang();
      return this.props.fallback || (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-center p-8">
            <p className="text-gray-500 mb-3">{t('common.somethingWrong', lang)}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm"
            >
              {t('common.reloadPage', lang)}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
