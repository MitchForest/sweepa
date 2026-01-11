import type { Project } from 'ts-morph';
import type { Issue } from './types.js';
export declare function detectDependencyIssues(options: {
    project: Project;
    tsConfigPath: string;
    projectRoot: string;
    reachableFiles: Set<string>;
}): Issue[];
//# sourceMappingURL=Dependencies.d.ts.map