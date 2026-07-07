// ============================================
// 管理員後台首頁 — /admin
// ============================================
'use client';

import Link from 'next/link';
import { Upload, Users, BookOpen, BarChart3 } from 'lucide-react';

const quickLinks = [
  {
    label: '批量匯入',
    description: '使用 CSV 批量匯入學生與教師資料',
    href: '/admin/import',
    icon: Upload,
    color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  },
  {
    label: '使用者管理',
    description: '查看與管理所有使用者帳號',
    href: '/admin/users',
    icon: Users,
    color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  },
  {
    label: '班級管理',
    description: '管理班級、年級與學年設定',
    href: '/admin/classes',
    icon: BookOpen,
    color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  },
  {
    label: '數據分析',
    description: '查看平台使用數據與學習報表',
    href: '/admin/reports',
    icon: BarChart3,
    color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  },
];

export default function AdminDashboard() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          管理員後台
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          歡迎使用 AI 英語學習平台管理後台。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${link.color}`}
              >
                <link.icon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                  {link.label}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {link.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
