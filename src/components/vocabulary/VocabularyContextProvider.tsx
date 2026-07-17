// ============================================
// VocabularyContextProvider — 全域生字簿右鍵加入
// 包裝所有學生頁面，自動在任何英文文字上提供右鍵「加入生字簿」
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { useHighlightAddVocab, HighlightContextMenu } from '@/components/vocabulary/HighlightContextMenu';
import QuickAddVocab from '@/components/vocabulary/QuickAddVocab';
import { useAppStore } from '@/store/appStore';

export default function VocabularyContextProvider({ children }: { children: React.ReactNode }) {
  const store = useAppStore();
  const [studentId, setStudentId] = useState('');
  const [gradeLevel, setGradeLevel] = useState('S4');

  useEffect(() => {
    fetch('/api/auth/profile')
      .then(r => r.json())
      .then(d => {
        const id = d?.user?.id || store.userId || '';
        if (id) setStudentId(id);
        const level = d?.user?.level || d?.user?.class?.gradeLevel;
        if (level && ['S1','S2','S3','S4','S5','S6'].includes(level)) setGradeLevel(level);
      })
      .catch(() => {});
  }, [store.userId]);

  const {
    menuPos,
    selectedWord,
    showQuickAdd,
    handleAddToVocab,
    handleWordAdded,
  } = useHighlightAddVocab(studentId, gradeLevel);

  return (
    <>
      {children}

      {/* Right-click context menu */}
      <HighlightContextMenu
        menuPos={menuPos}
        selectedWord={selectedWord}
        onAddToVocab={handleAddToVocab}
        onClose={() => {}}
      />

      {/* Quick Add modal (triggered from right-click) */}
      {showQuickAdd && studentId && (
        <QuickAddVocab
          studentId={studentId}
          gradeLevel={gradeLevel}
          initialWord={selectedWord}
          onAdded={() => handleWordAdded(selectedWord)}
        />
      )}
    </>
  );
}
