import type {
  JudgmentRequest,
  JudgmentResponse,
  ModelAdapter,
} from "./contracts";
/** No mock fallback. Tokens are obtained from the active Privy session. */
export function modelService(
  getAccessToken: () => Promise<string | null>,
): ModelAdapter {
  return {
    async judge(
      input: JudgmentRequest,
      signal?: AbortSignal,
    ): Promise<JudgmentResponse> {
      const token = await getAccessToken();
      if (!token) throw new Error("SIGN_IN_REQUIRED");
      const response = await fetch("/api/models/judgment", {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "MODEL_UNAVAILABLE");
      if (
        data.requestId !== input.requestId ||
        data.stateVersion !== input.stateVersion ||
        !["observe", "verify", "learn", "propose", "execute", "stop"].includes(
          data.action,
        ) ||
        !Array.isArray(data.evidenceRefs) ||
        typeof data.reason !== "string" ||
        typeof data.requiresConfirmation !== "boolean"
      )
        throw new Error("MODEL_RESPONSE_INVALID");
      return data;
    },
  };
}
