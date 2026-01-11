import Graph from 'graphology';
const { DirectedGraph } = Graph;
/**
 * A directed graph representing the call/reference relationships in a codebase.
 *
 * - Nodes are declarations (functions, classes, methods, properties, types)
 * - Edges are references (calls, property accesses, type usages)
 */
export class CallGraph {
    graph;
    constructor() {
        this.graph = new DirectedGraph();
    }
    /**
     * Add a declaration to the graph
     */
    addSymbol(node) {
        if (this.graph.hasNode(node.id)) {
            // Update existing node
            this.graph.mergeNodeAttributes(node.id, node);
        }
        else {
            this.graph.addNode(node.id, node);
        }
    }
    /**
     * Add a reference edge between two symbols
     */
    addReference(fromId, toId, edge) {
        // Ensure both nodes exist
        if (!this.graph.hasNode(fromId)) {
            console.warn(`Source node not found: ${fromId}`);
            return;
        }
        if (!this.graph.hasNode(toId)) {
            console.warn(`Target node not found: ${toId}`);
            return;
        }
        // Treat edges as a set (connectivity graph).
        // The default graphology DirectedGraph does not allow multiple edges between
        // the same pair of nodes. For dead-code reachability we only need to know
        // that a reference exists, not how many times it occurs.
        if (this.graph.hasEdge(fromId, toId))
            return;
        this.graph.addEdge(fromId, toId, edge);
    }
    /**
     * Get a symbol by ID
     */
    getSymbol(id) {
        if (!this.graph.hasNode(id))
            return undefined;
        return this.graph.getNodeAttributes(id);
    }
    /**
     * Check if a symbol exists
     */
    hasSymbol(id) {
        return this.graph.hasNode(id);
    }
    /**
     * Get all symbols
     */
    getAllSymbols() {
        return this.graph.mapNodes((id, attrs) => attrs);
    }
    /**
     * Get all symbols of a specific kind
     */
    getSymbolsByKind(kind) {
        return this.getAllSymbols().filter(s => s.kind === kind);
    }
    /**
     * Get all exported symbols
     */
    getExportedSymbols() {
        return this.getAllSymbols().filter(s => s.exported);
    }
    /**
     * Get all entry points
     */
    getEntryPoints() {
        return this.getAllSymbols().filter(s => s.isEntryPoint);
    }
    /**
     * Get symbols that reference this symbol (incoming edges)
     */
    getReferencingSymbols(id) {
        if (!this.graph.hasNode(id))
            return [];
        return this.graph.inNeighbors(id).map(neighborId => this.graph.getNodeAttributes(neighborId));
    }
    /**
     * Get symbols that this symbol references (outgoing edges)
     */
    getReferencedSymbols(id) {
        if (!this.graph.hasNode(id))
            return [];
        return this.graph.outNeighbors(id).map(neighborId => this.graph.getNodeAttributes(neighborId));
    }
    /**
     * Get incoming reference count
     */
    getInDegree(id) {
        if (!this.graph.hasNode(id))
            return 0;
        return this.graph.inDegree(id);
    }
    /**
     * Get outgoing reference count
     */
    getOutDegree(id) {
        if (!this.graph.hasNode(id))
            return 0;
        return this.graph.outDegree(id);
    }
    /**
     * Mark a symbol as used
     */
    markAsUsed(id) {
        if (this.graph.hasNode(id)) {
            this.graph.setNodeAttribute(id, 'isUsed', true);
        }
    }
    /**
     * Mark a symbol as an entry point with reason
     */
    markAsEntryPoint(id, reason) {
        if (this.graph.hasNode(id)) {
            this.graph.setNodeAttribute(id, 'isEntryPoint', true);
            if (reason) {
                this.graph.setNodeAttribute(id, 'entryPointReason', reason);
            }
        }
    }
    /**
     * Mark a symbol as retained (won't be reported as unused)
     */
    markAsRetained(id, reason) {
        if (this.graph.hasNode(id)) {
            this.graph.setNodeAttribute(id, 'retainedBy', reason);
            // Retained symbols are also considered used
            this.graph.setNodeAttribute(id, 'isUsed', true);
        }
    }
    /**
     * Get all retained symbols
     */
    getRetainedSymbols() {
        return this.getAllSymbols().filter(s => s.retainedBy !== undefined);
    }
    /**
     * Get all used symbols
     */
    getUsedSymbols() {
        return this.getAllSymbols().filter(s => s.isUsed);
    }
    /**
     * Get all unused symbols
     */
    getUnusedSymbols() {
        return this.getAllSymbols().filter(s => !s.isUsed);
    }
    /**
     * Add a reference edge by type (simplified API for mutators)
     */
    addReferenceByType(fromId, toId, type, location) {
        this.addReference(fromId, toId, {
            type,
            file: location?.file ?? '',
            line: location?.line ?? 0,
            column: location?.column ?? 0,
        });
    }
    /**
     * Find a symbol by name (returns first match)
     */
    findSymbolByName(name) {
        return this.getAllSymbols().find(s => s.name === name);
    }
    /**
     * Find all symbols matching a predicate
     */
    findSymbols(predicate) {
        return this.getAllSymbols().filter(predicate);
    }
    /**
     * Get the underlying graphology instance (for algorithms)
     */
    getGraphologyInstance() {
        return this.graph;
    }
    /**
     * Get statistics about the graph
     */
    getStats() {
        const symbols = this.getAllSymbols();
        return {
            nodeCount: this.graph.order,
            edgeCount: this.graph.size,
            exportedCount: symbols.filter(s => s.exported).length,
            entryPointCount: symbols.filter(s => s.isEntryPoint).length,
        };
    }
}
//# sourceMappingURL=CallGraph.js.map