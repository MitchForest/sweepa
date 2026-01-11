/**
 * Mutator Pipeline Exports
 */

export type {
  GraphMutator,
  MutatorContext,
  MutatorConfig,
  MutatorPhase,
} from './types.js'

export { MutatorRunner } from './MutatorRunner.js'

// Entry Point Mutators
export { EntryPointRetainer } from './entry-points/EntryPointRetainer.js'

// Reference Builder Mutators
export { JSXReferenceBuilder } from './references/JSXReferenceBuilder.js'

// Retention Mutators
export { DecoratorRetainer } from './retention/DecoratorRetainer.js'

// Marking Mutators
export { UsedDeclarationMarker } from './marking/UsedDeclarationMarker.js'

// Re-export for convenience
import { EntryPointRetainer } from './entry-points/EntryPointRetainer.js'
import { JSXReferenceBuilder } from './references/JSXReferenceBuilder.js'
import { DecoratorRetainer } from './retention/DecoratorRetainer.js'
import { UsedDeclarationMarker } from './marking/UsedDeclarationMarker.js'
import type { GraphMutator } from './types.js'

/**
 * Get all core mutators in the correct order
 */
export function getCoreMutators(): GraphMutator[] {
  return [
    EntryPointRetainer,
    JSXReferenceBuilder,
    DecoratorRetainer,
    UsedDeclarationMarker,
  ]
}
