// ============================================
// 教師端佈局 — 使用統一 SidebarLayout
// ============================================
'use client';

import SidebarLayout from './SidebarLayout';
import { teacherNavSections } from '@/lib/nav';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout
      role="teacher"
      navSections={teacherNavSections}
      accentColor="blue"
      subtitle="教師版"
    >
      {children}
    </SidebarLayout>
  );
}
