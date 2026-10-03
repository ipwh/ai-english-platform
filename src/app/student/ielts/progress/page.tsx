// ============================================
// 學生端 — IELTS 練習進度
// ============================================
// 「最近一次」估算 + SQL 級累積次數；不產生跨技能累積平均（避免假精度）。
// ============================================
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/hooks/use-i18n';
import { Loader2, TrendingUp, Info } from 'lucide-react';

interface SkillProgress {
  skill: string;
  attemptCount: number;
  submittedCount: number;
  latestAttempt: {
    id: string;
    submittedAt: string | null;
    rawScore: number | null;
    totalItems: number | null;
    bandEstimate: { displayRange: string } | null;
  } | null;
  latestAssessment: {
    id: string;
    estimatedBand: number | null;
    languageBandEstimate: number | null;
    confidence: string;
    createdAt: string;
  } | null;
}

interface ProgressSummary {
  skills: SkillProgress[];
  recentAttempts: Array<{
    id: string;
    skill: string;
    status: string;
    startedAt: string;
    rawScore: number | null;
    totalItems: number | null;
    bandEstimate: { displayRange: string } | null;
  }>;
}

interface GovernanceStatus {
  humanEvidence: string;
  markerEquivalence: string;
  calibrationStatus: string;
  aiCost: string;
  disclaimers: string[];
}

export default function IeltsProgressPage() {
  const { t } = useT();
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [status, setStatus] = useState<GovernanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [progressRes, statusRes] = await Promise.all([
          fetch('/api/ielts/progress'),
          fetch('/api/ielts/status'),
        ]);
        if (!progressRes.ok) throw new Error('PROGRESS_FAILED');
        const progressData = (await progressRes.json()) as { progress: ProgressSummary };
        if (!cancelled) setProgress(progressData.progress);
        if (statusRes.ok) {
          const statusData = (await statusRes.json()) as GovernanceStatus;
          if (!cancelled) setStatus(statusData);
        }
      } catch {
        if (!cancelled) setError(t('ielts.error.generic'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> …
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <header>
        <Link href="/student/ielts" className="text-xs text-indigo-600 hover:underline">
          ← {t('ielts.title')}
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900">
          <TrendingUp className="h-6 w-6 text-indigo-600" />
          {t('ielts.progress.title')}
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {t('ielts.betaBadge')}
          </span>
        </h1>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {progress && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {progress.skills.map((skill) => (
              <article key={skill.skill} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">{t(`ielts.skill.${skill.skill.toLowerCase()}`)}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {t('ielts.progress.attempts')}: {skill.attemptCount} ({skill.submittedCount})
                </p>
                {skill.skill === 'SPEAKING' ? (
                  <p className="mt-2 text-xs text-slate-500">{t('ielts.speaking.noScoreNotice')}</p>
                ) : (
                  <p className="mt-2 text-sm text-slate-800">
                    {t('ielts.progress.latestBand')}:{' '}
                    <span className="font-bold">
                      {skill.latestAttempt?.bandEstimate?.displayRange ??
                        (skill.latestAssessment?.estimatedBand != null
                          ? skill.latestAssessment.estimatedBand.toFixed(1)
                          : '—')}
                    </span>
                  </p>
                )}
              </article>
            ))}
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{t('ielts.progress.recent')}</h2>
            {progress.recentAttempts.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">{t('ielts.progress.noData')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 text-xs">
                {progress.recentAttempts.slice(0, 15).map((attempt) => (
                  <li key={attempt.id} className="flex items-center justify-between py-2">
                    <span className="text-slate-700">
                      {t(`ielts.skill.${attempt.skill.toLowerCase()}`)} ·{' '}
                      {new Date(attempt.startedAt).toLocaleDateString()}
                    </span>
                    <span className="text-slate-900">
                      {attempt.status === 'SUBMITTED'
                        ? attempt.totalItems != null
                          ? `${attempt.rawScore ?? 0}/${attempt.totalItems}${
                              attempt.bandEstimate ? ` · ${attempt.bandEstimate.displayRange}` : ''
                            }`
                          : '—'
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-slate-500">{t('ielts.progress.latestNote')}</p>
          </section>
        </>
      )}

      {status && (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Info className="h-4 w-4" />
            {t('ielts.status.title')}
          </h2>
          <ul className="mt-2 space-y-1">
            <li>HUMAN_EVIDENCE: {status.humanEvidence}</li>
            <li>MARKER_EQUIVALENCE: {status.markerEquivalence}</li>
            <li>CALIBRATION_STATUS: {status.calibrationStatus}</li>
            <li>AI_COST: {status.aiCost}</li>
          </ul>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-slate-500">
            {status.disclaimers.map((disclaimer, i) => (
              <li key={i}>{disclaimer}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
