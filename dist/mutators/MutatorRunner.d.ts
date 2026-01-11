/**
 * Mutator Runner - Orchestrates the mutator pipeline
 */
import type { Project } from 'ts-morph';
import type { CallGraph } from '../graph/index.js';
import type { FrameworkDetection } from '../frameworks/index.js';
import type { GraphMutator, MutatorConfig } from './types.js';
/**
 * Runs mutators in phase order, then priority order within each phase.
 */
export declare class MutatorRunner {
    private mutators;
    private verbose;
    constructor(options?: {
        verbose?: boolean;
    });
    /**
     * Register a mutator
     */
    register(mutator: GraphMutator): void;
    /**
     * Register multiple mutators
     */
    registerAll(mutators: GraphMutator[]): void;
    /**
     * Run all mutators in phase order
     */
    run(options: {
        graph: CallGraph;
        project: Project;
        projectRoot: string;
        frameworks: FrameworkDetection[];
        config?: MutatorConfig;
    }): void;
    /**
     * Get registered mutators (for debugging)
     */
    getMutators(): GraphMutator[];
    private createContext;
}
//# sourceMappingURL=MutatorRunner.d.ts.map