import type { Project } from 'ts-morph';
import type { CombinedEntryPointConfig } from '../frameworks/FrameworkDetector.js';
import type { Issue } from './types.js';
export declare function detectUnusedFiles(options: {
    project: Project;
    tsConfigPath: string;
    projectRoot: string;
    entryPointConfig: CombinedEntryPointConfig;
}): Issue[];
//# sourceMappingURL=UnusedFiles.d.ts.map