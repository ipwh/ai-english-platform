// ============================================
// OcrUpload — 圖片上傳 + OCR 辨識元件
// 支援多頁作文：可一次選擇多張圖片，依序 OCR 辨識後合併文字
// ============================================
'use client';

import { useState, useRef, useCallback } from 'react';
import { Camera, Loader2, X, ImagePlus, Check, AlertTriangle } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

interface OcrUploadProps {
  onTextExtracted: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

/** Single file with its processing state */
interface FileEntry {
  id: number;
  file: File;
  previewUrl: string;
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
  text?: string;
}

export default function OcrUpload({ onTextExtracted, disabled = false, className = '' }: OcrUploadProps) {
  const { t } = useT();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [totalText, setTotalText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);

  /** Add files from input — supports multi-select */
  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];
    const newEntries: FileEntry[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (!validTypes.includes(file.type)) continue;
      if (file.size > 10 * 1024 * 1024) continue;
      newEntries.push({
        id: nextId.current++,
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'pending',
      });
    }

    if (newEntries.length === 0) return;

    setFiles(prev => [...prev, ...newEntries]);
    resetInput();
  }, []);

  /** Process all pending files sequentially */
  const processAll = useCallback(async () => {
    setProcessing(true);

    // Get current pending files (snapshot)
    setFiles(prev => {
      const pending = prev.filter(f => f.status === 'pending');
      if (pending.length === 0) {
        setProcessing(false);
        return prev;
      }

      // Process async — we use the snapshot
      (async () => {
        let accumulatedText = '';
        const updated = [...prev];

        for (let i = 0; i < pending.length; i++) {
          const entry = pending[i];
          const idx = updated.findIndex(f => f.id === entry.id);
          if (idx === -1) continue;

          // Mark as uploading
          updated[idx] = { ...updated[idx], status: 'uploading' };
          setFiles([...updated]);

          try {
            const formData = new FormData();
            formData.append('file', entry.file);

            // Mark as processing (OCR in progress)
            updated[idx] = { ...updated[idx], status: 'processing' };
            setFiles([...updated]);

            let data: { text?: string; error?: string; warning?: string };
            try {
              const res = await fetch('/api/ocr/essay', { method: 'POST', body: formData });
              const raw = await res.text();
              try {
                data = JSON.parse(raw);
              } catch {
                // Non-JSON response (HTML error page, etc.)
                data = { error: raw.slice(0, 200) || `Server error (${res.status})` };
              }
            } catch (fetchErr: unknown) {
              const msg = fetchErr instanceof Error ? fetchErr.message : 'Network error';
              data = { error: msg };
            }

            if (data.text) {
              updated[idx] = { ...updated[idx], status: 'done', text: data.text };
              accumulatedText += (accumulatedText ? '\n\n' : '') + data.text;
            } else {
              updated[idx] = {
                ...updated[idx],
                status: 'error',
                error: data.error || data.warning || t('ocr.processingFailed'),
              };
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('ocr.failed');
            updated[idx] = { ...updated[idx], status: 'error', error: msg };
          }

          setFiles([...updated]);
        }

        // All done — emit accumulated text
        if (accumulatedText) {
          setTotalText(accumulatedText);
          onTextExtracted(accumulatedText);
        }
        setProcessing(false);
      })();

      return prev;
    });
  }, [onTextExtracted]);

  /** Remove a file entry */
  const removeFile = useCallback((id: number) => {
    setFiles(prev => {
      const entry = prev.find(f => f.id === id);
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  }, []);

  /** Clear all files */
  const clearAll = useCallback(() => {
    files.forEach(f => URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
    setTotalText('');
  }, [files]);

  /** Reset file input */
  const resetInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const doneCount = files.filter(f => f.status === 'done').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const totalCount = files.length;
  const canProcess = pendingCount > 0 && !processing && !disabled;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Upload button + multi-select */}
      <div className="flex items-center gap-2 flex-wrap">
        <label
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
            ${disabled || processing ? 'opacity-50 cursor-not-allowed' : ''}
            bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30`}
        >
          <Camera className="w-3.5 h-3.5" />
          {t('ocr.uploadPhoto')}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp"
            capture="environment"
            multiple
            className="hidden"
            disabled={disabled || processing}
            onChange={e => handleFileSelect(e.target.files)}
          />
        </label>

        {/* Add more pages button — always available for multi-page essays */}
        {files.length > 0 && !processing && (
          <label
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
              bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-700/50 dark:text-gray-300 dark:hover:bg-gray-700`}
          >
            <ImagePlus className="w-3 h-3" />
            {t('ocr.addPage')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/bmp"
              capture="environment"
              multiple
              className="hidden"
              disabled={processing}
              onChange={e => handleFileSelect(e.target.files)}
            />
          </label>
        )}

        {/* Process button */}
        {canProcess && (
          <button
            onClick={processAll}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/30 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            {t('ocr.scanPages', { count: pendingCount })}
          </button>
        )}

        {/* Clear all */}
        {files.length > 0 && !processing && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            <X className="w-3 h-3" />
            {t('ocr.clear')}
          </button>
        )}
      </div>

      {/* Progress indicator */}
      {processing && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('ocr.scanningProgress', { done: doneCount, total: totalCount })}
        </div>
      )}

      {/* File list with status */}
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map(entry => (
            <div
              key={entry.id}
              className={`flex items-center gap-2 p-1.5 rounded text-xs ${
                entry.status === 'error' ? 'bg-red-50 dark:bg-red-900/10' :
                entry.status === 'done' ? 'bg-green-50 dark:bg-green-900/10' :
                entry.status === 'processing' || entry.status === 'uploading' ? 'bg-amber-50 dark:bg-amber-900/10' :
                'bg-gray-50 dark:bg-gray-700/30'
              }`}
            >
              {/* Thumbnail */}
              <img
                src={entry.previewUrl}
                alt={`Page ${files.indexOf(entry) + 1}`}
                className="w-10 h-10 rounded object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0"
              />

              {/* Status */}
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {t('ocr.page')} {files.indexOf(entry) + 1}
                </span>
                {entry.status === 'pending' && (
                  <span className="ml-1 text-gray-400">{t('ocr.pending')}</span>
                )}
                {entry.status === 'uploading' && (
                  <span className="ml-1 text-amber-500 flex items-center gap-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> {t('ocr.uploading')}
                  </span>
                )}
                {entry.status === 'processing' && (
                  <span className="ml-1 text-amber-500 flex items-center gap-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> {t('ocr.processing')}
                  </span>
                )}
                {entry.status === 'done' && (
                  <span className="ml-1 text-green-600">
                    <Check className="w-3 h-3 inline" /> {entry.text ? `+${entry.text.length} ${t('ocr.chars')}` : ''}
                  </span>
                )}
                {entry.status === 'error' && (
                  <span className="ml-1 text-red-500 flex items-center gap-1" title={entry.error}>
                    <AlertTriangle className="w-3 h-3" /> {entry.error?.slice(0, 50) || t('ocr.failed')}
                  </span>
                )}
              </div>

              {/* Remove button */}
              {entry.status === 'pending' && (
                <button onClick={() => removeFile(entry.id)} className="text-gray-400 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary after all done */}
      {!processing && doneCount > 0 && (
        <div className="text-xs text-green-600 dark:text-green-400">
          ✅ {t('ocr.pagesScanned', { done: doneCount, total: totalCount })} — {totalText.length} {t('ocr.chars')}
        </div>
      )}
    </div>
  );
}

