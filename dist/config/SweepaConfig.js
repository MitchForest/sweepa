import path from 'node:path';
import { cosmiconfigSync } from 'cosmiconfig';
export function resolveSweepaConfigForProject(options) {
    const configRoot = path.resolve(options.loaded.configRoot);
    const projectRoot = path.resolve(options.projectRoot);
    const relativeProjectRoot = path.relative(configRoot, projectRoot).replace(/\\/g, '/');
    const base = normalizeConfig(options.loaded.config);
    const workspaces = options.loaded.config.workspaces ?? {};
    const matchingKeys = Object.keys(workspaces)
        .map((k) => k.replace(/\\/g, '/').replace(/\/+$/, ''))
        .filter((k) => {
        if (!k)
            return false;
        return relativeProjectRoot === k || relativeProjectRoot.startsWith(k + '/');
    })
        .sort((a, b) => a.length - b.length);
    if (matchingKeys.length === 0)
        return { configRoot, config: base };
    let merged = base;
    for (const key of matchingKeys) {
        merged = mergeConfigs(merged, normalizeConfig(workspaces[key] ?? {}));
    }
    return { configRoot, config: merged };
}
export function loadSweepaConfig(projectRoot) {
    const root = path.resolve(projectRoot);
    const explorer = cosmiconfigSync('sweepa', {
        searchPlaces: [
            'package.json',
            '.sweepa.json',
            '.sweepa.yaml',
            '.sweepa.yml',
            'sweepa.config.json',
            'sweepa.config.yaml',
            'sweepa.config.yml',
        ],
    });
    try {
        const result = explorer.search(root) ?? manualSearchUpwards(explorer, root);
        const cfg = (result?.config ?? {});
        const normalized = normalizeConfig(cfg);
        const errors = validateConfig(normalized);
        return {
            config: normalized,
            configRoot: result?.filepath ? path.dirname(result.filepath) : root,
            configPath: result?.filepath,
            errors,
        };
    }
    catch {
        return { config: {}, configRoot: root, errors: [] };
    }
}
export function applyConfigIgnores(issues, config, configRoot) {
    const ignoreDependencies = new Set(config.ignoreDependencies ?? []);
    const ignoreIssues = config.ignoreIssues ?? {};
    const ignoreUnresolved = config.ignoreUnresolved ?? [];
    return issues.filter((issue) => {
        if ((issue.kind === 'unused-dependency' || issue.kind === 'unlisted-dependency') &&
            ignoreDependencies.has(issue.name)) {
            return false;
        }
        if (issue.kind === 'unresolved-import') {
            for (const pattern of ignoreUnresolved) {
                if (matchesGlob(issue.name, pattern))
                    return false;
            }
        }
        const relativePath = path.relative(configRoot, issue.file).replace(/\\/g, '/');
        for (const [pattern, kinds] of Object.entries(ignoreIssues)) {
            if (kinds.includes(issue.kind) && matchesGlob(relativePath, pattern)) {
                return false;
            }
        }
        return true;
    });
}
function normalizeConfig(cfg) {
    return {
        ignoreIssues: cfg.ignoreIssues ?? {},
        ignoreDependencies: cfg.ignoreDependencies ?? [],
        ignoreUnresolved: cfg.ignoreUnresolved ?? [],
        workspaces: cfg.workspaces ?? {},
    };
}
function mergeConfigs(base, override) {
    return {
        ignoreDependencies: Array.from(new Set([...(base.ignoreDependencies ?? []), ...(override.ignoreDependencies ?? [])])),
        ignoreUnresolved: Array.from(new Set([...(base.ignoreUnresolved ?? []), ...(override.ignoreUnresolved ?? [])])),
        ignoreIssues: { ...(base.ignoreIssues ?? {}), ...(override.ignoreIssues ?? {}) },
        workspaces: base.workspaces ?? {},
    };
}
function manualSearchUpwards(explorer, startDir) {
    let current = path.resolve(startDir);
    while (true) {
        for (const candidate of [
            path.join(current, '.sweepa.json'),
            path.join(current, '.sweepa.yaml'),
            path.join(current, '.sweepa.yml'),
            path.join(current, 'sweepa.config.json'),
            path.join(current, 'sweepa.config.yaml'),
            path.join(current, 'sweepa.config.yml'),
            path.join(current, 'package.json'),
        ]) {
            try {
                const loaded = explorer.load(candidate);
                if (loaded && loaded.config) {
                    if (path.basename(candidate) === 'package.json') {
                        if (loaded.config && typeof loaded.config === 'object' && 'sweepa' in loaded.config) {
                            return { config: loaded.config.sweepa, filepath: candidate, isEmpty: false };
                        }
                        continue;
                    }
                    return loaded;
                }
            }
            catch {
                // ignore
            }
        }
        const parent = path.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return null;
}
/**
 * Simple glob matching (supports `**` and `*`), anchored to full path.
 */
function matchesGlob(filePath, pattern) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');
    let regexPattern = '';
    let i = 0;
    while (i < normalizedPattern.length) {
        const char = normalizedPattern[i];
        const nextChar = normalizedPattern[i + 1];
        if (char === '*' && nextChar === '*') {
            if (normalizedPattern[i + 2] === '/') {
                regexPattern += '(?:[^/]+/)*';
                i += 3;
            }
            else {
                regexPattern += '.*';
                i += 2;
            }
        }
        else if (char === '*') {
            regexPattern += '[^/]*';
            i++;
        }
        else if ('.+^${}()|[]\\'.includes(char)) {
            regexPattern += '\\' + char;
            i++;
        }
        else {
            regexPattern += char;
            i++;
        }
    }
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedPath);
}
// Exported for unit testing; not considered part of the stable public API yet.
export const __private__matchesGlob = matchesGlob;
function validateConfig(cfg) {
    const errors = [];
    if (cfg.ignoreDependencies && !Array.isArray(cfg.ignoreDependencies)) {
        errors.push('ignoreDependencies must be an array of strings');
    }
    else if (cfg.ignoreDependencies) {
        for (const [i, v] of cfg.ignoreDependencies.entries()) {
            if (typeof v !== 'string')
                errors.push(`ignoreDependencies[${i}] must be a string`);
        }
    }
    if (cfg.ignoreIssues && typeof cfg.ignoreIssues !== 'object') {
        errors.push('ignoreIssues must be an object of pattern -> issueKinds[]');
    }
    else if (cfg.ignoreIssues) {
        for (const [pattern, kinds] of Object.entries(cfg.ignoreIssues)) {
            if (!Array.isArray(kinds)) {
                errors.push(`ignoreIssues['${pattern}'] must be an array of issue kinds`);
                continue;
            }
            for (const [i, k] of kinds.entries()) {
                if (typeof k !== 'string')
                    errors.push(`ignoreIssues['${pattern}'][${i}] must be a string issue kind`);
            }
        }
    }
    if (cfg.ignoreUnresolved && !Array.isArray(cfg.ignoreUnresolved)) {
        errors.push('ignoreUnresolved must be an array of strings');
    }
    else if (cfg.ignoreUnresolved) {
        for (const [i, v] of cfg.ignoreUnresolved.entries()) {
            if (typeof v !== 'string')
                errors.push(`ignoreUnresolved[${i}] must be a string`);
        }
    }
    if (cfg.workspaces && typeof cfg.workspaces !== 'object') {
        errors.push('workspaces must be an object of workspacePath -> SweepaConfig');
    }
    else if (cfg.workspaces) {
        for (const [wk, wc] of Object.entries(cfg.workspaces)) {
            if (!wk)
                errors.push('workspaces keys must be non-empty strings');
            errors.push(...validateConfig(wc ?? {}).map((e) => `workspaces['${wk}'].${e}`));
        }
    }
    return errors;
}
//# sourceMappingURL=SweepaConfig.js.map