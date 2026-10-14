// Mirror of the backend DTOs (apps/playground/backend/src: replay/replayBatch.ts,
// commands/commands.ts, accounts/getHead.ts, accounts/summaries.ts, accounts/timeline.ts,
// generator/generate.ts, detection/runDetection.ts). Keep in sync by hand.

export type BalanceState = { readonly amount: number; readonly currency: string };
export type StatsState = {
  readonly deposits: number;
  readonly withdrawals: number;
  readonly denied: number;
};
export type PlaygroundViews = {
  readonly balance: BalanceState;
  readonly stats: StatsState;
  readonly risk: number;
};

export type EventMeta = {
  readonly eventType: string;
  readonly capturedAt: string;
  readonly capturedBy: string;
  readonly storedAt: string | null;
  readonly traceparent: string | null;
};

export type EventPayload = {
  readonly description: string;
  readonly value: number;
  readonly currency: string;
  readonly reason?: string;
};

export type MessageDto = {
  readonly messageType: string;
  readonly payload: { readonly [key: string]: string | number } | null;
};

export type ReplayItem = {
  readonly offset: number;
  readonly event_meta: EventMeta;
  readonly event_payload: EventPayload;
  readonly views: PlaygroundViews;
  readonly messages: readonly MessageDto[];
};

export type ReplayBatch = {
  readonly streamId: string;
  readonly lastOffset: number;
  readonly isHead: boolean;
  readonly items: readonly ReplayItem[];
};

export type AccountHead = {
  readonly streamId: string;
  readonly lastOffset: number;
  readonly views: PlaygroundViews;
};

export type CommandInput = {
  readonly value: number;
  readonly currency: string;
  readonly description?: string;
};

export type CommandResult = {
  readonly offset: number;
  readonly eventType: "FundsDeposited" | "FundsWithdrawn" | "WithdrawalDenied";
  readonly views: PlaygroundViews;
};

export type AccountSummary = {
  readonly id: string;
  readonly lastOffset: number;
  readonly balance: BalanceState;
  readonly risk: number;
};

export type GeneratePattern = "random" | "riskSpike" | "riskCoolDown" | "targetBalance";
export type GenerateTarget = { readonly mode: "absolute" | "percent"; readonly value: number };

export type GenerateInput = {
  readonly count: number;
  readonly pattern: GeneratePattern;
  readonly storeEvery: number;
  readonly currency?: string;
  readonly target?: GenerateTarget;
};

export type GenerateResult = {
  readonly fromOffset: number;
  readonly toOffset: number;
  readonly count: number;
  readonly denied: number;
  readonly views: PlaygroundViews;
};

export type TimelineEntry = {
  readonly offset: number;
  readonly eventType: string;
  readonly value: number;
};

export type Timeline = { readonly lastOffset: number; readonly events: readonly TimelineEntry[] };

export type DetectorKind =
  "riskJump" | "riskRise" | "riskDecline" | "balanceCrossUp" | "balanceCrossDown";

export type DetectRequest = {
  readonly detector: DetectorKind;
  readonly params: { readonly [key: string]: number };
};

export type DetectResult = {
  readonly detector: DetectorKind;
  readonly matches: readonly number[];
  readonly scanned: number;
  readonly lastOffset: number;
  readonly truncated: boolean;
};
