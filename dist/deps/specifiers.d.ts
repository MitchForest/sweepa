export declare function isNodeBuiltin(specifier: string): boolean;
export declare function isRelativeOrAbsolute(specifier: string): boolean;
/**
 * Convert an import specifier like:
 * - "react" -> "react"
 * - "@scope/pkg" -> "@scope/pkg"
 * - "@scope/pkg/subpath" -> "@scope/pkg"
 * - "lodash/get" -> "lodash"
 */
export declare function getPackageNameFromSpecifier(specifier: string): string;
//# sourceMappingURL=specifiers.d.ts.map