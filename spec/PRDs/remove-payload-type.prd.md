refactor the library to remove the IEvDbEventPayload.
the type of the event is `eventType` defined in 'IEvDbEvent' 

the `payload` on `EvDbEvent` should be `unknown` instead of  `IEvDbEventPayload`.

`T & { readonly payloadType: string }` should be `T & IEvDbEventType` or remove if not required

the appendEvent should be changed from

```ts
protected appendEvent(
    payload: IEvDbEventPayload,
    capturedBy?: string | null,
  ): IEvDbEventMetadata 
  ```
   to
   ```ts
   protected appendEvent(
    eventType: string,
    payload: unknown,
    capturedBy?: string | null,
  ): IEvDbEvent
  ```