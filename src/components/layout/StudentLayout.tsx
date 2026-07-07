// ============================================
// 學生端佈局 — 使用統一 SidebarLayout
// ============================================
'use client';

import SidebarLayout from './SidebarLayout';
import { studentNavItems } from '@/lib/nav';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout
      role="student"
      navItems={studentNavItems}
      accentColor="teal"
      subtitle="學生版"
    >
      {children}
    </SidebarLayout>
  );
}
