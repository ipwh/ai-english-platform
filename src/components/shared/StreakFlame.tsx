'use client';
// ============================================
// StreakFlame — 每日連續學習火焰動畫元件
// 根據連續天數顯示不同大小的 CSS 火焰動畫
// ============================================

import { useEffect, useState } from 'react';

interface StreakFlameProps {
  streakDays: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** 火焰強度對應的顏色與大小 */
const FLAME_CONFIG = {
  none: { scale: 0, colors: [] },
  small: { scale: 0.7, colors: ['#FF6B35', '#FF8C42', '#FFD166'] },
  medium: { scale: 0.85, colors: ['#FF4500', '#FF6B35', '#FF8C42', '#FFD166'] },
  large: { scale: 1, colors: ['#DC143C', '#FF4500', '#FF6B35', '#FF8C42', '#FFD166', '#FFEE88'] },
};

function getFlameLevel(days: number): keyof typeof FLAME_CONFIG {
  if (days >= 7) return 'large';
  if (days >= 3) return 'medium';
  if (days >= 1) return 'small';
  return 'none';
}

export default function StreakFlame({ streakDays, size = 'md', className = '' }: StreakFlameProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const level = getFlameLevel(streakDays);
  if (!mounted || level === 'none') return null;

  const config = FLAME_CONFIG[level];
  const sizePx = size === 'sm' ? 40 : size === 'md' ? 56 : 72;
  const flameCount = config.colors.length;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: sizePx, height: sizePx }}
      aria-label={`${streakDays} day streak`}
    >
      {/* 外層光暈 */}
      <div
        className="absolute inset-0 rounded-full opacity-30 blur-md animate-pulse"
        style={{
          background: `radial-gradient(circle, ${config.colors[0]}40 0%, transparent 70%)`,
          animationDuration: '2s',
        }}
      />

      {/* 火焰層 */}
      {config.colors.map((color, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            bottom: '10%',
            width: `${30 + (flameCount - i) * 8}%`,
            height: `${40 + (flameCount - i) * 15}%`,
            left: `${50 - (15 + (flameCount - i) * 4)}%`,
            background: color,
            borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
            transformOrigin: 'bottom center',
            filter: `blur(${(flameCount - i) * 0.8}px)`,
            opacity: 0.85 - i * 0.12,
            animation: `streakFlicker${(i % 3) + 1} ${1.2 + i * 0.3}s ease-in-out infinite`,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}

      {/* 中心火苗 */}
      <div
        className="absolute"
        style={{
          bottom: '8%',
          width: '18%',
          height: '28%',
          left: '41%',
          background: '#FFEE88',
          borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
          transformOrigin: 'bottom center',
          filter: 'blur(1px)',
          opacity: 0.95,
          animation: 'streakFlicker1 0.8s ease-in-out infinite',
        }}
      />

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes streakFlicker1 {
          0%, 100% { transform: scaleY(1) scaleX(1) translateY(0); opacity: 0.9; }
          25% { transform: scaleY(1.15) scaleX(0.85) translateY(-2px); opacity: 0.95; }
          50% { transform: scaleY(0.9) scaleX(1.1) translateY(1px); opacity: 0.85; }
          75% { transform: scaleY(1.08) scaleX(0.9) translateY(-1px); opacity: 0.92; }
        }
        @keyframes streakFlicker2 {
          0%, 100% { transform: scaleY(1) scaleX(1) translateY(0); opacity: 0.8; }
          30% { transform: scaleY(1.2) scaleX(0.8) translateY(-3px); opacity: 0.88; }
          60% { transform: scaleY(0.85) scaleX(1.15) translateY(2px); opacity: 0.75; }
        }
        @keyframes streakFlicker3 {
          0%, 100% { transform: scaleY(1) scaleX(1) translateY(0); opacity: 0.7; }
          20% { transform: scaleY(1.1) scaleX(0.9) translateY(-2px); opacity: 0.78; }
          70% { transform: scaleY(0.92) scaleX(1.08) translateY(1px); opacity: 0.65; }
        }
      `}</style>

      {/* 天數文字 */}
      <span
        className="relative z-10 text-white font-bold drop-shadow-md select-none"
        style={{ fontSize: size === 'sm' ? '0.65rem' : size === 'md' ? '0.75rem' : '0.9rem' }}
      >
        {streakDays}
      </span>
    </div>
  );
}
