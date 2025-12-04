import { IEvDbPayload } from '@eventualize/entities-types/IEvDbEventPayload';


class Event1 implements IEvDbPayload {
    readonly payloadType = 'event_1';
    constructor(public readonly value1: number) { }
}

class Event2 implements IEvDbPayload {
    readonly payloadType = 'event_2';
    constructor(public readonly value2: number) { }
}


