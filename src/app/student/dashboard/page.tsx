// ============================================
// 學生端首頁 Dashboard
// ============================================
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Play, BookOpen, AlertTriangle, TrendingUp, BookMarked, ArrowRight, Clock, Calendar, Flame, Sparkles, Loader2 } from 'lucide-react';
import { mockStudent, mockStudentKpis, mockQuestions, mockStudentAssignments } from '@/lib/mock-data';
import KpiCard from '@/components/shared/KpiCard';
import ProgressBar from '@/components/shared/ProgressBar';
import SkillChip from '@/components/shared/SkillChip';
import { getGreeting, daysRemaining, formatDateShort } from '@/lib/utils';
import { getStatusColor } from '@/lib/utils';
import { statusLabels } from '@/lib/nav';

export default function StudentDashboardPage() {
  const student = mockStudent;
  const greeting = getGreeting();
  const kpis = mockStudentKpis;
  const weakSkills = student.weakSkills;
  const assignments = mockStudentAssignments.filter(a => a.status !== 'completed').slice(0, 3);
  const recentQuestion = mockQuestions[0];

  // === AI 進度分析 ===
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<{
    summary: string;
    urgentAreas: string[];
    recommendedFocus: { skill: string; reason: string; priority: string }[];
    encouragementMessage: string;
  } | null>(null);

  const handleAIAnalysis = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/analyze-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentLevel: student.level,
          overallAccuracy: student.overallAccuracy,
          weakSkills: student.weakSkills.map(w => ({
            name: w.subSkill,
            nameZh: w.subSkillZh,
            accuracy: w.accuracy,
          })),
          recentPerformance: [
            { date: '2026-07-05', accuracy: 72, questionsDone: 8 },
            { date: '2026-07-04', accuracy: 65, questionsDone: 10 },
            { date: '2026-07-03', accuracy: 58, questionsDone: 6 },
          ],
          streakDays: student.streakDays,
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setAiInsight(json.analysis);
      }
    } catch { /* silent fail */ }
    finally { setAiLoading(false); }
  };

  return (
    <div className="space-y-6">
      {/* ====== 歡迎區 ====== */}
      <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-teal-100 text-sm">{greeting}，{student.nameZh} 👋</p>
            <h1 className="text-2xl font-bold mt-1">今日目標：完成 10 題練習</h1>
            <div className="flex items-center gap-4 mt-3 text-sm text-teal-100">
              <span className="flex items-center gap-1"><Flame className="w-4 h-4" /> 連續 {student.streakDays} 天</span>
              <span>·</span>
              <span>正確率 {student.overallAccuracy}%</span>
            </div>
          </div>
          <Link
            href="/student/practice"
            className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-white text-teal-600 rounded-xl font-medium hover:bg-teal-50 transition-colors"
          >
            <Play className="w-4 h-4" />
            繼續練習
          </Link>
        </div>
        {/* 今日進度條 */}
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1">
            <span>今日進度</span>
            <span>3/10 題</span>
          </div>
          <div className="w-full bg-teal-400/40 rounded-full h-2">
            <div className="bg-white rounded-full h-2 transition-all" style={{ width: '30%' }} />
          </div>
        </div>
      </div>

      {/* 手機版繼續按鈕 */}
      <Link
        href="/student/practice"
        className="sm:hidden flex items-center justify-center gap-2 w-full py-3 bg-teal-500 text-white rounded-xl font-medium"
      >
        <Play className="w-4 h-4" />
        繼續練習
      </Link>

      {/* ====== KPI 卡片 ====== */}
      <div className="grid grid-cols-3 gap-3">
        {kpis.map((kpi, i) => (
          <KpiCard key={i} data={kpi} />
        ))}
      </div>

      {/* ====== 教師任務區 ====== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-teal-500" />
            待完成作業
          </h2>
          <Link href="/student/assignments" className="text-sm text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1">
            查看全部 <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-3">
          {assignments.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center text-gray-400">
              🎉 所有作業已完成！
            </div>
          ) : (
            assignments.map((a) => (
              <Link
                key={a.id}
                href={`/student/practice?assignment=${a.id}`}
                className="block bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-600 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900 dark:text-white">{a.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(a.status)}`}>
                    {statusLabels[a.status]}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 截止：{formatDateShort(a.dueDate)}</span>
                  <SkillChip grammarItem={a.grammarItem} languageSkill={a.languageSkill} />
                </div>
                {a.score !== undefined && (
                  <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    得分：<span className="font-bold text-teal-600">{a.score} 分</span>
                  </div>
                )}
              </Link>
            ))
          )}
        </div>
      </section>

      {/* ====== 弱點與建議區 ====== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            需要加強的技能
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {weakSkills.map((skill, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-start justify-between mb-2">
                <SkillChip grammarItem={skill.grammarItem} languageSkill={skill.languageSkill} subSkill={skill.subSkill} />
                <span className="text-sm font-bold text-red-500">{skill.accuracy}%</span>
              </div>
              <ProgressBar value={skill.accuracy} size="sm" showPercentage={false} />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                已練習 {skill.totalAttempts} 次 · 建議針對性重溫
              </p>
              <Link
                href={`/student/practice?skill=${skill.grammarItem || skill.languageSkill}&difficulty=remedial`}
                className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
              >
                開始練習 <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ====== 快捷功能區 ====== */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">快捷功能</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'AI 練習', icon: BookOpen, href: '/student/practice', color: 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400' },
            { label: '查看錯題', icon: AlertTriangle, href: '/student/mistakes', color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
            { label: '我的進度', icon: TrendingUp, href: '/student/progress', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
            { label: '生字簿', icon: BookMarked, href: '/student/vocabulary', color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-600 transition-colors text-center"
            >
              <div className={`w-10 h-10 ${item.color} rounded-xl flex items-center justify-center mx-auto mb-2`}>
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ====== 最近練習 ====== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-teal-500" />
            最近練習
          </h2>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 dark:bg-teal-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-white truncate">{recentQuestion.subSkill}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">上次練習：7月5日</p>
            </div>
            <Link
              href={`/student/practice/${recentQuestion.id}`}
              className="px-3 py-1.5 text-sm bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
            >
              繼續
            </Link>
          </div>
        </div>
      </section>

      {/* ====== AI 智能分析 ====== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            AI 學習洞察
          </h2>
        </div>

        {!aiInsight && (
          <button
            onClick={handleAIAnalysis}
            disabled={aiLoading}
            className="w-full bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border-2 border-dashed border-purple-200 dark:border-purple-800 hover:border-purple-400 transition-colors text-center disabled:opacity-50"
          >
            {aiLoading ? (
              <div className="flex items-center justify-center gap-2 text-purple-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>AI 正在分析你的學習數據...</span>
              </div>
            ) : (
              <div className="text-purple-500">
                <Sparkles className="w-8 h-8 mx-auto mb-2" />
                <p className="font-medium">點擊獲取 AI 個人化學習建議</p>
                <p className="text-xs text-gray-400 mt-1">AI 將根據你的練習數據提供專屬分析</p>
              </div>
            )}
          </button>
        )}

        {aiInsight && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-purple-100 dark:border-purple-800 space-y-4">
            {/* 摘要 */}
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{aiInsight.summary}</p>
            </div>

            {/* 急需改善 */}
            {aiInsight.urgentAreas.length > 0 && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">🚨 急需改善</p>
                {aiInsight.urgentAreas.map((area, i) => (
                  <p key={i} className="text-xs text-red-700 dark:text-red-300">• {area}</p>
                ))}
              </div>
            )}

            {/* 建議重點 */}
            {aiInsight.recommendedFocus.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500">📌 建議優先學習</p>
                {aiInsight.recommendedFocus.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{f.skill}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      f.priority === 'high' ? 'bg-red-100 text-red-600' : f.priority === 'medium' ? 'bg-yellow-100 text-yellow-600' : 'bg-green-100 text-green-600'
                    }`}>
                      {f.priority === 'high' ? '高優先' : f.priority === 'medium' ? '中優先' : '低優先'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* 鼓勵訊息 */}
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <p className="text-sm text-purple-700 dark:text-purple-300">💜 {aiInsight.encouragementMessage}</p>
            </div>

            <button
              onClick={handleAIAnalysis}
              disabled={aiLoading}
              className="w-full py-2 text-sm text-purple-500 hover:text-purple-700 border border-purple-200 dark:border-purple-800 rounded-lg disabled:opacity-50"
            >
              {aiLoading ? '分析中...' : '🔄 重新分析'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
