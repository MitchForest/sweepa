import { Project } from 'ts-morph';
import path from 'node:path';
import { detectFrameworks, } from '../frameworks/index.js';
import { computeReachableFiles } from './reachability.js';
import { loadSweepaConfig, resolveSweepaConfigForProject, applyConfigIgnores, } from '../config/index.js';
import { parseProjectIgnores } from '../config/CommentParser.js';
export function createAnalysisContext(options) {
    const tsConfigPath = path.resolve(options.tsConfigPath);
    const projectRoot = path.dirname(tsConfigPath);
    const loaded = loadSweepaConfig(projectRoot);
    const configStrict = options.configStrict ?? true;
    if (configStrict && loaded.configPath && loaded.errors.length > 0) {
        throw new Error([
            `Invalid Sweepa config at ${loaded.configPath}:`,
            ...loaded.errors.map((e) => `- ${e}`),
        ].join('\n'));
    }
    const resolved = resolveSweepaConfigForProject({ loaded, projectRoot });
    const { frameworks, entryPointConfig } = detectFrameworks(projectRoot);
    const project = new Project({
        tsConfigFilePath: tsConfigPath,
        skipAddingFilesFromTsConfig: false,
    });
    const ignoresByFile = parseProjectIgnores(project.getSourceFiles());
    return {
        tsConfigPath,
        projectRoot,
        project,
        frameworks,
        entryPointConfig,
        configRoot: resolved.configRoot,
        config: resolved.config,
        ignoresByFile,
    };
}
export function computeReachabilityForContext(ctx, options) {
    return computeReachableFiles({
        project: ctx.project,
        tsConfigPath: ctx.tsConfigPath,
        projectRoot: ctx.projectRoot,
        entryPointConfig: ctx.entryPointConfig,
        ignoreGenerated: options.ignoreGenerated,
    });
}
export function applyAllIgnores(ctx, issues) {
    return applyConfigIgnores(issues, ctx.config, ctx.configRoot);
}
//# sourceMappingURL=context.js.map