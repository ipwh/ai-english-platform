// ============================================
// Sprint 116 / Phase 1A: Reading Layout Types (v2)
// Deterministic layout engine. No AI, no browser DOM.
// v2: Gutter-based line numbers, paragraph labels, clean text/metadata separation
// ============================================

/** A single display line — pure metadata, text has NO inline markers */
export interface DisplayLine {
  /** 0-based index across all lines in the layout */
  lineIndex: number;
  /** Display line number (undefined if this line is not a numbered interval) */
  lineNumber?: number;
  /** 0-based paragraph index this line belongs to */
  paragraphIndex: number;
  /** Clean prose text — NEVER contains [N] or [line N] markers */
  text: string;
  /** Whether this line is the first line of its paragraph */
  isParagraphStart: boolean;
  /** Paragraph label for the first line of a paragraph (e.g. "Paragraph 1" / "1") */
  paragraphLabel?: string;
}

/** A paragraph after layout computation */
export interface LayoutParagraph {
  /** 0-based paragraph index */
  paragraphIndex: number;
  /** Paragraph label string (e.g. "Paragraph 1" or "1") */
  label: string;
  /** 1-based convenience: paragraph number (backward compat) */
  paragraphNumber: number;
  /** Original source text for this paragraph */
  sourceText: string;
  /** Display lines in this paragraph */
  lines: DisplayLine[];
  /** 0-based index (backward compat alias for paragraphIndex) */
  index: number;
  /** First global line number (backward compat) */
  startLine?: number;
  /** Last global line number (backward compat) */
  endLine?: number;
}

/** Options for the layout engine */
export interface LayoutOptions {
  /** Characters per visual line — hard upper cap (default 68) */
  maxCharsPerLine?: number;
  /** Line number interval — show number every N lines (default 5) */
  lineNumberInterval?: number;
  /** Whether to show paragraph labels (default true) */
  showParagraphLabels?: boolean;
  /** Paragraph label format: "Paragraph 1" or just "1" (default "numeric") */
  paragraphLabelMode?: 'numeric' | 'paragraph';
  /** Line number display style (default "gutter") */
  lineNumberStyle?: 'gutter' | 'none';

  // ── Phase 1C: Stable reading measure ──
  /** Viewport category for width selection (default auto-detected) */
  viewportMode?: 'mobile' | 'tablet' | 'desktop';
  /** When true, use preferredCharsPerLine instead of fluid container-based calc */
  fixedReadingMeasure?: boolean;
  /** Target characters per line for fixed-measure mode (default 66) */
  preferredCharsPerLine?: number;

  // ── Backward-compat aliases ──
  /** @deprecated Use maxCharsPerLine */
  charsPerLine?: number;
  /** @deprecated Use lineNumberInterval */
  markerInterval?: number;
  /** @deprecated Container width for responsive estimation */
  containerWidth?: number;
  /** @deprecated Font size for responsive estimation */
  fontSize?: number;
  /** @deprecated Whether to include paragraph breaks as blank lines */
  includeParagraphSpacing?: boolean;
}

/** Resolved options with all defaults applied */
export interface ResolvedLayoutOptions {
  maxCharsPerLine: number;
  lineNumberInterval: number;
  showParagraphLabels: boolean;
  paragraphLabelMode: 'numeric' | 'paragraph';
  lineNumberStyle: 'gutter' | 'none';
  viewportMode: 'mobile' | 'tablet' | 'desktop';
  fixedReadingMeasure: boolean;
  preferredCharsPerLine: number;
}

export const DEFAULT_LAYOUT_OPTIONS: ResolvedLayoutOptions = {
  maxCharsPerLine: 68,
  lineNumberInterval: 5,
  showParagraphLabels: true,
  paragraphLabelMode: 'numeric',
  lineNumberStyle: 'gutter',
  viewportMode: 'desktop',
  fixedReadingMeasure: true,
  preferredCharsPerLine: 66,
};

/** Resolve partial options against defaults (also handles backward-compat aliases) */
export function resolveLayoutOptions(raw?: Partial<LayoutOptions>): ResolvedLayoutOptions {
  return {
    maxCharsPerLine: raw?.maxCharsPerLine ?? raw?.charsPerLine ?? DEFAULT_LAYOUT_OPTIONS.maxCharsPerLine,
    lineNumberInterval: raw?.lineNumberInterval ?? raw?.markerInterval ?? DEFAULT_LAYOUT_OPTIONS.lineNumberInterval,
    showParagraphLabels: raw?.showParagraphLabels ?? DEFAULT_LAYOUT_OPTIONS.showParagraphLabels,
    paragraphLabelMode: raw?.paragraphLabelMode ?? DEFAULT_LAYOUT_OPTIONS.paragraphLabelMode,
    lineNumberStyle: raw?.lineNumberStyle ?? DEFAULT_LAYOUT_OPTIONS.lineNumberStyle,
    viewportMode: raw?.viewportMode ?? DEFAULT_LAYOUT_OPTIONS.viewportMode,
    fixedReadingMeasure: raw?.fixedReadingMeasure ?? DEFAULT_LAYOUT_OPTIONS.fixedReadingMeasure,
    preferredCharsPerLine: raw?.preferredCharsPerLine ?? DEFAULT_LAYOUT_OPTIONS.preferredCharsPerLine,
  };
}

/**
 * Phase 1C / 4D.2: Resolve stable chars-per-line based on viewport mode.
 * When fixedReadingMeasure is true, uses predetermined caps per viewport
 * (more conservative than previous — better for HKDSE exam-like density).
 * Otherwise falls back to maxCharsPerLine as a hard upper limit.
 */
export function resolveCharsPerLine(opts: ResolvedLayoutOptions): number {
  if (opts.fixedReadingMeasure) {
    switch (opts.viewportMode) {
      case 'desktop': return Math.min(opts.preferredCharsPerLine, 68);
      case 'tablet':  return Math.min(opts.preferredCharsPerLine, 58);
      case 'mobile':  return Math.min(opts.preferredCharsPerLine, 40);
    }
  }
  return Math.min(opts.maxCharsPerLine, 68);
}

/** Layout quality warnings computed during layout */
export interface LayoutWarnings {
  overWideLines: boolean;
  unstableLineCount: boolean;
  gutterAlignmentRisk: boolean;
  splitViewEligible: boolean;
  details: string[];
}

/** Full layout result */
export interface LayoutResult {
  /** Paragraphs with computed display lines */
  paragraphs: LayoutParagraph[];
  /** Rendered HTML with gutter line numbers */
  html: string;
  /** Total display lines */
  totalLines: number;
  /** Phase 1C.1: Runtime diagnostics, separate from config */
  warnings?: LayoutWarnings;

  // ── Backward-compat fields ──
  /** Plain text with line markers (backward compat) */
  renderedText?: string;
  /** Substantive (non-empty) lines (backward compat) */
  lineMap?: DisplayLine[];
  /** Line numbers that have markers (backward compat) */
  markers?: number[];
  /** Options used to produce this layout (backward compat) */
  options?: Record<string, unknown>;
  /** Count of substantive lines (backward compat) */
  substantiveLines?: number;
}

/** Metrics collected during layout (unchanged from v1) */
export interface LayoutMetrics {
  totalLayouts: number;
  totalLines: number;
  totalParagraphs: number;
  totalDurationMs: number;
  totalRenderDurationMs: number;
  markerCounts: number[];
}
