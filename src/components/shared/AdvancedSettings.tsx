// ============================================
// 進階設定摺疊面板 (Accordion)
// 所有複雜 AI 設定必須收納於此元件內
// ============================================
'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface AdvancedSettingsProps {
  title?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export default function AdvancedSettings({
  title = '進階設定',
  children,
  defaultOpen = false,
  className = '',
}: AdvancedSettingsProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300 flex items-center gap-2">
          ⚙️ {title}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 py-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          {children}
        </div>
      )}
    </div>
  );
}
