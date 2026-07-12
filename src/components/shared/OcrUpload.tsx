// ============================================
// OcrUpload — 圖片上傳 + OCR 辨識元件
// 用於學生拍照上傳手寫作文
// ============================================
'use client';

import { useState, useRef, useCallback } from 'react';
import { Camera, Loader2, X, ImagePlus, Check } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

interface OcrUploadProps {
  onTextExtracted: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function OcrUpload({ onTextExtracted, disabled = false, className = '' }: OcrUploadProps) {
  const { t } = useT();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    // 驗證
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];
    if (!validTypes.includes(file.type)) {
      setError(t('ocr.invalidType'));
      setStatus('error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t('ocr.fileTooLarge'));
      setStatus('error');
      return;
    }

    // 預覽
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    setError('');
    setStatus('uploading');

    try {
      const formData = new FormData();
      formData.append('file', file);

      setStatus('processing');
      const res = await fetch('/api/ocr/essay', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('ocr.processingFailed'));
      }

      if (data.text) {
        setExtractedText(data.text);
        setStatus('done');
        onTextExtracted(data.text);
      } else if (data.warning) {
        setError(data.warning);
        setStatus('error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('ocr.failed');
      setError(msg);
      setStatus('error');
    } finally {
      setUploading(false);
      // 釋放 preview URL
      if (preview) URL.revokeObjectURL(preview);
    }
  }, [onTextExtracted]);

  const clear = () => {
    setPreview(null);
    setExtractedText('');
    setStatus('idle');
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Upload button */}
      <label
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
          ${disabled || uploading ? 'opacity-50 cursor-not-allowed' : ''}
          ${status === 'done'
            ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30'
          }`}
      >
        {uploading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : status === 'done' ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Camera className="w-3.5 h-3.5" />
        )}
        {uploading ? t('ocr.scanning') : status === 'done' ? t('ocr.done') : t('ocr.uploadPhoto')}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/bmp"
          capture="environment"
          className="hidden"
          disabled={disabled || uploading}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </label>

      {/* Preview thumbnail */}
      {preview && (
        <div className="relative inline-flex">
          <img
            src={preview}
            alt="Preview"
            className="w-8 h-8 rounded object-cover border border-gray-200 dark:border-gray-600"
          />
          <button
            onClick={clear}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <span className="text-xs text-red-500 max-w-[200px] truncate" title={error}>
          {error}
        </span>
      )}

      {/* Extracted text summary */}
      {status === 'done' && extractedText && (
        <span className="text-xs text-green-600 dark:text-green-400">
          {t('ocr.charsRecognized', { n: extractedText.length })}
        </span>
      )}
    </div>
  );
}
