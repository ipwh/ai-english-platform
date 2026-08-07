// ============================================
// ListeningScript — 聆聽對話稿顯示元件
// 按說話者角色（Woman/Man/Boy/Girl）分色顯示，
// 附男女聲圖示（♀/♂），用於所有聆聽題目頁面。
// ============================================
'use client';

import { type ReactNode } from 'react';

/** 說話者樣式對照表 */
const SPEAKER_STYLES: Record<string, { icon: string; color: string; bg: string; darkBg: string; label: string }> = {
  Woman: { icon: '♀', color: 'text-pink-600', bg: 'bg-pink-50', darkBg: 'dark:bg-pink-900/20', label: 'Woman' },
  Man:   { icon: '♂', color: 'text-blue-600', bg: 'bg-blue-50', darkBg: 'dark:bg-blue-900/20', label: 'Man' },
  Boy:   { icon: '♂', color: 'text-cyan-600', bg: 'bg-cyan-50', darkBg: 'dark:bg-cyan-900/20', label: 'Boy' },
  Girl:  { icon: '♀', color: 'text-purple-600', bg: 'bg-purple-50', darkBg: 'dark:bg-purple-900/20', label: 'Girl' },
};

interface ListeningScriptProps {
  /** 聆聽對話內容，格式為 "Woman: ...\nMan: ..." */
  content: string;
  /** 對話文字顏色（預設 gray-700） */
  textColor?: string;
  /** 對話文字 dark mode 顏色 */
  textColorDark?: string;
  /** 自訂每行文字的渲染方式（用於 VocabEnabledText 等） */
  renderText?: (text: string, lineIndex: number) => ReactNode;
}

export default function ListeningScript({
  content,
  textColor = 'text-gray-700',
  textColorDark = 'dark:text-gray-300',
  renderText,
}: ListeningScriptProps) {
  if (!content?.trim()) return null;

  const lines = content.split(/\n/).filter(l => l.trim());

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        // 嘗試匹配 "Woman: ..." / "Man: ..." / "Boy: ..." / "Girl: ..."
        const match = line.match(/^(Woman|Man|Boy|Girl)\s*:\s*(.+)$/i);
        if (match) {
          const speaker = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
          const text = match[2].trim();
          const style = SPEAKER_STYLES[speaker] || SPEAKER_STYLES['Woman'];

          return (
            <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg ${style.bg} ${style.darkBg}`}>
              <span className={`shrink-0 font-bold text-xs ${style.color} mt-0.5 w-14 text-right`}>
                {style.icon} {style.label}
              </span>
              <span className={`${textColor} ${textColorDark}`}>
                {renderText ? renderText(text, i) : text}
              </span>
            </div>
          );
        }
        // 非對話行（旁白、敘述等）
        return (
          <div key={i} className="px-2 py-1 text-gray-500 dark:text-gray-400 italic text-xs">
            {line}
          </div>
        );
      })}
    </div>
  );
}
