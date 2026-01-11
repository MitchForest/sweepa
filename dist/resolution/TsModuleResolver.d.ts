export interface TsModuleResolver {
    /**
     * Resolve a module specifier from within a containing file.
     *
     * Returns an absolute path to the resolved module file (if it resolves to a file),
     * or undefined if it cannot be resolved.
     */
    resolveModule(specifier: string, containingFileAbsPath: string): string | undefined;
}
export declare function createTsModuleResolver(options: {
    tsConfigPath: string;
}): TsModuleResolver;
//# sourceMappingURL=TsModuleResolver.d.ts.map