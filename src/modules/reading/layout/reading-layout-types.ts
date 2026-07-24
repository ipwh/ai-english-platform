// ============================================
// Sprint 116: Reading Layout Types
// Deterministic layout engine. No AI, no browser DOM.
// ============================================

/** Options for the layout engine */
export interface LayoutOptions {
  /** Characters per visual line (default 65 for desktop, ~50 for mobile) */
  charsPerLine?: number;
  /** Line marker interval — insert [line N] every N lines (default 5) */
  markerInterval?: number;
  /** Container width in pixels (for responsive estimation) */
  containerWidth?: number;
  /** Font size in pixels (default 14) */
  fontSize?: number;
  /** Whether to include paragraph breaks as blank lines */
  includeParagraphSpacing?: boolean;
}

export const DEFAULT_LAYOUT_OPTIONS: Required<LayoutOptions> = {
  charsPerLine: 65,
  markerInterval: 5,
  containerWidth: 700,
  fontSize: 14,
  includeParagraphSpacing: true,
};

/** A single display line after layout calculation */
export interface DisplayLine {
  /** Global line number (1-based) */
  line: number;
  /** Paragraph index (0-based) */
  paragraph: number;
  /** Paragraph-relative line number (1-based) */
  paragraphLine: number;
  /** The text on this line */
  text: string;
  /** Whether this line has a marker */
  hasMarker: boolean;
  /** Whether this is a blank/spacer line between paragraphs */
  isBlank: boolean;
}

/** A paragraph after layout */
export interface LayoutParagraph {
  /** Paragraph index (0-based) */
  index: number;
  /** Original paragraph number from [N] marker */
  paragraphNumber: number;
  /** Lines in this paragraph */
  lines: DisplayLine[];
  /** First global line number */
  startLine: number;
  /** Last global line number */
  endLine: number;
}

/** Full layout result */
export interface LayoutResult {
  /** Rendered HTML string with line markers */
  html: string;
  /** Plain text with line markers */
  renderedText: string;
  /** Full line map for question reference resolution */
  lineMap: DisplayLine[];
  /** Paragraph breakdown */
  paragraphs: LayoutParagraph[];
  /** Total display lines (including blank lines) */
  totalLines: number;
  /** Total substantive (non-blank) lines */
  substantiveLines: number;
  /** Marker positions (global line numbers) */
  markers: number[];
  /** Options used */
  options: Required<LayoutOptions>;
}

/** Metrics collected during layout */
export interface LayoutMetrics {
  totalLayouts: number;
  totalLines: number;
  totalParagraphs: number;
  totalDurationMs: number;
  totalRenderDurationMs: number;
  markerCounts: number[];
}
