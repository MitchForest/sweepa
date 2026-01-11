/**
 * UsedDeclarationMarker - Final DFS traversal to mark used symbols
 *
 * This is the last mutator in the pipeline. It traverses from all entry points
 * and marks everything reachable as "used". Symbols not reached are unused.
 */
import type { GraphMutator } from '../types.js';
export declare const UsedDeclarationMarker: GraphMutator;
//# sourceMappingURL=UsedDeclarationMarker.d.ts.map