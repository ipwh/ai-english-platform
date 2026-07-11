// ============================================
// 教師端佈局 — 使用統一 SidebarLayout
// ============================================
'use client';

import SidebarLayout from './SidebarLayout';
import { teacherNavSections } from '@/lib/nav';
import { useAppStore } from '@/store/appStore';
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
