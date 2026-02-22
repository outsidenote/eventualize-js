import type { PointsAdded } from "./PointsAdded.js";
import type { PointsSubtracted } from "./PointsSubtracted.js";
import type { PointsMultiplied } from "./PointsMultiplied.js";

export type PointsStreamEvents = PointsAdded | PointsSubtracted | PointsMultiplied;
