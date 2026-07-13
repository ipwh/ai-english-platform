// ============================================
// 管理員後台首頁 — /admin
// ============================================
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Upload, Users, BookOpen, BarChart3, RefreshCw, FileSpreadsheet, Wrench, Trash2, Loader2 } from 'lucide-react';

import { useT } from '@/hooks/use-i18n';

const quickLinkKeys = [
  { key: 'admin.quickLinks.import', href: '/admin/import', icon: Upload, color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  { key: 'admin.quickLinks.users', href: '/admin/users', icon: Users, color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  { key: 'admin.quickLinks.classes', href: '/admin/classes', icon: BookOpen, color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  { key: 'admin.quickLinks.reports', href: '/admin/reports', icon: BarChart3, color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
];

export default function AdminDashboard() {
  const { t } = useT();
  const [toolRunning, setToolRunning] = useState<string | null>(null);
  const [toolResult, setToolResult] = useState('');

  const runTool = async (endpoint: string, name: string) => {
    setToolRunning(name);
    setToolResult('');
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      setToolResult(`${name} ${t('common.success')}：${JSON.stringify(data).slice(0, 200)}`);
    } catch {
      setToolResult(`${name} ${t('common.error')}`);
    }
    finally { setToolRunning(null); }
  };

  const tools = [
    { name: t('admin.tools.syncSheets'), desc: t('admin.tools.syncSheets.desc'), endpoint: '/api/admin/sync-sheets', icon: RefreshCw, color: 'text-teal-500' },
    { name: t('admin.tools.exportDashboard'), desc: t('admin.tools.exportDashboard.desc'), endpoint: '/api/admin/export-sheets', icon: FileSpreadsheet, color: 'text-green-500' },
    { name: t('admin.tools.fixClasses'), desc: t('admin.tools.fixClasses.desc'), endpoint: '/api/admin/fix-classes', icon: Wrench, color: 'text-orange-500' },
    { name: t('admin.tools.cleanupMock'), desc: t('admin.tools.cleanupMock.desc'), endpoint: '/api/admin/cleanup-mock-data', icon: Trash2, color: 'text-red-500' },
  ];
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('admin.dashboard.title')}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {t('admin.dashboard.welcome')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quickLinkKeys.map((link) => (
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
                  {t(link.key + '.label')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t(link.key + '.description')}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* 管理工具 */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-gray-500" /> {t('admin.tools.title')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tools.map((tool) => (
            <button
              key={tool.name}
              onClick={() => runTool(tool.endpoint, tool.name)}
              disabled={toolRunning !== null}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-left hover:border-gray-300 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                {toolRunning === tool.name
                  ? <Loader2 className={`w-5 h-5 animate-spin ${tool.color}`} />
                  : <tool.icon className={`w-5 h-5 ${tool.color}`} />
                }
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{tool.name}</p>
                  <p className="text-xs text-gray-500">{tool.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
        {toolResult && (
          <p className="mt-3 text-xs text-gray-500 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg font-mono">
            {toolResult}
          </p>
        )}
      </div>
    </div>
  );
}
