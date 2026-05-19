import type EvDbStream from "@eventualize/core/store/EvDbStream";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";

export type CommandHandler<TStream extends EvDbStream, TCommand> =
  (stream: TStream, command: TCommand) => void;

export interface CommandHandlerOrchestratorResult {
  readonly streamId: string;
  readonly events: readonly EvDbEvent[];
}

export type CommandHandlerOrchestrator<TCommand> =
  (command: TCommand) => Promise<CommandHandlerOrchestratorResult>;
