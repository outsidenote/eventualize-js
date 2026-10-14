import { useCallback, useRef, useState } from "react";
import { detect } from "./api/client";
import type { DetectorKind } from "./api/types";
import { buildDetectRequest, DETECTORS } from "./replay/detectors";
import { stepMatch } from "./replay/matchNav";

const initialInputs = (): { [key: string]: string } => {
  const out: { [key: string]: string } = {};
  for (const d of DETECTORS) for (const p of d.params) out[p.key] ??= p.initial;
  return out;
};

export type Detection = {
  readonly kind: DetectorKind;
  readonly setKind: (k: DetectorKind) => void;
  readonly inputs: { readonly [key: string]: string };
  readonly setInput: (key: string, value: string) => void;
  readonly matches: readonly number[];
  readonly index: number;
  readonly running: boolean;
  readonly error: string | null;
  readonly truncated: boolean;
  readonly stale: boolean;
  readonly searched: boolean;
  readonly run: () => Promise<number | null>;
  readonly step: (delta: 1 | -1) => number | null;
};

/** Detector selection, server detection, and the current match. Results go stale when the head moves. */
export function useDetection(accountId: string | null, lastOffset: number): Detection {
  const [kind, setKindState] = useState<DetectorKind>("riskJump");
  const [inputs, setInputs] = useState<{ [key: string]: string }>(initialInputs);
  const [matches, setMatches] = useState<readonly number[]>([]);
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [detectedAt, setDetectedAt] = useState<number | null>(null);

  const requestId = useRef(0);

  const setKind = useCallback((k: DetectorKind) => {
    requestId.current++; // drop any in-flight run of the previous detector
    setRunning(false);
    setTruncated(false);
    setKindState(k);
    setMatches([]);
    setIndex(0);
    setDetectedAt(null);
    setError(null);
  }, []);

  const setInput = useCallback((key: string, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const run = useCallback(async (): Promise<number | null> => {
    if (accountId === null) return null;
    const id = ++requestId.current; // also invalidates any older in-flight run
    const built = buildDetectRequest(kind, inputs);
    if (!built.ok) {
      setRunning(false);
      setError(built.error);
      return null;
    }
    setRunning(true);
    setError(null);
    try {
      const result = await detect(accountId, built.request);
      if (id !== requestId.current) return null; // superseded: record nothing
      setMatches(result.matches);
      setIndex(0);
      setTruncated(result.truncated);
      setDetectedAt(result.lastOffset);
      return result.matches[0] ?? null;
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      if (id === requestId.current) setRunning(false);
    }
  }, [accountId, kind, inputs]);

  const step = useCallback(
    (delta: 1 | -1): number | null => {
      if (matches.length === 0) return null;
      const next = stepMatch(index, delta, matches.length);
      setIndex(next);
      return matches[next] ?? null;
    },
    [index, matches],
  );

  return {
    kind,
    setKind,
    inputs,
    setInput,
    matches,
    index,
    running,
    error,
    truncated,
    stale: detectedAt !== null && detectedAt !== lastOffset,
    searched: detectedAt !== null,
    run,
    step,
  };
}
