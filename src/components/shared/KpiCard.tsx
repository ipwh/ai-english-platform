// ============================================
// KPI 卡片元件
// ============================================
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { KpiData } from '@/shared/types/types';

interface KpiCardProps {
  data: KpiData;
  className?: string;
}

export default function KpiCard({ data, className = '' }: KpiCardProps) {
  const TrendIcon = data.trend === 'up' ? TrendingUp : data.trend === 'down' ? TrendingDown : Minus;
  const trendColor = data.trend === 'up' ? 'text-green-600' : data.trend === 'down' ? 'text-red-600' : 'text-gray-400';

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">{data.label}</span>
        {data.trend && (
          <span className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            {data.change !== undefined && `${data.change > 0 ? '+' : ''}${data.change}%`}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">{data.value}</span>
        {data.unit && <span className="text-sm text-gray-500 dark:text-gray-400">{data.unit}</span>}
      </div>
    </div>
  );
}
