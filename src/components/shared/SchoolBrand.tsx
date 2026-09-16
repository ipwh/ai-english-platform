// ============================================
// 校徽 + 校名 品牌區 — 全校共用單一 owner
// 使用位置：登入頁（stacked）、學生／老師側欄、管理員側欄（inline / icon）
//
// 註：`public/branding/pochiu-logo.png` 為白底不透明圖檔，故一律置於白色圓角
// 底板內，淺色／深色模式下外觀一致（深色模式看起來像校徽徽章）。
// 日後若換成透明底 SVG／PNG，只需改 LOGO_SRC 與底板樣式。
// ============================================
'use client';

import Image from 'next/image';
import { useT } from '@/hooks/use-i18n';

const LOGO_SRC = '/branding/pochiu-logo.png';
/** 校徽原始像素尺寸（95×126，直向）— 供 next/image 計算長寬比 */
const LOGO_WIDTH = 95;
const LOGO_HEIGHT = 126;

/** 版面尺寸（plate = 白色底板、img = 校徽高度） */
const VARIANTS = {
  /** 登入頁：校徽置中 + 中英校名並列 */
  stacked: { plate: 'p-2 rounded-2xl shadow-sm', img: 'h-14' },
  /** 側欄展開：校徽 + 校名（跟隨語言）+ 角色副標 */
  inline: { plate: 'p-0.5 rounded-lg', img: 'h-9' },
  /** 側欄收合：只顯示校徽 */
  icon: { plate: 'p-0.5 rounded-lg', img: 'h-9' },
} as const;

export interface SchoolBrandProps {
  variant?: keyof typeof VARIANTS;
  /** 角色副標（如「學生版」／「教師版」），僅 inline 使用 */
  subtitle?: string;
  className?: string;
}

export default function SchoolBrand({
  variant = 'inline',
  subtitle,
  className = '',
}: SchoolBrandProps) {
  const { t } = useT();
  const { plate, img } = VARIANTS[variant];

  // alt="" 為刻意設計：校徽旁的校名文字已提供無障礙名稱，避免重複朗讀
  const logo = (
    <span
      className={`inline-flex items-center justify-center flex-shrink-0 bg-white ring-1 ring-black/5 ${plate}`}
    >
      <Image
        src={LOGO_SRC}
        alt=""
        aria-hidden="true"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className={`${img} w-auto object-contain`}
        // 登入頁校徽在首屏，需 eager 載入避免拖延 LCP；側欄維持 lazy
        loading={variant === 'stacked' ? 'eager' : undefined}
        fetchPriority={variant === 'stacked' ? 'high' : undefined}
      />
    </span>
  );

  if (variant === 'icon') {
    return (
      <span
        className={`inline-flex flex-shrink-0 ${className}`}
        role="img"
        aria-label={t('brand.logoAlt')}
        title={t('brand.schoolName')}
      >
        {logo}
      </span>
    );
  }

  if (variant === 'stacked') {
    return (
      <div className={`flex flex-col items-center gap-3 ${className}`}>
        {logo}
        <div className="text-center leading-tight">
          <p className="text-base font-bold text-gray-900 dark:text-white">
            {t('brand.schoolNameZh')}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {t('brand.schoolNameEn')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 min-w-0 flex-1 ${className}`}>
      {logo}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {t('brand.schoolName')}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
