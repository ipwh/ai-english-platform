// ============================================
// Zustand Store — Integrated Skills Task State (v4)
// 管理「聽 → 記 → 寫」全流程狀態
// 新功能：步驟鎖定、聆聽進度、自動儲存計時器
// ============================================
import { create } from 'zustand';

export type TaskStage = 'config' | 'listening' | 'writing' | 'result';

/** 任務步驟（用於 UI 步驟指示器） */
export type TaskStep = 1 | 2 | 3;

export interface NoteGuideItem {
  question: string;
  hint: string;
}

export interface IntegratedTaskData {
  listeningContent: string;
  listeningContentZh?: string;
  noteTakingGuide: NoteGuideItem[];
  writingTask: string;
  writingTaskZh?: string;
  expectedContentPoints: string[];
  wordLimit?: number;
}

export interface IntegratedSkillsResult {
  overallScore: number;
  estimatedLevel?: string;
  listeningAccuracy: number;
  writingQuality: number;
  contentCompleteness: number;
  languageAccuracy: number;
  organizationClarity: number;
  generalComment?: string;
  capturedPoints?: string[];
  missedPoints?: string[];
  overCopyWarnings?: { original: string; suggestion: string }[];
}

interface IntegratedSkillsState {
  stage: TaskStage;
  gradeLevel: string;
  difficulty: string;
  taskType: string;
  task: IntegratedTaskData | null;
  studentNotes: string;
  studentWriting: string;

  // UI 狀態
  loading: boolean;
  error: string;
  aiLoading: boolean;
  showListeningText: boolean;
  showNotesGuide: boolean;
  showContentPoints: boolean;
  draftSaved: boolean;
  showNotesWarning: boolean;

  // v4: 步驟鎖定
  listeningCompleted: boolean;
  activeStep: TaskStep;
  playbackProgress: number;
  playbackSpeed: number;

  analysis: IntegratedSkillsResult | null;

  // 動作
  setStage: (stage: TaskStage) => void;
  setConfig: (grade: string, diff: string, type: string) => void;
  setTask: (task: IntegratedTaskData | null) => void;
  setStudentNotes: (notes: string) => void;
  setStudentWriting: (writing: string) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string) => void;
  setAiLoading: (v: boolean) => void;
  toggleListeningText: () => void;
  toggleNotesGuide: () => void;
  toggleContentPoints: () => void;
  setDraftSaved: (v: boolean) => void;
  setShowNotesWarning: (v: boolean) => void;
  setListeningCompleted: (v: boolean) => void;
  setActiveStep: (step: TaskStep) => void;
  setPlaybackProgress: (p: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setAnalysis: (a: IntegratedSkillsResult | null) => void;
  reset: () => void;
  // v5: Backend draft persistence
  saveDraft: () => Promise<void>;
  loadDraft: () => Promise<boolean>;
  clearDraft: () => Promise<void>;
}

const initialState = {
  stage: 'config' as TaskStage,
  gradeLevel: 'S4',
  difficulty: 'core',
  taskType: 'summary',
  task: null as IntegratedTaskData | null,
  studentNotes: '',
  studentWriting: '',
  loading: false,
  error: '',
  aiLoading: false,
  showListeningText: true,
  showNotesGuide: true,
  showContentPoints: false,
  draftSaved: false,
  showNotesWarning: false,
  listeningCompleted: false,
  activeStep: 1 as TaskStep,
  playbackProgress: 0,
  playbackSpeed: 1.0,
  analysis: null as IntegratedSkillsResult | null,
};

export const useIntegratedSkillsStore = create<IntegratedSkillsState>((set) => ({
  ...initialState,

  setStage: (stage) => set({ stage }),
  setConfig: (gradeLevel, difficulty, taskType) => set({ gradeLevel, difficulty, taskType }),
  setTask: (task) => set({
    task,
    listeningCompleted: false,
    activeStep: 1,
    playbackProgress: 0,
  }),
  setStudentNotes: (studentNotes) => set({ studentNotes }),
  setStudentWriting: (studentWriting) => set({ studentWriting }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setAiLoading: (aiLoading) => set({ aiLoading }),
  toggleListeningText: () => set(s => ({ showListeningText: !s.showListeningText })),
  toggleNotesGuide: () => set(s => ({ showNotesGuide: !s.showNotesGuide })),
  toggleContentPoints: () => set(s => ({ showContentPoints: !s.showContentPoints })),
  setDraftSaved: (draftSaved) => set({ draftSaved }),
  setShowNotesWarning: (showNotesWarning) => set({ showNotesWarning }),
  setListeningCompleted: (listeningCompleted) => set({ listeningCompleted }),
  setActiveStep: (activeStep) => set({ activeStep }),
  setPlaybackProgress: (playbackProgress) => set({ playbackProgress }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setAnalysis: (analysis) => set({ analysis }),
  reset: () => set(initialState),

  // === v5: Backend Draft Persistence ===
  saveDraft: async () => {
    const state = useIntegratedSkillsStore.getState();
    try {
      await fetch('/api/integrated-skills/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentNotes: state.studentNotes,
          studentWriting: state.studentWriting,
          taskData: state.task,
          stage: state.stage,
          activeStep: state.activeStep,
          listeningCompleted: state.listeningCompleted,
        }),
      });
      set({ draftSaved: true });
    } catch {
      set({ draftSaved: false });
    }
  },

  loadDraft: async () => {
    try {
      const res = await fetch('/api/integrated-skills/draft');
      const data = await res.json();
      if (data.draft) {
        set({
          studentNotes: data.draft.studentNotes || '',
          studentWriting: data.draft.studentWriting || '',
          task: data.draft.taskData || null,
          stage: data.draft.stage || 'config',
          activeStep: (data.draft.activeStep || 1) as TaskStep,
          listeningCompleted: data.draft.listeningCompleted || false,
        });
        return true;
      }
    } catch { /* no draft to load */ }
    return false;
  },

  clearDraft: async () => {
    try {
      await fetch('/api/integrated-skills/draft', { method: 'DELETE' });
    } catch { /* silent */ }
  },
}));
