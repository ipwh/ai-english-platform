// ============================================
// HighlightContextMenu — 選取文字右鍵加入生字簿
// 用於練習頁、錯題頁、寫作頁等任何顯示英文文字的地方
// ============================================
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { BookMarked, Sparkles } from 'lucide-react';

interface HighlightContextMenuProps {
  /** 學生 ID */
  studentId: string;
  /** 年級 */
  gradeLevel: string;
  /** 加入成功回呼 */
  onWordAdded?: (word: string) => void;
}

interface Position {
  x: number;
  y: number;
}

export function useHighlightAddVocab(
  studentId: string,
  gradeLevel: string,
  onWordAdded?: (word: string) => void,
) {
  const [selectedWord, setSelectedWord] = useState('');
  const [menuPos, setMenuPos] = useState<Position | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTouchPos = useRef<Position | null>(null);

  const showMenuForSelection = useCallback((x: number, y: number) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

    const text = selection.toString().trim();
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 3) return;
    if (!/^[a-zA-Z\s'-]+$/.test(text)) return;

    setSelectedWord(text);
    setMenuPos({ x, y });
  }, []);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    showMenuForSelection(e.clientX, e.clientY);
  }, [showMenuForSelection]);

  // Long-press handler for touch devices
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    const touch = e.touches[0];
    lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      // Only show on long press if there's a text selection
      const pos = lastTouchPos.current;
      if (pos) showMenuForSelection(pos.x, pos.y);
    }, 600); // 600ms long press
  }, [showMenuForSelection]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    // Cancel long press if finger moves
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleAddToVocab = useCallback(() => {
    setShowQuickAdd(true);
    setMenuPos(null);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMenuPos(null);
    setSelectedWord('');
  }, []);

  const handleWordAdded = useCallback((word: string) => {
    setShowQuickAdd(false);
    setSelectedWord('');
    onWordAdded?.(word);
  }, [onWordAdded]);

  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleCloseMenu);
    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchmove', handleTouchMove);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleCloseMenu);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, [handleContextMenu, handleCloseMenu, handleTouchStart, handleTouchEnd, handleTouchMove]);

  return {
    menuPos,
    selectedWord,
    showQuickAdd,
    handleAddToVocab,
    handleCloseMenu,
    handleWordAdded,
    setShowQuickAdd,
  };
}

export function HighlightContextMenu({
  menuPos,
  selectedWord,
  onAddToVocab,
  onClose,
}: {
  menuPos: Position | null;
  selectedWord: string;
  onAddToVocab: () => void;
  onClose: () => void;
}) {
  if (!menuPos) return null;

  return (
    <>
      {/* Backdrop to close on click */}
      <div className="fixed inset-0 z-[100]" onClick={onClose} />

      {/* Menu */}
      <div
        className="fixed z-[101] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[180px] max-w-[calc(100vw-16px)]"
        style={{
          left: Math.min(menuPos.x, window.innerWidth - 220),
          top: Math.min(menuPos.y, window.innerHeight - 120),
        }}
      >
        <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100 dark:border-gray-700 truncate">
          已選取：<span className="font-medium text-gray-600 dark:text-gray-300">{selectedWord}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onAddToVocab(); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
        >
          <BookMarked className="w-4 h-4 text-teal-500" />
          加入生字簿
          <Sparkles className="w-3 h-3 text-purple-400 ml-auto" />
        </button>
      </div>
    </>
  );
}
