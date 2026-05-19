import type { CommandHandler, CommandHandlerOrchestrator, CommandHandlerOrchestratorResult } from "./commandHandler.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { EvDbStreamFactory, StreamWithEventMethods } from "@eventualize/core/factories/EvDbStreamFactory";

export class CommandHandlerOrchestratorFactory {
  static create<
    TCommand,
    TEventMap extends Record<string, object>,
    TStreamType extends string,
    TViews extends Record<string, unknown> = {},
  >(
    storageAdapter: IEvDbStorageAdapter,
    streamFactory: EvDbStreamFactory<TEventMap, TStreamType, TViews>,
    getStreamId: (command: TCommand) => string,
    commandHandler: CommandHandler<StreamWithEventMethods<TEventMap, TViews>, TCommand>,
  ): CommandHandlerOrchestrator<TCommand> {
    return async (command: TCommand): Promise<CommandHandlerOrchestratorResult> => {
      const streamId = getStreamId(command);
      const stream = await streamFactory.get(
        streamId,
        storageAdapter,
        storageAdapter,
      ) as StreamWithEventMethods<TEventMap, TViews>;

      commandHandler(stream, command);

      const events = stream.getEvents();
      if (events.length > 0) {
        await stream.store();
      }

      return { streamId, events };
    };
  }
}
