// ============================================
// 學生端佈局 — 使用統一 SidebarLayout
// ============================================
'use client';

import SidebarLayout from './SidebarLayout';
import { studentNavItems } from '@/lib/nav';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  return (
    <SidebarLayout
      role="student"
      navItems={studentNavItems}
      accentColor="teal"
      subtitle={t('layout.studentSubtitle')}
    >
      {children}
    </SidebarLayout>
  );
}
