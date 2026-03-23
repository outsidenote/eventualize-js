export const PointsSubtracted = "PointsSubtracted" as const;
export type PointsSubtracted = { readonly eventType: typeof PointsSubtracted; readonly points: number };
