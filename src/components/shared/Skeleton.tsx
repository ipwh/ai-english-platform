// ============================================
// 載入骨架元件
// ============================================

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 練習頁面骨架 — 表單 + 卡片預覽 */
export function PracticePageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <Skeleton className="h-8 w-48" />
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** 寫作頁面骨架 */
export function WritingPageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <Skeleton className="h-8 w-48" />
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
        <Skeleton className="h-5 w-36" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
    </div>
  );
}

/** 測驗/批改結果骨架 */
export function AnalysisSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-5 w-24 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}

/** Gamification / 等級卡片骨架 */
export function GamificationSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-5 w-24 mb-2" />
          <Skeleton className="h-3 w-full rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
