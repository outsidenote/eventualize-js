#!/usr/bin/env node
/*
 * Copyright (c) 2025 Nebulit GmbH
 * Licensed under the MIT License.
 *
 * Standalone CLI for generating Eventualize applications from config.json
 *
 * Usage:
 *   node cli.js                    # Interactive mode
 *   node cli.js --generate-all     # Generate all aggregates
 *   node cli.js --aggregates=Cart,Inventory  # Generate specific aggregates
 *   node cli.js --output=./src/eventstore    # Custom output directory
 */

const fs = require('fs');
const path = require('path');
const slugify = require('slugify');

// Load config.json from current working directory
const configPath = path.join(process.cwd(), 'config.json');
if (!fs.existsSync(configPath)) {
    console.error('Error: config.json not found in current directory');
    process.exit(1);
}

const config = require(configPath);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    generateAll: args.includes('--generate-all'),
    output: './generated',
    aggregates: []
};

args.forEach(arg => {
    if (arg.startsWith('--output=')) {
        options.output = arg.split('=')[1];
    }
    if (arg.startsWith('--aggregates=')) {
        options.aggregates = arg.split('=')[1].split(',').map(a => a.trim());
    }
});

// Determine which aggregates to generate
let selectedAggregates = [];
if (options.generateAll) {
    selectedAggregates = config.aggregates.map(a => a.title);
} else if (options.aggregates.length > 0) {
    selectedAggregates = options.aggregates;
} else {
    // Default: generate all
    selectedAggregates = config.aggregates.map(a => a.title);
}

console.log(`Generating Eventualize app for aggregates: ${selectedAggregates.join(', ')}`);
console.log(`Output directory: ${options.output}`);

// Type mapping function
const typeMapping = (fieldType, fieldCardinality) => {
    let mappedType;
    switch (fieldType?.toLowerCase()) {
        case "string": mappedType = "string"; break;
        case "double": mappedType = "number"; break;
        case "long": mappedType = "number"; break;
        case "int": mappedType = "number"; break;
        case "boolean": mappedType = "boolean"; break;
        case "date": mappedType = "Date"; break;
        case "uuid": mappedType = "string"; break;
        case "custom": mappedType = "any"; break;
        default: mappedType = "string"; break;
    }
    if (fieldCardinality?.toLowerCase() === "list") {
        return `${mappedType}[]`;
    }
    return mappedType;
};

// Helper functions
const toCamelCase = (str) => slugify(str, '').replace(/^./, c => c.toLowerCase());

const renderConstructorParams = (fields) => {
    if (!fields || fields.length === 0) return '';
    return fields.map(field => {
        return `public readonly ${field.name}: ${typeMapping(field.type, field.cardinality)}`;
    }).join(', ');
};

const renderConstructorParamsWithDefaults = (fields) => {
    if (!fields || fields.length === 0) return '';
    return fields.map(field => {
        const type = typeMapping(field.type, field.cardinality);
        const defaultValue = getDefaultValue(type);
        return `public ${field.name}: ${type} = ${defaultValue}`;
    }).join(', ');
};

const renderInterfaceFields = (fields) => {
    if (!fields || fields.length === 0) return '';
    return fields.map(field => {
        return `    ${field.name}: ${typeMapping(field.type, field.cardinality)};`;
    }).join('\n');
};

const getDefaultValue = (type) => {
    if (type.endsWith('[]')) return '[]';
    switch (type) {
        case 'string': return "''";
        case 'number': return '0';
        case 'boolean': return 'false';
        case 'Date': return 'new Date()';
        default: return "''";
    }
};

const getDefaultStateArgs = (fields) => {
    if (!fields || fields.length === 0) return '';
    return fields.map(field => {
        const type = typeMapping(field.type, field.cardinality);
        return getDefaultValue(type);
    }).join(', ');
};

// Ensure directory exists
const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// Generate files for each aggregate
const generateFullApplication = (outputDir, selectedAggregates) => {
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
        const aggregateDir = path.join(outputDir, `${streamName}Stream`);

        ensureDir(aggregateDir);

        // Generate events file
        generateAggregateEvents(aggregateDir, streamName, group.events);

        // Generate views file from readmodels
        generateAggregateViews(aggregateDir, streamName, group.readmodels, group.events);

        // Generate commands file
        generateAggregateCommands(aggregateDir, streamName, group.commands, group.events);

        // Generate stream factory (index.ts)
        generateAggregateStream(aggregateDir, streamName, group.events, group.readmodels);

        // Generate messages file
        generateAggregateMessages(aggregateDir, streamName, group.events, group.readmodels);

        console.log(`  Generated: ${aggregateDir}/`);
    });
};

