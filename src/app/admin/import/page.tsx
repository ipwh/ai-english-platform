// ============================================
// 管理員批量匯入頁面 — /admin/import
// ============================================
'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Upload, Download, FileText, CheckCircle, XCircle,
  AlertTriangle, RefreshCw, Users, GraduationCap,
} from 'lucide-react';
import { useT } from '@/hooks/use-i18n';
import type { ImportResult, ImportDetail } from '@/lib/import-utils';

// ============================================
// Sub-components
// ============================================

/** 模板下載按鈕卡片 */
function TemplateCard({
  title,
  description,
  icon: Icon,
  downloadUrl,
  fileName,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  downloadUrl: string;
  fileName: string;
}) {
  const { t } = useT();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(t('admin.import.downloadFailed'));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert(t('admin.import.downloadFailed'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col items-center text-center gap-4 hover:shadow-md transition-shadow">
      <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 rounded-2xl flex items-center justify-center">
        <Icon className="w-7 h-7 text-purple-600 dark:text-purple-400" />
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
          {title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {description}
        </p>
      </div>
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl font-medium text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
      >
        {downloading ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {downloading ? t('admin.import.downloading') : t("admin.import.downloadBtn").replace("{file}", fileName)}
      </button>
    </div>
  );
}

/** 上傳區域 + 拖放支援 */
function UploadZone({
  onFileSelected,
  uploading,
  acceptType,
}: {
  onFileSelected: (file: File) => void;
  uploading: boolean;
  acceptType: string;
}) {
  const { t } = useT();
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      setSelectedFile(file);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
        dragOver
          ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20'
          : 'border-gray-300 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-500 bg-gray-50 dark:bg-gray-800/50'
      } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptType}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="hidden"
      />
      {selectedFile ? (
        <div className="flex flex-col items-center gap-3">
          <FileText className="w-10 h-10 text-purple-500" />
          <p className="font-medium text-gray-900 dark:text-white">
            {selectedFile.name}
          </p>
          <p className="text-sm text-gray-500">
            {(selectedFile.size / 1024).toFixed(1)} KB
          </p>
          <span className="text-xs text-purple-600 dark:text-purple-400">
            {t('admin.import.clickToChange')}
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Upload className="w-10 h-10 text-gray-400" />
          <p className="font-medium text-gray-700 dark:text-gray-300">
            {t('admin.import.dropCSV')}
          </p>
          <p className="text-sm text-gray-500">{t('admin.import.csvOnly')}</p>
        </div>
      )}
    </div>
  );
}

