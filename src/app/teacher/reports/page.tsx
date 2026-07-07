// ============================================
// 教師端 — 報告與匯出
// TODO: connect to API
// ============================================
'use client';

import { Download, FileText, Users, BarChart3, FileSpreadsheet } from 'lucide-react';
import { mockWeeklyReports } from '@/lib/mock-data';
import { formatDate } from '@/lib/utils';
import ProgressBar from '@/components/shared/ProgressBar';
import { useT } from '@/hooks/use-i18n';

export default function TeacherReportsPage() {
  const { t } = useT();
  const reports = mockWeeklyReports;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📄 報告與匯出</h1>

      {/* 快速報表類型 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: '班級週報', icon: BarChart3, desc: '每週班級表現摘要' },
          { label: '學生個別摘要', icon: Users, desc: '單一學生進度報告' },
          { label: '家長面談摘要', icon: FileText, desc: '家長日面談用摘要卡' },
        ].map((item, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mx-auto mb-3">
              <item.icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-medium text-gray-900 dark:text-white">{item.label}</h3>
            <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
            <button className="mt-3 px-4 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-lg hover:bg-gray-200 transition-colors">
              生成報告
            </button>
          </div>
        ))}
      </div>

      {/* 最近週報 */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">最近週報</h2>
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">{r.className} 班級週報</h3>
                  <p className="text-xs text-gray-500">週次：{formatDate(r.weekStart)} 起</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const csv = [
                        'Class,Avg Accuracy,Avg Completion,Active Students',
                        `${r.className},${r.avgAccuracy}%,${r.avgCompletion}%,${r.activeStudents}`,
                      ].join('\n');
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = `report-${r.className}.csv`;
                      a.click(); URL.revokeObjectURL(url);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    title="匯出 CSV"
                  >
                    <FileText className="w-3 h-3" /> CSV
                  </button>
                  <button
                    onClick={() => alert('PDF 匯出功能即將推出')}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-400 text-white rounded-lg hover:bg-gray-500"
                    title="匯出 PDF（即將推出）"
                  >
                    <FileSpreadsheet className="w-3 h-3" /> PDF
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">平均正確率</p>
                  <p className="font-bold text-gray-900 dark:text-white">{r.avgAccuracy}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">平均完成率</p>
                  <p className="font-bold text-gray-900 dark:text-white">{r.avgCompletion}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">活躍學生</p>
                  <p className="font-bold text-gray-900 dark:text-white">{r.activeStudents} 人</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">最弱技能</p>
                  <p className="font-bold text-orange-600">{r.topWeakSkillZh}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg">{r.highlights}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 家長面談摘要卡 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-500" /> 家長面談摘要卡（範本）
        </h2>
        <div className="space-y-3">
          {[
            { name: '陳家明', class: '4A', accuracy: 68, comment: '文法弱點需關注，建議增加練習量。', risk: '中' },
            { name: '林小芬', class: '4A', accuracy: 52, comment: '完成率偏低，需與家長商討對策。', risk: '高' },
          ].map((s, i) => (
            <div key={i} className="flex items-start gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">{s.name.charAt(0)}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">{s.name}</span>
                  <span className="text-xs text-gray-400">{s.class}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${s.risk === '高' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{s.risk}風險</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{s.comment}</p>
              </div>
              <button className="text-xs text-blue-600 hover:underline flex-shrink-0">
                <Download className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
