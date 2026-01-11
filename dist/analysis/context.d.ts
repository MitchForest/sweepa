import { Project } from 'ts-morph';
import { type CombinedEntryPointConfig, type FrameworkDetection } from '../frameworks/index.js';
import { type SweepaConfig } from '../config/index.js';
import { type FileIgnores } from '../config/CommentParser.js';
import type { Issue } from '../detectors/types.js';
export interface AnalysisContext {
    tsConfigPath: string;
    projectRoot: string;
    project: Project;
    frameworks: FrameworkDetection[];
    entryPointConfig: CombinedEntryPointConfig;
    configRoot: string;
    config: SweepaConfig;
    ignoresByFile: Map<string, FileIgnores>;
}
export declare function createAnalysisContext(options: {
    tsConfigPath: string;
    configStrict?: boolean;
}): AnalysisContext;
export declare function computeReachabilityForContext(ctx: AnalysisContext, options: {
    ignoreGenerated: boolean;
}): {
    reachableFiles: Set<string>;
    entryFiles: Set<string>;
    fileByPath: Map<string, import("ts-morph").SourceFile>;
};
export declare function applyAllIgnores(ctx: AnalysisContext, issues: Issue[]): Issue[];
//# sourceMappingURL=context.d.ts.map