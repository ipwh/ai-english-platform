// ============================================
// InlineAddVocabButton — 無縫添加生字按鈕
// v3: iPad 強化 — pointerdown 位置校驗 + aria
// ============================================
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { BookMarked, Plus, Loader2, Check, Sparkles } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

const DEV_LOG = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// ============================================
// Hook: useTextSelectionVocab — 文字選取加入生字
// ============================================

interface UseTextSelectionVocabOptions {
  studentId: string;
  gradeLevel: string;
  onWordAdded?: (word: string) => void;
  /** 只接受純英文單詞（不超過 N 個詞） */
  maxWords?: number;
}

export function useTextSelectionVocab({
  studentId,
  gradeLevel,
  onWordAdded,
  maxWords = 3,
}: UseTextSelectionVocabOptions) {
  const [selectedText, setSelectedText] = useState('');
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectionEnd = useCallback((e: MouseEvent | TouchEvent | PointerEvent) => {
    if (DEV_LOG) console.log('[InlineVocab] handleSelectionEnd', e.type);

    // For touch/pointer events, validate there's a selection
    if (e.type === 'touchend' || e.type === 'pointerup') {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        if (DEV_LOG) console.log('[InlineVocab] no selection on', e.type);
        return;
      }
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setPopupPos(null);
        return;
      }

      const text = selection.toString().trim();
      const wordCount = text.split(/\s+/).length;
      if (wordCount > maxWords) {
        setPopupPos(null);
        return;
      }
      if (!/^[a-zA-Z\s'-]+$/.test(text)) {
        setPopupPos(null);
        return;
      }

      if (DEV_LOG) console.log('[InlineVocab] showing popup for:', text);
      setSelectedText(text);
      setAdded(false);

      // 在選取文字附近顯示 popup
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setPopupPos({
        x: rect.left + rect.width / 2,
        y: rect.bottom + window.scrollY + 8,
      });
    }, 250);
  }, [maxWords]);

  const handleAddWord = useCallback(async () => {
    if (!selectedText || adding) return;
    if (DEV_LOG) console.log('[InlineVocab] addWord:', selectedText);
    setAdding(true);
    try {
      const res = await fetch('/api/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          word: selectedText,
          partOfSpeech: 'unknown',
          meaningZh: '',
          familiarity: 'new',
          masteryLevel: 0,
        }),
      });

      if (res.ok) {
        setAdded(true);
        onWordAdded?.(selectedText);
        setTimeout(() => setPopupPos(null), 1500);
        fetch('/api/gamification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId, event: { type: 'learnWord' } }),
        }).catch(() => {});
      } else if (res.status === 409) {
        setAdded(true);
        setTimeout(() => setPopupPos(null), 1500);
      }
    } catch {
      // silent
    } finally {
      setAdding(false);
    }
  }, [selectedText, adding, studentId, onWordAdded]);

  const handleClosePopup = useCallback(() => {
    setPopupPos(null);
    setSelectedText('');
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return {
    popupPos,
    selectedText,
    adding,
    added,
    handleSelectionEnd,
    handleAddWord,
    handleClosePopup,
  };
}

// ============================================
// Component: TextSelectionPopup — 浮動加入按鈕
// ============================================

interface TextSelectionPopupProps {
  position: { x: number; y: number } | null;
  selectedText: string;
  adding: boolean;
  added: boolean;
  onAdd: () => void;
  onClose: () => void;
}

export function TextSelectionPopup({
  position,
  selectedText,
  adding,
  added,
  onAdd,
  onClose,
}: TextSelectionPopupProps) {
  const { t, language } = useT();
  const popupRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number } | null>(null);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!position || !popupRef.current) {
      setAdjustedPos(null);
      return;
    }
    const rect = popupRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = position.x;
    let y = position.y;

    // Keep within horizontal bounds
    const halfWidth = rect.width / 2;
    if (x - halfWidth < 12) x = halfWidth + 12;
    if (x + halfWidth > vw - 12) x = vw - halfWidth - 12;

    // If too close to bottom, show above
    if (y + rect.height > vh - 12) {
      y = position.y - rect.height - 12;
    }

    setAdjustedPos({ x, y });
  }, [position]);

  const displayPos = adjustedPos || position;
  if (!displayPos) return null;

  return (
    <div
      ref={popupRef}
      className="fixed z-[100]"
      style={{ left: displayPos.x, top: displayPos.y, transform: 'translate(-50%, 0)' }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={language === 'en' ? 'Add word to vocabulary' : '加入生字簿'}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 px-3 py-2 flex items-center gap-2 animate-in fade-in zoom-in-95 max-w-[calc(100vw-24px)]">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
          &ldquo;{selectedText}&rdquo;
        </span>
        {added ? (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 whitespace-nowrap">
            <Check className="w-3.5 h-3.5" />
            {language === 'en' ? 'Added!' : '已加入！'}
          </span>
        ) : (
          <button
            onClick={onAdd}
            disabled={adding}
            role="button"
            aria-label={`${language === 'en' ? 'Add' : '加入'} "${selectedText}" ${language === 'en' ? 'to vocabulary' : '到生字簿'}`}
            className="flex items-center gap-1 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 active:bg-teal-700 disabled:bg-gray-300 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap min-h-[36px]"
          >
            {adding ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <BookMarked className="w-3 h-3" />
            )}
            {adding
              ? (language === 'en' ? 'Adding...' : '加入中...')
              : (language === 'en' ? 'Add to Vocab' : '加入生字簿')}
          </button>
        )}
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-1 p-1 min-w-[28px] min-h-[28px] flex items-center justify-center"
          aria-label={language === 'en' ? 'Close' : '關閉'}
        >
          <span className="text-xs">✕</span>
        </button>
      </div>
    </div>
  );
}

