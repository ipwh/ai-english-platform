// ============================================
// AudioPlayer — 文字轉語音元件（支援多人對話）
// 使用瀏覽器 Web Speech API，無需外部錄音檔
// 自動解析對話角色標籤（Woman:/Man: 等），用不同語音朗讀
// ============================================
'use client';

import { useState, useCallback, useRef } from 'react';
import { Volume2, Pause, Loader2 } from 'lucide-react';

interface AudioPlayerProps {
  text: string;
  label?: string;
  autoPlay?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onPlayEnd?: () => void;
}

interface DialogueLine {
  speaker: string | null;
  text: string;
}

/** 對話行模式：Woman: / Man: / A: / B: / Speaker 1: */
const SPEAKER_LINE_RE = /^(Woman|Man|Boy|Girl|Speaker\s*\d|[A-B])\s*[:：]\s*(.+)$/i;

/** 將文字解析成對話段落 */
function parseDialogue(text: string): DialogueLine[] {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const dialogue: DialogueLine[] = [];

  for (const line of lines) {
    const match = line.match(SPEAKER_LINE_RE);
    if (match) {
      dialogue.push({ speaker: match[1].toLowerCase(), text: match[2] });
    } else {
      dialogue.push({ speaker: null, text: line });
    }
  }

  if (dialogue.length === 0) {
    dialogue.push({ speaker: null, text });
  }

  return dialogue;
}

/** 從可用語音中選一個（依語言與性別偏好） */
function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: 'en' | 'zh',
  gender: 'female' | 'male' | 'any' = 'any',
): SpeechSynthesisVoice | null {
  const candidates = voices.filter(v => v.lang.startsWith(lang === 'zh' ? 'zh' : 'en'));
  if (candidates.length === 0) return null;

  if (gender === 'female') {
    return candidates.find(v => /female|samantha|karen|zira|victoria/i.test(v.name))
      || candidates[candidates.length - 1]
      || candidates[0];
  }
  if (gender === 'male') {
    return candidates.find(v => /male|daniel|tom|david|alex/i.test(v.name))
      || candidates[0]
      || null;
  }
  return candidates[0];
}

export default function AudioPlayer({
  text,
  label = '播放',
  autoPlay = false,
  size = 'md',
  className = '',
  onPlayEnd,
}: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const cancelled = useRef(false);

  if (typeof window === 'undefined') {
    return <span className="text-xs text-gray-400">TTS 不可用</span>;
  }

  const synth = window.speechSynthesis;
  if (!synth) {
    return <span className="text-xs text-gray-400">瀏覽器不支援語音</span>;
  }

  const handleStop = useCallback(() => {
    cancelled.current = true;
    synth.cancel();
    setPlaying(false);
    setLoading(false);
  }, [synth]);

  const handlePlay = useCallback(() => {
    if (!text) return;

    if (playing) {
      handleStop();
      return;
    }

    setLoading(true);
    cancelled.current = false;
    synth.cancel();

    const dialogue = parseDialogue(text);

    const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const lang: 'en' | 'zh' = cjkCount / Math.max(text.length, 1) > 0.3 ? 'zh' : 'en';

    const trySpeak = () => {
      const voices = synth.getVoices();
      if (voices.length === 0) {
        setTimeout(trySpeak, 100);
        return;
      }

      const femaleVoice = pickVoice(voices, lang, 'female') || pickVoice(voices, lang, 'any');
      const maleVoice = pickVoice(voices, lang, 'male') || pickVoice(voices, lang, 'any');
      const defaultVoice = pickVoice(voices, lang, 'any');

      const map = new Map<string, SpeechSynthesisVoice | null>();
      map.set('woman', femaleVoice);
      map.set('girl', femaleVoice);
      map.set('man', maleVoice);
      map.set('boy', maleVoice);
      map.set('a', femaleVoice);
      map.set('b', maleVoice);

      let idx = 0;

      const speakNext = () => {
        if (cancelled.current) {
          setPlaying(false);
          setLoading(false);
          return;
        }

        while (idx < dialogue.length && !dialogue[idx].text.trim()) {
          idx++;
        }

        if (idx >= dialogue.length) {
          setPlaying(false);
          setLoading(false);
          onPlayEnd?.();
          return;
        }

        const line = dialogue[idx];
        const utterance = new SpeechSynthesisUtterance(line.text);
        utterance.lang = lang === 'zh' ? 'zh-HK' : 'en-US';
        utterance.rate = 0.9;
        utterance.pitch = 1;

        if (line.speaker) {
          const voice = map.get(line.speaker);
          if (voice) utterance.voice = voice;
        } else if (defaultVoice) {
          utterance.voice = defaultVoice;
        }

        utterance.onstart = () => {
          setLoading(false);
          setPlaying(true);
        };

        utterance.onend = () => {
          idx++;
          setTimeout(speakNext, line.speaker ? 120 : 60);
        };

        utterance.onerror = (e) => {
          if (e.error === 'canceled' || e.error === 'interrupted') {
            setPlaying(false);
            setLoading(false);
            return;
          }
          console.warn('TTS error:', e.error);
          idx++;
          setTimeout(speakNext, 100);
        };

        synth.speak(utterance);
      };

      speakNext();
    };

    trySpeak();
  }, [text, playing, synth, handleStop, onPlayEnd]);

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
    lg: 'px-4 py-2.5 text-base gap-2',
  };

  const iconSize = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-5 h-5' };

  return (
    <button
      onClick={handlePlay}
      disabled={loading}
      className={`inline-flex items-center rounded-lg font-medium transition-colors disabled:opacity-50 ${
        playing
          ? 'bg-teal-100 text-teal-700 hover:bg-teal-200 dark:bg-teal-900/30 dark:text-teal-300'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      } ${sizeClasses[size]} ${className}`}
      title={playing ? '停止播放' : `播放：${label}`}
    >
      {loading ? (
        <Loader2 className={`${iconSize[size]} animate-spin`} />
      ) : playing ? (
        <Pause className={iconSize[size]} />
      ) : (
        <Volume2 className={iconSize[size]} />
      )}
      {playing ? '停止' : label}
    </button>
  );
}
