/**
 * JSXReferenceBuilder - Adds reference edges for React components in JSX
 *
 * When we see <UserCard />, we need to add an edge from the containing
 * component to the UserCard component. The TypeScript compiler already
 * resolves these, but we need to trace them for dead code analysis.
 */
import type { GraphMutator } from '../types.js';
export declare const JSXReferenceBuilder: GraphMutator;
//# sourceMappingURL=JSXReferenceBuilder.d.ts.map