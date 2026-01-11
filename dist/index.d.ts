export { CallGraph } from './graph/index.js';
export { CallGraphBuilder } from './analyzer/index.js';
export { detectUnusedParams, detectAssignOnlyProps, detectUnusedMethods, detectUnusedImports, detectUnusedEnumCases, detectRedundantExports, } from './detectors/index.js';
export { MutatorRunner, getCoreMutators, } from './mutators/index.js';
export { detectFrameworks, shouldIgnoreFile, isEntryPointFile, getEntryExportsForFile, } from './frameworks/index.js';
export { createBaseline, filterNewIssues, validateBaseline, hashIssue, } from './baseline/index.js';
export { parseIgnoreDirectives, parseProjectIgnores, shouldIgnoreIssue, } from './config/index.js';
export { removeDependenciesFromPackageJson, moveDependenciesBetweenSections, } from './fix/index.js';
export { formatGitHubActions, formatGitHubMarkdown, formatSARIF, formatCSV, } from './output/index.js';
export type { SymbolNode, SymbolKind, ReferenceEdge, ReferenceType, ReferenceSource, } from './graph/index.js';
export type { CallGraphBuilderOptions } from './analyzer/index.js';
export type { Issue, IssueKind, Confidence, DetectionResult, } from './detectors/index.js';
export type { Baseline, BaselineIssue } from './baseline/index.js';
export type { FileIgnores, IgnoreDirective } from './config/index.js';
//# sourceMappingURL=index.d.ts.map