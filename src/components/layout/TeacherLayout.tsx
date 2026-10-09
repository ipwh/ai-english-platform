// ============================================
// 教師端佈局 — 使用統一 SidebarLayout
// ============================================
'use client';

import SidebarLayout from './SidebarLayout';
import { teacherNavSections } from '@/shared/utils/nav';
import { useT } from '@/hooks/use-i18n';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  return (
    <SidebarLayout
      role="teacher"
      navSections={teacherNavSections}
      accentColor="blue"
      subtitle={t('layout.teacherSubtitle')}
    >
      {children}
    </SidebarLayout>
  );
}
