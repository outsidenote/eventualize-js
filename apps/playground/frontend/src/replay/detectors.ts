import type { DetectorKind, DetectRequest } from "../api/types";

export type DetectorDef = {
  readonly kind: DetectorKind;
  readonly label: string;
  readonly params: ReadonlyArray<{
    readonly key: string;
    readonly label: string;
    readonly initial: string;
  }>;
};

export const DETECTORS: readonly DetectorDef[] = [
  {
    kind: "riskJump",
    label: "⚡ risk jump",
    params: [{ key: "jump", label: "jump ≥", initial: "2.5" }],
  },
  {
    kind: "riskRise",
    label: "📈 risk rise %",
    params: [
      { key: "percent", label: "rise ≥ %", initial: "50" },
      { key: "window", label: "window", initial: "5" },
    ],
  },
  {
    kind: "riskDecline",
    label: "📉 risk decline %",
    params: [
      { key: "percent", label: "decline ≥ %", initial: "50" },
      { key: "window", label: "window", initial: "5" },
    ],
  },
  {
    kind: "balanceCrossUp",
    label: "⬆️ balance crosses up",
    params: [{ key: "threshold", label: "threshold", initial: "50000" }],
  },
  {
    kind: "balanceCrossDown",
    label: "⬇️ balance crosses down",
    params: [{ key: "threshold", label: "threshold", initial: "50000" }],
  },
];

export function detectorDef(kind: DetectorKind): DetectorDef {
  return DETECTORS.find((d) => d.kind === kind) ?? DETECTORS[0];
}

export function buildDetectRequest(
  kind: DetectorKind,
  inputs: { readonly [key: string]: string },
):
  | { readonly ok: true; readonly request: DetectRequest }
  | { readonly ok: false; readonly error: string } {
  const params: { [key: string]: number } = {};
  for (const p of detectorDef(kind).params) {
    const raw = (inputs[p.key] ?? "").trim();
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) return { ok: false, error: `${p.key} must be a number` };
    params[p.key] = n;
  }
  return { ok: true, request: { detector: kind, params } };
}
