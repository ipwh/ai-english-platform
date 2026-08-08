'use client';

// ============================================
// Sprint 131: CloRationaleCard — educational feedback display
// Shows per-dimension CLO rationale (evidence, strengths, limitations, next steps)
// NOT score authority — scores shown are formal CLO scores, not LLM claims.
// ============================================

import type { CloDimensionRationaleResult } from '@/shared/types/ai-response-types';

const DIMENSION_LABELS: Record<string, { zh: string; en: string }> = {
  content: { zh: '內容', en: 'Content' },
  language: { zh: '語言', en: 'Language' },
  organization: { zh: '組織', en: 'Organization' },
};

function formatDimensionName(dimension: string, lang: string): string {
  return DIMENSION_LABELS[dimension]?.[lang as 'zh' | 'en'] || dimension;
}

interface CloRationaleCardProps {
  rationale: CloDimensionRationaleResult;
  language?: string;
  /** When true, this is a fallback rationale — not real student feedback */
  isFallback?: boolean;
}

export function CloRationaleCard({
  rationale,
  language = 'zh',
  isFallback = false,
}: CloRationaleCardProps) {
  const isZh = language === 'zh';

  if (isFallback) {
    return (
      <section
        data-testid={`clo-rationale-${rationale.dimension}`}
        className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600"
      >
        <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-1">
          {formatDimensionName(rationale.dimension, language)}
        </h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">
          {isZh
            ? '暫時無法提供此維度的詳細分析。請參考上方整體評分。'
            : 'Detailed feedback for this dimension is not available yet. Please refer to the overall score above.'}
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid={`clo-rationale-${rationale.dimension}`}
      className="p-3 bg-white dark:bg-gray-700 rounded-lg border border-blue-100 dark:border-blue-800 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">
          {formatDimensionName(rationale.dimension, language)}
        </h3>
        <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-full font-bold">
          {rationale.score}/7
        </span>
      </div>

      {rationale.strengths.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
            {isZh ? '👍 做得好的地方' : '👍 What you did well'}
          </h4>
          <ul className="space-y-1">
            {rationale.strengths.map((item, index) => (
              <li key={`strength-${index}`} className="text-xs text-gray-600 dark:text-gray-400 pl-3 border-l-2 border-green-300">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rationale.limitations.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">
            {isZh ? '💡 可改進的地方' : '💡 What to improve'}
          </h4>
          <ul className="space-y-1">
            {rationale.limitations.map((item, index) => (
              <li key={`limitation-${index}`} className="text-xs text-gray-600 dark:text-gray-400 pl-3 border-l-2 border-orange-300">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rationale.evidence.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
            {isZh ? '📝 來自你文章的證據' : '📝 Evidence from your writing'}
          </h4>
          <ul className="space-y-1">
            {rationale.evidence.map((item, index) => (
              <li key={`evidence-${index}`} className="text-xs text-gray-500 dark:text-gray-500 italic pl-3 border-l-2 border-blue-300">
                <details>
                  <summary className="cursor-pointer line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400">
                    {item}
                  </summary>
                  <blockquote className="mt-1 pt-1 border-t border-blue-200 dark:border-blue-700 whitespace-pre-wrap break-words">
                    {item}
                  </blockquote>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rationale.nextSteps.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
            {isZh ? '🎯 下一步建議' : '🎯 Next steps'}
          </h4>
          <ul className="space-y-1">
            {rationale.nextSteps.map((item, index) => (
              <li key={`next-step-${index}`} className="text-xs text-gray-600 dark:text-gray-400 pl-3 border-l-2 border-purple-300">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Full feedback panel: renders all 3 CLO dimensions with null/empty handling */
interface CloFeedbackPanelProps {
  cloRationales?: CloDimensionRationaleResult[];
  language?: string;
}

export function CloFeedbackPanel({ cloRationales, language = 'zh' }: CloFeedbackPanelProps) {
  const isZh = language === 'zh';

  if (!cloRationales || cloRationales.length === 0) {
    return (
      <div data-testid="clo-feedback-empty" className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-600 text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {isZh
            ? '詳細的 CLO 維度分析暫時無法提供。'
            : 'Detailed CLO dimension analysis is not available yet.'}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="clo-feedback-panel" className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        {isZh ? '📊 CLO 三維度詳細分析' : '📊 CLO Dimension Analysis'}
      </h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2">
        {isZh
          ? '以下分析幫助你了解每個評分維度的具體表現。分數為平台內部評分，並非 HKEAA 官方等級。'
          : 'The analysis below helps you understand your performance in each dimension. Scores are platform-internal and are NOT official HKEAA grades.'}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cloRationales.map((rationale) => (
          <CloRationaleCard
            key={rationale.dimension}
            rationale={rationale}
            language={language}
            isFallback={rationale.evidence.length === 0 && rationale.strengths.length === 0 && rationale.limitations.length <= 1}
          />
        ))}
      </div>
    </div>
  );
}
