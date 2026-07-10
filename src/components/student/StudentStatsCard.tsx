// ============================================
// 學生端可重用元件 — 統計摘要卡片
// ============================================
'use client';

interface StudentStatsCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  color?: string;
}

export default function StudentStatsCard({ label, value, unit, icon, color }: StudentStatsCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className={color || 'text-teal-500'}>{icon}</span>}
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">
        {value}
        {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
      </p>
    </div>
  );
}
