// ============================================
// HighlightContextMenu — 選取文字右鍵加入生字簿
// v3: 完整 iPad/Android/Desktop 三平台觸控支援
// ============================================
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { BookMarked, Sparkles } from 'lucide-react';

const DEV_LOG = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

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
  const touchMoved = useRef(false);
  const pointerDownPos = useRef<Position | null>(null);

  const showMenuForSelection = useCallback((x: number, y: number) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
return;
    }

    const text = selection.toString().trim();
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 3) {
return;
    }
    if (!/^[a-zA-Z\s'-]+$/.test(text)) {
return;
    }
setSelectedWord(text);
    setMenuPos({ x, y });
  }, []);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    showMenuForSelection(e.clientX, e.clientY);
  }, [showMenuForSelection]);

  // pointerdown: track tap start for distance validation
  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    touchMoved.current = false;
}, []);

  // pointerup: universal fallback for iPad/Android/Desktop
  const handlePointerUp = useCallback((e: PointerEvent) => {
if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;

    // Validate tap distance: skip if moved > 10px
    const downPos = pointerDownPos.current;
    if (downPos) {
      const dx = Math.abs(e.clientX - downPos.x);
      const dy = Math.abs(e.clientY - downPos.y);
      if (dx > 10 || dy > 10) {
pointerDownPos.current = null;
        return;
      }
    }

    if (touchMoved.current) {
return;
    }

    // Prevent default to avoid double-fire on iPad
    e.preventDefault();
    e.stopPropagation();

    // Delay to let browser finalize text selection
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
return;
      }
      showMenuForSelection(e.clientX, e.clientY);
    }, 350);
  }, [showMenuForSelection]);

  // touchend: backup for older iOS
  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (touchMoved.current) return;

    // On iPad, touch events after text selection may have no touches
    // Use last known position
    const pos = lastTouchPos.current;
    if (!pos) return;

    // Only fire on short tap (long press fires separately)
setTimeout(() => {
      // Avoid double-fire if pointerup already handled it
      if (menuPos !== null) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
      showMenuForSelection(pos.x, pos.y);
    }, 400);
  }, [showMenuForSelection, menuPos]);

  // Long-press handler for touch devices
  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Prevent default to stop iOS text selection UI from interfering
    // Only prevent on long-press targets, not for normal text interaction
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    touchMoved.current = false;
    const touch = e.touches[0];
    lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      const pos = lastTouchPos.current;
      if (pos && !touchMoved.current) {
showMenuForSelection(pos.x, pos.y);
      }
    }, 600);
  }, [showMenuForSelection]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    const startPos = lastTouchPos.current;
    if (startPos) {
      const dx = Math.abs(touch.clientX - startPos.x);
      const dy = Math.abs(touch.clientY - startPos.y);
      if (dx > 8 || dy > 8) {
        touchMoved.current = true;
}
    }
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
    // Desktop
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleCloseMenu);
    // Touch: use { passive: false } to allow preventDefault on iPad
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchend', handleTouchEnd as EventListener, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    // Pointer: universal fallback
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleCloseMenu);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd as EventListener);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handleContextMenu, handleCloseMenu, handleTouchStart, handleTouchEnd, handleTouchMove, handlePointerDown, handlePointerUp]);

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
