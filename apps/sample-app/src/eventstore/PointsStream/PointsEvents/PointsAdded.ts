export const PointsAdded = "PointsAdded" as const;
export type PointsAdded = { readonly eventType: typeof PointsAdded; readonly points: number };
