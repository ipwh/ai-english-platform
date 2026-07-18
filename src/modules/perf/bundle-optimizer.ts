// Sprint 14: Bundle Optimizer — import analysis and tree-shaking guidance

export interface BundleAnalysis {
  totalImports: number;
  heavyModules: HeavyModule[];
  duplicates: DuplicateImport[];
  treeShakingScore: number;
  recommendations: string[];
}

export interface HeavyModule {
  path: string;
  estimatedSizeKB: number;
  importCount: number;
  suggestion: string;
}

export interface DuplicateImport {
  module: string;
  files: string[];
  count: number;
}

// Known heavy modules and their estimated sizes
const KNOWN_SIZES: Record<string, number> = {
  '@prisma/client': 800,
  'next': 500,
  'react': 120,
  'react-dom': 130,
  'pdfkit': 400,
  'zod': 60,
  'jose': 50,
  'google-auth-library': 300,
};

/** Analyze imports for bundle size concerns */
export function analyzeBundle(
  imports: Array<{ file: string; modulePath: string }>
): BundleAnalysis {
  const moduleCounts = new Map<string, { count: number; files: string[] }>();
  const heavy: HeavyModule[] = [];
  const duplicates: DuplicateImport[] = [];

  for (const imp of imports) {
    const existing = moduleCounts.get(imp.modulePath);
    if (existing) {
      existing.count++;
      if (!existing.files.includes(imp.file)) existing.files.push(imp.file);
    } else {
      moduleCounts.set(imp.modulePath, { count: 1, files: [imp.file] });
    }
  }

  for (const [modulePath, data] of moduleCounts) {
    const estimatedSize = KNOWN_SIZES[modulePath] ?? estimateModuleSize(modulePath);
    if (estimatedSize >= 50) {
      heavy.push({
        path: modulePath,
        estimatedSizeKB: estimatedSize,
        importCount: data.count,
        suggestion: data.count > 5
          ? `Imported ${data.count} times — consider a barrel re-export`
          : estimatedSize > 200
            ? `Heavy module (${estimatedSize}KB) — ensure dynamic import where possible`
            : 'OK',
      });
    }
    if (data.count > 3) {
      duplicates.push({ module: modulePath, files: data.files, count: data.count });
    }
  }

  const recommendations: string[] = [];
  if (heavy.length > 5) recommendations.push(`${heavy.length} heavy modules (>50KB) detected — audit for tree-shaking opportunities`);
  if (duplicates.length > 3) recommendations.push(`${duplicates.length} modules imported 3+ times — consider barrel files`);
  if (imports.length > 200) recommendations.push(`High total import count (${imports.length}) — consider code splitting`);

  return {
    totalImports: imports.length,
    heavyModules: heavy.sort((a, b) => b.estimatedSizeKB - a.estimatedSizeKB),
    duplicates: duplicates.sort((a, b) => b.count - a.count),
    treeShakingScore: Math.max(0, 100 - heavy.length * 5 - duplicates.length * 2),
    recommendations,
  };
}

/** Estimate module size based on path heuristics */
function estimateModuleSize(modulePath: string): number {
  if (modulePath.includes('pdf')) return 300;
  if (modulePath.includes('ai-service')) return 200;
  if (modulePath.includes('chart') || modulePath.includes('graph')) return 150;
  if (modulePath.includes('icon') || modulePath.includes('lucide')) return 80;
  return 10;
}

/** Recommend lazy loading for a module */
export function shouldLazyLoad(modulePath: string, estimatedSizeKB: number): boolean {
  // Heuristic: lazy load if > 50KB AND not a core dependency
  const corePatterns = ['react', 'next', 'db', 'auth', 'config', 'logger'];
  const isCore = corePatterns.some(p => modulePath.includes(p));
  return estimatedSizeKB > 50 && !isCore;
}

/** Generate dynamic import code for lazy loading */
export function generateLazyImport(modulePath: string, exportName: string): string {
  return `const { ${exportName} } = await import('${modulePath}');`;
}
