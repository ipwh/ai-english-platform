# ADR-037: Reading Layout Engine

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Sprint 116 architecture review
- **Module**: `src/modules/reading/layout/`

---

## Context

Previously, the AI was responsible for generating `[line N]` markers within reading passages. The prompt instructed the AI to insert markers at specific word intervals (every ~55 words for `[line 5]`, `[line 10]`, etc.).

However, AI-generated line numbers are **fundamentally unreliable** because:

1. **Browser word wrapping** — lines that fit on one line at 700px may wrap at 320px
2. **Font size** — 14px vs 16px changes characters per line
3. **Container width** — responsive layouts change the visible line count
4. **Different devices** — desktop vs tablet vs mobile all render differently
5. **AI has no DOM** — the AI cannot know how text will actually render

A passage that the AI thinks has 20 lines may actually render as 27 lines on mobile or 15 on wide desktop. This makes `(line 17)` references in questions inaccurate.

## Decision

Move line numbering responsibility from the AI to a deterministic **Reading Layout Engine** that calculates line numbers at render time based on actual display metrics.

```
Plain Text → Layout Engine → Display Lines → HTML with [line N] markers
```

The AI must NEVER generate line numbers. It only outputs clean paragraphs with `[N]` paragraph markers.

## Architecture

### Pipeline

```
Raw passage text (with [Paragraph N] markers)
  ↓ extractParagraphs()
Paragraph array [{ text, number }]
  ↓ calculateTotalLines()
Display lines [{ line, paragraph, text }]
  ↓ renderToHtml()
HTML with accurate [line N] markers at configurable intervals
```

### Modules

| File | Responsibility |
|------|---------------|
| `reading-layout-types.ts` | Core types: DisplayLine, LayoutResult, LayoutOptions |
| `line-calculator.ts` | Splits paragraphs into display lines based on charsPerLine |
| `paragraph-layout.ts` | Extracts paragraphs from [Paragraph N] markers |
| `layout-renderer.ts` | Renders HTML with styled line markers |
| `layout-engine.ts` | Main public API: `layoutReadingText()` |
| `layout-metrics.ts` | Tracks layout performance |
| `layout-report.ts` | Markdown/JSON reports |

### Responsive Support

The engine supports recalculation when:
- Container width changes (ResizeObserver)
- Font size changes
- Window resize

`recalculateLayout()` regenerates the layout without re-fetching the passage.

### Key Design Decisions

1. **Chars-per-line estimation**: Average character width ≈ 0.55 × fontSize for proportional fonts
2. **Marker interval**: Default every 5 lines, configurable (2/5/10)
3. **Paragraph spacing**: Blank spacer lines between paragraphs (configurable)
4. **Line map export**: Full `{ line, paragraph, text }` array for future question reference resolution

## Consequences

### Positive
- Line numbers always match actual display
- Responsive — recalculates on resize
- No AI cost for line numbering
- Deterministic and testable
- Cleaner AI prompts (no line marker instructions)

### Negative
- Adds client-side computation (~1ms for typical passage)
- Line numbering may fluctuate slightly on resize (acceptable — DSE tolerance is ±2 lines)
- Requires ResizeObserver (supported in all modern browsers)

## Alternatives Considered

1. **AI-generated line numbers**: Current approach. Rejected: fundamentally unreliable.
2. **Monospace font**: Would make chars-per-line predictable. Rejected: poor reading UX.
3. **Server-side layout with fixed width**: Calculate once on server. Rejected: can't adapt to device.
