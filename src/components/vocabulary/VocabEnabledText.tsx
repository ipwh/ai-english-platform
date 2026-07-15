// ============================================
// VocabEnabledText — 包裝元件：讓任何文字區域支援
// 「選取文字 → 加入生字簿」功能
// 用於 AI 生成的 passage、分析、改寫建議等
// ============================================
'use client';

import { useRef, useEffect } from 'react';
import { useTextSelectionVocab, TextSelectionPopup } from './InlineAddVocabButton';

interface VocabEnabledTextProps {
  studentId: string;
  gradeLevel: string;
  children: React.ReactNode;
  onWordAdded?: (word: string) => void;
  /** 容器 class */
  className?: string;
  /** 是否為區塊元素 (div) 還是行內元素 (span) */
  as?: 'div' | 'span' | 'section';
}

export default function VocabEnabledText({
  studentId,
  gradeLevel,
  children,
  onWordAdded,
  className = '',
  as: Tag = 'div',
}: VocabEnabledTextProps) {
  const {
    popupPos,
    selectedText,
    adding,
    added,
    handleSelectionEnd,
    handleAddWord,
    handleClosePopup,
  } = useTextSelectionVocab({ studentId, gradeLevel, onWordAdded });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('mouseup', handleSelectionEnd as EventListener);
    el.addEventListener('touchend', handleSelectionEnd as EventListener);
    return () => {
      el.removeEventListener('mouseup', handleSelectionEnd as EventListener);
      el.removeEventListener('touchend', handleSelectionEnd as EventListener);
    };
  }, [handleSelectionEnd]);

  return (
    <>
      <Tag ref={containerRef as any} className={className}>
        {children}
      </Tag>
      <TextSelectionPopup
        position={popupPos}
        selectedText={selectedText}
        adding={adding}
        added={added}
        onAdd={handleAddWord}
        onClose={handleClosePopup}
      />
    </>
  );
}
