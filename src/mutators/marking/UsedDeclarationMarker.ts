/**
 * UsedDeclarationMarker - Final DFS traversal to mark used symbols
 *
 * This is the last mutator in the pipeline. It traverses from all entry points
 * and marks everything reachable as "used". Symbols not reached are unused.
 */

import type { GraphMutator, MutatorContext } from '../types.js'

export const UsedDeclarationMarker: GraphMutator = {
  name: 'UsedDeclarationMarker',
  priority: 100,
  phase: 'marking',

  mutate(ctx: MutatorContext): void {
    const { graph } = ctx
    const visited = new Set<string>()

    // DFS from a starting node
    function traverse(nodeId: string): void {
      if (visited.has(nodeId)) return
      visited.add(nodeId)

      // Mark as used
      graph.markAsUsed(nodeId)

      // Follow outgoing references
      for (const referenced of graph.getReferencedSymbols(nodeId)) {
        traverse(referenced.id)
      }

      // Also mark parent as used (e.g., if method is used, class is used)
      const symbol = graph.getSymbol(nodeId)
      if (symbol?.parent) {
        traverse(symbol.parent)
      }
    }

    // Start from all entry points
    const entryPoints = graph.getEntryPoints()
    for (const entry of entryPoints) {
      traverse(entry.id)
    }

    // Also mark all retained symbols as used
    for (const retained of graph.getRetainedSymbols()) {
      if (!visited.has(retained.id)) {
        traverse(retained.id)
      }
    }

    // Count results
    const allSymbols = graph.getAllSymbols()
    const usedCount = allSymbols.filter(s => s.isUsed).length
    const unusedCount = allSymbols.length - usedCount

    ctx.log(`Traversal complete: ${usedCount} used, ${unusedCount} unused`)
  },
}
