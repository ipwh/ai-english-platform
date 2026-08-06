// ============================================
// VocabEnabledText — 包裝元件：讓任何文字區域支援
// 「選取文字 → 加入生字簿」功能
// v2: iPad 強化 — pointerdown 位置校驗 + touch-action
// ============================================
'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useTextSelectionVocab, TextSelectionPopup } from './InlineAddVocabButton';

const DEV_LOG = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

interface VocabEnabledTextProps {
  studentId: string;
  gradeLevel: string;
  children: React.ReactNode;
  onWordAdded?: (word: string) => void;
  className?: string;
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
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const isTapRef = useRef(false);

  // pointerdown: track tap start for distance validation
  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    isTapRef.current = true;
    if (DEV_LOG) { /* debug: pointerdown */ }
  }, []);

  // pointerup: trigger selection check with tap distance validation
  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (DEV_LOG) { /* debug: pointerup */ }
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;

    // Validate tap distance: skip if moved > 10px (was a scroll/drag)
    const downPos = pointerDownPos.current;
    if (downPos) {
      const dx = Math.abs(e.clientX - downPos.x);
      const dy = Math.abs(e.clientY - downPos.y);
      if (dx > 10 || dy > 10) {
        if (DEV_LOG) { /* debug: pointerup moved too much */ }
        isTapRef.current = false;
        pointerDownPos.current = null;
        return;
      }
    }

    e.preventDefault();
    e.stopPropagation();

    // Tag this as a tap so handleSelectionEnd knows it came from pointer
    handleSelectionEnd(e);
    pointerDownPos.current = null;
  }, [handleSelectionEnd]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Mouse (desktop)
    el.addEventListener('mouseup', handleSelectionEnd as EventListener);
    // Touch (Android + older iOS)
    el.addEventListener('touchend', handleSelectionEnd as EventListener, { passive: true });
    // Pointer (iPad + modern browsers)
    el.addEventListener('pointerdown', handlePointerDown as EventListener);
    el.addEventListener('pointerup', handlePointerUp as EventListener);

    return () => {
      el.removeEventListener('mouseup', handleSelectionEnd as EventListener);
      el.removeEventListener('touchend', handleSelectionEnd as EventListener);
      el.removeEventListener('pointerdown', handlePointerDown as EventListener);
      el.removeEventListener('pointerup', handlePointerUp as EventListener);
    };
  }, [handleSelectionEnd, handlePointerDown, handlePointerUp]);

  return (
    <>
      <Tag
        ref={containerRef as React.RefObject<HTMLDivElement>}
        className={className}
        style={{ touchAction: 'manipulation', WebkitUserSelect: 'text', userSelect: 'text' }}
      >
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
