import Graph from 'graphology'
import type { AbstractGraph } from 'graphology-types'
import type { SymbolNode, ReferenceEdge, ReferenceType } from './types.js'

const { DirectedGraph } = Graph

/**
 * A directed graph representing the call/reference relationships in a codebase.
 *
 * - Nodes are declarations (functions, classes, methods, properties, types)
 * - Edges are references (calls, property accesses, type usages)
 */
export class CallGraph {
  private graph: AbstractGraph<SymbolNode, ReferenceEdge>

  constructor() {
    this.graph = new DirectedGraph<SymbolNode, ReferenceEdge>()
  }

  /**
   * Add a declaration to the graph
   */
  addSymbol(node: SymbolNode): void {
    if (this.graph.hasNode(node.id)) {
      // Update existing node
      this.graph.mergeNodeAttributes(node.id, node)
    } else {
      this.graph.addNode(node.id, node)
    }
  }

  /**
   * Add a reference edge between two symbols
   */
  addReference(fromId: string, toId: string, edge: ReferenceEdge): void {
    // Ensure both nodes exist
    if (!this.graph.hasNode(fromId)) {
      console.warn(`Source node not found: ${fromId}`)
      return
    }
    if (!this.graph.hasNode(toId)) {
      console.warn(`Target node not found: ${toId}`)
      return
    }

    // Treat edges as a set (connectivity graph).
    // The default graphology DirectedGraph does not allow multiple edges between
    // the same pair of nodes. For dead-code reachability we only need to know
    // that a reference exists, not how many times it occurs.
    if ((this.graph as any).hasEdge(fromId, toId)) return
    this.graph.addEdge(fromId, toId, edge)
  }

  /**
   * Get a symbol by ID
   */
  getSymbol(id: string): SymbolNode | undefined {
    if (!this.graph.hasNode(id)) return undefined
    return this.graph.getNodeAttributes(id)
  }

  /**
   * Check if a symbol exists
   */
  hasSymbol(id: string): boolean {
    return this.graph.hasNode(id)
  }

  /**
   * Get all symbols
   */
  getAllSymbols(): SymbolNode[] {
    return this.graph.mapNodes((id, attrs) => attrs)
  }

  /**
   * Get all symbols of a specific kind
   */
  getSymbolsByKind(kind: SymbolNode['kind']): SymbolNode[] {
    return this.getAllSymbols().filter(s => s.kind === kind)
  }

  /**
   * Get all exported symbols
   */
  getExportedSymbols(): SymbolNode[] {
    return this.getAllSymbols().filter(s => s.exported)
  }

  /**
   * Get all entry points
   */
  getEntryPoints(): SymbolNode[] {
    return this.getAllSymbols().filter(s => s.isEntryPoint)
  }

  /**
   * Get symbols that reference this symbol (incoming edges)
   */
  getReferencingSymbols(id: string): SymbolNode[] {
    if (!this.graph.hasNode(id)) return []
    return this.graph.inNeighbors(id).map(neighborId =>
      this.graph.getNodeAttributes(neighborId)
    )
  }

  /**
   * Get symbols that this symbol references (outgoing edges)
   */
  getReferencedSymbols(id: string): SymbolNode[] {
    if (!this.graph.hasNode(id)) return []
    return this.graph.outNeighbors(id).map(neighborId =>
      this.graph.getNodeAttributes(neighborId)
    )
  }

  /**
   * Get incoming reference count
   */
  getInDegree(id: string): number {
    if (!this.graph.hasNode(id)) return 0
    return this.graph.inDegree(id)
  }

  /**
   * Get outgoing reference count
   */
  getOutDegree(id: string): number {
    if (!this.graph.hasNode(id)) return 0
    return this.graph.outDegree(id)
  }

  /**
   * Mark a symbol as used
   */
  markAsUsed(id: string): void {
    if (this.graph.hasNode(id)) {
      this.graph.setNodeAttribute(id, 'isUsed', true)
    }
  }

  /**
   * Mark a symbol as an entry point with reason
   */
  markAsEntryPoint(id: string, reason?: string): void {
    if (this.graph.hasNode(id)) {
      this.graph.setNodeAttribute(id, 'isEntryPoint', true)
      if (reason) {
        this.graph.setNodeAttribute(id, 'entryPointReason', reason)
      }
    }
  }

  /**
   * Mark a symbol as retained (won't be reported as unused)
   */
  markAsRetained(id: string, reason: string): void {
    if (this.graph.hasNode(id)) {
      this.graph.setNodeAttribute(id, 'retainedBy', reason)
      // Retained symbols are also considered used
      this.graph.setNodeAttribute(id, 'isUsed', true)
    }
  }

  /**
   * Get all retained symbols
   */
  getRetainedSymbols(): SymbolNode[] {
    return this.getAllSymbols().filter(s => s.retainedBy !== undefined)
  }

  /**
   * Get all used symbols
   */
  getUsedSymbols(): SymbolNode[] {
    return this.getAllSymbols().filter(s => s.isUsed)
  }

  /**
   * Get all unused symbols
   */
  getUnusedSymbols(): SymbolNode[] {
    return this.getAllSymbols().filter(s => !s.isUsed)
  }

  /**
   * Add a reference edge by type (simplified API for mutators)
   */
  addReferenceByType(
    fromId: string,
    toId: string,
    type: ReferenceType,
    location?: { file: string; line: number; column: number }
  ): void {
    this.addReference(fromId, toId, {
      type,
      file: location?.file ?? '',
      line: location?.line ?? 0,
      column: location?.column ?? 0,
    })
  }

  /**
   * Find a symbol by name (returns first match)
   */
  findSymbolByName(name: string): SymbolNode | undefined {
    return this.getAllSymbols().find(s => s.name === name)
  }

  /**
   * Find all symbols matching a predicate
   */
  findSymbols(predicate: (s: SymbolNode) => boolean): SymbolNode[] {
    return this.getAllSymbols().filter(predicate)
  }

  /**
   * Get the underlying graphology instance (for algorithms)
   */
  getGraphologyInstance(): AbstractGraph<SymbolNode, ReferenceEdge> {
    return this.graph
  }

  /**
   * Get statistics about the graph
   */
  getStats(): {
    nodeCount: number
    edgeCount: number
    exportedCount: number
    entryPointCount: number
  } {
    const symbols = this.getAllSymbols()
    return {
      nodeCount: this.graph.order,
      edgeCount: this.graph.size,
      exportedCount: symbols.filter(s => s.exported).length,
      entryPointCount: symbols.filter(s => s.isEntryPoint).length,
    }
  }
}
