// ============================================
// 進度條元件
// ============================================

interface ProgressBarProps {
  value: number;       // 0-100
  max?: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'yellow' | 'red';
  className?: string;
}

const colorMap = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
};

const sizeMap = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export default function ProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
  size = 'md',
  color,
  className = '',
}: ProgressBarProps) {
  const pct = Math.min(Math.round((value / max) * 100), 100);
  // An explicitly requested colour wins; otherwise the bar stays a traffic light.
  const barColor = color
    ? colorMap[color]
    : pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className={`w-full ${className}`}>
      {(label || showPercentage) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>}
          {showPercentage && <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{pct}%</span>}
        </div>
      )}
      <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full ${sizeMap[size]}`}>
        <div
          className={`${sizeMap[size]} rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
