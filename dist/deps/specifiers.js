import { builtinModules } from 'node:module';
const BUILTINS = new Set([
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
]);
export function isNodeBuiltin(specifier) {
    return BUILTINS.has(specifier);
}
export function isRelativeOrAbsolute(specifier) {
    return (specifier.startsWith('./') ||
        specifier.startsWith('../') ||
        specifier.startsWith('/') ||
        specifier.startsWith('file:'));
}
/**
 * Convert an import specifier like:
 * - "react" -> "react"
 * - "@scope/pkg" -> "@scope/pkg"
 * - "@scope/pkg/subpath" -> "@scope/pkg"
 * - "lodash/get" -> "lodash"
 */
export function getPackageNameFromSpecifier(specifier) {
    if (specifier.startsWith('@')) {
        const [scope, name] = specifier.split('/');
        return name ? `${scope}/${name}` : specifier;
    }
    const [name] = specifier.split('/');
    return name ?? specifier;
}
//# sourceMappingURL=specifiers.js.map