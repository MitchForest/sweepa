/**
 * Mutator Pipeline Exports
 */
export type { GraphMutator, MutatorContext, MutatorConfig, MutatorPhase, } from './types.js';
export { MutatorRunner } from './MutatorRunner.js';
export { EntryPointRetainer } from './entry-points/EntryPointRetainer.js';
export { JSXReferenceBuilder } from './references/JSXReferenceBuilder.js';
export { DecoratorRetainer } from './retention/DecoratorRetainer.js';
export { UsedDeclarationMarker } from './marking/UsedDeclarationMarker.js';
import type { GraphMutator } from './types.js';
/**
 * Get all core mutators in the correct order
 */
export declare function getCoreMutators(): GraphMutator[];
//# sourceMappingURL=index.d.ts.map