const generateAggregateEvents = (dir, streamName, events) => {
    const uniqueEvents = [...new Map(events.map(e => [e.title, e])).values()];

    const eventClasses = uniqueEvents.map(event => {
        const eventName = slugify(event.title, '');
        const constructorParams = renderConstructorParams(event.fields);
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

    fs.writeFileSync(path.join(dir, 'events.ts'), content);
};

const generateAggregateViews = (dir, streamName, readmodels, events) => {
    const uniqueReadmodels = [...new Map(readmodels.map(r => [r.title, r])).values()];
    const uniqueEvents = [...new Map(events.map(e => [e.title, e])).values()];

    const viewClasses = uniqueReadmodels.map(readmodel => {
        const viewName = slugify(readmodel.title, '');
        const viewNameCamel = toCamelCase(readmodel.title);
        const constructorParams = renderConstructorParamsWithDefaults(readmodel.fields);

        const inboundEvents = readmodel.dependencies
            ?.filter(d => d.type === 'INBOUND' && d.elementType === 'EVENT')
            .map(d => d.title) || [];

        const handlers = uniqueEvents
            .filter(e => inboundEvents.includes(e.title))
            .map(event => {
                const eventName = slugify(event.title, '');
                return `    ${eventName}: (oldState: ${viewName}State, event: ${eventName}) => {
        // TODO: Implement projection logic
        return new ${viewName}State(${getDefaultStateArgs(readmodel.fields)});
    }`;
            }).join(',\n');

        return `export class ${viewName}State {
    constructor(${constructorParams}) { }
}

export const ${viewNameCamel}Handlers = {
${handlers}
};`;
    }).join('\n\n');

    const eventImports = uniqueEvents.map(e => slugify(e.title, '')).join(', ');

    const content = `import { ${eventImports} } from "./events.js";

${viewClasses}
`;

    fs.writeFileSync(path.join(dir, 'views.ts'), content);
};

const generateAggregateCommands = (dir, streamName, commands, events) => {
    const uniqueCommands = [...new Map(commands.map(c => [c.title, c])).values()];
    const uniqueEvents = [...new Map(events.map(e => [e.title, e])).values()];

    const commandHandlers = uniqueCommands.map(command => {
        const commandName = slugify(command.title, '');
        const fields = renderInterfaceFields(command.fields);

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

    const eventImports = uniqueEvents.map(e => slugify(e.title, '')).join(', ');

    const content = `import { ${eventImports} } from "./events.js";
import { ${streamName}StreamType } from "./index.js";

${commandHandlers}
`;

    fs.writeFileSync(path.join(dir, 'commands.ts'), content);
};

const generateAggregateStream = (dir, streamName, events, readmodels) => {
    const uniqueEvents = [...new Map(events.map(e => [e.title, e])).values()];
    const uniqueReadmodels = [...new Map(readmodels.map(r => [r.title, r])).values()];

    const eventImports = uniqueEvents.map(e => slugify(e.title, '')).join(', ');

    const viewImports = uniqueReadmodels.map(r => {
        const viewName = slugify(r.title, '');
        const viewNameCamel = toCamelCase(r.title);
        return `${viewName}State, ${viewNameCamel}Handlers`;
    }).join(', ');

    const eventRegistrations = uniqueEvents.map(e => {
        const eventName = slugify(e.title, '');
        return `    .withEventType(${eventName})`;
    }).join('\n');

    const viewRegistrations = uniqueReadmodels.map(r => {
        const viewName = slugify(r.title, '');
        const viewNameCamel = toCamelCase(r.title);
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

    fs.writeFileSync(path.join(dir, 'index.ts'), content);
};

const generateAggregateMessages = (dir, streamName, events, readmodels) => {
    const uniqueEvents = [...new Map(events.map(e => [e.title, e])).values()];
    const uniqueReadmodels = [...new Map(readmodels.map(r => [r.title, r])).values()];

    const eventImports = uniqueEvents.map(e => slugify(e.title, '')).join(', ');

    const viewStateImports = uniqueReadmodels.map(r => {
        const viewName = slugify(r.title, '');
        return `${viewName}State`;
    }).join(', ');

    const messageProducers = uniqueEvents.map(event => {
        const eventName = slugify(event.title, '');
        const eventNameCamel = toCamelCase(event.title);
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

    fs.writeFileSync(path.join(dir, 'messages.ts'), content);
};

// Run the generator
ensureDir(options.output);
generateFullApplication(options.output, selectedAggregates);

console.log('\nGeneration complete!');
