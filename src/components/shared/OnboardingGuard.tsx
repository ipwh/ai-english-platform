// ============================================
// OnboardingGuard — 新學生首次登入強制診斷引導
// 檢查學生是否已完成診斷測試，若無則引導至診斷頁
// ============================================
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, ArrowRight } from 'lucide-react';

interface OnboardingGuardProps {
  children: React.ReactNode;
  studentId: string;
}

export default function OnboardingGuard({ children, studentId }: OnboardingGuardProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [practiceCount, setPracticeCount] = useState(0);

  useEffect(() => {
    if (!studentId) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    async function check() {
      try {
        // 檢查是否有診斷記錄
        const diagRes = await fetch(`/api/diagnostic?studentId=${encodeURIComponent(studentId)}`);
        const diagData = await diagRes.json();
        const hasDiagnostic = diagData?.results?.length > 0;

        // 檢查是否有練習記錄
        const practiceRes = await fetch(`/api/practice?studentId=${encodeURIComponent(studentId)}`);
        const practiceData = await practiceRes.json();
        const sessions = practiceData?.sessions?.length || 0;
        setPracticeCount(sessions);

        // 新學生 = 無診斷記錄 + 練習少於 3 次
        if (!hasDiagnostic && sessions < 3) {
          setNeedsOnboarding(true);
        }
      } catch {
        // API 錯誤不阻擋
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    check();
    return () => { cancelled = true; };
  }, [studentId]);

  if (checking) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
      </div>
    );
  }

  if (needsOnboarding) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-6 animate-in fade-in zoom-in duration-500">
        <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-3xl p-8 text-white shadow-xl">
          <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-80" />
          <h1 className="text-2xl font-bold mb-2">歡迎來到 AI 英語學習平台！</h1>
          <p className="text-teal-100 text-sm mb-6">
            讓我們先了解你的英文程度，為你制定最適合的學習計劃。
          </p>

          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3 text-sm text-left">
              <span className="text-2xl">📋</span>
              <div>
                <p className="font-semibold">第一步：診斷測試</p>
                <p className="text-teal-100 text-xs">AI 會根據你的年級，生成文法、詞彙、閱讀題目，約 5-10 分鐘完成</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3 text-sm text-left">
              <span className="text-2xl">🎯</span>
              <div>
                <p className="font-semibold">第二步：弱項分析</p>
                <p className="text-teal-100 text-xs">AI 自動分析你的強弱項，精準推薦練習內容</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3 text-sm text-left">
              <span className="text-2xl">🚀</span>
              <div>
                <p className="font-semibold">第三步：個人化練習</p>
                <p className="text-teal-100 text-xs">針對弱項的 AI 練習、Integrated Skills、寫作支援</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => router.push('/student/diagnostic')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-teal-600 rounded-xl font-semibold hover:bg-teal-50 transition-colors shadow-lg"
          >
            開始診斷測試
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => setNeedsOnboarding(false)}
            className="block mx-auto mt-3 text-teal-200 text-xs hover:text-white transition-colors"
          >
            跳過，直接開始
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
