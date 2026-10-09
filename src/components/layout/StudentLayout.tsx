// ============================================
// 學生端佈局 — 使用統一 SidebarLayout + 全域生字簿右鍵加入
// ============================================
'use client';

import SidebarLayout from './SidebarLayout';
import VocabularyContextProvider from '@/modules/vocabulary/components/VocabularyContextProvider';
import { studentNavItems } from '@/shared/utils/nav';
import { useT } from '@/hooks/use-i18n';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  return (
    <VocabularyContextProvider>
      <SidebarLayout
        role="student"
        navItems={studentNavItems}
        accentColor="teal"
        subtitle={t('layout.studentSubtitle')}
      >
        {children}
      </SidebarLayout>
    </VocabularyContextProvider>
  );
}
