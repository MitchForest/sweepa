import type { Project, SourceFile } from 'ts-morph';
import type { CombinedEntryPointConfig } from '../frameworks/FrameworkDetector.js';
export declare function computeReachableFiles(options: {
    project: Project;
    tsConfigPath: string;
    projectRoot: string;
    entryPointConfig: CombinedEntryPointConfig;
    /** Defaults true: ignore generated code in reachability. */
    ignoreGenerated?: boolean;
}): {
    reachableFiles: Set<string>;
    entryFiles: Set<string>;
    fileByPath: Map<string, SourceFile>;
};
//# sourceMappingURL=reachability.d.ts.map