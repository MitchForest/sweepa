import ts from 'typescript';
import path from 'node:path';
export function createTsModuleResolver(options) {
    const tsConfigPath = path.resolve(options.tsConfigPath);
    const tsConfigDir = path.dirname(tsConfigPath);
    const parsed = readTsConfig(tsConfigPath);
    const compilerOptions = parsed.options;
    const host = {
        ...ts.sys,
        getCurrentDirectory: () => tsConfigDir,
        realpath: ts.sys.realpath
            ? (p) => ts.sys.realpath(p)
            : (p) => p,
    };
    const moduleResolutionCache = ts.createModuleResolutionCache(tsConfigDir, (s) => s, compilerOptions);
    return {
        resolveModule(specifier, containingFileAbsPath) {
            const containing = path.resolve(containingFileAbsPath);
            const result = ts.resolveModuleName(specifier, containing, compilerOptions, host, moduleResolutionCache);
            const resolved = result.resolvedModule?.resolvedFileName;
            if (!resolved)
                return undefined;
            // Typescript can resolve to .d.ts; for file reachability we usually want source files.
            // Keep .d.ts resolution only if it is the only option (caller can decide to filter).
            return path.resolve(resolved);
        },
    };
}
function readTsConfig(tsConfigPath) {
    const readResult = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
    if (readResult.error) {
        const msg = ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n');
        throw new Error(`Failed to read tsconfig at ${tsConfigPath}: ${msg}`);
    }
    const config = ts.parseJsonConfigFileContent(readResult.config, ts.sys, path.dirname(tsConfigPath), undefined, tsConfigPath);
    if (config.errors.length > 0) {
        const msg = config.errors
            .map((e) => ts.flattenDiagnosticMessageText(e.messageText, '\n'))
            .join('\n');
        throw new Error(`Failed to parse tsconfig at ${tsConfigPath}:\n${msg}`);
    }
    return config;
}
//# sourceMappingURL=TsModuleResolver.js.map