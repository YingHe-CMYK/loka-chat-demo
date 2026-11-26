/** Twin Backend v0.1. All calls use an authenticated same-origin gateway. */
export type Dilemma = {
  id: string;
  question: string;
  options: { id: string; label: string }[];
};
export type RegistrationForm = {
  copy: Record<string, string>;
  field_suggestions: string[];
  years_bands: string[];
  age_bands: string[];
  dilemmas: Dilemma[];
};
export type RegistrationDraft = {
  display_name: string;
  about: string;
  years_in_field?: string;
  age_band?: string;
  background?: string;
  dilemmas: Record<string, string>;
  current_thing?: string;
  quiet_text?: string;
  timezone: string;
};
export type TwinIdentity = {
  nostr_pubkey: string;
  npub: string;
  eth_address: string;
  chain_id: number | null;
  key_custody: string;
  wallet_state: string;
};
export type Stage = {
  level: number;
  name: string;
  can_assert: boolean;
  says: string;
  next_step?: string;
};
export type Retelling = {
  heard: string;
  roles: { id: string; label: string; stance: string; loud_when: string }[];
  promise: string;
};
export type TwinCreated = {
  twin_id: string;
  identity: TwinIdentity;
  ontology_version: number;
  stage: Stage;
  review_at: string;
  retelling: Retelling;
  quiet_understood: string;
  quiet_hours: { from: string; to: string; days: number[] }[];
};
export type MaterialAsk = {
  ask_id: string;
  question: string;
  why: string;
  options: { id: string; label: string }[];
};
export type TickResult = {
  twin_id: string;
  spoke: unknown | null;
  reason?: string;
  stage: Stage;
  material_ask?: MaterialAsk;
};
export class TwinRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function twinClient({
  getToken,
  base = "/api/twin",
  fetcher = fetch,
}: {
  getToken: () => Promise<string | null>;
  base?: string;
  fetcher?: typeof fetch;
}) {
  if (!base.startsWith("/") || base.startsWith("//"))
    throw new Error("Twin gateway must be same-origin");
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const token = await getToken();
    if (!token) throw new TwinRequestError("Sign in to continue", 401);
    const response = await fetcher(`${base}${path}`, {
      method,
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      throw new TwinRequestError(
        response.status === 501
          ? "Service offline"
          : response.status === 401
            ? "Session expired. Sign in again."
            : "Unable to finish. Keep your draft and try again.",
        response.status,
      );
    const type = response.headers.get("content-type") || "";
    if (!type.includes("application/json"))
      throw new TwinRequestError("Unexpected response from the service", 502);
    return response.json() as Promise<T>;
  }
  return {
    registrationForm: (signal?: AbortSignal) =>
      request<RegistrationForm>(
        "/v1/registration/form",
        "GET",
        undefined,
        signal,
      ),
    create: (draft: RegistrationDraft, signal?: AbortSignal) =>
      request<TwinCreated>("/v1/twins", "POST", draft, signal),
    get: (id: string, signal?: AbortSignal) =>
      request<{
        twin_id: string;
        identity: TwinIdentity;
        stage: Stage;
        ontology_review: { due: boolean; at: string };
        daily_speak_cap: number;
      }>(`/v1/twins/${encodeURIComponent(id)}`, "GET", undefined, signal),
    tick: (id: string, signal?: AbortSignal) =>
      request<TickResult>(
        `/v1/twins/${encodeURIComponent(id)}/tick`,
        "POST",
        {},
        signal,
      ),
    tell: (id: string, text: string, signal?: AbortSignal) =>
      request<{
        twin_id: string;
        reply: string;
        heard: string;
        ontology_version: number;
        rewrote_ontology: boolean;
      }>(`/v1/twins/${encodeURIComponent(id)}/tell`, "POST", { text }, signal),
  };
}
