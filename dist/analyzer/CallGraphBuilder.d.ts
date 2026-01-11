import { Project } from 'ts-morph';
import { CallGraph } from '../graph/CallGraph.js';
export interface CallGraphBuilderOptions {
    /** Path to tsconfig.json */
    tsConfigPath: string;
    /** Additional files to include (beyond tsconfig) */
    include?: string[];
    /** Files/patterns to exclude from analysis (glob patterns supported) */
    exclude?: string[];
    /** Emit progress logs to stderr */
    verbose?: boolean;
}
/**
 * Builds a call graph from a TypeScript project using ts-morph.
 *
 * Uses ts-morph's findReferences() to discover all symbol references,
 * similar to how Periphery uses Swift's index store.
 */
export declare class CallGraphBuilder {
    private project;
    private graph;
    private options;
    constructor(options: CallGraphBuilderOptions);
    /**
     * Build the complete call graph
     */
    build(): CallGraph;
    private shouldExclude;
    /**
     * Simple glob matching for exclusion patterns
     * Supports ** (any path segments) and * (any characters except /)
     */
    private matchesGlob;
    /**
     * Extract all declarations from a source file
     */
    private extractDeclarations;
    /**
     * Extract references from declarations using ts-morph's findReferences
     */
    private extractReferences;
    /**
     * Find all identifiers used in a declaration's body/initializer and add edges to them
     * This handles outgoing references (what does this symbol use?)
     */
    private findOutgoingReferences;
    /**
     * Resolve an ImportSpecifier to the actual exported declaration in the source module
     */
    private resolveImportSpecifier;
    /**
     * Find type references used in interface/type definitions
     * This handles cases like: interface Props { border: AvatarBorderStyle }
     */
    private findOutgoingTypeReferences;
    /**
     * Check if a node supports findReferences
     */
    private isReferenceFindable;
    /**
     * Find all references to a declaration and add them as edges
     */
    private findAndAddReferences;
    /**
     * Find the declaration that contains a reference node
     */
    private findContainingDeclaration;
    /**
     * Ensure a module-level node exists for tracking module-level references
     */
    private ensureModuleNode;
    /**
     * Determine the type of reference from context
     */
    private determineReferenceType;
    /**
     * Create a unique symbol ID
     */
    private createSymbolId;
    private addSymbolNode;
    /**
     * Get the underlying ts-morph project
     */
    getProject(): Project;
}
//# sourceMappingURL=CallGraphBuilder.d.ts.map