// ============================================
// Component: InlineWordBadge — 單字旁的小 + 按鈕
// ============================================

interface InlineWordBadgeProps {
  word: string;
  studentId: string;
  gradeLevel?: string;
  onAdded?: (word: string) => void;
  /** 是否始終顯示（預設 hover 才顯示） */
  alwaysShow?: boolean;
  className?: string;
  /** 是否為 AI 建議的替換詞（style 略有不同）*/
  isSuggestion?: boolean;
}

export function InlineWordBadge({
  word,
  studentId,
  gradeLevel = 'S4',
  onAdded,
  alwaysShow = false,
  className = '',
  isSuggestion = false,
}: InlineWordBadgeProps) {
  const { t, language } = useT();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [duplicate, setDuplicate] = useState(false);

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (adding || added) return;

    setAdding(true);
    try {
      const res = await fetch('/api/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          word: word.trim(),
          partOfSpeech: 'unknown',
          meaningZh: '',
          familiarity: 'new',
          masteryLevel: 0,
        }),
      });

      if (res.ok) {
        setAdded(true);
        onAdded?.(word);
        fetch('/api/gamification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId, event: { type: 'learnWord' } }),
        }).catch(() => {});
        setTimeout(() => setAdded(false), 3000);
      } else if (res.status === 409) {
        setDuplicate(true);
        setTimeout(() => setDuplicate(false), 3000);
      }
    } catch {
      // silent
    } finally {
      setAdding(false);
    }
  };

  return (
    <span className={`inline-flex items-center gap-0.5 group ${className}`}>
      <span className={isSuggestion ? 'text-purple-600 dark:text-purple-400 font-medium' : ''}>
        {word}
      </span>
      <button
        onClick={handleAdd}
        disabled={adding || added}
        title={
          duplicate
            ? (language === 'en' ? 'Already in vocab book' : '已在生字簿中')
            : added
              ? (language === 'en' ? 'Added!' : '已加入！')
              : (language === 'en' ? 'Add to vocab book' : '加入生字簿')
        }
        className={`inline-flex items-center justify-center rounded-full transition-all ${
          alwaysShow || isSuggestion
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 max-sm:opacity-100'
        } ${
          added
            ? 'text-green-500 bg-green-50 dark:bg-green-900/20'
            : duplicate
              ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
              : 'text-teal-500 hover:text-teal-700 hover:bg-teal-50 active:bg-teal-100 dark:hover:bg-teal-900/30 dark:active:bg-teal-900/50'
        }`}
        style={{ width: '24px', height: '24px', minWidth: '24px', minHeight: '24px' }}
      >
        {adding ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : added ? (
          <Check className="w-3 h-3" />
        ) : duplicate ? (
          <Check className="w-3 h-3" />
        ) : (
          <Plus className="w-3 h-3" />
        )}
      </button>
    </span>
  );
}

