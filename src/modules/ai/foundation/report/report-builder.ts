// ============================================
// ReportBuilder — Unified report generation
// with pluggable renderers.
//
// Supports: Markdown, JSON, Console, and future
// HTML rendering. All existing report generators
// can delegate to this builder.
// ============================================

import type { ReportFormat, RenderedReport } from '../types';

// ── Renderer Interface ──

/**
 * A renderer converts structured report data into a
 * specific output format (Markdown, JSON, etc.).
 *
 * @typeParam TData — The report data type
 */
export interface ReportRenderer<TData> {
  /** The format this renderer produces */
  readonly format: ReportFormat;

  /** The MIME type for transport */
  readonly mimeType: string;

  /** Render the report data to a string */
  render(data: TData, options?: ReportRenderOptions): string;
}

/**
 * Options passed to renderers.
 */
export interface ReportRenderOptions {
  /** Report title */
  title?: string;
  /** Include generation timestamp */
  includeTimestamp?: boolean;
  /** Include metadata section */
  includeMetadata?: boolean;
  /** Pretty-print (for JSON) */
  pretty?: boolean;
}

/**
 * Metadata attached to every report.
 */
export interface ReportMetadata {
  /** Report title */
  title: string;
  /** When the report was generated */
  generatedAt: string;
  /** Report format */
  format: ReportFormat;
  /** Arbitrary tags */
  tags?: string[];
  /** Extra metadata (renderer-specific) */
  extra?: Record<string, unknown>;
}

// ── Markdown Renderer ──

/**
 * Default Markdown renderer.
 * Converts structured data to Markdown tables and sections.
 *
 * @typeParam TData — Report data type
 */
export class MarkdownRenderer<TData> implements ReportRenderer<TData> {
  readonly format: ReportFormat = 'markdown';
  readonly mimeType = 'text/markdown';

  /**
   * @param builder — Function that converts data to Markdown lines
   */
  constructor(
    private readonly builder: (data: TData, options?: ReportRenderOptions) => string[],
  ) {}

  render(data: TData, options?: ReportRenderOptions): string {
    const lines: string[] = [];

    if (options?.title) {
      lines.push(`# ${options.title}`);
      if (options.includeTimestamp) {
        lines.push(`**Generated**: ${new Date().toISOString()}`);
      }
      lines.push('');
    }

    lines.push(...this.builder(data, options));
    return lines.join('\n');
  }
}

// ── JSON Renderer ──

/**
 * Default JSON renderer.
 * Converts data to JSON with optional pretty-printing.
 *
 * @typeParam TData — Report data type
 */
export class JSONRenderer<TData> implements ReportRenderer<TData> {
  readonly format: ReportFormat = 'json';
  readonly mimeType = 'application/json';

  render(data: TData, options?: ReportRenderOptions): string {
    const output: Record<string, unknown> = {
      data,
    };

    if (options?.title) {
      output.title = options.title;
    }
    if (options?.includeTimestamp) {
      output.generatedAt = new Date().toISOString();
    }

    return options?.pretty !== false
      ? JSON.stringify(output, null, 2)
      : JSON.stringify(output);
  }
}

// ── Console Renderer ──

/**
 * Console-friendly renderer.
 * Produces plain-text output suitable for terminal display.
 *
 * @typeParam TData — Report data type
 */
export class ConsoleRenderer<TData> implements ReportRenderer<TData> {
  readonly format: ReportFormat = 'console';
  readonly mimeType = 'text/plain';

  /**
   * @param builder — Function that converts data to console lines
   */
  constructor(
    private readonly builder: (data: TData, options?: ReportRenderOptions) => string[],
  ) {}

  render(data: TData, options?: ReportRenderOptions): string {
    const lines: string[] = [];

    if (options?.title) {
      lines.push(`=== ${options.title} ===`);
      if (options?.includeTimestamp) {
        lines.push(`Generated: ${new Date().toISOString()}`);
      }
      lines.push('');
    }

    lines.push(...this.builder(data, options));
    return lines.join('\n');
  }
}

// ── Report Builder ──

/**
 * Unified report builder with pluggable renderers.
 *
 * Use this to generate reports in multiple formats from
 * the same structured data. All existing report generators
 * (experiment, regression, continuous-eval) can delegate
 * to this builder for format-agnostic output.
 *
 * @typeParam TData — The structured report data type
 *
 * @example
 * ```ts
 * const builder = new ReportBuilder<MyReport>()
 *   .register(new MarkdownRenderer((data) => buildMarkdownLines(data)))
 *   .register(new JSONRenderer());
 *
 * // Build a Markdown report
 * const md = builder.build('markdown', data, { title: 'My Report' });
 *
 * // Export to JSON
 * const json = builder.export('json', data);
 * ```
 */
export class ReportBuilder<TData> {
  private renderers = new Map<ReportFormat, ReportRenderer<TData>>();

  /**
   * Register a renderer for a specific format.
   *
   * @param renderer — The renderer instance
   * @returns this (for method chaining)
   */
  register(renderer: ReportRenderer<TData>): this {
    this.renderers.set(renderer.format, renderer);
    return this;
  }

  /**
   * Check if a format is supported.
   */
  supports(format: ReportFormat): boolean {
    return this.renderers.has(format);
  }

  /**
   * Build a report in the specified format.
   *
   * @param format — Desired output format
   * @param data — Report data
   * @param options — Rendering options
   * @returns Rendered report
   * @throws {Error} If the format is not supported
   */
  build(format: ReportFormat, data: TData, options?: ReportRenderOptions): RenderedReport {
    const renderer = this.renderers.get(format);
    if (!renderer) {
      throw new Error(`No renderer registered for format "${format}". ` +
        `Registered: [${Array.from(this.renderers.keys()).join(', ')}]`);
    }

    const content = renderer.render(data, options);

    return {
      content,
      format: renderer.format,
      mimeType: renderer.mimeType,
    };
  }

  /**
   * Render a report and return the raw string content.
   * Convenience wrapper around {@link build}.
   */
  render(format: ReportFormat, data: TData, options?: ReportRenderOptions): string {
    return this.build(format, data, options).content;
  }

  /**
   * Export a report in the specified format.
   * Alias for {@link render} with clearer semantic intent for file export.
   */
  export(format: ReportFormat, data: TData, options?: ReportRenderOptions): string {
    return this.render(format, data, options);
  }

  /**
   * Build reports in all registered formats.
   *
   * @param data — Report data
   * @param options — Rendering options
   * @returns Map of format → rendered report
   */
  buildAll(data: TData, options?: ReportRenderOptions): Map<ReportFormat, RenderedReport> {
    const results = new Map<ReportFormat, RenderedReport>();
    for (const format of this.renderers.keys()) {
      results.set(format, this.build(format, data, options));
    }
    return results;
  }

  /**
   * List all registered formats.
   */
  listFormats(): ReportFormat[] {
    return Array.from(this.renderers.keys());
  }

  /**
   * Create a report metadata object.
   */
  static metadata(title: string, format: ReportFormat, extra?: Record<string, unknown>): ReportMetadata {
    return {
      title,
      generatedAt: new Date().toISOString(),
      format,
      extra,
    };
  }
}

// ── Re-export renderers ──

export { MarkdownRenderer as MarkdownReportRenderer } from './markdown-renderer';
export { JSONRenderer as JSONReportRenderer } from './json-renderer';
