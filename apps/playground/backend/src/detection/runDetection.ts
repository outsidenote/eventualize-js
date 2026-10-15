import type { PlaygroundStorage } from "../storage.js";
import { detect } from "./detect.js";
import type { Detector, DetectorKind } from "./detect.js";
import { readSeries } from "./series.js";

export const MAX_SCAN = 20_000;
export const MAX_MATCHES = 1_000;

export type DetectResult = {
  readonly detector: DetectorKind;
  readonly matches: number[];
  readonly scanned: number;
  readonly lastOffset: number;
  readonly truncated: boolean;
};

export async function runDetection(
  storage: PlaygroundStorage,
  streamId: string,
  detector: Detector,
  limits: { readonly maxScan: number; readonly maxMatches: number } = {
    maxScan: MAX_SCAN,
    maxMatches: MAX_MATCHES,
  },
): Promise<DetectResult> {
  const series = await readSeries(storage, streamId, limits.maxScan);
  const all = detect(series.points, detector);
  return {
    detector: detector.kind,
    matches: all.slice(0, limits.maxMatches),
    scanned: series.points.length,
    lastOffset: series.lastOffset,
    truncated: series.truncated || all.length > limits.maxMatches,
  };
}