// ============================================
// Component: AddToVocabButton — 通用「加入生字簿」按鈕
// ============================================

interface AddToVocabButtonProps {
  word: string;
  studentId: string;
  onAdded?: (word: string) => void;
  size?: 'sm' | 'md';
  variant?: 'icon' | 'text' | 'pill';
  className?: string;
}

export function AddToVocabButton({
  word,
  studentId,
  onAdded,
  size = 'sm',
  variant = 'icon',
  className = '',
}: AddToVocabButtonProps) {
  const { t, language } = useT();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [duplicate, setDuplicate] = useState(false);

  const handleAdd = async () => {
    if (adding || added) return;
    setAdding(true);
    try {
      const res = await fetch('/api/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          word: word.trim(),
          partOfSpeech: 'unknown',
          meaningZh: '',
          familiarity: 'new',
          masteryLevel: 0,
        }),
      });
      if (res.ok) {
        setAdded(true);
        onAdded?.(word);
        setTimeout(() => setAdded(false), 3000);
      } else if (res.status === 409) {
        setDuplicate(true);
        setTimeout(() => setDuplicate(false), 3000);
      }
    } catch { /* silent */ }
    finally { setAdding(false); }
  };

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1.5';

  if (variant === 'icon') {
    return (
      <button
        onClick={handleAdd}
        disabled={adding || added}
        title={language === 'en' ? 'Add to vocab book' : '加入生字簿'}
        className={`p-2 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center ${
          added
            ? 'text-green-500 bg-green-50 dark:bg-green-900/20'
            : duplicate
              ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
              : 'text-gray-400 hover:text-teal-500 hover:bg-teal-50 active:bg-teal-100 dark:hover:bg-teal-900/30 dark:active:bg-teal-900/50'
        } ${className}`}
      >
        {adding ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : added ? (
          <Check className="w-4 h-4" />
        ) : (
          <BookMarked className="w-4 h-4" />
        )}
      </button>
    );
  }

  if (variant === 'pill') {
    return (
      <button
        onClick={handleAdd}
        disabled={adding || added}
        className={`inline-flex items-center gap-1 ${sizeClass} rounded-full font-medium transition-all min-h-[36px] ${
          added
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            : duplicate
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              : 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 hover:bg-teal-100 active:bg-teal-200 dark:hover:bg-teal-900/40 dark:active:bg-teal-900/60'
        } ${className}`}
      >
        {adding ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : added ? (
          <Check className="w-3 h-3" />
        ) : (
          <BookMarked className="w-3 h-3" />
        )}
        {added
          ? (language === 'en' ? 'Added' : '已加入')
          : duplicate
            ? (language === 'en' ? 'Exists' : '已有')
            : (language === 'en' ? 'Add to Vocab' : '加入生字簿')}
      </button>
    );
  }

  // text variant
  return (
    <button
      onClick={handleAdd}
      disabled={adding || added}
      className={`inline-flex items-center gap-1 ${sizeClass} rounded-lg font-medium transition-colors min-h-[36px] ${
        added
          ? 'text-green-600 dark:text-green-400'
          : duplicate
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-teal-600 dark:text-teal-400 hover:text-teal-700 active:text-teal-800 hover:underline'
      } ${className}`}
    >
      <BookMarked className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      {adding
        ? (language === 'en' ? 'Adding...' : '加入中...')
        : added
          ? (language === 'en' ? 'Added!' : '已加入！')
          : duplicate
            ? (language === 'en' ? 'In Vocab Book' : '已在生字簿')
            : (language === 'en' ? 'Add to Vocab' : '加入生字簿')}
    </button>
  );
}
