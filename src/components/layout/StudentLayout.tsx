// ============================================
// 學生端佈局 — 使用統一 SidebarLayout
// ============================================
'use client';

import SidebarLayout from './SidebarLayout';
import { studentNavItems } from '@/lib/nav';
import { useAppStore } from '@/store/appStore';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { language } = useAppStore();
  return (
    <SidebarLayout
      role="student"
      navItems={studentNavItems}
      accentColor="teal"
      subtitle={language === 'en' ? 'Student' : '學生版'}
    >
      {children}
    </SidebarLayout>
  );
}
