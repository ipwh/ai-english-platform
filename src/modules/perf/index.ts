// Sprint 14: Performance — barrel
export {
  startQueryLogging, stopQueryLogging, logQuery, detectNPlusOne,
  batchQueries, createIdBatcher, estimateQueryDepth,
  type NPlusOneReport, type NPlusOneIssue,
} from './query-optimizer';
export {
  analyzeBundle, shouldLazyLoad, generateLazyImport,
  type BundleAnalysis, type HeavyModule, type DuplicateImport,
} from './bundle-optimizer';
export { generatePerfReport } from './perf-report';
