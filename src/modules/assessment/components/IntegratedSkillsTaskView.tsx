// ============================================
// IntegratedSkillsTaskView (v4) — 聽→記→寫 單頁完整流程
// 步驟鎖定 · 自動儲存 · 行動裝置友好 · 雙維度批改
// ============================================
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  Loader2, Send, Sparkles, CheckCircle2, XCircle, Lightbulb,
  Target, BookOpen, AlertTriangle, Award, ChevronDown, ChevronUp,
  Save, Headphones, Edit3, ChevronRight, PenLine, FileText,
  ArrowLeft, Eye, EyeOff, Languages, Download,
} from 'lucide-react';
import AudioPlayer from '@/components/shared/AudioPlayer';
import ListeningScript from '@/components/shared/ListeningScript';
import { useAppStore } from '@/store/appStore';
import { useIntegratedSkillsStore, type IntegratedTaskData, type TaskStep } from '@/store/integratedSkillsStore';
import { useT } from '@/hooks/use-i18n';
import VocabEnabledText from '@/modules/vocabulary/components/VocabEnabledText';

const DRAFT_KEY = 'integrated-skills-draft-v4';
const AUTO_SAVE_INTERVAL = 15_000; // 15 秒

interface Props {
  task: IntegratedTaskData;
  onBack?: () => void;
}

// ============================================
// 子元件：步驟指示器
// ============================================
function StepIndicator({ activeStep, listeningCompleted, hasNotes, hasWriting }: {
  activeStep: TaskStep;
  listeningCompleted: boolean;
  hasNotes: boolean;
  hasWriting: boolean;
}) {
  const { t } = useT();
  const steps = [
    { num: 1, label: t('is.stepListening'), icon: Headphones, done: listeningCompleted },
    { num: 2, label: t('is.stepNotes'), icon: Edit3, done: hasNotes },
    { num: 3, label: t('is.stepWriting'), icon: PenLine, done: hasWriting },
  ];

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const isActive = activeStep === step.num;
        const isDone = step.done;
        const Icon = step.icon;
        return (
          <div key={step.num} className="flex items-center flex-1">
            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
              isActive
                ? 'bg-teal-500 text-white shadow-md shadow-teal-200 dark:shadow-teal-900/30 scale-105'
                : isDone
                  ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
            }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                isActive
                  ? 'bg-white/20'
                  : isDone
                    ? 'bg-green-200 dark:bg-green-800'
                    : 'bg-gray-200 dark:bg-gray-600'
              }`}>
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : step.num}
              </div>
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < 2 && (
              <div className={`flex-1 h-0.5 mx-1 rounded ${
                step.done ? 'bg-green-300 dark:bg-green-700' : 'bg-gray-200 dark:bg-gray-600'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// 子元件：匯出按鈕
// ============================================
function ExportBtn({ fmt, color, task, s }: { fmt: string; color: string; task: IntegratedTaskData; s: any }) {
  const [loading, setLoading] = useState(false);
  const label = fmt === 'pdf' ? '📄 PDF' : '📝 DOCX';
  return (
    <button
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/export/integrated-skills?format=${fmt}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listeningContent: task.listeningContent,
              dataFileSources: task.dataFile?.sources,
              noteTakingGuide: task.noteTakingGuide,
              writingTask: task.writingTask, taskType: s.taskType,
              studentNotes: s.studentNotes, studentWriting: s.studentWriting,
              analysis: s.analysis,
            }),
          });
          if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const aEl = document.createElement('a');
            aEl.href = url; aEl.download = `integrated-skills-report.${fmt}`;
            aEl.click(); URL.revokeObjectURL(url);
          }
        } catch { /* ignore */ }
        finally { setLoading(false); }
      }}
      disabled={loading}
      className={`py-3 px-4 ${color} text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 text-sm disabled:opacity-50`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      {label}
    </button>
  );
}

