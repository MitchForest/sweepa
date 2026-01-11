/**
 * Mutator Pipeline Types
 *
 * Based on Periphery's architecture: mutators transform the call graph
 * to handle special cases before final used/unused determination.
 */
import type { Project } from 'ts-morph';
import type { CallGraph } from '../graph/index.js';
import type { FrameworkDetection } from '../frameworks/index.js';
import type { ReferenceType } from '../graph/types.js';
/**
 * Phase of the mutator pipeline
 */
export type MutatorPhase = 'entry-points' | 'references' | 'retention' | 'marking';
/**
 * A mutator that transforms the call graph
 */
export interface GraphMutator {
    /** Unique name for logging/debugging */
    name: string;
    /** Lower numbers run first within a phase */
    priority: number;
    /** Phase this mutator belongs to */
    phase: MutatorPhase;
    /**
     * Mutate the graph in place.
     * Can add edges, mark nodes as entry points, or mark nodes as retained.
     */
    mutate(context: MutatorContext): void;
}
/**
 * Context passed to each mutator
 */
export interface MutatorContext {
    /** The call graph to mutate */
    graph: CallGraph;
    /** The ts-morph project for additional analysis */
    project: Project;
    /** Project root directory */
    projectRoot: string;
    /** Detected frameworks */
    frameworks: FrameworkDetection[];
    /** Configuration options */
    config: MutatorConfig;
    /** Mark a node as an entry point */
    markAsEntryPoint(nodeId: string, reason: string): void;
    /** Mark a node as retained (won't be reported as unused) */
    markAsRetained(nodeId: string, reason: string): void;
    /** Add a reference edge between two nodes */
    addReference(fromId: string, toId: string, type: ReferenceType): void;
    /** Log a debug message */
    log(message: string): void;
}
/**
 * Configuration for mutators
 */
export interface MutatorConfig {
    /** Retain all exports (library mode) */
    retainExports?: boolean;
    /** Retain all public/exported symbols (library mode, same as retainExports) */
    retainPublic?: boolean;
    /** Retain all decorated code */
    retainDecorated?: boolean;
    /** Decorators that indicate framework usage */
    retainDecorators?: string[];
    /** Patterns of files to retain all exports from */
    retainFilePatterns?: string[];
    /** Enable verbose logging */
    verbose?: boolean;
}
//# sourceMappingURL=types.d.ts.map