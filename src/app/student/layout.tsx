// ============================================
// 學生端路由佈局包裝器
// ============================================
import StudentLayout from '@/components/layout/StudentLayout';

export default function StudentRouteLayout({ children }: { children: React.ReactNode }) {
  return <StudentLayout>{children}</StudentLayout>;
}
