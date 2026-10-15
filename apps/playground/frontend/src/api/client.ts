import type {
  AccountHead,
  AccountSummary,
  CommandInput,
  CommandResult,
  DetectRequest,
  DetectResult,
  GenerateInput,
  GenerateResult,
  ReplayBatch,
  Timeline,
} from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// `res.json()` is untyped; the backend is our own, so its DTOs are trusted here.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...init });
  if (!res.ok) {
    // HTTP boundary: the body may be anything (e.g. a proxy error page), so narrow it.
    const body: unknown = await res.json().catch(() => null);
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, message);
  }
  const data: T = await res.json();
  return data;
}

const enc = encodeURIComponent;

export async function listAccounts(): Promise<AccountSummary[]> {
  const body = await request<{ accounts: AccountSummary[] }>("/api/accounts");
  return body.accounts;
}

export const getHead = (id: string): Promise<AccountHead> => request(`/api/accounts/${enc(id)}`);

export const deposit = (id: string, input: CommandInput): Promise<CommandResult> =>
  request(`/api/accounts/${enc(id)}/deposit`, { method: "POST", body: JSON.stringify(input) });

export const withdraw = (id: string, input: CommandInput): Promise<CommandResult> =>
  request(`/api/accounts/${enc(id)}/withdraw`, { method: "POST", body: JSON.stringify(input) });

export const replay = (
  id: string,
  offset: number,
  batchSize: number,
  snapshots: boolean,
): Promise<ReplayBatch> =>
  request(
    `/api/accounts/${enc(id)}/replay?offset=${offset}&batchSize=${batchSize}&snapshots=${snapshots}`,
  );

export const generate = (id: string, input: GenerateInput): Promise<GenerateResult> =>
  request(`/api/accounts/${enc(id)}/generate`, { method: "POST", body: JSON.stringify(input) });

export const timeline = (id: string): Promise<Timeline> =>
  request(`/api/accounts/${enc(id)}/timeline`);

export const detect = (id: string, body: DetectRequest): Promise<DetectResult> =>
  request(`/api/accounts/${enc(id)}/detect`, { method: "POST", body: JSON.stringify(body) });
