import type { AbstractGraph } from 'graphology-types';
import type { SymbolNode, ReferenceEdge, ReferenceType } from './types.js';
/**
 * A directed graph representing the call/reference relationships in a codebase.
 *
 * - Nodes are declarations (functions, classes, methods, properties, types)
 * - Edges are references (calls, property accesses, type usages)
 */
export declare class CallGraph {
    private graph;
    constructor();
    /**
     * Add a declaration to the graph
     */
    addSymbol(node: SymbolNode): void;
    /**
     * Add a reference edge between two symbols
     */
    addReference(fromId: string, toId: string, edge: ReferenceEdge): void;
    /**
     * Get a symbol by ID
     */
    getSymbol(id: string): SymbolNode | undefined;
    /**
     * Check if a symbol exists
     */
    hasSymbol(id: string): boolean;
    /**
     * Get all symbols
     */
    getAllSymbols(): SymbolNode[];
    /**
     * Get all symbols of a specific kind
     */
    getSymbolsByKind(kind: SymbolNode['kind']): SymbolNode[];
    /**
     * Get all exported symbols
     */
    getExportedSymbols(): SymbolNode[];
    /**
     * Get all entry points
     */
    getEntryPoints(): SymbolNode[];
    /**
     * Get symbols that reference this symbol (incoming edges)
     */
    getReferencingSymbols(id: string): SymbolNode[];
    /**
     * Get symbols that this symbol references (outgoing edges)
     */
    getReferencedSymbols(id: string): SymbolNode[];
    /**
     * Get incoming reference count
     */
    getInDegree(id: string): number;
    /**
     * Get outgoing reference count
     */
    getOutDegree(id: string): number;
    /**
     * Mark a symbol as used
     */
    markAsUsed(id: string): void;
    /**
     * Mark a symbol as an entry point with reason
     */
    markAsEntryPoint(id: string, reason?: string): void;
    /**
     * Mark a symbol as retained (won't be reported as unused)
     */
    markAsRetained(id: string, reason: string): void;
    /**
     * Get all retained symbols
     */
    getRetainedSymbols(): SymbolNode[];
    /**
     * Get all used symbols
     */
    getUsedSymbols(): SymbolNode[];
    /**
     * Get all unused symbols
     */
    getUnusedSymbols(): SymbolNode[];
    /**
     * Add a reference edge by type (simplified API for mutators)
     */
    addReferenceByType(fromId: string, toId: string, type: ReferenceType, location?: {
        file: string;
        line: number;
        column: number;
    }): void;
    /**
     * Find a symbol by name (returns first match)
     */
    findSymbolByName(name: string): SymbolNode | undefined;
    /**
     * Find all symbols matching a predicate
     */
    findSymbols(predicate: (s: SymbolNode) => boolean): SymbolNode[];
    /**
     * Get the underlying graphology instance (for algorithms)
     */
    getGraphologyInstance(): AbstractGraph<SymbolNode, ReferenceEdge>;
    /**
     * Get statistics about the graph
     */
    getStats(): {
        nodeCount: number;
        edgeCount: number;
        exportedCount: number;
        entryPointCount: number;
    };
}
//# sourceMappingURL=CallGraph.d.ts.map