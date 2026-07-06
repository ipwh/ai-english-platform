// ============================================
// 教師端路由佈局包裝器
// ============================================
import TeacherLayout from '@/components/layout/TeacherLayout';

export default function TeacherRouteLayout({ children }: { children: React.ReactNode }) {
  return <TeacherLayout>{children}</TeacherLayout>;
}