/** 匯入結果面板 */
function ResultPanel({ result }: { result: ImportResult | null }) {
  const { t } = useT();
  if (!result) return null;

  const getStatusIcon = (status: ImportDetail['status']) => {
    switch (status) {
      case 'created':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'updated':
        return <RefreshCw className="w-4 h-4 text-blue-500" />;
      case 'skipped':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusLabel = (status: ImportDetail['status']) => {
    switch (status) {
      case 'created':
        return t('admin.import.statusCreated');
      case 'updated':
        return t('admin.import.statusUpdated');
      case 'skipped':
        return t('admin.import.statusSkipped');
      case 'error':
        return t('admin.import.statusError');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-6 border-b border-gray-100 dark:border-gray-700">
        <SummaryCard
          label={t('admin.import.totalRows')}
          value={result.total}
          color="text-gray-700 dark:text-gray-300"
        />
        <SummaryCard
          label={t('admin.import.successCreated')}
          value={result.success}
          color="text-green-600"
        />
        <SummaryCard
          label={t('admin.import.successUpdated')}
          value={result.updated}
          color="text-blue-600"
        />
        <SummaryCard
          label={t('admin.import.failed')}
          value={result.failed}
          color="text-red-600"
        />
      </div>

      {/* Error list */}
      {result.errors.length > 0 && (
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h4 className="font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {t('admin.import.errorsDetail').replace('{n}', String(result.errors.length))}
          </h4>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {result.errors.map((err, i) => (
              <li
                key={i}
                className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-1.5"
              >
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Detail table */}
      {result.details.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                  {t('admin.import.row')}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                  ID
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                  Email
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                  {t('admin.import.name')}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                  {t('admin.import.status')}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                  {t('admin.import.reason')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {result.details.map((d, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-2.5 text-gray-500">{d.row}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400">
                    {d.studentId || d.teacherId || '-'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                    {d.email}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                    {d.nameZh}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1">
                      {getStatusIcon(d.status)}
                      <span
                        className={`text-xs font-medium ${
                          d.status === 'created'
                            ? 'text-green-600'
                            : d.status === 'updated'
                            ? 'text-blue-600'
                            : d.status === 'skipped'
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }`}
                      >
                        {getStatusLabel(d.status)}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[200px] truncate">
                    {d.reason || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================

export default function AdminImportPage() {
  const { t } = useT();
  const [importType, setImportType] = useState<'students' | 'teachers'>('students');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (dryRun) formData.append('dryRun', 'true');

      const endpoint =
        importType === 'students'
          ? '/api/admin/import/students'
          : '/api/admin/import/teachers';

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({
          total: 0,
          success: 0,
          updated: 0,
          failed: 1,
          errors: [data.error || t('admin.import.importFailed')],
          details: [],
        });
        return;
      }

      setResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('admin.import.connectionError');
      setResult({
        total: 0,
        success: 0,
        updated: 0,
        failed: 1,
        errors: [msg],
        details: [],
      });
    } finally {
      setUploading(false);
    }
  };

  const clearResult = () => {
    setResult(null);
    setSelectedFile(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          批量匯入
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          使用 CSV 檔案批量匯入學生或教師資料。請先下載模板，填寫後上傳。
        </p>
      </div>

      {/* Step 1: Download templates */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <span className="w-7 h-7 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-sm font-bold text-purple-600 dark:text-purple-400">
            1
          </span>
          下載 CSV 模板
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TemplateCard
            title="學生匯入模板"
            description="包含 studentId, email, nameZh, nameEn, level, className, classNumber, gender, joinedAt"
            icon={Users}
            downloadUrl="/api/admin/import/template/students"
            fileName="students_template.csv"
          />
          <TemplateCard
            title="教師匯入模板"
            description="包含 teacherId, email, nameZh, nameEn, subjects, department, gender"
            icon={GraduationCap}
            downloadUrl="/api/admin/import/template/teachers"
            fileName="teachers_template.csv"
          />
        </div>
      </section>

      {/* Step 2: Upload */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <span className="w-7 h-7 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-sm font-bold text-purple-600 dark:text-purple-400">
            2
          </span>
          上傳 CSV 檔案
        </h2>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          {/* Import type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              匯入類型
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setImportType('students');
                  setSelectedFile(null);
                  setResult(null);
                }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  importType === 'students'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <Users className="w-4 h-4 inline mr-1.5" />
                學生
              </button>
              <button
                onClick={() => {
                  setImportType('teachers');
                  setSelectedFile(null);
                  setResult(null);
                }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  importType === 'teachers'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <GraduationCap className="w-4 h-4 inline mr-1.5" />
                教師
              </button>
            </div>
          </div>

          {/* Upload zone */}
          <UploadZone
            onFileSelected={setSelectedFile}
            uploading={uploading}
            acceptType=".csv"
          />

          {/* Options */}
          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                預覽模式（不實際寫入資料庫）
              </span>
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white rounded-xl font-medium text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  匯入中...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  {dryRun ? '預覽' : '開始匯入'}
                </>
              )}
            </button>
            {result && (
              <button
                onClick={clearResult}
                className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl text-sm font-medium transition-colors"
              >
                清除結果
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Step 3: Results */}
      {result && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
            <span className="w-7 h-7 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-sm font-bold text-purple-600 dark:text-purple-400">
              3
            </span>
            匯入結果
          </h2>
          <ResultPanel result={result} />
        </section>
      )}

      {/* Field reference */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">
          欄位說明
        </h3>
        {importType === 'students' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {[
              ['studentId', '必填，s + 數字（例：s10001）'],
              ['email', '必填，有效電郵地址'],
              ['nameZh', '必填，中文姓名'],
              ['nameEn', '必填，英文姓名'],
              ['level', '必填，S1 / S2 / S3 / S4 / S5 / S6'],
              ['className', '必填，數字+英文字母（例：4A）'],
              ['classNumber', '選填，班號（例：15）'],
              ['gender', '選填，M 或 F'],
              ['joinedAt', '選填，入學日期 YYYY-MM-DD（預設今天）'],
            ].map(([field, desc]) => (
              <div key={field} className="flex gap-2">
                <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-purple-600 dark:text-purple-400 font-mono shrink-0">
                  {field}
                </code>
                <span className="text-gray-600 dark:text-gray-400">{desc}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {[
              ['teacherId', '必填，英文姓氏+名字縮寫（例：chantm、cheunghy）'],
              ['email', '必填，有效電郵地址'],
              ['nameZh', '必填，中文姓名'],
              ['nameEn', '必填，英文姓名'],
              ['subjects', '選填，JSON 陣列或 | 分隔（預設 English Language）'],
              ['department', '選填，所屬部門'],
              ['gender', '選填，M 或 F'],
            ].map(([field, desc]) => (
              <div key={field} className="flex gap-2">
                <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-purple-600 dark:text-purple-400 font-mono shrink-0">
                  {field}
                </code>
                <span className="text-gray-600 dark:text-gray-400">{desc}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
