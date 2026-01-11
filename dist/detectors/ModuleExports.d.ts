import type { Project } from 'ts-morph';
import type { Issue } from './types.js';
import { type CombinedEntryPointConfig } from '../frameworks/index.js';
export declare function detectUnusedModuleExports(options: {
    project: Project;
    tsConfigPath: string;
    projectRoot: string;
    reachableFiles: Set<string>;
    entryPointConfig: CombinedEntryPointConfig;
    mode: 'barrels' | 'all';
    ignoreGenerated: boolean;
}): Issue[];
//# sourceMappingURL=ModuleExports.d.ts.map