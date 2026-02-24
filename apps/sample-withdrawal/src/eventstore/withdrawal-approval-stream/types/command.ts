/**
 * Base interface for all commands.
 *
 * Mirrors IEvDbEventPayload's discriminator pattern:
 * events use `payloadType`, commands use `commandType`.
 * This enables discriminated unions and Extract<> narrowing.
 */
export interface Command {
  readonly commandType: string;
}
