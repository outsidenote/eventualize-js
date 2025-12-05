import IEvDbEventPayload from '@eventualize/entities-types/IEvDbEventPayload';
import IEvDbEventsSet from '@eventualize/entities-types/IEvDbEventsSet';
import IEvDbEventMetadata from '@eventualize/entities-types/IEvDbEventMetadata';
import EvDbStreamCursor from '@eventualize/entities-types/EvDbStreamCursor';


class Event1 implements IEvDbEventPayload {
    readonly payloadType = 'Event1';
    constructor(public readonly value1: number) { }
}

class Event2 implements IEvDbEventPayload {
    readonly payloadType = 'Event2';
    constructor(public readonly value2: number) { }
}

class State1 {
    public sum: number = 0;
}






// Usage
class ExampleEventsSet implements IEvDbEventsSet<Event1 | Event2> {
    async applyEvent1(event: Event1): Promise<IEvDbEventMetadata> {
        console.log('Handling Event1:', event.value1);
        return {
            eventType: event.payloadType,
            streamCursor: new EvDbStreamCursor('exampleStream', 'streamId', 0),
            capturedAt: new Date(),
            capturedBy: 'user123',
        }
    }

    async applyEvent2(event: Event2): Promise<IEvDbEventMetadata> {
        console.log('Handling Event2:', event.value2);
        return {
            eventType: event.payloadType,
            streamCursor: new EvDbStreamCursor('exampleStream', 'streamId', 1),
            capturedAt: new Date(),
            capturedBy: 'user123',
        }
    }
}