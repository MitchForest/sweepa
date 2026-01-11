import path from 'node:path';
import { createTsModuleResolver } from '../resolution/index.js';
import { isEntryPointFile, shouldIgnoreFile as shouldIgnoreFrameworkFile } from '../frameworks/index.js';
const DEFAULT_IGNORE_PATH_PARTS = [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/.git/',
];
const DEFAULT_IGNORE_ALWAYS = [
    /\.d\.ts$/,
];
const DEFAULT_IGNORE_GENERATED = [
    /\/generated\//,
    /\.gen\.(ts|tsx|js|jsx)$/,
    /\.generated\.(ts|tsx|js|jsx)$/,
];
const DEFAULT_ROOT_ENTRY_RELATIVE_REGEXES = [
    /^(src\/)?index\.(ts|tsx|js|jsx)$/,
    /^(src\/)?main\.(ts|tsx|js|jsx)$/,
    /^(src\/)?app\.(ts|tsx|js|jsx)$/,
    /^(src\/)?server\.(ts|tsx|js|jsx)$/,
    /^(src\/)?worker\.(ts|tsx|js|jsx)$/,
];
const DEFAULT_CONFIG_ENTRY_BASENAMES = new Set([
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mjs',
    'vite.config.cjs',
    'eslint.config.ts',
    'eslint.config.js',
    'prettier.config.ts',
    'prettier.config.js',
    'tailwind.config.ts',
    'tailwind.config.js',
    'postcss.config.ts',
    'postcss.config.js',
    'drizzle.config.ts',
    'drizzle.config.js',
]);
export function computeReachableFiles(options) {
    const projectRoot = path.resolve(options.projectRoot);
    const resolver = createTsModuleResolver({ tsConfigPath: options.tsConfigPath });
    const sourceFiles = options.project.getSourceFiles();
    const fileByPath = new Map();
    for (const sf of sourceFiles) {
        const abs = path.resolve(sf.getFilePath());
        if (shouldIgnoreFile(abs, options.ignoreGenerated ?? true))
            continue;
        if (shouldIgnoreFrameworkFile(abs, projectRoot, options.entryPointConfig))
            continue;
        fileByPath.set(abs, sf);
    }
    const entryFiles = new Set();
    for (const filePath of fileByPath.keys()) {
        const relative = path.relative(projectRoot, filePath).replace(/\\/g, '/');
        const basename = path.basename(filePath);
        if (DEFAULT_CONFIG_ENTRY_BASENAMES.has(basename)) {
            entryFiles.add(filePath);
            continue;
        }
        if (isEntryPointFile(filePath, projectRoot, options.entryPointConfig)) {
            entryFiles.add(filePath);
            continue;
        }
        if (DEFAULT_ROOT_ENTRY_RELATIVE_REGEXES.some((r) => r.test(relative))) {
            entryFiles.add(filePath);
            continue;
        }
    }
    const reachableFiles = new Set();
    function visit(filePath) {
        const abs = path.resolve(filePath);
        if (reachableFiles.has(abs))
            return;
        if (!fileByPath.has(abs))
            return;
        reachableFiles.add(abs);
        const sf = fileByPath.get(abs);
        if (!sf)
            return;
        const specifiers = getModuleSpecifiers(sf);
        for (const specifier of specifiers) {
            const resolved = resolver.resolveModule(specifier, abs);
            if (!resolved)
                continue;
            if (shouldIgnoreFile(resolved, options.ignoreGenerated ?? true))
                continue;
            visit(resolved);
        }
    }
    for (const entry of entryFiles)
        visit(entry);
    return { reachableFiles, entryFiles, fileByPath };
}
function shouldIgnoreFile(filePathAbs, ignoreGenerated) {
    const normalized = filePathAbs.replace(/\\/g, '/');
    if (DEFAULT_IGNORE_PATH_PARTS.some((p) => normalized.includes(p)))
        return true;
    if (DEFAULT_IGNORE_ALWAYS.some((r) => r.test(normalized)))
        return true;
    if (ignoreGenerated && DEFAULT_IGNORE_GENERATED.some((r) => r.test(normalized)))
        return true;
    return false;
}
function getModuleSpecifiers(sourceFile) {
    const out = [];
    for (const imp of sourceFile.getImportDeclarations()) {
        out.push(imp.getModuleSpecifierValue());
    }
    for (const exp of sourceFile.getExportDeclarations()) {
        const spec = exp.getModuleSpecifierValue();
        if (spec)
            out.push(spec);
    }
    return out;
}
//# sourceMappingURL=reachability.js.map