/*
 * Copyright (c) 2025 Nebulit GmbH
 * Licensed under the MIT License.
 */

var Generator = require('yeoman-generator');
var slugify = require('slugify')

var config = {}

module.exports = class extends Generator {

    constructor(args, opts) {
        super(args, opts);
        this.givenAnswers = opts.answers || {};

        // Register command line options
        this.option('generate-all', {
            type: Boolean,
            description: 'Generate all aggregates without prompting',
            default: false
        });

        this.option('output', {
            type: String,
            description: 'Output directory',
            default: './generated'
        });

        this.option('aggregates', {
            type: String,
            description: 'Comma-separated list of aggregates to generate'
        });

        /**
         * Load the exported config json from the
         * current Working Directory
         */
        config = require(this.env.cwd + "/config.json");
    }

    async prompting() {
        // Check for non-interactive mode
        if (this.options['generate-all']) {
            this.answers = {
                generationType: 'Full Application',
                aggregates: config.aggregates.map(a => a.title),
                outputDir: this.options.output
            };
            return;
        }

        if (this.options.aggregates) {
            this.answers = {
                generationType: 'Full Application',
                aggregates: this.options.aggregates.split(',').map(a => a.trim()),
                outputDir: this.options.output
            };
            return;
        }

        // Check if pre-configured answers were passed
        if (this.givenAnswers && Object.keys(this.givenAnswers).length > 0) {
            this.answers = this.givenAnswers;
            return;
        }

        /**
         * configure prompts.
         */
        this.answers = await this.prompt([
            {
                type: 'list',
                name: 'generationType',
                message: 'What do you want to generate?',
                choices: ['Full Application', 'Events Only', 'Commands Only', 'Read Models Only', 'Specific Aggregate']
            },
            {
                type: 'checkbox',
                name: 'aggregates',
                message: 'Which aggregates should be generated?',
                choices: config.aggregates.map(item => item.title),
                when: (answers) => answers.generationType === 'Specific Aggregate' || answers.generationType === 'Full Application'
            },
            {
                type: 'checkbox',
                name: 'events',
                message: 'Which events should be generated?',
                choices: config.slices.flatMap(item => item.events).map(item => item.title),
                when: (answers) => answers.generationType === 'Events Only'
            },
            {
                type: 'checkbox',
                name: 'commands',
                message: 'Which commands should be generated?',
                choices: config.slices.flatMap(item => item.commands).map(item => item.title),
                when: (answers) => answers.generationType === 'Commands Only'
            },
            {
                type: 'checkbox',
                name: 'readmodels',
                message: 'Which read models should be generated?',
                choices: config.slices.flatMap(item => item.readmodels).map(item => item.title),
                when: (answers) => answers.generationType === 'Read Models Only'
            },
            {
                type: 'input',
                name: 'outputDir',
                message: 'Output directory?',
                default: './generated'
            }
        ]);
    }

    /**
     * Generate application based on selections
     */
    createElements() {
        const outputDir = this.answers.outputDir;

        if (this.answers.generationType === 'Full Application') {
            this._generateFullApplication(outputDir, this.answers.aggregates);
        } else if (this.answers.generationType === 'Events Only') {
            this._generateEvents(outputDir, this.answers.events);
        } else if (this.answers.generationType === 'Commands Only') {
            this._generateCommands(outputDir, this.answers.commands);
        } else if (this.answers.generationType === 'Read Models Only') {
            this._generateReadModels(outputDir, this.answers.readmodels);
        } else if (this.answers.generationType === 'Specific Aggregate') {
            this._generateFullApplication(outputDir, this.answers.aggregates);
        }
    }

    _generateFullApplication(outputDir, selectedAggregates) {
        // Group elements by aggregate
        const aggregateGroups = {};

        selectedAggregates.forEach(aggregateName => {
            aggregateGroups[aggregateName] = {
                events: [],
                commands: [],
                readmodels: []
            };
        });

        // Collect events, commands, and readmodels per aggregate
        config.slices.forEach(slice => {
            slice.events?.forEach(event => {
                if (selectedAggregates.includes(event.aggregate)) {
                    aggregateGroups[event.aggregate].events.push(event);
                }
            });

            slice.commands?.forEach(command => {
                if (selectedAggregates.includes(command.aggregate)) {
                    aggregateGroups[command.aggregate].commands.push(command);
                }
            });

            slice.readmodels?.forEach(readmodel => {
                if (selectedAggregates.includes(readmodel.aggregate)) {
                    aggregateGroups[readmodel.aggregate].readmodels.push(readmodel);
                }
            });
        });

        // Generate files for each aggregate
        Object.keys(aggregateGroups).forEach(aggregateName => {
            const group = aggregateGroups[aggregateName];
            const streamName = slugify(aggregateName, '');
            const aggregateDir = `${outputDir}/${streamName}Stream`;

            // Generate events file
            this._generateAggregateEvents(aggregateDir, streamName, group.events);

            // Generate views file from readmodels
            this._generateAggregateViews(aggregateDir, streamName, group.readmodels, group.events);

            // Generate commands file
            this._generateAggregateCommands(aggregateDir, streamName, group.commands, group.events);

            // Generate stream factory (index.ts)
            this._generateAggregateStream(aggregateDir, streamName, group.events, group.readmodels);

            // Generate messages file
            this._generateAggregateMessages(aggregateDir, streamName, group.events, group.readmodels);
        });
    }

    _generateAggregateEvents(dir, streamName, events) {
        // Deduplicate events by title
        const uniqueEvents = [...new Map(events.map(e => [e.title, e])).values()];

        const eventClasses = uniqueEvents.map(event => {
            const eventName = slugify(event.title, '');
            const constructorParams = this._renderConstructorParams(event.fields);
            return `export class ${eventName} implements IEvDbEventPayload {
    readonly payloadType = '${eventName}';
    constructor(${constructorParams}) { }
}`;
        }).join('\n\n');

        const eventUnion = uniqueEvents.map(e => slugify(e.title, '')).join(' | ');

        const content = `import IEvDbEventPayload from "@eventualize/types/IEvDbEventPayload";

${eventClasses}

export type ${streamName}StreamEvents = ${eventUnion};
`;

        this.fs.write(
            this.destinationPath(`${dir}/events.ts`),
            content
        );
    }

    _generateAggregateViews(dir, streamName, readmodels, events) {
        // Deduplicate readmodels by title
        const uniqueReadmodels = [...new Map(readmodels.map(r => [r.title, r])).values()];
        const uniqueEvents = [...new Map(events.map(e => [e.title, e])).values()];

        const viewClasses = uniqueReadmodels.map(readmodel => {
            const viewName = slugify(readmodel.title, '');
            const viewNameCamel = this._toCamelCase(readmodel.title);
            const constructorParams = this._renderConstructorParamsWithDefaults(readmodel.fields);

            // Generate handlers for each event that affects this view
            const inboundEvents = readmodel.dependencies
                ?.filter(d => d.type === 'INBOUND' && d.elementType === 'EVENT')
                .map(d => d.title) || [];

            const handlers = uniqueEvents
                .filter(e => inboundEvents.includes(e.title))
                .map(event => {
                    const eventName = slugify(event.title, '');
                    return `    ${eventName}: (oldState: ${viewName}State, event: ${eventName}) => {
        // TODO: Implement projection logic
        return new ${viewName}State(${this._getDefaultStateArgs(readmodel.fields)});
    }`;
                }).join(',\n');

            return `export class ${viewName}State {
    constructor(${constructorParams}) { }
}

export const ${viewNameCamel}Handlers = {
${handlers}
};`;
        }).join('\n\n');

        // Import events
        const eventImports = uniqueEvents.map(e => slugify(e.title, '')).join(', ');

        const content = `import { ${eventImports} } from "./events.js";

${viewClasses}
`;

        this.fs.write(
            this.destinationPath(`${dir}/views.ts`),
            content
        );
    }

    _generateAggregateCommands(dir, streamName, commands, events) {
        // Deduplicate commands by title
        const uniqueCommands = [...new Map(commands.map(c => [c.title, c])).values()];
        const uniqueEvents = [...new Map(events.map(e => [e.title, e])).values()];

        const commandHandlers = uniqueCommands.map(command => {
            const commandName = slugify(command.title, '');
            const fields = this._renderInterfaceFields(command.fields);

            // Get events this command produces
            const outboundEvents = command.dependencies
                ?.filter(d => d.type === 'OUTBOUND' && d.elementType === 'EVENT')
                .map(d => d.title) || [];

            const eventEmissions = outboundEvents.map(eventTitle => {
                const eventName = slugify(eventTitle, '');
                return `    // await stream.appendEvent${eventName}(new ${eventName}(...));`;
            }).join('\n');

            return `export interface ${commandName}Command {
${fields}
}

export const handle${commandName} = async (
    command: ${commandName}Command,
    stream: ${streamName}StreamType
): Promise<void> => {
    // TODO: Implement command handler logic
${eventEmissions}
};`;
        }).join('\n\n');

        // Import events
        const eventImports = uniqueEvents.map(e => slugify(e.title, '')).join(', ');

        const content = `import { ${eventImports} } from "./events.js";
import { ${streamName}StreamType } from "./index.js";

${commandHandlers}
`;

        this.fs.write(
            this.destinationPath(`${dir}/commands.ts`),
            content
        );
    }

    _generateAggregateStream(dir, streamName, events, readmodels) {
        // Deduplicate events and readmodels
        const uniqueEvents = [...new Map(events.map(e => [e.title, e])).values()];
        const uniqueReadmodels = [...new Map(readmodels.map(r => [r.title, r])).values()];

        const eventImports = uniqueEvents.map(e => slugify(e.title, '')).join(', ');

        const viewImports = uniqueReadmodels.map(r => {
            const viewName = slugify(r.title, '');
            const viewNameCamel = this._toCamelCase(r.title);
            return `${viewName}State, ${viewNameCamel}Handlers`;
        }).join(', ');

        const eventRegistrations = uniqueEvents.map(e => {
            const eventName = slugify(e.title, '');
            return `    .withEventType(${eventName})`;
        }).join('\n');

        const viewRegistrations = uniqueReadmodels.map(r => {
            const viewName = slugify(r.title, '');
            const viewNameCamel = this._toCamelCase(r.title);
            return `    .withView('${viewName}', ${viewName}State, ${viewNameCamel}Handlers)`;
        }).join('\n');

        const content = `import { StreamFactoryBuilder, StreamWithEventMethods } from '@eventualize/core/EvDbStreamFactory';
import { ${eventImports} } from './events.js';
import { ${viewImports} } from './views.js';

const ${streamName}StreamFactory = new StreamFactoryBuilder('${streamName}Stream')
${eventRegistrations}
${viewRegistrations}
    .build();

export default ${streamName}StreamFactory;

export type ${streamName}StreamType = typeof ${streamName}StreamFactory.StreamType;
`;

        this.fs.write(
            this.destinationPath(`${dir}/index.ts`),
            content
        );
    }

    _generateAggregateMessages(dir, streamName, events, readmodels) {
        // Deduplicate events and readmodels
        const uniqueEvents = [...new Map(events.map(e => [e.title, e])).values()];
        const uniqueReadmodels = [...new Map(readmodels.map(r => [r.title, r])).values()];

        const eventImports = uniqueEvents.map(e => slugify(e.title, '')).join(', ');

        const viewStateImports = uniqueReadmodels.map(r => {
            const viewName = slugify(r.title, '');
            return `${viewName}State`;
        }).join(', ');

        const messageProducers = uniqueEvents.map(event => {
            const eventName = slugify(event.title, '');
            const eventNameCamel = this._toCamelCase(event.title);
            return `export const ${eventNameCamel}Messages = (event: EvDbEvent, viewStates: Readonly<Record<string, unknown>>) => [
    // TODO: Define messages to produce for this event
    // EvDbMessage.createFromEvent(event, { payloadType: '...', ...data })
];`;
        }).join('\n\n');

        const content = `import EvDbEvent from "@eventualize/types/EvDbEvent";
import EvDbMessage from "@eventualize/types/EvDbMessage";
import { ${eventImports} } from "./events.js";
import { ${viewStateImports} } from "./views.js";

${messageProducers}
`;

        this.fs.write(
            this.destinationPath(`${dir}/messages.ts`),
            content
        );
    }

    _generateEvents(outputDir, selectedEvents) {
        selectedEvents?.forEach((eventTitle) => {
            var event = config.slices.flatMap(it => it.events).find(it => it.title === eventTitle)
            if (event) {
                let eventName = slugify(event.title, "")
                const constructorParams = this._renderConstructorParams(event.fields);

                this.fs.copyTpl(
                    this.templatePath(`src/components/event.tpl`),
                    this.destinationPath(`${outputDir}/events/${eventName}.ts`),
                    {
                        _eventName: eventName,
                        _constructorParams: constructorParams
                    }
                )
            }
        })
    }

    _generateCommands(outputDir, selectedCommands) {
        selectedCommands?.forEach((commandTitle) => {
            var command = config.slices.flatMap(it => it.commands).find(it => it.title === commandTitle)
            if (command) {
                let commandName = slugify(command.title, "")
                const fields = this._renderInterfaceFields(command.fields);
                const streamType = slugify(command.aggregate, '');

                // Get events this command produces
                const outboundEvents = command.dependencies
                    ?.filter(d => d.type === 'OUTBOUND' && d.elementType === 'EVENT')
                    .map(d => slugify(d.title, '')) || [];

                const eventEmissions = outboundEvents.map(eventName => {
                    return `    // await stream.appendEvent${eventName}(new ${eventName}(...));`;
                }).join('\n');

                this.fs.copyTpl(
                    this.templatePath(`src/components/command.tpl`),
                    this.destinationPath(`${outputDir}/commands/${commandName}.ts`),
                    {
                        _commandName: commandName,
                        _fields: fields,
                        _streamType: streamType,
                        _eventEmissions: eventEmissions
                    }
                )
            }
        })
    }

    _generateReadModels(outputDir, selectedReadModels) {
        selectedReadModels?.forEach((readmodelTitle) => {
            var readmodel = config.slices.flatMap(it => it.readmodels).find(it => it.title === readmodelTitle)
            if (readmodel) {
                let viewName = slugify(readmodel.title, "")
                let viewNameCamel = this._toCamelCase(readmodel.title);
                const constructorParams = this._renderConstructorParamsWithDefaults(readmodel.fields);

                // Get events this view depends on
                const inboundEvents = readmodel.dependencies
                    ?.filter(d => d.type === 'INBOUND' && d.elementType === 'EVENT')
                    .map(d => d.title) || [];

                const handlers = inboundEvents.map(eventTitle => {
                    const eventName = slugify(eventTitle, '');
                    return `    ${eventName}: (oldState: ${viewName}State, event: ${eventName}) => {
        // TODO: Implement projection logic
        return new ${viewName}State(${this._getDefaultStateArgs(readmodel.fields)});
    }`;
                }).join(',\n');

                this.fs.copyTpl(
                    this.templatePath(`src/components/view.tpl`),
                    this.destinationPath(`${outputDir}/views/${viewName}.ts`),
                    {
                        _viewName: viewName,
                        _viewNameCamel: viewNameCamel,
                        _constructorParams: constructorParams,
                        _handlers: handlers
                    }
                )
            }
        })
    }

    // Helper methods
    _renderConstructorParams(fields) {
        if (!fields || fields.length === 0) return '';
        return fields.map(field => {
            return `public readonly ${field.name}: ${typeMapping(field.type, field.cardinality)}`;
        }).join(', ');
    }

    _renderConstructorParamsWithDefaults(fields) {
        if (!fields || fields.length === 0) return '';
        return fields.map(field => {
            const type = typeMapping(field.type, field.cardinality);
            const defaultValue = this._getDefaultValue(type);
            return `public ${field.name}: ${type} = ${defaultValue}`;
        }).join(', ');
    }

    _renderInterfaceFields(fields) {
        if (!fields || fields.length === 0) return '';
        return fields.map(field => {
            return `    ${field.name}: ${typeMapping(field.type, field.cardinality)};`;
        }).join('\n');
    }

    _getDefaultValue(type) {
        if (type.endsWith('[]')) return '[]';
        switch (type) {
            case 'string': return "''";
            case 'number': return '0';
            case 'boolean': return 'false';
            case 'date': return 'new Date()';
            default: return "''";
        }
    }

    _getDefaultStateArgs(fields) {
        if (!fields || fields.length === 0) return '';
        return fields.map(field => {
            const type = typeMapping(field.type, field.cardinality);
            if (type.endsWith('[]')) return '[]';
            switch (type) {
                case 'string': return "''";
                case 'number': return '0';
                case 'boolean': return 'false';
                case 'date': return 'new Date()';
                default: return "''";
            }
        }).join(', ');
    }

    _toCamelCase(str) {
        return slugify(str, '').replace(/^./, c => c.toLowerCase());
    }
}

const typeMapping = (fieldType, fieldCardinality) => {
    var mappedType;
    switch (fieldType?.toLowerCase()) {
        case "string":
            mappedType = "string";
            break
        case "double":
            mappedType = "number";
            break
        case "long":
            mappedType = "number";
            break
        case "int":
            mappedType = "number";
            break
        case "boolean":
            mappedType = "boolean";
            break
        case "date":
            mappedType = "Date";
            break
        case "uuid":
            mappedType = "string";
            break
        case "custom":
            mappedType = "any";
            break
        default:
            mappedType = "string";
            break
    }
    if (fieldCardinality?.toLowerCase() === "list") {
        return `${mappedType}[]`
    } else {
        return mappedType
    }
}
