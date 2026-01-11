/**
 * DecoratorRetainer - Retains code with framework decorators
 *
 * Many frameworks use decorators to mark classes/methods for DI, routing, etc.
 * These should not be marked as unused even if not directly called.
 */
import { Node } from 'ts-morph';
// Known framework decorators and their packages
const FRAMEWORK_DECORATORS = {
    // NestJS
    '@nestjs/common': [
        'Injectable',
        'Controller',
        'Module',
        'Get',
        'Post',
        'Put',
        'Patch',
        'Delete',
        'All',
        'Options',
        'Head',
        'Inject',
        'Optional',
        'UseGuards',
        'UseInterceptors',
        'UsePipes',
        'UseFilters',
    ],
    '@nestjs/core': ['Reflector'],
    '@nestjs/microservices': ['MessagePattern', 'EventPattern', 'Transport'],
    '@nestjs/websockets': ['WebSocketGateway', 'SubscribeMessage'],
    '@nestjs/graphql': ['Resolver', 'Query', 'Mutation', 'Subscription', 'Field', 'ObjectType', 'InputType'],
    // TypeORM
    typeorm: [
        'Entity',
        'Column',
        'PrimaryColumn',
        'PrimaryGeneratedColumn',
        'ManyToOne',
        'OneToMany',
        'OneToOne',
        'ManyToMany',
        'JoinColumn',
        'JoinTable',
        'Index',
        'Unique',
        'BeforeInsert',
        'AfterInsert',
        'BeforeUpdate',
        'AfterUpdate',
        'BeforeRemove',
        'AfterRemove',
    ],
    // class-validator
    'class-validator': [
        'IsString',
        'IsNumber',
        'IsBoolean',
        'IsEmail',
        'IsDate',
        'IsArray',
        'IsOptional',
        'ValidateNested',
        'IsNotEmpty',
        'Min',
        'Max',
        'Length',
    ],
    // class-transformer
    'class-transformer': ['Expose', 'Exclude', 'Transform', 'Type', 'plainToClass', 'classToPlain'],
    // MobX
    mobx: ['observable', 'action', 'computed', 'observer', 'makeObservable', 'makeAutoObservable'],
    // Angular
    '@angular/core': [
        'Component',
        'Directive',
        'Injectable',
        'Pipe',
        'NgModule',
        'Input',
        'Output',
        'HostListener',
        'HostBinding',
        'ViewChild',
        'ViewChildren',
        'ContentChild',
        'ContentChildren',
    ],
};
// Flatten to a set of all known decorator names
const ALL_FRAMEWORK_DECORATORS = new Set(Object.values(FRAMEWORK_DECORATORS).flat());
export const DecoratorRetainer = {
    name: 'DecoratorRetainer',
    priority: 30,
    phase: 'retention',
    mutate(ctx) {
        const { graph, project, config } = ctx;
        // Get additional decorators from config
        const customDecorators = new Set(config.retainDecorators ?? []);
        const retainAllDecorated = config.retainDecorated === true;
        let retained = 0;
        for (const sourceFile of project.getSourceFiles()) {
            // IMPORTANT: Sweepa's graph IDs use absolute file paths (CallGraphBuilder).
            const filePath = sourceFile.getFilePath();
            // Process classes
            for (const cls of sourceFile.getClasses()) {
                const className = cls.getName();
                if (!className)
                    continue;
                // Check class decorators
                for (const decorator of cls.getDecorators()) {
                    const name = getDecoratorName(decorator);
                    if (retainAllDecorated || shouldRetain(name, customDecorators)) {
                        const symbolId = `${filePath}:${className}`;
                        ctx.markAsRetained(symbolId, `@${name} decorator`);
                        retained++;
                    }
                }
                // Check method decorators
                for (const method of cls.getMethods()) {
                    for (const decorator of method.getDecorators()) {
                        const name = getDecoratorName(decorator);
                        if (retainAllDecorated || shouldRetain(name, customDecorators)) {
                            const symbolId = `${filePath}:${className}.${method.getName()}`;
                            ctx.markAsRetained(symbolId, `@${name} decorator`);
                            retained++;
                        }
                    }
                }
                // Check property decorators
                for (const prop of cls.getProperties()) {
                    for (const decorator of prop.getDecorators()) {
                        const name = getDecoratorName(decorator);
                        if (retainAllDecorated || shouldRetain(name, customDecorators)) {
                            const symbolId = `${filePath}:${className}.${prop.getName()}`;
                            ctx.markAsRetained(symbolId, `@${name} decorator`);
                            retained++;
                        }
                    }
                }
            }
        }
        ctx.log(`Retained ${retained} decorated symbols`);
    },
};
function getDecoratorName(decorator) {
    if (!Node.isDecorator(decorator))
        return '';
    const expr = decorator.getExpression();
    // Simple decorator: @Injectable
    if (Node.isIdentifier(expr)) {
        return expr.getText();
    }
    // Call expression: @Injectable()
    if (Node.isCallExpression(expr)) {
        const callee = expr.getExpression();
        if (Node.isIdentifier(callee)) {
            return callee.getText();
        }
    }
    return '';
}
function shouldRetain(decoratorName, customDecorators) {
    return ALL_FRAMEWORK_DECORATORS.has(decoratorName) || customDecorators.has(decoratorName);
}
//# sourceMappingURL=DecoratorRetainer.js.map