// ============================================
// 子元件：雙維度結果卡片
// ============================================
function ResultView({ studentId, gradeLevel }: { studentId: string; gradeLevel: string }) {
  const a = useIntegratedSkillsStore(s => s.analysis);
  const oc = useIntegratedSkillsStore(s => s.overCopyCheck);
  const [showZh, setShowZh] = useState(false);
  if (!a) return null;

  const hasZh = !!(a.generalCommentZh || a.structureFeedbackZh || (a.improvementTipsZh?.length) || a.noteTakingFeedbackZh);

  const scoreColor = (s: number) =>
    s >= 80 ? 'text-green-600 bg-green-100 dark:bg-green-900/20' :
    s >= 60 ? 'text-amber-600 bg-amber-100 dark:bg-amber-900/20' :
    'text-red-600 bg-red-100 dark:bg-red-900/20';

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Overall + Bilingual toggle */}
      <div className="text-center py-6 bg-gradient-to-br from-teal-50 to-purple-50 dark:from-teal-900/10 dark:to-purple-900/10 rounded-2xl border border-teal-100 dark:border-teal-800">
        <Award className="w-10 h-10 text-teal-500 mx-auto mb-2" />
        <div className="text-4xl font-extrabold text-teal-600 dark:text-teal-400">{a.overallScore}<span className="text-lg">%</span></div>
        {a.estimatedLevel && <div className="text-sm text-gray-500 mt-1">{showZh ? '平台估算 Level' : 'Est.'} {a.estimatedLevel}</div>}
        {hasZh && (
          <button
            onClick={() => setShowZh(!showZh)}
            className={`mt-2 text-xs px-3 py-1 rounded-full inline-flex items-center gap-1 transition-colors ${
              showZh ? 'bg-purple-200 dark:bg-purple-700 text-purple-800 dark:text-purple-200' : 'bg-purple-100 dark:bg-purple-800 text-purple-600 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-700'
            }`}
          >
            <Languages className="w-3 h-3" /> {showZh ? 'English' : '中文'}
          </button>
        )}
        <div className="text-sm text-gray-500 mt-1">{showZh ? '總體分數' : 'Overall Score'}</div>
        {/* R3.10-L: 強制免責聲明 — 診斷分析為平台內部評估，並非 HKEAA 官方評分 */}
        <div className="mx-auto mt-2 max-w-md rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
          ⚠️ {showZh
            ? '此診斷分析為平台內部評估，並非 HKEAA 官方評分；百分比權重及等級對照為平台教學參考，並非來自官方文件。'
            : 'This diagnostic analysis is the platform\'s internal assessment, not an official HKEAA score. Percentage weights and level mapping are platform teaching references, not official documents.'}
        </div>
        {a.estimatedLevel && (
          <div className="inline-block mt-2 px-3 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs font-bold rounded-full">
            {showZh ? `平台估算 Level ${a.estimatedLevel}` : `Est. Level ${a.estimatedLevel}`}
          </div>
        )}
      </div>

      {/* Three-dimension scores (HKEAA aligned) */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`rounded-xl p-4 text-center ${scoreColor(a.listeningAccuracy)}`}>
          <Headphones className="w-5 h-5 mx-auto mb-1" />
          <div className="text-2xl font-bold">{a.listeningAccuracy}%</div>
          <div className="text-xs font-medium">{showZh ? '聆聽理解 (40%)' : 'Listening (40%)'}</div>
        </div>
        <div className={`rounded-xl p-4 text-center ${scoreColor(a.languageAccuracy)}`}>
          <PenLine className="w-5 h-5 mx-auto mb-1" />
          <div className="text-2xl font-bold">{a.languageAccuracy}%</div>
          <div className="text-xs font-medium">{showZh ? '語言運用 (35%)' : 'Language (35%)'}</div>
        </div>
        <div className={`rounded-xl p-4 text-center ${scoreColor(a.organizationClarity)}`}>
          <Target className="w-5 h-5 mx-auto mb-1" />
          <div className="text-2xl font-bold">{a.organizationClarity}%</div>
          <div className="text-xs font-medium">{showZh ? '組織結構 (25%)' : 'Organization (25%)'}</div>
        </div>
      </div>

      {/* Detail bars (bilingual labels) */}
      <div className="space-y-3">
        {[
          { labelZh: '內容完整度', labelEn: 'Content Completeness', value: a.contentCompleteness, color: 'bg-teal-500' },
          { labelZh: '語言準確度', labelEn: 'Language Accuracy', value: a.languageAccuracy, color: 'bg-purple-500' },
          { labelZh: '組織與清晰度', labelEn: 'Organization & Clarity', value: a.organizationClarity, color: 'bg-amber-500' },
        ].map(item => (
          <div key={item.labelEn}>
            <div className="flex justify-between text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              <span>{showZh ? item.labelZh : item.labelEn}</span>
              <span>{item.value}%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${item.color}`} style={{ width: `${item.value}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Content points */}
      {a.capturedPoints && a.capturedPoints.length > 0 && (
        <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-4 border border-green-200 dark:border-green-800">
          <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> {showZh ? '已捕捉要點' : 'Captured Points'} ({a.capturedPoints.length})
          </h4>
          <ul className="space-y-1">
            {a.capturedPoints.map((pt, i) => (
              <li key={i} className="text-xs text-green-700 dark:text-green-400 flex items-start gap-1.5">
                <span className="text-green-500 mt-0.5">✓</span>{pt}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.missedPoints && a.missedPoints.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-4 border border-red-200 dark:border-red-800">
          <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1.5">
            <XCircle className="w-4 h-4" /> {showZh ? '遺漏要點' : 'Missed Points'} ({a.missedPoints.length})
          </h4>
          <ul className="space-y-1">
            {a.missedPoints.map((pt, i) => (
              <li key={i} className="text-xs text-red-700 dark:text-red-400 flex items-start gap-1.5">
                <span className="text-red-500 mt-0.5">✗</span>{pt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Over-copy warnings (AI) */}
      {a.overCopyWarnings && a.overCopyWarnings.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
          <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> {showZh ? '過度抄襲警告（AI）' : 'Over-copy Warnings (AI)'}
          </h4>
          {a.overCopyWarnings.map((w, i) => (
            <div key={i} className="text-xs mb-2 last:mb-0">
              <div className="text-red-600 line-through bg-red-50 dark:bg-red-900/20 rounded px-2 py-1 mb-1">{w.original}</div>
              <div className="text-green-600 bg-green-50 dark:bg-green-900/20 rounded px-2 py-1">→ {w.suggestion}</div>
            </div>
          ))}
        </div>
      )}

      {/* 2026-08-29 audit: deterministic server-side plagiarism verdict */}
      {oc && (oc.copyRatio > 0 || oc.isOverCopy) && (
        <div className={`rounded-xl p-4 border ${oc.isOverCopy ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-900/10 border-gray-200 dark:border-gray-700'}`}>
          <h4 className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${oc.isOverCopy ? 'text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
            <AlertTriangle className="w-4 h-4" /> {showZh ? '系統抄襲檢測' : 'System Plagiarism Check'}
          </h4>
          <p className={`text-xs ${oc.isOverCopy ? 'text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
            {showZh
              ? `與聆聽文稿及資料夾原文的重疊率約 ${Math.round(oc.copyRatio * 100)}%${oc.isOverCopy ? ' — 判定為過度抄襲' : ' — 未超過閾值'}。`
              : `Overlap with the listening transcript / data file sources ≈ ${Math.round(oc.copyRatio * 100)}%${oc.isOverCopy ? ' — excessive copying detected.' : ' — below threshold.'}`}
          </p>
          {oc.overallSuggestion && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{showZh && oc.overallSuggestionZh ? oc.overallSuggestionZh : oc.overallSuggestion}</p>
          )}
        </div>
      )}

      {/* Grammar errors */}
      {a.grammarErrors && a.grammarErrors.length > 0 && (() => {
        const realErrors = a.grammarErrors.filter(e => e.original.trim() !== e.correction.trim());
        if (realErrors.length === 0) return null;
        return (
        <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-4 border border-red-200 dark:border-red-800">
          <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1.5">
            <XCircle className="w-4 h-4" /> {showZh ? '文法錯誤' : 'Grammar Errors'} ({realErrors.length})
          </h4>
          {realErrors.map((e, i) => (
            <div key={i} className="text-xs mb-2 last:mb-0">
              <div className="text-red-600 line-through bg-red-50 dark:bg-red-900/20 rounded px-2 py-1 mb-1">{e.original}</div>
              <div className="text-green-600 bg-green-50 dark:bg-green-900/20 rounded px-2 py-1">→ {e.correction}</div>
              <div className="text-gray-500 text-xs mt-0.5 ml-1">{e.explanation}</div>
            </div>
          ))}
        </div>
        );
      })()}

      {/* Chinglish warnings */}
      {a.chinglishWarnings && a.chinglishWarnings.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/10 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
          <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> {showZh ? '中式英語警告' : 'Chinglish Warnings'} ({a.chinglishWarnings.length})
          </h4>
          {a.chinglishWarnings.map((w, i) => (
            <div key={i} className="text-xs mb-2 last:mb-0">
              <div className="text-orange-600 line-through bg-orange-50 dark:bg-orange-900/20 rounded px-2 py-1 mb-1">{w.original}</div>
              <div className="text-green-600 bg-green-50 dark:bg-green-900/20 rounded px-2 py-1">→ {w.suggestion}</div>
              <div className="text-gray-500 text-xs mt-0.5 ml-1">{w.explanation}</div>
            </div>
          ))}
        </div>
      )}

      {/* Vocabulary suggestions */}
      {a.vocabularySuggestions && a.vocabularySuggestions.length > 0 && (
        <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800">
          <h4 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-2 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4" /> {showZh ? '詞彙升級建議' : 'Vocabulary Upgrades'} ({a.vocabularySuggestions.length})
          </h4>
          {a.vocabularySuggestions.map((v, i) => (
            <div key={i} className="text-xs mb-2 last:mb-0 flex flex-wrap items-center gap-1.5">
              <span className="text-indigo-500 line-through bg-indigo-50 dark:bg-indigo-900/20 rounded px-1.5 py-0.5">{v.original}</span>
              <span className="text-gray-400">→</span>
              <span className="text-green-600 bg-green-50 dark:bg-green-900/20 rounded px-1.5 py-0.5 font-medium">{v.suggestion}</span>
              {v.reason && <span className="text-gray-400 text-xs ml-1">— {v.reason}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Note-taking feedback */}
      {a.noteTakingFeedback && (
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
          <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1.5">
            <Edit3 className="w-4 h-4" /> {showZh ? '筆記評語' : 'Note-taking Feedback'}
          </h4>
          <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">{a.noteTakingFeedback}</p>
          {showZh && a.noteTakingFeedbackZh && (
            <p className="text-sm text-amber-600/70 dark:text-amber-300/60 leading-relaxed mt-1 pt-1 border-t border-amber-200 dark:border-amber-700">{a.noteTakingFeedbackZh}</p>
          )}
        </div>
      )}

      {/* Data manipulation feedback */}
      {a.dataManipulationFeedback && (
        <div className="bg-teal-50 dark:bg-teal-900/10 rounded-xl p-4 border border-teal-200 dark:border-teal-800">
          <h4 className="text-sm font-semibold text-teal-700 dark:text-teal-400 mb-1 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" /> {showZh ? '資料運用' : 'Data Manipulation'}
          </h4>
          <p className="text-sm text-teal-700 dark:text-teal-400 leading-relaxed">{a.dataManipulationFeedback}</p>
          {showZh && a.dataManipulationFeedbackZh && (
            <p className="text-sm text-teal-600/70 dark:text-teal-300/60 leading-relaxed mt-1 pt-1 border-t border-teal-200 dark:border-teal-700">{a.dataManipulationFeedbackZh}</p>
          )}
        </div>
      )}

      {/* Structure feedback */}
      {a.structureFeedback && (
        <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800">
          <h4 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-1 flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> {showZh ? '結構評語' : 'Structure Feedback'}
          </h4>
          <p className="text-sm text-indigo-700 dark:text-indigo-400 leading-relaxed">{a.structureFeedback}</p>
          {showZh && a.structureFeedbackZh && (
            <p className="text-sm text-indigo-600/70 dark:text-indigo-300/60 leading-relaxed mt-1 pt-1 border-t border-indigo-200 dark:border-indigo-700">{a.structureFeedbackZh}</p>
          )}
        </div>
      )}

      {/* Improvement tips */}
      {a.improvementTips && a.improvementTips.length > 0 && (
        <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-4 border border-green-200 dark:border-green-800">
          <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1.5">
            <Lightbulb className="w-4 h-4" /> {showZh ? '改善建議' : 'Improvement Tips'}
          </h4>
          <ul className="space-y-1.5">
            {(showZh && a.improvementTipsZh?.length ? a.improvementTipsZh : a.improvementTips).map((tip, i) => (
              <li key={i} className="text-sm text-green-700 dark:text-green-400 flex items-start gap-2">
                <span className="text-green-500 mt-0.5 font-bold">{i + 1}.</span>{tip}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.generalComment && (
        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-1 flex items-center gap-1.5">
            <Lightbulb className="w-4 h-4" /> {showZh ? 'AI 總體評語' : 'AI Feedback'}
          </h4>
          {studentId ? (
            <VocabEnabledText studentId={studentId} gradeLevel={gradeLevel}>
              <p className="text-sm text-blue-700 dark:text-blue-400 leading-relaxed">{showZh && a.generalCommentZh ? a.generalCommentZh : a.generalComment}</p>
            </VocabEnabledText>
          ) : (
            <p className="text-sm text-blue-700 dark:text-blue-400 leading-relaxed">{showZh && a.generalCommentZh ? a.generalCommentZh : a.generalComment}</p>
          )}
          {showZh && a.generalCommentZh && (
            <p className="text-xs text-blue-500/60 dark:text-blue-300/50 mt-1 pt-1 border-t border-blue-200 dark:border-blue-700">{a.generalComment}</p>
          )}
        </div>
      )}

      {/* Model Answer */}
      {a.modelAnswer && (
        <div className="bg-purple-50 dark:bg-purple-900/10 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
          <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-2 flex items-center gap-1.5">
            <Award className="w-4 h-4" /> {showZh ? '範本答案（參考）' : 'Model Answer (Reference)'}
          </h4>
          <p className="text-[11px] text-purple-500/80 dark:text-purple-300/70 mb-2">
            {showZh
              ? '平台教學參考範本，並非 HKEAA 官方評分樣本。'
              : 'A platform teaching reference sample, not an official HKEAA graded sample.'}
          </p>
          <div className="text-sm text-purple-700 dark:text-purple-400 leading-relaxed whitespace-pre-line bg-white/50 dark:bg-gray-800/50 rounded-lg p-3">
            {a.modelAnswer}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// 主元件
// ============================================
export default function IntegratedSkillsTaskView({ task, onBack }: Props) {
  const { t, language } = useT();
  const appStore = useAppStore();
  const s = useIntegratedSkillsStore();
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // === 雙語開關 + 按需翻譯 ===
  const [showZhNotes, setShowZhNotes] = useState(false);
  const [zhTranslations, setZhTranslations] = useState<Record<number, { q: string; h: string }>>({});
  const [translating, setTranslating] = useState(false);

  const handleToggleZh = async () => {
    const next = !showZhNotes;
    setShowZhNotes(next);
    if (next && Object.keys(zhTranslations).length === 0 && task.noteTakingGuide?.length) {
      setTranslating(true);
      try {
        const res = await fetch('/api/ai/translate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: task.noteTakingGuide.map(g => ({ question: g.question, hint: g.hint })) }),
        });
        if (res.ok) {
          const json = await res.json();
          const map: Record<number, { q: string; h: string }> = {};
          (json.translations || []).forEach((item: any, i: number) => { if (item) map[i] = { q: item.q || '', h: item.h || '' }; });
          setZhTranslations(map);
        }
      } catch { /* ignore */ }
      finally { setTranslating(false); }
    }
  };

  // === 計算值 ===
  const hasNotes = s.studentNotes.trim().length > 0;
  const hasWriting = s.studentWriting.trim().length > 0;
  const wordCount = (s.studentWriting.match(/[A-Za-z0-9][A-Za-z0-9'\-]*/g) || []).length;

  // === 步驟可用性 ===
  const canAccessNotes = s.listeningCompleted; // 必須先聽過
  const canAccessWriting = hasNotes;             // 必須有筆記

  // === 自動儲存 (15 秒) + beforeunload 保護 ===
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSavedContent, setLastSavedContent] = useState('');

  const currentContent = s.studentNotes + '|' + s.studentWriting;
  const hasUnsavedChanges = currentContent !== lastSavedContent && (s.studentNotes || s.studentWriting);

  // Save to localStorage + backend API
  const saveDraft = useCallback(async () => {
    if (!s.studentNotes && !s.studentWriting) return;
    setSaveState('saving');
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        gradeLevel: s.gradeLevel, difficulty: s.difficulty, taskType: s.taskType,
        studentNotes: s.studentNotes, studentWriting: s.studentWriting, savedAt: Date.now(),
      }));
      // Also save to backend if logged in
      try { await s.saveDraft(); } catch { /* backend optional */ }
      setLastSavedContent(currentContent);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch {
      setSaveState('idle');
    }
  }, [s.studentNotes, s.studentWriting, s.gradeLevel, s.difficulty, s.taskType, currentContent]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, AUTO_SAVE_INTERVAL);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [s.studentNotes, s.studentWriting, saveDraft]);

  // 卸載時 flush 未儲存草稿：SPA 導航不觸發 beforeunload，15 秒視窗內的編輯否則會靜默遺失
  const saveDraftRef = useRef(saveDraft);
  useEffect(() => {
    saveDraftRef.current = saveDraft;
  }, [saveDraft]);
  useEffect(() => {
    return () => { saveDraftRef.current(); };
  }, []);

  // === 離開頁面保護（未儲存時提示） ===
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // === 提交 ===
  const handleSubmit = async () => {
    if (!s.studentWriting.trim()) return;
    if (!s.studentNotes.trim()) { s.setShowNotesWarning(true); return; }
    s.setShowNotesWarning(false);
    s.setAiLoading(true); s.setError('');
    try {
      const res = await fetch('/api/ai/analyze-integrated-skills', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listeningContent: task.listeningContent,
          noteTakingGuide: task.noteTakingGuide,
          expectedContentPoints: task.expectedContentPoints,
          writingTask: task.writingTask, taskType: s.taskType,
          studentNotes: s.studentNotes, studentWriting: s.studentWriting,
          gradeLevel: s.gradeLevel,
          dataFileSources: task.dataFile?.sources,
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        s.setAnalysis(json.analysis);
        // 2026-08-29 audit: surface the server's DETERMINISTIC plagiarism
        // verdict (detectOverCopying) — previously computed but never shown.
        if (json.overCopyCheck) s.setOverCopyCheck(json.overCopyCheck);
        s.setStage('result');
        localStorage.removeItem(DRAFT_KEY);
        // 任務已完成：清除伺服器草稿，避免下次進入還原已完成任務的舊草稿
        s.clearDraft();
        // 儲存練習記錄到學生分析（R3.10-L：不傳送 totalQuestions/correctCount，
        // 綜合訓練無逐題計分 — 伺服器衍生聚合為 0/0，歷史以「已記錄」標示）
        if (appStore.userId) {
          fetch('/api/practice', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              studentId: appStore.userId, skill: 'integrated-skills', skillZh: 'DSE Integrated Skills',
              difficulty: s.difficulty, source: 'dse-integrated-skills',
            }),
          }).catch(() => {});
        }
        if (appStore.userId) {
          fetch('/api/gamification', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: appStore.userId, event: { type: 'submitWriting', difficulty: s.difficulty } }),
          }).catch(() => {});
        }
      } else {
        s.setError(json.error || t('is.analyzeFailed'));
      }
    } catch {
      s.setError(t('is.networkFailed'));
    } finally {
      s.setAiLoading(false);
    }
  };

  // ====== RESULT VIEW ======
  if (s.stage === 'result') {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { s.setStage('writing'); s.setAnalysis(null); }}
            className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> {t('is.backToEdit')}
          </button>
        </div>
        <ResultView studentId={appStore.userId || ''} gradeLevel={s.gradeLevel || 'S4'} />
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => { s.reset(); }}
            className="flex-1 py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> {t('is.newTask')}
          </button>
          <ExportBtn fmt="pdf" color="bg-red-500 hover:bg-red-600" task={task} s={s} />
          <ExportBtn fmt="docx" color="bg-blue-500 hover:bg-blue-600" task={task} s={s} />
        </div>
      </div>
    );
  }

  // ====== TASK VIEW (Listening → Notes → Writing) ======
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Top bar: title + step indicator + back */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1">
          <StepIndicator
            activeStep={s.activeStep}
            listeningCompleted={s.listeningCompleted}
            hasNotes={hasNotes}
            hasWriting={hasWriting}
          />
        </div>
        {/* Save indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {saveState === 'saving' && (
            <span className="text-xs text-amber-500 dark:text-amber-400 flex items-center gap-1 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" /> {language === 'zh' ? '儲存中...' : 'Saving...'}
            </span>
          )}
          {saveState === 'saved' && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 animate-in fade-in">
              <CheckCircle2 className="w-3 h-3" /> {language === 'zh' ? '已儲存' : 'Saved'}
            </span>
          )}
          {saveState === 'idle' && hasUnsavedChanges && (
            <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
              ○ {language === 'zh' ? '有未儲存變更' : 'Unsaved changes'}
            </span>
          )}
        </div>
      </div>

      {/* Data File section (if present) */}
      {task.dataFile?.sources && task.dataFile.sources.length > 0 && (
        <details className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-blue-200 dark:border-blue-700 overflow-hidden" open>
          <summary className="p-4 cursor-pointer font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-blue-500" />
            {language === 'zh' ? `資料夾（${task.dataFile.sources.length} 份文件）` : `Data File (${task.dataFile.sources.length} sources)`}
            <span className="text-xs font-normal text-gray-400 ml-2">{language === 'zh' ? '— 點擊展開／收合' : '— Click to expand/collapse'}</span>
          </summary>
          <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
            {task.dataFile.sources.map((src, i) => (
              <div key={i} className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full uppercase">
                    {src.type}
                  </span>
                  <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">{src.title}</span>
                  {src.sourceDate && (
                    <span className="text-xs text-blue-400 ml-auto">{src.sourceDate}</span>
                  )}
                </div>
                <p className="text-sm text-blue-700 dark:text-blue-400 leading-relaxed whitespace-pre-line">{src.content}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Main grid: 3/4 content + 1/4 sidebar (desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* ===== MAIN CONTENT (3/4) ===== */}
        <div id="is-main-task" className="lg:col-span-3 space-y-4">

          {/* ── STEP 1: LISTENING ── */}
          <section className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border transition-all ${
            s.activeStep === 1
              ? 'border-teal-300 dark:border-teal-700 ring-1 ring-teal-200 dark:ring-teal-800'
              : 'border-gray-100 dark:border-gray-700'
          }`}>
            <button
              onClick={() => s.setActiveStep(1)}
              className="w-full p-5 flex items-center justify-between text-left"
            >
              <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${
                  s.listeningCompleted
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                    : 'bg-teal-100 dark:bg-teal-900/30 text-teal-600'
                }`}>
                  {s.listeningCompleted ? <CheckCircle2 className="w-4 h-4" /> : '1'}
                </span>
                {language === 'zh' ? '聆聽' : 'Listening'}<span className="text-xs font-normal text-gray-400">— {t('is.listeningDesc')}</span>
              </h2>
              <div className="flex items-center gap-2">
                {s.listeningCompleted && (
                  <span className="text-xs bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                    ✓ {language === 'zh' ? '已完成' : 'Completed'}
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${s.activeStep === 1 ? '' : '-rotate-90'}`} />
              </div>
            </button>

            {s.activeStep === 1 && (
              <div className="px-5 pb-5 space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                {/* Audio player */}
                <AudioPlayer
                  text={task.listeningContent}
                  label={t('is.playAudio')}
                  size="lg"
                  useCloudTTS
                  onPlayEnd={() => {
                    if (!s.listeningCompleted) s.setListeningCompleted(true);
                  }}
                  onPlayStart={() => {
                    // Auto-hide transcript when playback starts
                    if (s.showListeningText) s.toggleListeningText();
                  }}
                />

                {/* Transcript toggle */}
                <div>
                  <button
                    onClick={() => {
                      s.toggleListeningText();
                      if (!s.listeningCompleted) s.setListeningCompleted(true);
                    }}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-teal-600 transition-colors"
                  >
                    {s.showListeningText ? (
                      <><EyeOff className="w-4 h-4" /> {t('is.hideTranscript')}</>
                    ) : (
                      <><Eye className="w-4 h-4" /> {t('is.showTranscript')}</>
                    )}
                  </button>
                  {s.showListeningText && (
                    <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm leading-relaxed max-h-56 overflow-y-auto border border-gray-100 dark:border-gray-600">
                      <ListeningScript
                        content={task.listeningContent}
                        renderText={appStore.userId
                          ? (text) => (
                            <VocabEnabledText
                              studentId={appStore.userId!}
                              gradeLevel={s.gradeLevel || 'S4'}
                              as="span"
                            >
                              {text}
                            </VocabEnabledText>
                          )
                          : undefined
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Note-taking — always accessible during listening */}
                <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-3 flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-amber-500" />
                    {language === 'zh' ? '速記筆記' : 'Note-taking'}
                    <span className="text-xs font-normal text-gray-400">
                      — {t('is.noteHint')}
                    </span>
                  </h3>

                  {/* Note-taking guide */}
                  {task.noteTakingGuide.length > 0 && (
                    s.showNotesGuide ? (
                      <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800 mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                            <Target className="w-4 h-4" /> {t('is.noteGuide')}
                          </h4>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleToggleZh}
                              disabled={translating}
                              className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 transition-colors ${
                                showZhNotes
                                  ? 'bg-amber-200 dark:bg-amber-700 text-amber-800 dark:text-amber-200'
                                  : 'bg-amber-100 dark:bg-amber-800 text-amber-600 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-700'
                              } disabled:opacity-50`}
                              title={language === 'zh'
                                ? (showZhNotes ? '只顯示英文' : '顯示中文對照')
                                : (showZhNotes ? 'Show English only' : 'Show Chinese')}
                            >
                              {translating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                              {showZhNotes ? 'EN' : '中文'}
                            </button>
                            <button onClick={s.toggleNotesGuide} className="text-xs text-amber-500 hover:underline">
                              {t('is.hide')}
                            </button>
                          </div>
                        </div>
                        <ul className="space-y-2">
                          {task.noteTakingGuide.map((item, i) => {
                            const zh = zhTranslations[i];
                            return (
                            <li key={i} className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                              <span className="font-bold text-amber-500 shrink-0">{i + 1}.</span>
                              <div>
                                <span className="font-medium">{item.question}</span>
                                <span className="text-amber-500/60 ml-1.5 text-xs">{t('is.hint')}：{item.hint}</span>
                                {showZhNotes && zh && (
                                  <div className="mt-1 text-xs text-amber-600/70 dark:text-amber-300/60 border-t border-amber-200 dark:border-amber-700 pt-1">
                                    <div>📝 {zh.q}</div>
                                    <div>💡 {zh.h}</div>
                                  </div>
                                )}
                              </div>
                            </li>
                          )})}
                        </ul>
                      </div>
                    ) : (
                      <button onClick={s.toggleNotesGuide} className="mb-3 text-xs text-amber-500 hover:text-amber-600 hover:underline flex items-center gap-1">
                        <Target className="w-3.5 h-3.5" /> {t('is.show')} {t('is.noteGuide')}
                      </button>
                    )
                  )}

                  {/* Shorthand symbols reference */}
                  <details className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                    <summary className="cursor-pointer hover:text-teal-500 transition-colors">
                      {t('is.symbols.title')}
                    </summary>
                    <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-1.5 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <span title={language === 'zh' ? '優點/好處' : 'advantages/benefits'}>{t('is.symbols.plus')}</span>
                      <span title={language === 'zh' ? '缺點/問題' : 'disadvantages/problems'}>{t('is.symbols.minus')}</span>
                      <span title={language === 'zh' ? '導致/引致' : 'causes/leads to'}>{t('is.symbols.arrow')}</span>
                      <span title={language === 'zh' ? '原因' : 'reasons for'}>{t('is.symbols.because')}</span>
                      <span title={language === 'zh' ? '重要/關鍵' : 'important/key'}>{t('is.symbols.important')}</span>
                      <span title={language === 'zh' ? '金錢/財務' : 'money/financial'}>{t('is.symbols.money')}</span>
                      <span title={language === 'zh' ? '數字/統計' : 'numbers/statistics'}>{t('is.symbols.number')}</span>
                      <span title={language === 'zh' ? '不確定' : 'uncertain'}>{t('is.symbols.uncertain')}</span>
                      <span title={language === 'zh' ? '地點' : 'location'}>{t('is.symbols.location')}</span>
                      <span title={language === 'zh' ? '因此/結論' : 'therefore/conclusion'}>{t('is.symbols.therefore')}</span>
                      <span title={language === 'zh' ? '大約/關於' : 'approximately/about'}>{t('is.symbols.approx')}</span>
                      <span title={language === 'zh' ? '上升/下降/趨勢' : 'increase/decrease/trend'}>{t('is.symbols.trend')}</span>
                    </div>
                  </details>

                  {/* Notes textarea */}
                  <textarea
                    value={s.studentNotes}
                    onChange={e => s.setStudentNotes(e.target.value)}
                    placeholder={t('is.notePlaceholder')}
                    className="w-full min-h-[160px] p-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-y focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Next step prompt */}
                {s.listeningCompleted && (
                  <div className="flex items-center justify-between p-3 bg-teal-50 dark:bg-teal-900/10 rounded-xl border border-teal-100 dark:border-teal-800 animate-in fade-in">
                    <span className="text-sm text-teal-700 dark:text-teal-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> {t('is.listeningDone')}
                    </span>
                    <button
                      onClick={() => { s.setListeningCompleted(true); s.setActiveStep(3); }}
                      className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      {t('is.startWriting')} <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── STEP 2: NOTE-TAKING ── */}
          <section id="is-notes-section" className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border transition-all ${
            s.activeStep === 2
              ? 'border-amber-300 dark:border-amber-700 ring-1 ring-amber-200 dark:ring-amber-800'
              : canAccessNotes
                ? 'border-gray-100 dark:border-gray-700'
                : 'border-gray-100 dark:border-gray-700 opacity-60'
          }`}>
            <button
              onClick={() => { if (canAccessNotes) s.setActiveStep(2); }}
              disabled={!canAccessNotes}
              className="w-full p-5 flex items-center justify-between text-left disabled:cursor-not-allowed"
            >
              <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${
                  hasNotes
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                    : s.activeStep === 2
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                }`}>
                  {hasNotes ? <CheckCircle2 className="w-4 h-4" /> : '2'}
                </span>
                {language === 'zh' ? '速記筆記' : 'Note-taking'}
                <span className="text-xs font-normal text-gray-400">
                  {hasNotes ? `${s.studentNotes.length} ${t('is.chars')}` : `— ${t('is.noteHint')}`}
                </span>
                {!canAccessNotes && (
                  <span className="text-xs text-gray-400 flex items-center gap-1 ml-2">
                    <Target className="w-3 h-3" /> {t('is.pleaseListenFirst')}
                  </span>
                )}
              </h2>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${s.activeStep === 2 ? '' : '-rotate-90'}`} />
            </button>

            {s.activeStep === 2 && canAccessNotes && (
              <div className="px-5 pb-5 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-4">
                {/* Note-taking guide */}
                {task.noteTakingGuide.length > 0 && (
                  s.showNotesGuide ? (
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                          <Target className="w-4 h-4" /> {t('is.noteGuide')}
                        </h4>
                        <button onClick={s.toggleNotesGuide} className="text-xs text-amber-500 hover:underline">
                          {t('is.hide')}
                        </button>
                      </div>
                      <ul className="space-y-2">
                        {task.noteTakingGuide.map((item, i) => (
                          <li key={i} className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                            <span className="font-bold text-amber-500 shrink-0">{i + 1}.</span>
                            <div>
                              <span className="font-medium">{item.question}</span>
                              <span className="text-amber-500/60 ml-1.5 text-xs">{t('is.hint')}：{item.hint}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <button onClick={s.toggleNotesGuide} className="text-xs text-amber-500 hover:text-amber-600 hover:underline flex items-center gap-1">
                      <Target className="w-3.5 h-3.5" /> {t('is.show')} {t('is.noteGuide')}
                    </button>
                  )
                )}

                {/* Notes textarea */}
                <textarea
                  value={s.studentNotes}
                  onChange={e => s.setStudentNotes(e.target.value)}
                  placeholder={t('is.notePlaceholder')}
                  className="w-full min-h-[200px] p-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-y focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                />

                {/* Actions row */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <button
                    onClick={saveDraft}
                    className="text-xs text-teal-600 hover:underline flex items-center gap-1"
                  >
                    <Save className="w-3 h-3" /> {t('is.manualSave')}
                  </button>
                  {hasNotes && (
                    <button
                      onClick={() => s.setActiveStep(3)}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      {t('is.doneNotesStartWriting')} <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── STEP 3: WRITING ── */}
          <section className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border transition-all ${
            s.activeStep === 3
              ? 'border-purple-300 dark:border-purple-700 ring-1 ring-purple-200 dark:ring-purple-800'
              : canAccessWriting
                ? 'border-gray-100 dark:border-gray-700'
                : 'border-gray-100 dark:border-gray-700 opacity-60'
          }`}>
            <button
              onClick={() => { if (canAccessWriting) s.setActiveStep(3); }}
              disabled={!canAccessWriting}
              className="w-full p-5 flex items-center justify-between text-left disabled:cursor-not-allowed"
            >
              <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${
                  hasWriting
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                    : s.activeStep === 3
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                }`}>
                  {hasWriting ? <CheckCircle2 className="w-4 h-4" /> : '3'}
                </span>
                {language === 'zh' ? '寫作' : 'Writing'}
                <span className="text-xs font-normal text-gray-400">
                  — {wordCount}{task.wordLimit ? ` / ${task.wordLimit}` : ''} {language === 'zh' ? '字' : 'words'}
                  {task.wordLimit && wordCount > task.wordLimit && (
                    <span className="text-red-500 ml-1 font-medium">{t('is.overWordLimit')}</span>
                  )}
                </span>
                {!canAccessWriting && (
                  <span className="text-xs text-gray-400 flex items-center gap-1 ml-2">
                    <Target className="w-3 h-3" /> {t('is.pleaseNoteFirst')}
                  </span>
                )}
              </h2>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${s.activeStep === 3 ? '' : '-rotate-90'}`} />
            </button>

            {s.activeStep === 3 && canAccessWriting && (
              <div className="px-5 pb-5 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-4">
                {/* Writing task prompt */}
                <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-800">
                  <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-1.5 flex items-center gap-1.5">
                    <FileText className="w-4 h-4" /> {t('is.writingTask')}
                  </h4>
                  <p className="text-sm text-purple-700 dark:text-purple-400 leading-relaxed">{task.writingTask}</p>
                  {task.wordLimit && (
                    <p className="text-xs text-purple-500 mt-2">📏 {t('is.suggestedWords')}：{task.wordLimit} {t('is.chars')}</p>
                  )}
                </div>

                {/* Writing textarea */}
                <textarea
                  value={s.studentWriting}
                  onChange={e => s.setStudentWriting(e.target.value)}
                  placeholder={t('is.writingPlaceholder')}
                  className="w-full min-h-[300px] p-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-y focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />

                {/* Word count bar */}
                {task.wordLimit && (
                  <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        wordCount > task.wordLimit ? 'bg-red-500' :
                        wordCount >= task.wordLimit * 0.8 ? 'bg-amber-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${Math.min(100, (wordCount / task.wordLimit) * 100)}%` }}
                    />
                  </div>
                )}

                {/* Submit area */}
                {s.showNotesWarning && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{t('is.needNotesFirst')}</span>
                  </div>
                )}
                {s.error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                    {s.error}
                  </div>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={s.aiLoading || !s.studentWriting.trim()}
                  className="w-full py-3.5 bg-gradient-to-r from-purple-500 to-teal-500 hover:from-purple-600 hover:to-teal-600 disabled:from-gray-300 disabled:to-gray-300 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-purple-200 dark:shadow-purple-900/20 disabled:shadow-none"
                >
                  {s.aiLoading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> {t('is.aiAnalyzing')}</>
                  ) : (
                    <><Send className="w-5 h-5" /> {t('is.submitForReview')}</>
                  )}
                </button>
              </div>
            )}
          </section>
        </div>

        {/* ===== SIDEBAR (1/4) — 桌面版 ===== */}
        <aside className="hidden lg:block space-y-4">
          {/* Writing task quick view */}
          <div className="bg-purple-50 dark:bg-purple-900/10 rounded-2xl p-4 border border-purple-200 dark:border-purple-800">
            <h3 className="font-semibold text-purple-800 dark:text-purple-300 text-sm mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" /> {language === 'zh' ? '寫作任務' : 'Writing Task'}
            </h3>
            <p className="text-sm text-purple-700 dark:text-purple-400 leading-relaxed">{task.writingTask}</p>
            {task.wordLimit && <p className="text-xs text-purple-500 mt-2">📏 ~{task.wordLimit} {language === 'zh' ? '字' : 'words'}</p>}
          </div>

          {/* Expected content points */}
          <div className="bg-green-50 dark:bg-green-900/10 rounded-2xl border border-green-200 dark:border-green-800 overflow-hidden">
            <button onClick={s.toggleContentPoints} className="w-full p-4 flex items-center justify-between text-left">
              <h3 className="font-semibold text-green-800 dark:text-green-300 text-sm flex items-center gap-2">
                <Target className="w-4 h-4" /> {language === 'zh' ? '預期要點' : 'Expected Points'}
              </h3>
              {s.showContentPoints ? <ChevronUp className="w-4 h-4 text-green-400" /> : <ChevronDown className="w-4 h-4 text-green-400" />}
            </button>
            {s.showContentPoints && (
              <ul className="px-4 pb-4 space-y-1.5">
                {task.expectedContentPoints.map((pt, i) => {
                  // Defensive: AI may return {point, source} object instead of plain string
                  const text = typeof pt === 'string' ? pt : (pt as Record<string, unknown>)?.point as string || JSON.stringify(pt);
                  const source = typeof pt === 'string' ? undefined : (pt as Record<string, unknown>)?.source as string | undefined;
                  return (
                    <li key={i} className="text-xs text-green-700 dark:text-green-400 flex items-start gap-1.5">
                      <span className="text-green-500 mt-0.5 font-bold shrink-0">{i + 1}.</span>
                      <span>
                        {text}
                        {source && <span className="text-green-400/60 ml-1 italic">({source})</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Live notes preview */}
          <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-4 border border-amber-200 dark:border-amber-800">
            <h3 className="font-semibold text-amber-800 dark:text-amber-300 text-sm mb-2 flex items-center gap-2">
              <Edit3 className="w-4 h-4" /> {language === 'zh' ? '你的筆記' : 'Your Notes'}
            </h3>
            <div className="text-xs text-amber-700 dark:text-amber-400 whitespace-pre-line max-h-40 overflow-y-auto leading-relaxed">
              {s.studentNotes || (
                <span className="text-gray-400 dark:text-gray-500 italic">
                  {language === 'zh' ? '你的筆記會在你輸入時顯示在這裡...' : 'Your notes will appear here as you type...'}
                </span>
              )}
            </div>
          </div>

          {/* Progress checklist */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">{language === 'zh' ? '進度' : 'Progress'}</h3>
            <div className="space-y-2.5 text-xs">
              {[
                { label: language === 'zh' ? '聆聽' : 'Listening', done: s.listeningCompleted, icon: Headphones },
                { label: language === 'zh' ? `筆記（${s.studentNotes.length} 字）` : `Notes (${s.studentNotes.length}c)`, done: hasNotes, icon: Edit3 },
                { label: language === 'zh' ? `寫作（${wordCount} 字）` : `Writing (${wordCount}w)`, done: hasWriting, icon: PenLine },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Icon className="w-3.5 h-3.5" />
                      {item.label}
                    </span>
                    <span className={item.done ? 'text-green-500' : 'text-gray-300'}>
                      {item.done ? '✓' : '⋯'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ===== MOBILE BOTTOM TABS ===== */}
        {/* 行動裝置：側欄隱藏，故提供三種快速跳轉（任務/要點/筆記） */}
        {s.showContentPoints && (
          <div className="lg:hidden bg-green-50 dark:bg-green-900/10 rounded-2xl border border-green-200 dark:border-green-800 overflow-hidden mt-2">
            <div className="p-4">
              <h3 className="font-semibold text-green-800 dark:text-green-300 text-sm flex items-center gap-2 mb-3">
                <Target className="w-4 h-4" /> {language === 'zh' ? '預期要點' : 'Expected Points'}
              </h3>
              <ul className="space-y-1.5">
                {task.expectedContentPoints.map((pt, i) => {
                  const text = typeof pt === 'string' ? pt : (pt as Record<string, unknown>)?.point as string || JSON.stringify(pt);
                  const source = typeof pt === 'string' ? undefined : (pt as Record<string, unknown>)?.source as string | undefined;
                  return (
                    <li key={i} className="text-xs text-green-700 dark:text-green-400 flex items-start gap-1.5">
                      <span className="text-green-500 mt-0.5 font-bold shrink-0">{i + 1}.</span>
                      <span>
                        {text}
                        {source && <span className="text-green-400/60 ml-1 italic">({source})</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
        <div className="lg:hidden grid grid-cols-3 gap-2 mt-2">
          {[
            { label: language === 'zh' ? '任務' : 'Task', icon: FileText, onClick: () => { document.getElementById('is-main-task')?.scrollIntoView({ behavior: 'smooth' }); } },
            { label: language === 'zh' ? '要點' : 'Points', icon: Target, onClick: () => { s.toggleContentPoints(); if (!s.showContentPoints) setTimeout(() => document.querySelector('.lg\\:hidden.bg-green-50')?.scrollIntoView({ behavior: 'smooth' }), 50); } },
            { label: language === 'zh' ? '筆記' : 'Notes', icon: Edit3, onClick: () => { document.getElementById('is-notes-section')?.scrollIntoView({ behavior: 'smooth' }); } },
          ].map((tab, i) => {
            const Icon = tab.icon;
            return (
              <button
                key={i}
                onClick={tab.onClick}
                className="flex items-center justify-center gap-1.5 py-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
