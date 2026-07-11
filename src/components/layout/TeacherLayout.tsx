// ============================================
// 教師端佈局 — 使用統一 SidebarLayout
// ============================================
'use client';

import SidebarLayout from './SidebarLayout';
import { teacherNavSections } from '@/lib/nav';
import { useAppStore } from '@/store/appStore';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { language } = useAppStore();
  return (
    <SidebarLayout
      role="teacher"
      navSections={teacherNavSections}
      accentColor="blue"
      subtitle={language === 'en' ? 'Teacher' : '教師版'}
    >
      {children}
    </SidebarLayout>
  );
}
